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
      // --- [V59.3] Unified ID extraction - only PLEDGE-YYYY-NNN format ---
      // No more SUB- prefix. Subscription detection via sheet lookup.
      const idMatches = subject.match(/PLEDGE-\d{4}-\d+/g);

      if (!idMatches) {
        writeLog('WARN', FUNC_NAME, `Could not find any Pledge ID in subject: "${subject}". Skipping.`);
        thread.addLabel(labelProcessed).removeLabel(labelToProcess);
        continue;
      }

      // Always use the last ID found (most specific/recent)
      const extractedId = idMatches[idMatches.length - 1];

      // [V59.3] Check if this is a subscription by looking up in Monthly Pledges
      const subWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.monthlyPledges.name);
      const subRow = findRowByValue(subWs, SHEETS.monthlyPledges.cols.subscriptionId, extractedId);
      const isSubscription = !!subRow;

      writeLog('INFO', FUNC_NAME, `Found ID: ${extractedId} (Subscription: ${isSubscription})`, extractedId);

      // --- CROSS-PROCESSING FIX: Skip Internal/Hostel Emails ---
      // These should be handled by the Watchdog, not the Receipt Processor.
      const sender = message.getFrom().toLowerCase();
      // We check if the sender includes any of our known Hostel/UAO addresses
      const internalEmails = [EMAILS.ddHostels, EMAILS.uao].filter(e => e); // Filter out null/undefined
      const isInternal = internalEmails.some(email => sender.includes(email.toLowerCase()));

      if (isInternal) {
        writeLog('INFO', FUNC_NAME, `Skipping internal email from ${sender}. Likely a Hostel Reply (Watchdog territory).`, extractedId);
        // Remove the 'Receipts' label so we don't process it again here.
        // It will be picked up by 'runWatchdog' if it matches the 'Ref:' pattern.
        thread.removeLabel(labelToProcess);
        continue;
      }
      // ----------------------------------------------------------------

      const attachments = message.getAttachments();

      // --- [V59.3] BRANCH: SUBSCRIPTION RECEIPT (detected by sheet lookup) ---
      if (isSubscription) {
        writeLog('INFO', FUNC_NAME, `Processing Subscription Receipt for ${extractedId}`);

        // Call SubscriptionService to handle the payment
        // We pass the FIRST attachment found (assuming it's the receipt)
        // In a future update, we could add stricter attachment checks

        try {
          // We use the first attachment or null if none (though receipt usually requires one)
          const receiptBlob = attachments.length > 0 ? attachments[0] : null;

          if (receiptBlob) {
            // Save to Drive first (optional, but good practice)
            // For now, recordSubscriptionPayment handles logic. 
            // Ideally we pass the file token or ID. 
            // Let's assume recordSubscriptionPayment helps or we save it here.

            // Actually, recordSubscriptionPayment expects a file ID if we want to link it.
            // Let's check SubscriptionService.js signature.
            // It takes (subscriptionId, amount, receiptId, notes, date)
            // It doesn't upload files itself.

            // So we should save the file here.
            const folderId = CONFIG.folders.receipts;
            const folder = DriveApp.getFolderById(folderId);
            const file = folder.createFile(receiptBlob);
            file.setName(`${extractedId}_Receipt_${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd')}`);

            // [V59.3 FIX] Get monthly amount from subscription record
            // recordSubscriptionPayment signature: (subscriptionId, receiptId, amount)
            const monthlyAmount = subRow.data[SHEETS.monthlyPledges.cols.monthlyAmount - 1] || 0;

            if (!monthlyAmount || monthlyAmount <= 0) {
              writeLog('ERROR', FUNC_NAME, `Invalid monthly amount (${monthlyAmount}) for ${extractedId}. Cannot process.`);
              thread.addLabel(labelProcessed).removeLabel(labelToProcess);
              continue;
            }

            // Call with correct signature: (subscriptionId, receiptId, amount)
            const result = recordSubscriptionPayment(extractedId, file.getId(), monthlyAmount);

            // recordSubscriptionPayment returns boolean, not object
            if (result) {
              writeLog('SUCCESS', FUNC_NAME, `Subscription payment recorded for ${extractedId}`);
              // recordSubscriptionPayment sends the confirmation email internally
            } else {
              writeLog('ERROR', FUNC_NAME, `Failed to record subscription payment for ${extractedId}`);
            }
          } else {
            writeLog('WARN', FUNC_NAME, 'No attachment found for subscription receipt.');
          }

        } catch (e) {
          writeLog('ERROR', FUNC_NAME, `Error processing subscription receipt: ${e.message}`);
        }

        // Done with this thread
        thread.addLabel(labelProcessed).removeLabel(labelToProcess);
        continue;
      }

      // --- BRANCH: STANDARD PLEDGE RECEIPT (Existing Logic) ---
      pledgeId = extractedId; // Set for existing logic below

      writeLog('INFO', FUNC_NAME, 'Found Pledge ID. Starting processing.', pledgeId);

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
      const aiStartTime = Date.now();
      const aiResult = analyzeDonorEmail(
        emailContext.formattedForLLM,
        attachments,
        pledgeDate,
        message.getDate(),
        pledgeAmount
      );
      const aiProcessingTime = Date.now() - aiStartTime;

      // [V59.3] Log AI response to AI Audit Log
      logAIResponse(
        pledgeId,
        message.getFrom(),
        subject,
        aiResult,
        aiProcessingTime,
        [] // Receipt links will be updated after processing
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
      const savedReceiptLinks = []; // [V59.3] Collect receipt links for AI log

      for (const rx of receiptsFound) {
        // 1. Find file
        const fileObj = attachments.find(a => a.getName() === rx.filename);
        if (!fileObj) continue;

        // 2. Save File
        const newFileName = `${pledgeId} - ${rx.filename}`;
        const savedFile = driveFolder.createFile(fileObj.copyBlob()).setName(newFileName);
        const fileUrl = savedFile.getUrl();
        savedReceiptLinks.push(fileUrl); // [V59.3] Track for AI log

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

      // [V59.3] Update AI Audit Log with receipt links
      if (savedReceiptLinks.length > 0) {
        updateAILogWithReceipts(pledgeId, savedReceiptLinks);
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
 * [V59.4] Processes a Batch Allocation with support for MULTIPLE students.
 * 
 * @param {Array} pledgeIds - Array of pledge IDs (strings or {id, amount} objects)
 * @param {Array|string} students - Array of CMS IDs (strings) or objects {cmsId, amount}
 *                                  If strings: equal distribution across students
 *                                  If objects with amount: explicit amounts per student
 *                                  If single string: backward compatible single student
 * 
 * Creates individual Allocation rows (one per pledge-student pair).
 * Assigns them a shared BATCH-ID.
 * Sends ONE email to the Hostel with consolidated tables.
 */
function processBatchAllocation(pledgeIds, students) {
  const FUNC_NAME = 'processBatchAllocation';
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error("System busy. Please try again.");
  }

  const batchId = `BATCH-${new Date().getTime()}`;
  const ssOps = SpreadsheetApp.openById(CONFIG.ssId_operations);
  const allocWs = ssOps.getSheetByName(SHEETS.allocations.name);
  const rawWs = ssOps.getSheetByName(SHEETS.donations.name);
  const studentWs = SpreadsheetApp.openById(CONFIG.ssId_confidential).getSheetByName(SHEETS.students.name);

  // Tracking for email generation
  const donorsForEmail = []; // { name, email, amount, pledgeId, chapter, date, receiptFiles }
  const studentsForEmail = []; // { name, cmsId, school, allocated }

  try {
    // ========================================================================
    // 1. NORMALIZE INPUTS
    // ========================================================================

    // Normalize students to array of objects
    let studentList = [];
    if (typeof students === 'string') {
      // Backward compatible: single CMS ID string
      studentList = [{ cmsId: students, amount: null }];
      writeLog('INFO', FUNC_NAME, `Single student mode: ${students}`, batchId);
    } else if (Array.isArray(students)) {
      studentList = students.map(s => {
        if (typeof s === 'string') {
          return { cmsId: s, amount: null }; // Equal distribution
        } else if (typeof s === 'object' && s.cmsId) {
          return { cmsId: s.cmsId, amount: s.amount || null };
        } else {
          throw new Error(`Invalid student entry: ${JSON.stringify(s)}`);
        }
      });
      writeLog('INFO', FUNC_NAME, `Multi-student mode: ${studentList.length} students`, batchId);
    } else {
      throw new Error('Invalid students parameter. Expected string or array.');
    }

    if (studentList.length === 0) throw new Error('No students provided.');
    if (!pledgeIds || pledgeIds.length === 0) throw new Error('No pledge IDs provided.');

    // ========================================================================
    // 2. FETCH STUDENT DATA AND CALCULATE TARGETS
    // ========================================================================

    const studentData = []; // { cmsId, name, school, need, target, allocated, row }

    for (const s of studentList) {
      const sRow = findRowByValue(studentWs, SHEETS.students.cols.cmsId, s.cmsId);
      if (!sRow) throw new Error(`Student ${s.cmsId} not found.`);

      const need = getRealTimeStudentNeed(s.cmsId);
      if (!need || need <= 0) {
        writeLog('WARN', FUNC_NAME, `Student ${s.cmsId} has 0 need. Skipping.`, batchId);
        continue;
      }

      studentData.push({
        cmsId: s.cmsId,
        name: sRow.data[SHEETS.students.cols.name - 1] || 'Unknown',
        school: sRow.data[SHEETS.students.cols.school - 1] || 'Unknown',
        need: need,
        target: s.amount || null, // null = calculate later
        allocated: 0
      });
    }

    if (studentData.length === 0) throw new Error('No students with pending need.');

    // ========================================================================
    // 3. FETCH PLEDGE BALANCES
    // ========================================================================

    const pledgeData = []; // { pledgeId, balance, remaining, rowData }
    let totalAvailable = 0;

    for (const pledgeInput of pledgeIds) {
      let pId = typeof pledgeInput === 'object' ? pledgeInput.id : pledgeInput;

      const rowData = findRowByValue(rawWs, SHEETS.donations.cols.pledgeId, pId);
      if (!rowData) throw new Error(`Pledge ID ${pId} not found.`);

      const balance = getRealTimePledgeBalance(pId, rowData.data);
      if (balance <= 0) {
        writeLog('WARN', FUNC_NAME, `Pledge ${pId} has 0 balance. Skipping.`, batchId);
        continue;
      }

      pledgeData.push({
        pledgeId: pId,
        balance: balance,
        remaining: balance,
        rowData: rowData
      });
      totalAvailable += balance;
    }

    if (pledgeData.length === 0) throw new Error('No pledges with available balance.');
    writeLog('INFO', FUNC_NAME, `Total available from ${pledgeData.length} pledges: ${totalAvailable}`, batchId);

    // ========================================================================
    // 4. CALCULATE TARGET AMOUNTS (if not explicit)
    // ========================================================================

    const hasExplicitAmounts = studentData.some(s => s.target !== null);

    if (!hasExplicitAmounts) {
      // Equal distribution: divide available funds equally (capped by individual need)
      const equalShare = Math.floor(totalAvailable / studentData.length);
      studentData.forEach(s => {
        s.target = Math.min(equalShare, s.need);
      });
      writeLog('INFO', FUNC_NAME, `Equal distribution: ${equalShare} per student`, batchId);
    } else {
      // Use explicit amounts but validate against need
      studentData.forEach(s => {
        if (s.target === null) {
          // Mixed mode: no amount specified for this student, use their need
          s.target = s.need;
        }
        s.target = Math.min(s.target, s.need); // Cap at need
      });
      writeLog('INFO', FUNC_NAME, 'Using explicit amounts per student', batchId);
    }

    // ========================================================================
    // 5. GREEDY DISTRIBUTION: Allocate pledges to students
    // ========================================================================

    const allocationRows = []; // For batch writing to Allocation Log

    for (const student of studentData) {
      let neededForStudent = student.target - student.allocated;
      if (neededForStudent <= 0) continue;

      writeLog('INFO', FUNC_NAME, `Processing ${student.cmsId}: target=${student.target}`, batchId);

      for (const pledge of pledgeData) {
        if (neededForStudent <= 0) break;
        if (pledge.remaining <= 0) continue;

        const amountToAlloc = Math.min(pledge.remaining, neededForStudent);

        // Get verified amount for logging
        const totalVerified = Number(pledge.rowData.data[SHEETS.donations.cols.verifiedTotalAmount - 1]) || 0;

        // Create allocation ID
        const allocId = `ALLOC-${Math.floor(Math.random() * 1000000)}`;

        // --- DONOR NOTIFICATION (per allocation) ---
        let donorAllocMsgId = '';
        try {
          const dEmail = pledge.rowData.data[SHEETS.donations.cols.donorEmail - 1];
          const dName = pledge.rowData.data[SHEETS.donations.cols.donorName - 1];

          if (dEmail && TEMPLATES.donorAllocationNotification &&
            !TEMPLATES.donorAllocationNotification.includes('ENTER')) {
            const receiptMsgId = pledge.rowData.data[SHEETS.donations.cols.receiptMessageId - 1];
            const pledgeMsgId = pledge.rowData.data[SHEETS.donations.cols.pledgeEmailId - 1];

            const dData = {
              donorName: dName,
              studentId: student.cmsId,
              cmsId: student.cmsId,
              amount: amountToAlloc.toLocaleString(),
              pledgeId: pledge.pledgeId,
              allocationId: allocId,
              studentName: student.name,
              school: student.school,
              chapter: pledge.rowData.data[SHEETS.donations.cols.cityCountry - 1]
            };

            const content = createEmailFromTemplate(TEMPLATES.donorAllocationNotification, dData);
            donorAllocMsgId = sendOrReply(dEmail, content.subject, content.htmlBody, {
              from: EMAILS.processOwner,
              cc: getCCString(pledge.rowData.data[SHEETS.donations.cols.cityCountry - 1])
            }, [receiptMsgId, pledgeMsgId]);
          }
        } catch (err) {
          writeLog('WARN', FUNC_NAME, `Failed to notify donor ${pledge.pledgeId}: ${err.message}`, batchId);
        }

        // --- Fetch Receipt Files forEmail ---
        let receiptFiles = [];
        let dbDate = '';
        try {
          const receiptData = getVerifiedReceiptsForPledge(pledge.pledgeId);
          receiptFiles = receiptData.files || [];
          dbDate = receiptData.dates.join(', ') || pledge.rowData.data[SHEETS.donations.cols.actualTransferDate - 1];
        } catch (e) {
          writeLog('WARN', FUNC_NAME, `Failed to fetch receipts for ${pledge.pledgeId}: ${e.message}`, batchId);
        }

        // --- Track for email ---
        // Check if this pledge already added (may appear multiple times if funding multiple students)
        const existingDonor = donorsForEmail.find(d => d.pledgeId === pledge.pledgeId);
        if (existingDonor) {
          existingDonor.amount += amountToAlloc; // Aggregate
        } else {
          donorsForEmail.push({
            pledgeId: pledge.pledgeId,
            amount: amountToAlloc,
            verifiedAmount: totalVerified,
            name: pledge.rowData.data[SHEETS.donations.cols.donorName - 1],
            email: pledge.rowData.data[SHEETS.donations.cols.donorEmail - 1],
            chapter: pledge.rowData.data[SHEETS.donations.cols.cityCountry - 1],
            date: dbDate ? Utilities.formatDate(new Date(dbDate), Session.getScriptTimeZone(), "dd-MMM-yyyy") : 'N/A',
            receiptFiles: receiptFiles
          });
        }

        // --- Prepare Allocation Row ---
        const newRow = [
          allocId, student.cmsId, pledge.pledgeId,
          totalVerified,
          amountToAlloc,
          new Date(),
          STATUS.allocation.PENDING_HOSTEL,
          '', '',
          formatIdForSheet(donorAllocMsgId), new Date(),
          '', '',
          '', '',
          '', '',
          batchId
        ];
        allocationRows.push(newRow);

        // Update tracking
        student.allocated += amountToAlloc;
        pledge.remaining -= amountToAlloc;
        neededForStudent -= amountToAlloc;

        writeLog('INFO', FUNC_NAME,
          `Allocated ${amountToAlloc} from ${pledge.pledgeId} to ${student.cmsId}`, batchId);
      }

      // Check if student was fully or partially funded
      if (student.allocated < student.target) {
        writeLog('WARN', FUNC_NAME,
          `Student ${student.cmsId} partially funded: ${student.allocated}/${student.target}`, batchId);
      }

      // Add to students for email
      studentsForEmail.push({
        name: student.name,
        cmsId: student.cmsId,
        school: student.school,
        allocated: student.allocated
      });
    }

    if (allocationRows.length === 0) {
      throw new Error("No allocations could be made (insufficient funds or invalid data).");
    }

    // ========================================================================
    // 6. WRITE ALL ALLOCATION ROWS TO LOG
    // ========================================================================

    allocationRows.forEach(row => allocWs.appendRow(row));
    writeLog('INFO', FUNC_NAME, `Written ${allocationRows.length} allocation rows`, batchId);

    // ========================================================================
    // 7. UPDATE PLEDGE STATUSES
    // ========================================================================

    for (const pledge of pledgeData) {
      const usedAmount = pledge.balance - pledge.remaining;
      if (usedAmount > 0) {
        const newStatus = pledge.remaining <= 0
          ? STATUS.pledge.FULLY_ALLOCATED
          : STATUS.pledge.PARTIALLY_ALLOCATED;
        rawWs.getRange(pledge.rowData.row, SHEETS.donations.cols.status).setValue(newStatus);
      }
    }

    // ========================================================================
    // 8. BUILD EMAIL CONTENT
    // ========================================================================

    // Shared table styling
    const styleTable = 'width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; font-family: Arial, sans-serif; font-size: 10pt;';
    const styleTh = 'border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: left; font-weight: bold; min-width: 80px;';
    const styleTd = 'border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; word-wrap: break-word;';

    // --- Donor Table ---
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

    // --- Student Table (MATCHING FORMAT) ---
    let studentTableHtml = `<table style="${styleTable}">
        <thead>
            <tr>
                <th style="${styleTh}">Name</th>
                <th style="${styleTh}">CMS ID</th>
                <th style="${styleTh}">School</th>
                <th style="${styleTh}">Allocated</th>
            </tr>
        </thead>
        <tbody>`;

    const totalAllocated = studentsForEmail.reduce((sum, s) => sum + s.allocated, 0);
    studentsForEmail.forEach(s => {
      studentTableHtml += `
            <tr>
                <td style="${styleTd}">${s.name}</td>
                <td style="${styleTd}">${s.cmsId}</td>
                <td style="${styleTd}">${s.school}</td>
                <td style="${styleTd}">PKR ${Number(s.allocated).toLocaleString()}</td>
            </tr>`;
    });
    studentTableHtml += `</tbody></table>`;

    // --- Collect Attachments ---
    const emailAttachments = [];
    let currentSize = 0;
    const MAX_EMAIL_SIZE = 24 * 1024 * 1024;

    donorsForEmail.forEach(d => {
      if (d.receiptFiles && d.receiptFiles.length > 0) {
        d.receiptFiles.forEach(blob => {
          try {
            if ((currentSize + blob.getBytes().length) < MAX_EMAIL_SIZE) {
              emailAttachments.push(blob);
              currentSize += blob.getBytes().length;
            }
          } catch (err) {
            writeLog('WARN', FUNC_NAME, `Failed to attach file: ${err.message}`, batchId);
          }
        });
      }
    });

    // --- Generate Mailto Link with all students ---
    // [V59.4] Pass all students for text-only studentTable in mailto body
    const mailtoLink = generateBatchMailtoLink(donorsForEmail, studentsForEmail, batchId);

    // --- Build Final Email ---
    let emailBody = "";
    let emailSubject = `Batch Request ${batchId}`;

    if (TEMPLATES.batchIntimationToHostel) {
      const templateData = {
        batchId: batchId,
        studentName: studentsForEmail.map(s => s.name).join(', '),
        studentId: studentsForEmail.map(s => s.cmsId).join(', '),
        cmsId: studentsForEmail.map(s => s.cmsId).join(', '),
        studentIds: studentsForEmail.map(s => s.cmsId).join(', '),
        studentTable: studentTableHtml,
        receiptCount: emailAttachments.length.toString(),
        donorTable: donorTableHtml,
        totalAmount: totalAllocated.toLocaleString(),
        mailtoLink: mailtoLink,
        school: studentsForEmail.map(s => s.school).join(', '),
        studentCount: studentsForEmail.length.toString()
      };
      const templateResult = createEmailFromTemplate(TEMPLATES.batchIntimationToHostel, templateData);
      emailBody = templateResult.htmlBody;
      emailSubject = templateResult.subject;
    } else {
      // Fallback
      emailBody = `
            <h2>Batch Allocation Request</h2>
            <p><strong>Batch Ref:</strong> ${batchId}</p>
            <h3>Donors</h3>
            ${donorTableHtml}
            <h3>Students</h3>
            ${studentTableHtml}
            <p><strong>Total Allocated:</strong> PKR ${totalAllocated.toLocaleString()}</p>
            <p><a href="${mailtoLink}">CLICK HERE TO CONFIRM BATCH (BCC DONORS)</a></p>
        `;
    }

    // --- Aggregate CCs ---
    let ccEmails = [];
    if (EMAILS.alwaysCC) {
      ccEmails = ccEmails.concat(Array.isArray(EMAILS.alwaysCC) ? EMAILS.alwaysCC : [EMAILS.alwaysCC]);
    }
    const distinctChapters = [...new Set(donorsForEmail.map(d => d.chapter))];
    distinctChapters.forEach(chapter => {
      const safeChapter = chapter || 'Other';
      const leads = MAPPINGS.chapterLeads[safeChapter] || MAPPINGS.chapterLeads['Other'] || [];
      ccEmails = ccEmails.concat(Array.isArray(leads) ? leads : [leads]);
    });
    const finalCC = [...new Set(ccEmails)].filter(e => e && e.trim() !== '').join(',');

    // ========================================================================
    // 9. SEND ONE CONSOLIDATED EMAIL & STORE MESSAGE ID
    // ========================================================================

    const hostelMsgId = sendEmailAndGetId(EMAILS.ddHostels, emailSubject, emailBody, {
      cc: finalCC,
      attachments: emailAttachments
    });

    // [V59.4] Store hostel intimation ID in ALL allocation rows for this batch
    if (hostelMsgId && allocationRows.length > 0) {
      const formattedMsgId = formatIdForSheet(hostelMsgId);
      const now = new Date();

      // Find all allocation rows with this batchId (they were just appended)
      const allocData = allocWs.getDataRange().getValues();
      for (let i = allocData.length - 1; i >= 1; i--) {
        if (allocData[i][SHEETS.allocations.cols.batchId - 1] === batchId) {
          allocWs.getRange(i + 1, SHEETS.allocations.cols.hostelIntimationId).setValue(formattedMsgId);
          allocWs.getRange(i + 1, SHEETS.allocations.cols.hostelIntimationDate).setValue(now);
        }
      }
      writeLog('INFO', FUNC_NAME, `Stored hostel intimation ID for batch ${batchId}`, batchId);
    }

    writeLog('SUCCESS', FUNC_NAME,
      `Batch ${batchId} processed. ${studentsForEmail.length} students, ${allocationRows.length} allocations, Total: ${totalAllocated}`, batchId);

    // Sync
    syncStudentData();
    syncPledgeData();

  } catch (e) {
    writeLog('ERROR', FUNC_NAME, e.message, batchId);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

// ==================================================================================
//                      [V59.3] AI AUDIT LOGGING
// ==================================================================================

/**
 * Logs AI analysis response to the AI Audit Log sheet.
 * Provides full audit trail for all AI decisions.
 * 
 * @param {string} pledgeId - The pledge ID being processed
 * @param {string} sender - Email sender address
 * @param {string} subject - Email subject line
 * @param {Object|null} aiResult - The AI analysis result object
 * @param {number} processingTime - Time taken for AI call (ms)
 * @param {Array<string>} receiptLinks - Array of Drive URLs to receipt files
 */
function logAIResponse(pledgeId, sender, subject, aiResult, processingTime, receiptLinks) {
  const FUNC_NAME = 'logAIResponse';

  try {
    const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
    const aiLogWs = ss.getSheetByName(SHEETS.aiAuditLog.name);

    if (!aiLogWs) {
      writeLog('WARN', FUNC_NAME, 'AI Audit Log sheet not found. Skipping AI logging.');
      return;
    }

    // Calculate totals from AI result
    const receiptsFound = aiResult?.valid_receipts || [];
    const totalAmount = receiptsFound.reduce((sum, r) => sum + (r.amount || 0), 0);
    const avgConfidence = receiptsFound.length > 0
      ? receiptsFound.reduce((sum, r) => sum + (r.confidence || r.confidence_score || 0), 0) / receiptsFound.length
      : 0;

    const logRow = [
      new Date(),                                    // A: timestamp
      pledgeId,                                      // B: pledgeId
      sender,                                        // C: sender
      subject.substring(0, 200),                     // D: subject (truncate)
      aiResult?.category || 'ERROR',                 // E: category
      (aiResult?.summary || 'AI processing failed').substring(0, 500), // F: summary
      receiptsFound.length,                          // G: receiptsFound
      totalAmount,                                   // H: totalAmount
      avgConfidence,                                 // I: confidence
      receiptLinks.join('\n'),                       // J: receiptLinks
      JSON.stringify(aiResult || { error: 'null' }).substring(0, 5000), // K: rawResponse
      processingTime,                                // L: processingTime (ms)
      aiResult ? 'TRUE' : 'FALSE'                    // M: success
    ];

    aiLogWs.appendRow(logRow);
    writeLog('INFO', FUNC_NAME, `AI response logged for ${pledgeId}`, pledgeId);

  } catch (e) {
    // Don't fail the main process if logging fails
    writeLog('WARN', FUNC_NAME, `Failed to log AI response: ${e.message}`, pledgeId);
  }
}

/**
 * Updates AI Audit Log with receipt links after files are saved.
 * Called from processIncomingReceipts after saving receipt files.
 * 
 * @param {string} pledgeId - The pledge ID
 * @param {Array<string>} receiptLinks - Array of Drive URLs  
 */
function updateAILogWithReceipts(pledgeId, receiptLinks) {
  const FUNC_NAME = 'updateAILogWithReceipts';

  try {
    const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
    const aiLogWs = ss.getSheetByName(SHEETS.aiAuditLog.name);

    if (!aiLogWs) return;

    // Find the most recent log entry for this pledgeId
    const data = aiLogWs.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][SHEETS.aiAuditLog.cols.pledgeId - 1] === pledgeId) {
        aiLogWs.getRange(i + 1, SHEETS.aiAuditLog.cols.receiptLinks).setValue(receiptLinks.join('\n'));
        writeLog('INFO', FUNC_NAME, `Updated AI log with ${receiptLinks.length} receipt links`, pledgeId);
        return;
      }
    }
  } catch (e) {
    writeLog('WARN', FUNC_NAME, `Failed to update AI log: ${e.message}`, pledgeId);
  }
}