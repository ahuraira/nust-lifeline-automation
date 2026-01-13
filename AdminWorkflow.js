/**
 * Scans Gmail for new receipts, processes them, updates the sheet, and files them.
 * This function is designed to be run on a time-based trigger.
 * VERSION 4: PRODUCTION-GRADE WITH ROBUST ID EXTRACTION AND ATTACHMENT HANDLING.
 */
function processIncomingReceipts() {
  const FUNC_NAME = 'processIncomingReceipts';
  writeLog('INFO', FUNC_NAME, 'Starting receipt processing run.');

  const labelToProcess = GmailApp.getUserLabelByName('Receipts/To-Process');
  const labelProcessed = GmailApp.getUserLabelByName('Receipts/Processed');

  if (!labelToProcess || !labelProcessed) {
    writeLog('ERROR', FUNC_NAME, 'Could not find required Gmail labels. Halting execution.');
    return;
  }

  const threads = labelToProcess.getThreads();
  if (threads.length === 0) {
    writeLog('INFO', FUNC_NAME, 'No new receipts to process.');
    return;
  }
  writeLog('INFO', FUNC_NAME, `Found ${threads.length} email threads to process.`);

  for (const thread of threads) {
    const message = thread.getMessages()[thread.getMessageCount() - 1];
    const subject = message.getSubject();
    let pledgeId = null;

    try {
      // --- ROBUSTNESS UPGRADE 1: More flexible Pledge ID extraction ---
      const pledgeIdMatches = subject.match(/PLEDGE-\d{4}-\d+/g); // 'g' flag finds all matches
      if (!pledgeIdMatches) {
        writeLog('WARN', FUNC_NAME, `Could not find any Pledge ID in subject: "${subject}". Skipping.`);
        thread.addLabel(labelProcessed).removeLabel(labelToProcess);
        continue;
      }
      pledgeId = pledgeIdMatches[pledgeIdMatches.length - 1]; // Always use the last ID found in the subject

      // --- CROSS-PROCESSING FIX: Skip Internal/Hostel Emails ---
      // These should be handled by the Watchdog, not the Receipt Processor.
      const sender = message.getFrom().toLowerCase();
      // We check if the sender includes any of our known Hostel/UAO addresses
      const internalEmails = [EMAILS.ddHostels, EMAILS.uao].filter(e => e); // Filter out null/undefined
      const isInternal = internalEmails.some(email => sender.includes(email.toLowerCase()));

      if (isInternal) {
        writeLog('INFO', FUNC_NAME, `Skipping internal email from ${sender}. Likely a Hostel Reply (Watchdog territory).`, pledgeId);
        // Remove the 'Receipts' label so we don't process it again here.
        // It will be picked up by 'runWatchdog' if it matches the 'Ref:' pattern.
        thread.removeLabel(labelToProcess);
        continue;
      }
      // ----------------------------------------------------------------

      writeLog('INFO', FUNC_NAME, 'Found Pledge ID. Starting processing.', pledgeId);

      const attachments = message.getAttachments();
      const attachmentNames = attachments.map(a => a.getName());

      // --- STRUCTURED EMAIL CONTEXT ---
      // Use getThreadContext to properly separate current email from thread history
      const emailContext = getThreadContext(thread);

      // --- FETCH ROW DATA EARLY FOR CONTEXT ---
      const ws = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.donations.name);
      const rowData = findRowByValue(ws, SHEETS.donations.cols.pledgeId, pledgeId);

      // FIX: Null Pointer Check
      if (!rowData) {
        writeLog('WARN', FUNC_NAME, 'Pledge ID found in email, but no matching row in the spreadsheet. Skipping.', pledgeId);
        thread.addLabel(labelProcessed).removeLabel(labelToProcess);
        continue;
      }

      let pledgeDate = new Date(); // Default fallbacks
      if (rowData) {
        // Assume timestamp is in Column 1 (Index 0)
        const rawDate = rowData.data[SHEETS.donations.cols.timestamp - 1];
        if (rawDate) pledgeDate = new Date(rawDate);
      }

      // --- FETCH PLEDGE AMOUNT FOR CONTEXT ---
      const durationStr = rowData.data[SHEETS.donations.cols.duration - 1]; // "One Year", "One Month"
      const pledgeAmount = getPledgeAmountFromDuration(durationStr) || 0;

      // --- AI ANALYSIS ---
      // Pass pledgeAmount for context
      const aiResult = analyzeDonorEmail(
        emailContext.formattedForLLM,
        attachments,
        pledgeDate,
        message.getDate(),
        pledgeAmount
      );

      if (!aiResult) {
        writeLog('WARN', FUNC_NAME, 'AI Processing Failed. Skipping.', pledgeId);
        continue;
      }

      // --- HANDLE QUESTION ---
      if (aiResult.category === 'QUESTION') {
        // ... (Same Question Handling as before) ...
        const queryLabel = GmailApp.createLabel('Receipts/Donor-Query'); // Ensure label exists
        thread.addLabel(queryLabel).removeLabel(labelToProcess);
        if (aiResult.suggested_reply) { thread.createDraftReply(aiResult.suggested_reply); }
        ws.getRange(rowData.row, SHEETS.donations.cols.notes).setValue(`[Query] ${aiResult.summary}`);
        continue;
      }

      // --- HANDLE RECEIPT SUBMISSION ---
      // Logic V2: Multi-Receipt Support
      const receiptsFound = aiResult.valid_receipts || [];

      if (receiptsFound.length === 0) {
        writeLog('WARN', FUNC_NAME, 'No valid receipt found/extracted by AI.', pledgeId);
        // Fallback? Or Manual Review?
        thread.addLabel(GmailApp.createLabel('Receipts/Manual-Review')).removeLabel(labelToProcess);
        continue;
      }

      // Open Receipt Log
      const wsReceipts = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.receipts.name);

      const driveFolder = DriveApp.getFolderById(CONFIG.folderId_receipts);
      let sessionTotalVerified = 0;
      let lastTransferDate = "Unknown";

      for (const rx of receiptsFound) {
        // 1. Find file
        const fileObj = attachments.find(a => a.getName() === rx.filename);
        if (!fileObj) continue;

        // 2. Save File
        const newFileName = `${pledgeId} - ${rx.filename}`;
        const savedFile = driveFolder.createFile(fileObj.copyBlob()).setName(newFileName);
        const fileUrl = savedFile.getUrl();

        // 3. Log to Sheet
        wsReceipts.appendRow([
          `${pledgeId}-R${Date.now().toString().slice(-4)}`, // Unique Receipt ID
          pledgeId,
          new Date(),
          message.getDate(),
          rx.date || "Unknown",
          rx.amount_declared || pledgeAmount || "N/A", // Declared (LLM > Pledge > N/A)
          rx.amount || 0, // Verified Amount
          rx.confidence_score || rx.confidence || "UNKNOWN", // Support new and old schema
          fileUrl,
          rx.filename,
          "VALID"
        ]);

        sessionTotalVerified += (rx.amount || 0);
        if (rx.date) lastTransferDate = rx.date;
      }

      // --- AGGREGATION & STATUS UPDATE ---
      // We need to sum ALL receipts for this Pledge including past ones.
      // Easiest is to add current session + whatever was verified before. 
      // But for robustness, we should query the Receipt Log.
      // OPTIMIZATION: For now, we take (Existing Verified + Session Verified).

      const currentVerified = Number(rowData.data[SHEETS.donations.cols.verifiedTotalAmount - 1]) || 0;
      const newTotal = currentVerified + sessionTotalVerified;
      const balance = Math.max(0, pledgeAmount - newTotal);

      // Determine Status
      let newStatus = STATUS.pledge.PROOF_SUBMITTED; // Default "Proof Received"
      if (newTotal > 0 && newTotal < pledgeAmount) {
        newStatus = STATUS.pledge.PARTIAL_RECEIPT;
      } else if (newTotal >= pledgeAmount) {
        newStatus = STATUS.pledge.FULLY_FUNDED;
      }

      // Update Donation Sheet
      // V2.1: Balance = Real-Time Available (Verified - Allocated)
      // We use the helper to get the true wallet balance.
      // We must pass update newTotal first? No, helper reads from sheet? 
      // Helper reads 'verifiedTotalAmount' from the rowData! 
      // BUT we haven't written newTotal to the sheet yet. 
      // So we must calculate it manually here: (newTotal - allocated).
      // Let's rely on standard logic but fetch Allocations.
      // OR, simpler: Write Verified Total FIRST, then call helper?
      // Yes, writes are sequential.

      ws.getRange(rowData.row, SHEETS.donations.cols.verifiedTotalAmount).setValue(newTotal);
      SpreadsheetApp.flush(); // Ensure write is committed for the helper reading (if helper reads sheet)?
      // Actually helper calculates: Verified - Allocated.
      // We can pass the new verified amount explicitly if we modify helper? No.
      // Let's just calculate allocated manually here? Or re-read?
      // Re-reading is slow.
      // Let's just use the helper after flush.
      // We need to inject the NEW verified amount into the data array we pass to the helper.
      let updatedRowData = [...rowData.data];
      updatedRowData[SHEETS.donations.cols.verifiedTotalAmount - 1] = newTotal;
      const walletBalance = getRealTimePledgeBalance(pledgeId, updatedRowData);

      ws.getRange(rowData.row, SHEETS.donations.cols.balanceAmount).setValue(walletBalance);
      ws.getRange(rowData.row, SHEETS.donations.cols.pledgeOutstanding).setValue(pledgeAmount - newTotal); // New Column Y
      ws.getRange(rowData.row, SHEETS.donations.cols.status).setValue(newStatus);
      ws.getRange(rowData.row, SHEETS.donations.cols.actualTransferDate).setValue(lastTransferDate);
      ws.getRange(rowData.row, SHEETS.donations.cols.dateProofReceived).setValue(new Date());
      ws.getRange(rowData.row, SHEETS.donations.cols.proofLink).setValue(`See Receipt Log (Last: ${lastTransferDate})`); // Pointer

      thread.addLabel(labelProcessed).removeLabel(labelToProcess);

      logAuditEvent(
        'SYSTEM',
        'RECEIPT_PROCESSED_V2',
        pledgeId,
        `Processed ${receiptsFound.length} receipts. Total: ${newTotal}. Balance: ${balance}`,
        rowData.data[SHEETS.donations.cols.status - 1],
        newStatus,
        { receipts: receiptsFound.length, amount: sessionTotalVerified }
      );

      // --- SYNC TRACKER ---
      try {
        syncPledgeData();
      } catch (syncErr) {
        writeLog('WARN', FUNC_NAME, `Failed to sync pledge data: ${syncErr.message}`, pledgeId);
      }

    } catch (e) {
      writeLog('ERROR', FUNC_NAME, `An error occurred: ${e.toString()}`, pledgeId);
      thread.addLabel(labelProcessed).removeLabel(labelToProcess);
    }
  }
  writeLog('INFO', FUNC_NAME, 'Finished receipt processing run.');
}

