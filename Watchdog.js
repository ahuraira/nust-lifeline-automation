/**
 * INTELLIGENT WATCHDOG
 * 
 * Scheduled job that:
 * 1. Scans for new replies from the Hostel.
 * 2. Uses Gemini AI to match replies to specific Allocations.
 * 3. Updates the Allocation Log.
 * 4. Closes the loop by notifying the Donor.
 */

function runWatchdog() {
    const FUNC_NAME = 'runWatchdog';
    writeLog('INFO', FUNC_NAME, 'Starting Watchdog execution...');

    // 1. Define Search Query for "Hostel Replies"
    // We look for emails FROM the Hostel/UAO that contain "Ref:" (standard in our subject) 
    // and are NOT yet labeled as 'Processed'.
    const processedLabel = getOrCreateLabel('Watchdog/Processed');
    const manualLabel = getOrCreateLabel('Watchdog/Manual-Review');

    // Search for threads that:
    // - Are from university domains (or specific addresses)
    // - Have our "Ref:" pattern in subject (from generateHostelReplyLink)
    // - Are NOT labeled processed
    const query = `from:(${EMAILS.ddHostels} OR ${EMAILS.uao} OR "finance.university.edu") subject:("Ref: PLEDGE-") -label:Watchdog/Processed -label:Watchdog/Manual-Review`;

    const threads = GmailApp.search(query, 0, 10);
    if (threads.length === 0) {
        writeLog('INFO', FUNC_NAME, 'No new hostel replies found.');
        return;
    }

    writeLog('INFO', FUNC_NAME, `Found ${threads.length} candidate threads.`);

    // 2. Pre-fetch Open Allocations for Matching
    // specificAllocations: Map<PledgeID, Array<AllocationRow>>
    const openAllocationsMap = getOpenAllocationsMap();

    for (const thread of threads) {
        processThread(thread, openAllocationsMap, processedLabel, manualLabel);
    }
}

/**
 * Processes a single email thread.
 */
function processThread(thread, openAllocationsMap, processedLabel, manualLabel) {
    const FUNC_NAME = 'processThread';
    const subject = thread.getFirstMessageSubject();
    const messages = thread.getMessages();
    const lastMessage = messages[messages.length - 1]; // The latest reply
    // Robustness: Try to get RFC ID, fallback to API ID
    const lastMessageId = getRfcIdFromMessage(lastMessage);

    // Extract Pledge ID from Subject
    const pledgeIdMatch = subject.match(/PLEDGE-\d{4}-\d+/);
    if (!pledgeIdMatch) {
        writeLog('WARN', FUNC_NAME, `Thread subject "${subject}" is missing Pledge ID. Skipping.`);
        thread.addLabel(manualLabel); // Needs manual look
        return;
    }
    const pledgeId = pledgeIdMatch[0];

    // Get Pending Allocations for this Pledge
    const pendingAllocations = openAllocationsMap.get(pledgeId);

    if (!pendingAllocations || pendingAllocations.length === 0) {
        writeLog('WARN', FUNC_NAME, `Received reply for ${pledgeId} but no PENDING allocations found in sheet. Already closed?`);
        thread.addLabel(processedLabel); // Mark processed so we don't loop
        return;
    }

    // --- AI ANALYSIS ---
    // Get full thread context for the AI
    const threadContext = getThreadContext(thread).formattedForLLM;

    writeLog('INFO', FUNC_NAME, `Analyzing reply for ${pledgeId} with ${pendingAllocations.length} pending allocations.`);

    // Call LLM
    const analysis = analyzeHostelReply(threadContext, pendingAllocations);

    if (!analysis) {
        writeLog('ERROR', FUNC_NAME, 'AI Analysis failed (returned null).', pledgeId);
        return; // Do not label processed, retry next time
    }

    writeLog('INFO', FUNC_NAME, `AI Verdict: ${analysis.status}. Confirmed: ${JSON.stringify(analysis.confirmedAllocIds)}`, pledgeId);

    // --- EXECUTION ---
    if (analysis.status === 'AMBIGUOUS' || analysis.status === 'QUERY') {
        // Safety Net: If AI is unsure or there is a query, alert the human.
        thread.addLabel(manualLabel);
        thread.removeLabel(processedLabel); // Ensure it's not marked done
        sendAlertEmail(pledgeId, analysis, thread.getPermalink());

        logAuditEvent(
            'SYSTEM/Watchdog',
            'ALERT',
            pledgeId,
            'Ambiguous Hostel Reply - Flagged for Manual Review',
            '',
            '',
            { reasoning: analysis.reasoning, threadLink: thread.getPermalink() }
        );
    } else if (analysis.status === 'CONFIRMED_ALL' || analysis.status === 'PARTIAL') {
        // Process the confirmed IDs
        const confirmedCount = updateAllocations(analysis.confirmedAllocIds, lastMessageId);

        if (confirmedCount > 0) {
            // If we successfully closed at least one allocation, label the thread
            thread.addLabel(processedLabel);

            // Force pending Sheet updates to apply before we check for Closure logic
            SpreadsheetApp.flush();

            // Update the main Pledge Status (Derived Logic)
            updatePledgeStatus(pledgeId);
        }
    }
}

/**
 * Updates the Allocation Log for confirmed items and triggers Final Notification.
 */
