/**
 * Processes a new form submission, updates the sheet, and triggers the confirmation email.
 * @param {Object} e The event object passed from the onFormSubmit trigger.
 */
function processNewPledge(e) {
  const ws = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.donations.name);

  // The event object 'e' contains information about the context, including the row number.
  const row = e.range.getRow();

  // 1. Generate a Unique Pledge ID
  const pledgeId = 'PLEDGE-' + new Date().getFullYear() + '-' + row;

  // 2. Write the Pledge ID and initial status to the (RAW) Form Responses sheet.
  ws.getRange(row, SHEETS.donations.cols.pledgeId).setValue(pledgeId);
  ws.getRange(row, SHEETS.donations.cols.status).setValue(STATUS.pledge.PLEDGED);

  // 3. Gather all necessary data for the email.
  // The e.namedValues object gives us form data using the question titles as keys.
  const donorName = getFormValue(e, FORM_KEYS.donorName);
  const donorEmail = getFormValue(e, FORM_KEYS.donorEmail);
  const country = getFormValue(e, FORM_KEYS.country);
  const durationText = getFormValue(e, FORM_KEYS.duration);
  const pledgeAmount = getPledgeAmountFromDuration(durationText);

  // 4. Trigger the confirmation email.
  sendPledgeConfirmationEmail(donorName, donorEmail, pledgeId, country, pledgeAmount);

  // --- AUDIT TRAIL ---
  logAuditEvent(
    'SYSTEM',
    'NEW_PLEDGE',
    pledgeId,
    'New Pledge Form Submission',
    '',
    STATUS.pledge.PLEDGED,
    { donor: donorName, country: country }
  );

  // 5. Sync Pledge Data to Tracker
  try {
    syncPledgeData();
  } catch (e) {
    writeLog('WARN', 'processNewPledge', `Failed to sync pledge data: ${e.message}`, pledgeId);
  }
}


/**
 * Sends the initial pledge confirmation email to the donor.
 * @param {string} donorName The name of the donor.
 * @param {string} donorEmail The email of the donor.
 * @param {string} pledgeId The unique pledge ID.
 * @param {string} country The country selected by the donor, used for chapter mapping.
 */
function sendPledgeConfirmationEmail(donorName, donorEmail, pledgeId, country, amount) {
  const FUNC_NAME = 'sendPledgeConfirmationEmail';

  // Define the data object with placeholders and their values.
  const emailData = {
    donorName: donorName,
    pledgeId: pledgeId,
    amount: amount ? amount.toLocaleString() : '0',
    chapter: country // [NEW] Added Chapter
  };

  // Call our helper function to generate the email content from the Google Doc.
  const emailContent = createEmailFromTemplate(TEMPLATES.pledgeConfirmation, emailData);

  // --- ROBUSTNESS UPGRADE: Centralized CC Logic ---
  // Gets Chapter Leads (Array or String) + Default CC
  const ccString = getCCString(country);

  // Send the email and capture the ID (for potential future threading)
  const messageId = sendEmailAndGetId(
    donorEmail,
    emailContent.subject,
    emailContent.htmlBody,
    {
      cc: ccString, // Use the computed CC string including Chapter Leads
      from: EMAILS.processOwner
    }
  );

  // --- WRITE BACK MESSAGE ID ---
  // Store the initial email ID to enable threading later.
  const rawWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.donations.name);
  // findRowByValue is now in CoreLogic.js, available globally.
  const rowData = findRowByValue(rawWs, SHEETS.donations.cols.pledgeId, pledgeId);

  if (rowData) {
    rawWs.getRange(rowData.row, SHEETS.donations.cols.pledgeEmailId).setValue(formatIdForSheet(messageId));
    writeLog('INFO', FUNC_NAME, `Stored Pledge Email ID for threading: ${messageId}`, pledgeId);
  } else {
    writeLog('WARN', FUNC_NAME, 'Could not find row to store Pledge Email ID.', pledgeId);
  }

  writeLog('SUCCESS', FUNC_NAME, `Confirmation email sent to ${donorEmail}`, pledgeId);
}

/**
 * RECOVERY TOOL: Resends confirmation emails for rows where they are missing.
 * Useful if the script crashed before sending/logging the email.
 */
function retryFailedConfirmationEmails() {
  const FUNC_NAME = 'retryFailedConfirmationEmails';
  const ws = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.donations.name);
  const data = ws.getDataRange().getValues();

  writeLog('INFO', FUNC_NAME, 'Starting Retry Job for missing pledge emails...');

  let sentCount = 0;

  // Start from Row 2 (Index 1)
  for (let i = 1; i < data.length; i++) {
    const row = i + 1;
    const pledgeId = data[i][SHEETS.donations.cols.pledgeId - 1];
    const emailId = data[i][SHEETS.donations.cols.pledgeEmailId - 1];
    const donorEmail = data[i][SHEETS.donations.cols.donorEmail - 1];
    const donorName = data[i][SHEETS.donations.cols.donorName - 1];
    const country = data[i][SHEETS.donations.cols.cityCountry - 1];
    const durationText = data[i][SHEETS.donations.cols.duration - 1];

    // Condition: Valid Pledge ID AND Missing Email ID AND Valid Donor Email
    if (pledgeId && String(pledgeId).startsWith('PLEDGE') && (!emailId || emailId === '') && donorEmail) {

      writeLog('INFO', FUNC_NAME, `Found missing email log for ${pledgeId}. Retrying...`, pledgeId);

      try {
        const pledgeAmount = getPledgeAmountFromDuration(durationText);
        sendPledgeConfirmationEmail(donorName, donorEmail, pledgeId, country, pledgeAmount);
        sentCount++;
        // Sleep specifically to avoid hitting Gmail rate limits during a batch retry
        Utilities.sleep(2000);
      } catch (e) {
        writeLog('ERROR', FUNC_NAME, `Failed to resend email for ${pledgeId}: ${e.message}`, pledgeId);
      }
    }
  }

  writeLog('INFO', FUNC_NAME, `Retry Job Complete. Resent ${sentCount} emails.`);
}