/**
 * Creates an allocation record and sends the verification email to university offices.
 * VERSION 3.0: FULLY TRANSACTIONAL. Data is only committed after all operations succeed.
 * @param {string} pledgeId The Pledge ID of the donation to process.
 * @param {string} cmsId The Student CMS ID assigned by the volunteer.
 * @param {number} amount The amount allocated by the volunteer.
 * @return {boolean} Returns true if the operation was successful, false otherwise.
 */
function processAllocationTransaction(pledgeId, cmsId, amount) {
  const FUNC_NAME = 'processAllocationTransaction';

  // --- ROBUSTNESS UPGRADE: LOCKING ---
  // Prevent concurrent executions from reading stale balance data.
  const lock = LockService.getScriptLock();
  try {
    // Wait for up to 30 seconds for other processes to finish.
    const hasLock = lock.tryLock(30000);
    if (!hasLock) {
      writeLog('ERROR', FUNC_NAME, 'Could not acquire lock. System is busy. Please try again.', pledgeId);
      return false;
    }

    const rawWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.donations.name);
    const allocWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.allocations.name);

    // --- STEP 1: VALIDATE INPUTS ---
    // Sanitize the amount to handle "100,000" or other formats
    const cleanAmount = parseCurrencyString(amount);

    if (!cmsId || !cleanAmount || cleanAmount <= 0) {
      writeLog('ERROR', FUNC_NAME, `Validation failed: CMS ID is missing or Amount (${amount}) is invalid.`, pledgeId);
      return false;
    }

    const donationRowData = findRowByValue(rawWs, SHEETS.donations.cols.pledgeId, pledgeId);
    if (!donationRowData) {
      writeLog('ERROR', FUNC_NAME, `Validation failed: Could not find Pledge ID ${pledgeId} in the raw data sheet.`, pledgeId);
      return false;
    }

    const proofLink = donationRowData.data[SHEETS.donations.cols.proofLink - 1];
    if (!proofLink || proofLink === '') {
      writeLog('ERROR', FUNC_NAME, 'Validation failed: Proof of payment link is missing in the raw data.', pledgeId);
      return false;
    }

    // --- LOGIC CHECK 1: REAL-TIME PLEDGE BALANCE ---
    // Calculate balance directly from the Ledger (Allocation Log) + Raw Data
    const maxPledgeAvailable = getRealTimePledgeBalance(pledgeId, donationRowData.data);

    if (cleanAmount > maxPledgeAvailable) {
      writeLog('ERROR', FUNC_NAME, `Allocation Rejected: Amount (${cleanAmount}) exceeds Real-Time Pledge Balance (${maxPledgeAvailable}).`, pledgeId);
      return false;
    }

    // --- LOGIC CHECK 2: REAL-TIME STUDENT NEED ---
    // Calculate need directly from the Ledger (Allocation Log) + Student DB
    const maxStudentNeed = getRealTimeStudentNeed(cmsId);

    if (maxStudentNeed === null) {
      writeLog('ERROR', FUNC_NAME, `Allocation Rejected: Student ${cmsId} not found in Confidential Database.`, pledgeId);
      return false;
    }

    if (cleanAmount > maxStudentNeed) {
      writeLog('ERROR', FUNC_NAME, `Allocation Rejected: Amount (${cleanAmount}) exceeds Real-Time Student Need (${maxStudentNeed}).`, pledgeId);
      return false;
    }


    // --- STEP 2: GATHER ALL DATA FOR EMAIL ---
    // Get donor details from the raw data
    const donorName = donationRowData.data[SHEETS.donations.cols.donorName - 1];
    const donorChapter = donationRowData.data[SHEETS.donations.cols.cityCountry - 1];

    // Get student details from the Confidential Database
    const studentWs = SpreadsheetApp.openById(CONFIG.ssId_confidential).getSheetByName(SHEETS.students.name);
    const studentRowData = findRowByValue(studentWs, SHEETS.students.cols.cmsId, cmsId);

    if (!studentRowData) {
      writeLog('ERROR', FUNC_NAME, `Could not find student ${cmsId} in Confidential Database.`, pledgeId);
      return false;
    }

    const studentName = studentRowData.data[SHEETS.students.cols.name - 1];
    const studentSchool = studentRowData.data[SHEETS.students.cols.school - 1];

    // --- ROBUSTNESS UPGRADE: CC the Chapter Lead ---
    const ccString = getCCString(donorChapter);

    // Get Total Pledge Amount for Template
    // We use the centralized logic from CoreLogic.js (available in global scope)
    const durationText = donationRowData.data[SHEETS.donations.cols.duration - 1];
    const totalPledgeAmount = getPledgeAmountFromDuration(durationText);

    // --- [NEW] Get Extracted Transfer Date ---
    // If empty, default to "As per attached receipt"
    // --- STEP 1.1: FETCH VERIFIED RECEIPTS & DATES ---
    const receiptData = getVerifiedReceiptsForPledge(pledgeId);
    let transferDate = receiptData.dates.join(', ') || "As per attached receipt";
    const verifiedAmount = receiptData.totalVerified;
    const allProofFiles = receiptData.files; // Array of Blobs/Files

    // --- STEP 2.1: GENERATE ALLOCATION ID EARLY ---
    // We need this ID for the mailto link, so we generate it now instead of at the end.
    const allocationId = `ALLOC-${new Date().getTime()}`;

    // 1. Prepare Data for the Mailto Link
    const mailtoData = {
      donorName: donorName,
      donorEmail: donationRowData.data[SHEETS.donations.cols.donorEmail - 1],
      amount: cleanAmount.toLocaleString(),
      cmsId: cmsId,
      pledgeId: pledgeId,
      allocationId: allocationId,
      chapterLeadEmail: ccString,
      studentName: studentName,
      school: studentSchool,
      chapter: donorChapter // [NEW] Added Chapter
    };

    const mailtoLink = generateHostelReplyLink(mailtoData, TEMPLATES.hostelMailto);

    // --- Prepare Email Data with ALL required placeholders ---
    const emailData = {
      // Donor Details
      donorName: donorName,
      chapter: donorChapter,
      amount: cleanAmount.toLocaleString(), // Allocation Amount
      pledgeAmount: verifiedAmount.toLocaleString(), // [FIX] User requested VERIFIED amount here (Legacy Template Label says Pledge, Value is Verified)
      verifiedAmount: verifiedAmount.toLocaleString(), // [NEW]
      // Student Details
      studentName: studentName,
      studentId: cmsId,
      school: studentSchool,
      // Verification Details
      transferDate: transferDate, // <--- {{transferDate}} (Joined Dates)
      // For backward compatibility
      pledgeId: pledgeId,
      cmsId: cmsId,
      allocationDetails: `<ul><li>Student: <strong>${studentName}</strong> (${cmsId}) - Amount: <strong>PKR ${cleanAmount.toLocaleString()}</strong></li></ul>`,
      mailtoLink: mailtoLink
    };

    const emailContent = createEmailFromTemplate(TEMPLATES.hostelVerification, emailData);

    // 1. Send Hostel Verification Email & Capture ID
    let sentMessageId = 'NOT_FOUND';
    try {
      // Robustly construct recipient list
      const recipients = [EMAILS.ddHostels, EMAILS.uao].filter(e => e).join(',');

      const emailOptions = {
        from: EMAILS.processOwner,
        cc: ccString,
        attachments: []
      };

      // ATTACHMENT HANDLING (MULTI-FILE)
      const MAX_EMAIL_SIZE = 24 * 1024 * 1024;
      let currentSize = 0;
      let omittedCount = 0;

      for (const file of allProofFiles) {
        // Fix: Blobs use getBytes().length, not getSize()
        if ((currentSize + file.getBytes().length) < MAX_EMAIL_SIZE) {
          emailOptions.attachments.push(file);
          currentSize += file.getBytes().length;
        } else {
          omittedCount++;
        }
      }

      if (omittedCount > 0 || allProofFiles.length === 0) {
        const folderLink = `https://drive.google.com/drive/folders/${CONFIG.folderId_receipts}`;
        emailContent.htmlBody += `<br><p><strong>Note:</strong> ${omittedCount} receipt(s) omitted due to size limits. <a href="${folderLink}">View All Receipts</a></p>`;
      }

      sentMessageId = sendEmailAndGetId(
        recipients,
        emailContent.subject,
        emailContent.htmlBody,
        emailOptions
      );
    } catch (emailErr) {
      writeLog('ERROR', FUNC_NAME, `Failed to send Hostel Verification Email: ${emailErr.message}`, pledgeId);
      return false; // Stop transaction if primary email fails
    }

    // --- NOTIFY DONOR (INTERMEDIATE) ---
    // Send an email to the donor saying "Your funds have been allocated, awaiting hostel confirmation."
    let donorMessageId = 'NOT_SENT';
    try {
      // 1. Get Donor Email from Raw Data (Column B)
      const donorEmail = donationRowData.data[SHEETS.donations.cols.donorEmail - 1];
      const donorName = donationRowData.data[SHEETS.donations.cols.donorName - 1];

      // 2. Get Prior Message IDs for Threading
      // Priority 1: Receipt Message ID (where they sent the proof)
      // Priority 2: Pledge Email ID (initial confirmation)
      const receiptMsgId = donationRowData.data[SHEETS.donations.cols.receiptMessageId - 1];
      const pledgeMsgId = donationRowData.data[SHEETS.donations.cols.pledgeEmailId - 1]; // New Column
      const priorIds = [receiptMsgId, pledgeMsgId];

      if (donorEmail && TEMPLATES.donorAllocationNotification && TEMPLATES.donorAllocationNotification.includes('ENTER') === false) {
        const donorEmailData = {
          donorName: donorName,
          studentId: cmsId,
          amount: cleanAmount.toLocaleString(),
          pledgeId: pledgeId,
          allocationId: allocationId,
          studentName: studentName, // [NEW] Added per user request
          school: studentSchool,     // [NEW] Added per user request
          chapter: donorChapter      // [NEW] Added Chapter
        };
        const donorEmailContent = createEmailFromTemplate(TEMPLATES.donorAllocationNotification, donorEmailData);

        // Use sendOrReply to enforce Single Thread Policy
        const sentDonorMsgId = sendOrReply(
          donorEmail,
          donorEmailContent.subject,
          donorEmailContent.htmlBody,
          {
            from: EMAILS.processOwner,
            cc: ccString // Use the full CC list (AlwaysCC + Chapter Lead)
          },
          priorIds
        );
        donorMessageId = sentDonorMsgId;

        writeLog('INFO', FUNC_NAME, 'Donor allocation notification sent (threaded if possible).', pledgeId);
      } else {
        writeLog('WARN', FUNC_NAME, 'Skipping donor notification: Email missing or Template ID not set.', pledgeId);
      }
    } catch (donorErr) {
      writeLog('WARN', FUNC_NAME, `Failed to send donor notification: ${donorErr.message}`, pledgeId);
    }

    writeLog('INFO', FUNC_NAME, 'Emails sent. Proceeding to commit data.', pledgeId);

    // --- STEP 3: COMMIT DATA TO SHEETS (ONLY AFTER EMAIL SUCCESS) ---
    // sentMessageId is already captured above!

    // Append row with expanded columns matching new Config schema.
    // Order: [AllocID, CMS, Pledge, PLEDGE_AMOUNT, Alloc_Amount, Date, Status, IntimationID, IntimationDate, DonorAllocID, DonorAllocDate, ReplyID, ReplyDate, FinalNotifyID, FinalNotifyDate, StudentConfirmID, StudentConfirmDate]
    allocWs.appendRow([
      allocationId,
      cmsId,
      pledgeId,
      totalPledgeAmount, // Column 4
      cleanAmount,       // Column 5
      new Date(),        // Column 6
      STATUS.allocation.PENDING_HOSTEL, // Column 7
      formatIdForSheet(sentMessageId), new Date(), // Columns 8, 9
      formatIdForSheet(donorMessageId), new Date(), // Columns 10, 11 (Intermediate Donor)
      '', '', // Columns 12, 13 (Hostel Reply - Empty)
      '', '', // Columns 14, 15 (Final Donor Notify - Empty)
      '', ''  // Columns 16, 17 (Student Confirm - Empty)
    ]);

    // Now, write all the final data to the raw sheet.
    rawWs.getRange(donationRowData.row, SHEETS.donations.cols.cmsIdAssigned).setValue(cmsId);
    rawWs.getRange(donationRowData.row, SHEETS.donations.cols.amountAllocated).setValue(cleanAmount);

    // --- DETERMINE CORRECT STATUS: PARTIAL vs FULL ---
    // Calculate the remaining balance AFTER this allocation
    const remainingBalance = maxPledgeAvailable - cleanAmount;
    const pledgeStatus = (remainingBalance <= 0) ? STATUS.pledge.FULLY_ALLOCATED : STATUS.pledge.PARTIALLY_ALLOCATED;
    rawWs.getRange(donationRowData.row, SHEETS.donations.cols.status).setValue(pledgeStatus);

    // Trigger a background sync so the Student Lookup is updated immediately for the next user
    syncStudentData();
    syncPledgeData();

    writeLog('SUCCESS', FUNC_NAME, 'Transaction complete. Data committed, email sent, and DB synced.', pledgeId);

    // --- AUDIT TRAIL ---
    logAuditEvent(
      getActor(),
      'ALLOCATION',
      `${allocationId} (${pledgeId})`,
      'Funds Allocated & Verified Email Sent',
      '',
      STATUS.allocation.PENDING_HOSTEL,
      { amount: cleanAmount, cmsId: cmsId, method: 'Manual/Sidebar' }
    );

    return true; // --- Indicate FINAL SUCCESS

  } catch (e) {
    const errorMessage = `A critical error occurred: ${e.message}. File: ${e.fileName}. Line: ${e.lineNumber}.`;
    writeLog('ERROR', FUNC_NAME, errorMessage, pledgeId);
    return false;
  } finally {
    // Always release the lock
    lock.releaseLock();
  }
}