function updateAllocations(confirmedAllocIds, hostelReplyMessageId) {
    const FUNC_NAME = 'updateAllocations';
    const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
    const allocWs = ss.getSheetByName(SHEETS.allocations.name);
    const data = allocWs.getDataRange().getValues();
    let updateCount = 0;

    for (let i = 1; i < data.length; i++) {
        const rowAllocId = data[i][SHEETS.allocations.cols.allocId - 1]; // Use new config
        const currentStatus = data[i][SHEETS.allocations.cols.status - 1];

        if (confirmedAllocIds.includes(rowAllocId) && currentStatus !== STATUS.allocation.HOSTEL_VERIFIED) { // Prevent double update
            const row = i + 1;

            // 1. Update Status
            allocWs.getRange(row, SHEETS.allocations.cols.status).setValue(STATUS.allocation.HOSTEL_VERIFIED);

            // Define pledgeId early for logging
            const pledgeId = data[i][SHEETS.allocations.cols.pledgeId - 1];

            // 2. Log Hostel Reply
            allocWs.getRange(row, SHEETS.allocations.cols.hostelReplyId).setValue(formatIdForSheet(hostelReplyMessageId));
            allocWs.getRange(row, SHEETS.allocations.cols.hostelReplyDate).setValue(new Date());

            logAuditEvent(
                'SYSTEM/Watchdog',
                'HOSTEL_VERIFICATION',
                `${rowAllocId} (${pledgeId})`,
                'Allocation Verified by Hostel (AI)',
                currentStatus,
                STATUS.allocation.HOSTEL_VERIFIED,
                { msgId: hostelReplyMessageId }
            );

            // 3. Send Final Notification to Donor
            // We need to fetch donor details. To perform this efficiently, we might want to do it in batch, 
            // but for now, line-by-line is safer and easier to implement.
            // Fetching raw data row for this pledge
            const rawWs = ss.getSheetByName(SHEETS.donations.name);
            // pledgeId is already defined above
            const donationRow = findRowByValue(rawWs, SHEETS.donations.cols.pledgeId, pledgeId);

            if (donationRow) {
                const donorEmail = donationRow.data[SHEETS.donations.cols.donorEmail - 1];
                const donorName = donationRow.data[SHEETS.donations.cols.donorName - 1];
                const studentName = "Student"; // Privacy: We don't verify name from DB here again? 
                // ACTUALLY, we know the CMS ID from allocation row.
                const cmsId = data[i][SHEETS.allocations.cols.cmsId - 1];
                const amount = data[i][SHEETS.allocations.cols.amount - 1];

                // Send Final "Thank You / Verified" Email
                const finalNotifyId = sendFinalNotification(donorEmail, donorName, pledgeId, rowAllocId, cmsId, amount);

                // 4. Log Final Notification
                allocWs.getRange(row, SHEETS.allocations.cols.donorNotifyId).setValue(formatIdForSheet(finalNotifyId));
                allocWs.getRange(row, SHEETS.allocations.cols.donorNotifyDate).setValue(new Date());
            }

            updateCount++;
        }
    }
    return updateCount;
}

/**
 * Sends the final loop-closing email to the donor.
 */
function sendFinalNotification(email, name, pledgeId, allocId, cmsId, amount) {
    // Use template if available, or simple text fallback.
    // Using a hardcoded fall-back to ensure it works immediately without new template Config.
    const subject = `Complete: Donation Verified (Ref: ${pledgeId})`;
    const htmlBody = `
     <p>Dear ${name},</p>
     <p>We are pleased to inform you that your donation (<strong>PKR ${Number(amount).toLocaleString()}</strong>) for Student ID <strong>${cmsId}</strong> has been 
     <strong>fully verified</strong> by the Hostel Department.</p>
     <p>The funds have been credited to the student's dining account.</p>
     <p><strong>Verification Ref:</strong> ${allocId}</p>
     <p>Thank you for making a difference.</p>
     <br>
     <p>NUST Hostels Admin Directorate</p>
   `;

    return sendEmailAndGetId(email, subject, htmlBody, { from: EMAILS.processOwner });
}

/**
 * Helper: Returns a Map of PledgeID -> List of Pending Allocations
 */
function getOpenAllocationsMap() {
    const allocWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.allocations.name);
    const data = allocWs.getDataRange().getValues();
    const map = new Map();

    for (let i = 1; i < data.length; i++) {
        const status = data[i][SHEETS.allocations.cols.status - 1];

        // We only care about PENDING_HOSTEL items
        if (status === STATUS.allocation.PENDING_HOSTEL) {
            const pledgeId = data[i][SHEETS.allocations.cols.pledgeId - 1];
            const details = {
                allocId: data[i][SHEETS.allocations.cols.allocId - 1],
                cms: data[i][SHEETS.allocations.cols.cmsId - 1],
                amount: data[i][SHEETS.allocations.cols.amount - 1],
                // Name is not strictly in Allocation Log, but we might rely on CMS/Amount for matching
                // If we really need Name, we'd have to look it up.
                // For now, let's pass CMS and Amount, which is usually enough for "Distinct" matching.
            };

            if (!map.has(pledgeId)) {
                map.set(pledgeId, []);
            }
            map.get(pledgeId).push(details);
        }
    }
    return map;
}

/**
 * Helper: Sends an alert email to the admin for manual review.
 */
function sendAlertEmail(pledgeId, analysis, link) {
    const subject = `[ACTION REQUIRED] Ambiguous Hostel Reply for ${pledgeId}`;
    const body = `
      <p>The AI Watchdog could not automatically verify the hostel reply.</p>
      <p><strong>Reasoning:</strong> ${analysis.reasoning}</p>
      <p><a href="${link}">Open Email Thread</a></p>
    `;
    MailApp.sendEmail({
        to: EMAILS.processOwner,
        subject: subject,
        htmlBody: body
    });
}
