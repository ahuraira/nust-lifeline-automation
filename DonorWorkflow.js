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
  const donorName = e.namedValues['Name'][0];
  const donorEmail = e.namedValues['Email Address'][0];
  const country = e.namedValues['City / Country (of Contributor)'][0];

  // 4. Trigger the confirmation email.
  sendPledgeConfirmationEmail(donorName, donorEmail, pledgeId, country);

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
function sendPledgeConfirmationEmail(donorName, donorEmail, pledgeId, country) {
  // Define the data object with placeholders and their values.
  const emailData = {
    donorName: donorName,
    pledgeId: pledgeId
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
      cc: EMAILS.alwaysCC, // This overrides the ccString logic from above.
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