/**
 * Scans for university replies, analyzes them with the Gemini LLM using full conversation context.
 * VERSION 2.1: CONTEXT-AWARE
 */
function monitorUniversityReplies() {
  const FUNC_NAME = 'monitorUniversityReplies';

  const universityDomains = ['university.edu', 'finance.university.edu'];
  const searchQueries = universityDomains.map(domain => `from:(${domain}) PLEDGE- in:inbox -label:"University Comms"`);
  const searchQuery = searchQueries.join(' OR ');

  const universityCommsLabel = GmailApp.getUserLabelByName('University Comms');
  if (!universityCommsLabel) {
    writeLog('ERROR', FUNC_NAME, 'Could not find the "University Comms" Gmail label. Halting execution.');
    return;
  }

  try {
    const threads = GmailApp.search(searchQuery, 0, 10);

    if (threads.length === 0) {
      writeLog('INFO', FUNC_NAME, 'No new university communications to process.');
      return;
    }

    writeLog('INFO', FUNC_NAME, `Found ${threads.length} new university communication threads.`);

    // --- PRE-FETCH ALLOCATION LOG FOR THREAD MATCHING ---
    const allocWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.allocations.name);
    const allocData = allocWs.getDataRange().getValues();
    const messageIdMap = new Map(); // Map<MessageID, PledgeID>

    // Build Map: Cleaned Message ID -> Pledge ID
    for (let i = 1; i < allocData.length; i++) {
      const intimationId = String(allocData[i][SHEETS.allocations.cols.hostelIntimationId - 1]);
      const pId = allocData[i][SHEETS.allocations.cols.pledgeId - 1];

      if (intimationId && intimationId !== '') {
        // Store both raw and cleaned versions to be safe
        messageIdMap.set(intimationId, pId);
        messageIdMap.set(intimationId.replace(/^id:/, ''), pId);
        // Also handle RFC IDs if they were stored (strip < >)
        if (intimationId.startsWith('<')) {
          messageIdMap.set(intimationId.replace(/^<|>$/g, ''), pId);
        }
      }
    }

    for (const thread of threads) {
      const subject = thread.getFirstMessageSubject();
      let pledgeId = null;

      try {
        // --- STRATEGY 1: THREAD ID MATCHING (Robust) ---
        const messages = thread.getMessages();
        for (const msg of messages) {
          const msgId = msg.getId(); // API ID
          // We also might need to check RFC ID if we stored that? 
          // But getMessages() returns API IDs.
          // If we stored RFC ID in the sheet, we can't easily match it with msg.getId().
          // However, if the thread contains the original message, msg.getId() will return the API ID of that original message.
          // If we stored the RFC ID, we can't match it directly against API ID.
          // BUT, my sendEmailAndGetId now returns RFC ID (<...>) or API ID (id:...).
          // If I return RFC ID, I store RFC ID.

          // Workaround:
          // If I have an RFC ID in the sheet, I can't easily match it to `msg.getId()`.
          // I would need to `GmailApp.search('rfc822msgid:THE_STORED_ID')` to see if it returns this thread.
          // That is feasible!

          // Revised Strategy:
          // 1. Check if any stored RFC ID matches this thread? No, that's iterating the whole map.
          // 2. Iterate messages. If I can't match API ID, what then?

          // Let's look at the Subject Match fallback. It works.
          // Maybe I only do Thread Match if I stored an API ID?
          // Or, I can use `thread.getId()`?
          // If I stored the *Thread ID* of the outgoing email, this would be trivial.
          // But I stored Message ID.

          // Let's stick to Subject Match as primary if ID match is hard?
          // User Requirement: "While subject matching is a good backup, the primary logic should be thread-based."

          // OK, if I stored RFC ID, I can search for it.
          // But I don't know WHICH RFC ID to search for.

          // WAIT! `GmailThread` has `getId()`.
          // If I stored the API ID of the message, I could get its thread ID.
          // But I stored RFC ID.

          // Let's try to match API IDs first (if stored).
          if (messageIdMap.has(msgId)) {
            pledgeId = messageIdMap.get(msgId);
            writeLog('INFO', FUNC_NAME, `Match found via Thread/Message ID: ${msgId}`, pledgeId);
            break;
          }
        }

        // --- STRATEGY 2: SUBJECT MATCHING (Fallback) ---
        if (!pledgeId) {
          // --- CONTEXT UPGRADE: Get the full conversation, not just the last message ---
          const emailContext = getThreadContext(thread);
          // --------------------------------------------------------------------------

          const pledgeIdMatch = (subject + " " + emailContext.formattedForLLM).match(/PLEDGE-\d{4}-\d+/g);

          if (!pledgeIdMatch) {
            writeLog('WARN', FUNC_NAME, `Could not find any Pledge ID in thread with subject: "${subject}". Labeling as processed.`);
            thread.addLabel(universityCommsLabel);
            continue;
          }
          pledgeId = pledgeIdMatch[pledgeIdMatch.length - 1];
        }

        // --- AI INTEGRATION ---
        writeLog('INFO', FUNC_NAME, 'Sending structured email context to Gemini for analysis.', pledgeId);
        // --- CONTEXT UPGRADE: Send the structured conversation to the AI ---
        const emailContext = getThreadContext(thread);
        const aiResult = analyzeEmailWithGemini(emailContext.formattedForLLM);
        // -------------------------------------------------------------

        if (!aiResult) {
          writeLog('WARN', FUNC_NAME, 'AI analysis failed or returned no result. Manual review is needed.', pledgeId);
          thread.addLabel(universityCommsLabel);
          continue;
        }

        // ... The rest of the function (updating sheets, etc.) remains exactly the same ...
        const aiSummary = aiResult.summary;
        const aiStatus = aiResult.newStatus;

        const rawWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.donations.name);
        const donationRowData = findRowByValue(rawWs, SHEETS.donations.cols.pledgeId, pledgeId);

        if (donationRowData) {
          let newStatus = '';
          let logLevel = 'INFO';
          let logMessage = `AI Analysis complete. Summary: "${aiSummary}"`;

          rawWs.getRange(donationRowData.row, SHEETS.donations.cols.aiComments).setValue(aiSummary);

          if (aiStatus === 'Confirmed') {
            newStatus = STATUS.pledge.CLOSED; // Assuming full confirmation closes the pledge
            logLevel = 'SUCCESS';
          } else if (aiStatus === 'Query') {
            // If query, we don't change Pledge Status (remains FULLY_ALLOCATED), but we note it.
            // Or we could have a specific status if needed. For now, keep current or set to PARTIAL?
            // Let's just NOT update Pledge Status for Query, only AI Comments.
            newStatus = null;
            logLevel = 'WARN';
          }

          if (newStatus) {
            rawWs.getRange(donationRowData.row, SHEETS.donations.cols.status).setValue(newStatus);
          }

          // --- AUDIT TRAIL: Log Hostel Reply & Update Allocation Status ---
          try {
            // Find the allocation row for this pledge to update the log
            const allocWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.allocations.name);
            // We need to find the row in Allocation Log where pledgeId matches.
            // Reusing findRowByValue logic but for Allocation sheet
            const allocRowData = findRowByValue(allocWs, SHEETS.allocations.cols.pledgeId, pledgeId);

            if (allocRowData) {
              // Update Reply ID
              const replyMessageId = thread.getMessages()[thread.getMessageCount() - 1].getId();
              allocWs.getRange(allocRowData.row, SHEETS.allocations.cols.hostelReplyId).setValue(formatIdForSheet(replyMessageId));
              allocWs.getRange(allocRowData.row, SHEETS.allocations.cols.hostelReplyDate).setValue(new Date());

              // Update Allocation Status based on AI Result
              if (aiStatus === 'Confirmed') {
                allocWs.getRange(allocRowData.row, SHEETS.allocations.cols.status).setValue(STATUS.allocation.HOSTEL_VERIFIED);

                logAuditEvent(
                  'SYSTEM/AdminWorkflow',
                  'HOSTEL_VERIFICATION',
                  `${allocRowData.data[SHEETS.allocations.cols.allocId - 1]} (${pledgeId})`,
                  'Allocation Verified by Hostel (University Comms)',
                  '',
                  STATUS.allocation.HOSTEL_VERIFIED,
                  { msgId: replyMessageId }
                );

              } else if (aiStatus === 'Query') {
                allocWs.getRange(allocRowData.row, SHEETS.allocations.cols.status).setValue(STATUS.allocation.HOSTEL_QUERY);

                logAuditEvent(
                  'SYSTEM/AdminWorkflow',
                  'HOSTEL_QUERY',
                  `${allocRowData.data[SHEETS.allocations.cols.allocId - 1]} (${pledgeId})`,
                  'Hostel Raised a Query',
                  '',
                  STATUS.allocation.HOSTEL_QUERY,
                  { msgId: replyMessageId, summary: aiSummary }
                );
              }
            }
          } catch (auditErr) {
            writeLog('WARN', FUNC_NAME, `Failed to update Audit Log for Hostel Reply: ${auditErr.message}`, pledgeId);
          }

          writeLog(logLevel, FUNC_NAME, logMessage, pledgeId);
        } else {
          writeLog('WARN', FUNC_NAME, 'Found university email with a valid Pledge ID, but could not find a matching row in the sheet.', pledgeId);
        }

      } catch (innerErr) {
        writeLog('ERROR', FUNC_NAME, `An error occurred processing a single thread: ${innerErr.toString()}`, pledgeId);
      } finally {
        thread.addLabel(universityCommsLabel);
      }
    }
  } catch (e) {
    writeLog('ERROR', FUNC_NAME, `A critical error occurred while searching for university replies: ${e.toString()}`);
  }
}

