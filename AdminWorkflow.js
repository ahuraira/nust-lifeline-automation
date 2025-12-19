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
      const isInternal = [EMAILS.ddHostels, EMAILS.uao].some(email => sender.includes(email.toLowerCase()));

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

      let pledgeDate = new Date(); // Default fallbacks
      if (rowData) {
        // Assume timestamp is in Column 1 (Index 0)
        const rawDate = rowData.data[SHEETS.donations.cols.timestamp - 1];
        if (rawDate) pledgeDate = new Date(rawDate);
      }

      // --- AI ANALYSIS (MULTIMODAL) ---
      writeLog('INFO', FUNC_NAME, 'Analyzing email with Gemini (structured format + attachments)...', pledgeId);

      // We pass the raw attachments to the LLM service which will handle base64 conversion
      const aiResult = analyzeDonorEmail(
        emailContext.formattedForLLM,
        attachments,
        pledgeDate,
        message.getDate() // Email Date
      );

      if (!aiResult) {
        writeLog('WARN', FUNC_NAME, 'AI Analysis failed. Proceeding to manual attachment selection (Fallback Mode).', pledgeId);
        // Logic will automatically fall through to 'findBestAttachment' below.
      } else if (aiResult.category === 'QUESTION') {
        // --- HANDLE QUESTION ---
        writeLog('WARN', FUNC_NAME, `Donor Question Detected: "${aiResult.summary}"`, pledgeId);

        const queryLabel = GmailApp.createLabel('Receipts/Donor-Query'); // Ensure label exists
        thread.addLabel(queryLabel).removeLabel(labelToProcess);

        // Create Draft Reply
        if (aiResult.suggested_reply) {
          thread.createDraftReply(aiResult.suggested_reply);
          writeLog('INFO', FUNC_NAME, 'Draft reply created for donor question.', pledgeId);
        }

        // Log to Sheet Notes
        const ws = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.donations.name);
        const rowData = findRowByValue(ws, SHEETS.donations.cols.pledgeId, pledgeId);
        if (rowData) {
          ws.getRange(rowData.row, SHEETS.donations.cols.notes).setValue(`[Query] ${aiResult.summary}`);
        }
        continue; // STOP PROCESSING
      } else if (aiResult.category === 'IRRELEVANT') {
        // --- HANDLE IRRELEVANT ---
        writeLog('INFO', FUNC_NAME, 'Email classified as Irrelevant/Spam.', pledgeId);
        const ignoredLabel = GmailApp.createLabel('Receipts/Ignored');
        thread.addLabel(ignoredLabel).removeLabel(labelToProcess);
        continue; // STOP PROCESSING
      }

      // --- HANDLE RECEIPT SUBMISSION ---
      // If AI identified a specific file, try to find it. Otherwise use fallback.
      let receiptFile = null;
      if (aiResult && aiResult.receipt_filename) { // Use 'receipt_filename' from new schema
        receiptFile = attachments.find(a => a.getName() === aiResult.receipt_filename);
      }

      if (!receiptFile) {
        receiptFile = findBestAttachment(attachments); // Fallback to heuristic
      }

      if (!receiptFile) {
        writeLog('WARN', FUNC_NAME, 'Could not find a suitable receipt attachment. Skipping.', pledgeId);
        thread.addLabel(labelProcessed).removeLabel(labelToProcess);
        continue;
      }
      // ----------------------------------------------------------

      writeLog('INFO', FUNC_NAME, `Selected attachment: "${receiptFile.getName()}" with size ${receiptFile.getSize()} bytes.`, pledgeId);

      // (rowData is already fetched above)

      if (!rowData) {
        writeLog('WARN', FUNC_NAME, 'Pledge ID found in email, but no matching row in the spreadsheet. Skipping.', pledgeId);
        thread.addLabel(labelProcessed).removeLabel(labelToProcess);
        continue;
      }

      const driveFolder = DriveApp.getFolderById(CONFIG.folderId_receipts);
      const newFileName = `${pledgeId} - Receipt - ${receiptFile.getName()}`;
      const savedFile = driveFolder.createFile(receiptFile.copyBlob()).setName(newFileName);
      const fileUrl = savedFile.getUrl();

      ws.getRange(rowData.row, SHEETS.donations.cols.proofLink).setValue(fileUrl);
      ws.getRange(rowData.row, SHEETS.donations.cols.status).setValue(STATUS.pledge.PROOF_SUBMITTED);
      ws.getRange(rowData.row, SHEETS.donations.cols.dateProofReceived).setValue(new Date());
      // Use 'id:' prefix for Gmail API IDs (Thread/Message IDs)
      ws.getRange(rowData.row, SHEETS.donations.cols.receiptMessageId).setValue(formatIdForSheet(message.getId()));

      // --- NEW: WRITE EXTRACTED TRANSFER DATE ---
      const transferDate = aiResult && aiResult.extracted_transfer_date ? aiResult.extracted_transfer_date : "As per attached receipt";
      ws.getRange(rowData.row, SHEETS.donations.cols.actualTransferDate).setValue(transferDate);

      thread.addLabel(labelProcessed).removeLabel(labelToProcess);

      writeLog('SUCCESS', FUNC_NAME, `Successfully processed receipt. File saved to Drive: ${newFileName}. Date extracted: ${transferDate}`, pledgeId);

      logAuditEvent(
        'SYSTEM',
        'RECEIPT_PROCESSED',
        pledgeId,
        'Proof of Payment Uploaded',
        STATUS.pledge.PLEDGED,
        STATUS.pledge.PROOF_SUBMITTED,
        { fileUrl: fileUrl, messageId: message.getId() }
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
    const cleanAmount = parseCurrency(amount);

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
      allocationId: allocationId, // [NEW] Pass Allocation ID for Copywriting
      chapterLeadEmail: ccString
    };

    const mailtoLink = generateHostelReplyLink(mailtoData);

    // --- Prepare Email Data with ALL required placeholders ---
    const emailData = {
      // Donor Details
      donorName: donorName,
      chapter: donorChapter,
      amount: cleanAmount.toLocaleString(), // Allocation Amount
      pledgeAmount: totalPledgeAmount.toLocaleString(), // Total Pledge Amount
      // Student Details
      studentName: studentName,
      studentId: cmsId,
      school: studentSchool,
      // For backward compatibility
      pledgeId: pledgeId,
      cmsId: cmsId,
      allocationDetails: `<ul><li>Student: <strong>${studentName}</strong> (${cmsId}) - Amount: <strong>PKR ${cleanAmount.toLocaleString()}</strong></li></ul>`,
      mailtoLink: mailtoLink // <--- PASS THE LINK HERE
    };

    const emailContent = createEmailFromTemplate(TEMPLATES.hostelVerification, emailData);
    const proofFile = DriveApp.getFileById(proofLink.split('/d/')[1].split('/')[0]);

    // 1. Send Hostel Verification Email & Capture ID
    let sentMessageId = 'NOT_FOUND';
    try {
      sentMessageId = sendEmailAndGetId(
        `${EMAILS.ddHostels},${EMAILS.uao}`,
        emailContent.subject,
        emailContent.htmlBody,
        {
          attachments: [proofFile],
          from: EMAILS.processOwner,
          cc: ccString
        }
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
          allocationId: allocationId //[NEW]
        };
        const donorEmailContent = createEmailFromTemplate(TEMPLATES.donorAllocationNotification, donorEmailData);

        // Use sendOrReply to enforce Single Thread Policy
        const sentDonorMsgId = sendOrReply(
          donorEmail,
          donorEmailContent.subject,
          donorEmailContent.htmlBody,
          {
            from: EMAILS.processOwner,
            cc: EMAILS.alwaysCC
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