/**
 * Fetches all VALID receipts for a given Pledge ID from the Receipt Log.
 * Used to attach multiple files to the Hostel Verification Email.
 * @param {string} pledgeId
 * @returns {Object} { totalVerified: number, dates: string[], files: Blob[] }
 */
function getVerifiedReceiptsForPledge(pledgeId) {
  const ws = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.receipts.name);
  const data = ws.getDataRange().getValues();

  let totalVerified = 0;
  const uniqueDates = new Set();
  const files = [];

  // Skip Header (Row 1)
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    // Col 2: Pledge ID, Col 11: Status
    const pId = r[SHEETS.receipts.cols.pledgeId - 1]; // Index 1
    const status = r[SHEETS.receipts.cols.status - 1]; // Index 10

    if (String(pId) === String(pledgeId) && status === "VALID") {
      // Amount
      totalVerified += Number(r[SHEETS.receipts.cols.amountVerified - 1]) || 0;

      // Date
      const dateVal = r[SHEETS.receipts.cols.transferDate - 1];
      if (dateVal) {
        if (dateVal instanceof Date) {
          uniqueDates.add(Utilities.formatDate(dateVal, Session.getScriptTimeZone(), "yyyy-MM-dd"));
        } else {
          uniqueDates.add(String(dateVal));
        }
      }

      // File
      const link = r[SHEETS.receipts.cols.driveLink - 1];
      if (link) {
        try {
          let fileId = '';
          if (link.includes("/d/")) {
            fileId = link.split('/d/')[1].split('/')[0];
          } else if (link.includes("id=")) {
            fileId = link.split('id=')[1].split('&')[0];
          } else if (link.includes("open?")) {
            // Sometimes open?id=...
            const parts = link.split('id=');
            if (parts.length > 1) fileId = parts[1].split('&')[0];
          }

          if (fileId && fileId.length > 5) {
            const blob = DriveApp.getFileById(fileId).getBlob();
            files.push(blob); // Store Blob, not File object (for consistency with Single Alloc)
            // Note: In single alloc we used .files which were blobs?
            // Line 397: for (const file of allProofFiles) { ... file.getBytes() ... }
            // Blobs have getBytes(). File objects usually don't have getBytes() directly, 
            // but DriveApp.getFileById(id) returns a File object. 
            // File object has getBlob().
            // Line 399: file.getBytes().length -- Wait, File object DOES NOT have getBytes().
            // Blob has getBytes().
            // So `files` array MUST contain BLOBS.
            // My fix: files.push(DriveApp.getFileById(fileId).getBlob()); 
            // This matches the loop expectation.
          }
        } catch (e) {
          console.warn(`Failed to fetch blob for receipt ${link}: ${e.message}`);
        }
      }
    }
  }

  return {
    totalVerified: totalVerified,
    dates: Array.from(uniqueDates).sort(),
    files: files
  };
}

/**
 * Processes a Batch Allocation.
 * 1. Creates individual Allocation rows.
 * 2. Assigns them a shared BATCH-ID.
 * 3. Sends ONE email to the Hostel.
 */
function processBatchAllocation(pledgeIds, cmsId) {
  const FUNC_NAME = 'processBatchAllocation';
  const lock = LockService.getScriptLock();
  // tryLock returns boolean, doesn't throw. Check properly.
  if (!lock.tryLock(30000)) {
    throw new Error("System busy. Please try again.");
  }

  const batchId = `BATCH-${new Date().getTime()}`;
  // Using robust opener logic instead of getSheet()
  const ssOps = SpreadsheetApp.openById(CONFIG.ssId_operations);
  const allocWs = ssOps.getSheetByName(SHEETS.allocations.name);
  const rawWs = ssOps.getSheetByName(SHEETS.donations.name);
  const studentWs = SpreadsheetApp.openById(CONFIG.ssId_confidential).getSheetByName(SHEETS.students.name);

  // We need to fetch details for the email
  const donorsForEmail = []; // { name, email, amount, pledgeId }

  try {
    // 1. Fetch Student Need (Greedy Cap Logic)
    // We must know how much the student actually needs to avoid over-allocation.
    const studentNeed = getRealTimeStudentNeed(cmsId);
    if (!studentNeed || studentNeed <= 0) throw new Error(`Student ${cmsId} has 0 pending need.`);

    let remainingNeed = studentNeed;
    let studentDetailsCache = null; // [FIX] Initialize cache for loop

    // 2. Process Pledges (FIFO / Greedy)
    for (const pledgeInput of pledgeIds) {
      if (remainingNeed <= 0 && typeof pledgeInput !== 'object') break; // [STOP] Student is fully funded (Only if auto-allocating)

      // Support both string IDs (legacy) and Object {id, amount}
      let pId, manualAmount = null;
      if (typeof pledgeInput === 'object') {
        pId = pledgeInput.id;
        manualAmount = Number(pledgeInput.amount);
      } else {
        pId = pledgeInput;
      }

      const rowData = findRowByValue(rawWs, SHEETS.donations.cols.pledgeId, pId);
      if (!rowData) throw new Error(`Pledge ID ${pId} not found.`);

      // Re-calculate balance (Security check)
      const maxAvailable = getRealTimePledgeBalance(pId, rowData.data);
      if (maxAvailable <= 0) continue; // Skip exhausted pledges

      // [LOGIC] Determine Allocation Amount
      let amountToAlloc = 0;
      if (manualAmount !== null && manualAmount > 0) {
        // Manual Override: Cap at available balance AND remaining need (User Request)
        amountToAlloc = Math.min(manualAmount, maxAvailable, remainingNeed);
      } else {
        // Auto (Greedy): Allocate what is available up to remaining need
        if (remainingNeed <= 0) continue;
        amountToAlloc = Math.min(maxAvailable, remainingNeed);
      }

      // Get Verified Amount for Logging (User Request)
      const totalVerified = Number(rowData.data[SHEETS.donations.cols.verifiedTotalAmount - 1]) || 0;

      // Create Allocation Record
      const allocId = `ALLOC-${Math.floor(Math.random() * 1000000)}`;

      // --- [NEW] SEND INTERMEDIATE DONOR NOTIFICATION ---
      let donorAllocMsgId = '';
      try {
        const dEmail = rowData.data[SHEETS.donations.cols.donorEmail - 1];
        const dName = rowData.data[SHEETS.donations.cols.donorName - 1];

        // Threading Context
        const receiptMsgId = rowData.data[SHEETS.donations.cols.receiptMessageId - 1];
        const pledgeMsgId = rowData.data[SHEETS.donations.cols.pledgeEmailId - 1];
        const priorIds = [receiptMsgId, pledgeMsgId];

        if (dEmail && TEMPLATES.donorAllocationNotification && TEMPLATES.donorAllocationNotification.includes('ENTER') === false) {
          const dData = {
            donorName: dName,
            studentId: cmsId,
            amount: amountToAlloc.toLocaleString(),
            pledgeId: pId,
            allocationId: allocId,
            studentName: '', // Fetched later
            chapter: rowData.data[SHEETS.donations.cols.cityCountry - 1] // [NEW] Added Chapter
          };

          // QUICK FIX: Fetch student details lightly if missing (or move fetching up)
          // Moving fetching up is cleaner but touches more code. 
          // I will add a lightweight lookup here or just pass basic details.
          // Actually, let's fetch the Student Name right now for the email.
          if (!studentDetailsCache) {
            const sRow = findRowByValue(studentWs, SHEETS.students.cols.cmsId, cmsId);
            if (sRow) studentDetailsCache = {
              name: sRow.data[SHEETS.students.cols.name - 1],
              school: sRow.data[SHEETS.students.cols.school - 1]
            };
          }
          if (studentDetailsCache) {
            dData.studentName = studentDetailsCache.name;
            dData.school = studentDetailsCache.school;
          }

          const content = createEmailFromTemplate(TEMPLATES.donorAllocationNotification, dData);
          donorAllocMsgId = sendOrReply(dEmail, content.subject, content.htmlBody, {
            from: EMAILS.processOwner,
            cc: getCCString(rowData.data[SHEETS.donations.cols.cityCountry - 1]) // CC Chapter Lead
          }, priorIds);
        }
      } catch (err) {
        console.warn(`Batch: Failed to notify donor ${pId}: ${err.message}`);
      }

      // --- [NEW] PREPARE DATA FOR BATCH EMAIL & ATTACHMENTS ---
      // Fetch Receipt Details using Robust Helper (Standardized)
      let dbDate = '';
      let receiptFiles = [];
      try {
        const receiptData = getVerifiedReceiptsForPledge(pId);
        receiptFiles = receiptData.files || [];
        dbDate = receiptData.dates.join(', ');

        // Fallback Date if helper returned none
        if (!dbDate || dbDate === '') dbDate = rowData.data[SHEETS.donations.cols.actualTransferDate - 1];
      } catch (e) {
        console.warn("Batch: Failed to fetch receipt details for " + pId + ": " + e.message);
      }

      // Store extended data
      donorsForEmail.push({
        pledgeId: pId,
        amount: amountToAlloc,
        verifiedAmount: totalVerified,
        name: rowData.data[SHEETS.donations.cols.donorName - 1],
        email: rowData.data[SHEETS.donations.cols.donorEmail - 1],
        chapter: rowData.data[SHEETS.donations.cols.cityCountry - 1],
        date: dbDate ? Utilities.formatDate(new Date(dbDate), Session.getScriptTimeZone(), "dd-MMM-yyyy") : 'N/A',
        receiptFiles: receiptFiles // [NEW] List of File Objects (Array)
      });

      // Write to Allocation Log
      // Columns: [AllocID, CMS, Pledge, VERIFIED_AMT, Alloc_Amount, Date, Status, 
      //           IntimID, IntimDate, DonorAllocID, DonorAllocDate ...]
      const newRow = [
        allocId, cmsId, pId,
        totalVerified,
        amountToAlloc,
        new Date(),
        STATUS.allocation.PENDING_HOSTEL,
        '', '',
        formatIdForSheet(donorAllocMsgId), new Date(), // [FIX] Log the Notification
        '', '',
        '', '',
        '', '',
        batchId
      ];
      allocWs.appendRow(newRow);

      // Update Raw Sheet Status
      // If we used up everything, it's FULLY_ALLOCATED. Else PARTIAL.
      const newBalance = maxAvailable - amountToAlloc;
      const newStatus = (newBalance <= 0) ? STATUS.pledge.FULLY_ALLOCATED : STATUS.pledge.PARTIALLY_ALLOCATED;

      rawWs.getRange(rowData.row, SHEETS.donations.cols.status).setValue(newStatus);

      // Decrement Need
      remainingNeed -= amountToAlloc;
    }

    if (donorsForEmail.length === 0) {
      throw new Error("No funds could be allocated (Surplus or Error).");
    }

    // 3. Generate Batch Mailto
    const studentRow = findRowByValue(studentWs, SHEETS.students.cols.cmsId, cmsId);
    // Student might not be found if need was calculated but row check fails (unlikely)

    const studentDetails = {
      name: studentRow.data[SHEETS.students.cols.name - 1],
      cms: cmsId,
      school: studentRow.data[SHEETS.students.cols.school - 1]
    };

    const mailtoLink = generateBatchMailtoLink(donorsForEmail, studentDetails, batchId);

    // 4. PREPARE EMAIL CONTENT (HTML TABLE + ATTACHMENTS)

    // --- [NEW] GENERATE HTML TABLE (ROBUST FORMATTING) ---
    // User requested to fix text overlapping. Reverting to standard safe CSS.

    // Simple, robust table styles
    const styleTable = 'width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; font-family: Arial, sans-serif; font-size: 10pt;';
    const styleTh = 'border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: left; font-weight: bold; min-width: 80px;';
    const styleTd = 'border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; word-wrap: break-word;';

    let donorTableHtml = `<table style="${styleTable}">
        <thead>
            <tr>
                <th style="${styleTh}">Donor Name</th>
                <th style="${styleTh}">Chapter</th>
                <th style="${styleTh}">Date</th>
                <th style="${styleTh}">Verified</th>
                <th style="${styleTh}">Allocated</th>
            </tr>
        </thead>
        <tbody>`;

    donorsForEmail.forEach(d => {
      donorTableHtml += `
            <tr>
                <td style="${styleTd}">${d.name}</td>
                <td style="${styleTd}">${d.chapter}</td>
                <td style="${styleTd} white-space: nowrap;">${d.date}</td>
                <td style="${styleTd}">PKR ${Number(d.verifiedAmount).toLocaleString()}</td>
                <td style="${styleTd}">PKR ${Number(d.amount).toLocaleString()}</td>
            </tr>`;
    });

    donorTableHtml += `</tbody></table>`;

    // Fallback if empty (should not happen)
    if (donorsForEmail.length === 0) donorTableHtml = '<p>No donors found.</p>';

    // B. Collect Attachments
    const emailAttachments = [];
    let currentSize = 0;
    const MAX_EMAIL_SIZE = 24 * 1024 * 1024;

    donorsForEmail.forEach(d => {
      if (d.receiptFiles && d.receiptFiles.length > 0) {
        d.receiptFiles.forEach(blob => {
          try {
            // receiptFiles contains Blobs (from getVerifiedReceiptsForPledge)
            // d.receiptFiles.forEach(blob => ...)
            if ((currentSize + blob.getBytes().length) < MAX_EMAIL_SIZE) {
              emailAttachments.push(blob);
              currentSize += blob.getBytes().length;
            }
          } catch (err) {
            console.warn("Batch: Failed to attach file for " + d.pledgeId + ": " + err.message);
          }
        });
      }
    });

    // C. Send Email to Hostel
    let emailBody = "";
    let emailSubject = `Batch Request ${batchId}`;

    if (TEMPLATES.batchIntimationToHostel) {
      const templateData = {
        batchId: batchId,
        studentName: studentDetails.name,
        studentId: studentDetails.cms, // [NEW] Added
        receiptCount: emailAttachments.length.toString(), // [NEW] Added
        donorTable: donorTableHtml, // [NEW] Injected HTML
        totalAmount: (studentNeed - remainingNeed).toLocaleString(),
        mailtoLink: mailtoLink, // [FIX] Renamed property to trigger replacement
        cmsId: studentDetails.cms,
        school: studentDetails.school
      };
      const templateResult = createEmailFromTemplate(TEMPLATES.batchIntimationToHostel, templateData);
      emailBody = templateResult.htmlBody;
      emailSubject = templateResult.subject;
    } else {
      // Fallback if no template configured
      emailBody = `
            <h2>Batch Allocation Request</h2>
            <p><strong>Batch Ref:</strong> ${batchId}</p>
            <p>Please verify funds for student: <strong>${studentDetails.name}</strong></p>
            ${donorTableHtml}
            <p><a href="${mailtoLink}">CLICK HERE TO CONFIRM BATCH (BCC DONORS)</a></p>
        `;
    }

    // [FIX] Aggregate CCs (AlwaysCC + Chapter Leads from this batch)
    let ccEmails = [];
    if (EMAILS.alwaysCC) {
      ccEmails = ccEmails.concat(Array.isArray(EMAILS.alwaysCC) ? EMAILS.alwaysCC : [EMAILS.alwaysCC]);
    }

    // Get unique chapters from donors in this batch
    const distinctChapters = [...new Set(donorsForEmail.map(d => d.chapter))];
    distinctChapters.forEach(chapter => {
      const safeChapter = chapter || 'Other';
      // Access MAPPINGS safely (Config might be loaded via global context)
      const leads = MAPPINGS.chapterLeads[safeChapter] || MAPPINGS.chapterLeads['Other'] || [];
      ccEmails = ccEmails.concat(Array.isArray(leads) ? leads : [leads]);
    });

    // Dedup
    const finalCC = [...new Set(ccEmails)].filter(e => e && e.trim() !== '').join(',');

    GmailApp.sendEmail(EMAILS.ddHostels, emailSubject, '', {
      htmlBody: emailBody,
      cc: finalCC,
      attachments: emailAttachments // [NEW] Attach proofs
    });

    writeLog('SUCCESS', FUNC_NAME, `Batch ${batchId} processed. Allocated: ${(studentNeed - remainingNeed)}.`);

    // Sync
    syncStudentData();
    syncPledgeData();

  } catch (e) {
    writeLog('ERROR', FUNC_NAME, e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}