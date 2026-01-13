/**
 * Fetches a Google Doc as HTML and cleans it for mobile-friendly email display.
 * @param {string} templateId The ID of the Google Doc template.
 * @param {Object} data Key-value pairs to replace placeholders (e.g., {{name}}).
 * @returns {Object} { subject: string, htmlBody: string }
 */
function createEmailFromTemplate(templateId, data) {
  try {
    // 1. Get Subject Line
    const file = DriveApp.getFileById(templateId);
    let subject = file.getName();

    // 2. Fetch HTML content
    const url = `https://www.googleapis.com/drive/v3/files/${templateId}/export?mimeType=text/html`;
    const options = {
      method: 'get',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    let htmlBody = response.getContentText();

    // 3. --- MOBILE OPTIMIZATION & CLEANUP ---

    // A. Remove the fixed "page width" that causes the container look.
    // Google sets max-width to ~468pt (A4 size). We change it to 100% or 600px max.
    htmlBody = htmlBody.replace(/max-width:[^;]+;/g, 'max-width: 600px; margin: 0 auto;');

    // B. Remove the huge page padding/margins.
    htmlBody = htmlBody.replace(/padding:[^;]+;/g, 'padding: 10px;');

    // C. Force background to white (removes the gray "page background").
    htmlBody = htmlBody.replace(/background-color:[^;]+;/g, 'background-color: #ffffff;');

    // D. Fix Table Widths for Mobile
    // Google Docs tables often have fixed widths (e.g. width: 450pt). We force them to 100%.
    // This regex looks for table style definitions and injects width:100%.
    htmlBody = htmlBody.replace(/<table/g, '<table style="width: 100% !important; max-width: 600px;"');

    // 4. Replace placeholders in Subject
    for (const key in data) {
      const regex = new RegExp('{{' + key + '}}', 'g');
      subject = subject.replace(regex, data[key]);
    }

    // 5. Replace placeholders in Body
    for (const key in data) {
      const regex = new RegExp('{{' + key + '}}', 'g');
      htmlBody = htmlBody.replace(regex, data[key]);
    }

    // 6. SPECIAL HANDLING: Replace the placeholder URL for the Mailto Link
    // The user sets the link URL to "http://SEND_CONFIRMATION_EMAIL" in the Google Doc.
    // Google often wraps this in a redirect (https://www.google.com/url?q=...) and may change case.
    if (data.mailtoLink) {
      // 1. Replace Google Redirect version (Case Insensitive)
      // Matches: https://www.google.com/url?q=http://send_confirmation_email... up to the next quote
      const googleRedirectRegex = /https:\/\/www\.google\.com\/url\?q=http:\/\/send_confirmation_email[^"]*/gi;
      htmlBody = htmlBody.replace(googleRedirectRegex, data.mailtoLink);

      // 2. Replace Raw version (Case Insensitive) - fallback if not wrapped
      const rawRegex = /http:\/\/send_confirmation_email/gi;
      htmlBody = htmlBody.replace(rawRegex, data.mailtoLink);
    }

    return { subject: subject, htmlBody: htmlBody };

  } catch (e) {
    Logger.log('Error in createEmailFromTemplate: ' + e.toString());
    return { subject: 'Error Generating Email', htmlBody: 'Error: ' + e.toString() };
  }
}


/**
 * Writes a log entry to the 'Log' spreadsheet for a permanent audit trail.
 * Now includes an optional Pledge ID for contextual logging.
 * @param {string} level The type of log (e.g., 'INFO', 'ERROR', 'SUCCESS').
 * @param {string} funcName The name of the function where the log originates.
 * @param {string} message The log message.
 * @param {string} [pledgeId=''] The optional Pledge ID associated with this log entry.
 */
function writeLog(level, funcName, message, pledgeId = '') { // pledgeId is now an optional parameter
  try {
    const ws = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.log.name);
    ws.insertRowBefore(2);
    // The range now includes the new Column E for the Pledge ID
    ws.getRange('A2:E2').setValues([[new Date(), level, funcName, message, pledgeId]]);
  } catch (e) {
    Logger.log(`CRITICAL: Failed to write to Log sheet. Original Log: [${level}] ${funcName}: ${message} [PledgeID: ${pledgeId}]`);
  }
}

/**
 * Intelligently selects the most likely receipt from an array of email attachments.
 * @param {Array} attachments An array of GmailAttachment objects.
 * @returns {GmailAttachment|null} The most likely receipt attachment, or null if none are suitable.
 */
function findBestAttachment(attachments) {
  const preferredTypes = ['pdf', 'jpg', 'jpeg', 'png'];
  const ignoredNames = ['image.png', 'winmail.dat', 'invite.ics']; // Common junk attachments

  let potentialReceipts = [];

  for (const attachment of attachments) {
    const fileName = attachment.getName().toLowerCase();
    const fileExtension = fileName.split('.').pop();

    // Rule 1: Ignore known junk files
    if (ignoredNames.includes(fileName)) {
      continue;
    }

    // Rule 2: Prioritize preferred file types
    if (preferredTypes.includes(fileExtension)) {
      potentialReceipts.push(attachment);
    }
  }

  // Rule 3: If we found one or more preferred types, return the largest one.
  if (potentialReceipts.length > 0) {
    potentialReceipts.sort((a, b) => b.getSize() - a.getSize()); // Sort by size, descending
    return potentialReceipts[0];
  }

  // Rule 4: Fallback - if no preferred types, return the largest non-junk attachment.
  const allValidAttachments = attachments.filter(att => !ignoredNames.includes(att.getName().toLowerCase()));
  if (allValidAttachments.length > 0) {
    allValidAttachments.sort((a, b) => b.getSize() - a.getSize());
    return allValidAttachments[0];
  }

  // Rule 5: If all attachments were junk or there were none left, return null.
  return null;
}


/**
 * Extracts and formats email content from a Gmail thread for LLM analysis.
 * Returns a structured object separating the current (newest) email from thread history.
 * @param {GmailThread} thread The Gmail thread object to process.
 * @param {number} [maxHistoryMessages=3] Max number of historical messages to include.
 * @returns {Object} { currentEmail: string, threadHistory: string, formattedForLLM: string }
 */
function getThreadContext(thread, maxHistoryMessages = 3) {
  const messages = thread.getMessages();
  const messageCount = messages.length;

  // The most recent (newest) message is what we're analyzing
  const currentMessage = messages[messageCount - 1];

  // Format the current email
  const currentFrom = currentMessage.getFrom();
  const currentDate = currentMessage.getDate().toLocaleString();
  let currentBody = currentMessage.getPlainBody();
  currentBody = cleanEmailBody(currentBody);

  const currentEmail = `From: ${currentFrom}
Date: ${currentDate}
Content:
${currentBody}`;

  // Get thread history (previous messages, excluding the current one)
  let threadHistory = '';
  if (messageCount > 1) {
    const historyStartIndex = Math.max(0, messageCount - 1 - maxHistoryMessages);
    const historyMessages = messages.slice(historyStartIndex, messageCount - 1);

    for (const msg of historyMessages) {
      const from = msg.getFrom();
      const date = msg.getDate().toLocaleString();
      let body = msg.getPlainBody();
      body = cleanEmailBody(body);

      threadHistory += `[${date}] ${from}:
${body}
---
`;
    }
  }

  // Create a formatted string optimized for LLM understanding
  let formattedForLLM = `=== CURRENT EMAIL (Analyze This) ===
${currentEmail}

`;

  if (threadHistory) {
    formattedForLLM += `=== THREAD HISTORY (Context Only) ===
${threadHistory}`;
  }

  return {
    currentEmail: currentEmail,
    threadHistory: threadHistory,
    formattedForLLM: formattedForLLM
  };
}

/**
 * Cleans the email body by removing quoted replies and excessive whitespace.
 * @param {string} body The raw email body.
 * @returns {string} The cleaned email body.
 */
function cleanEmailBody(body) {
  // Remove quoted reply lines (lines starting with '>')
  body = body.replace(/^>.*$/gm, '');
  // Remove excessive blank lines
  body = body.replace(/\n{3,}/g, '\n\n');
  // Trim whitespace
  return body.trim();
}


/**
 * Shifts the manual input columns (A, B, C, E) down by one row
 * to keep them aligned when a new Form Response appears at the top.
 * Hardcodes the ARRAYFORMULA values in C2 and D2 to prevent reference drift.
 */
function alignManualInputs(e) {
  const ws = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName('Donations Tracker');

  // Since the sheet is a Table and has a Query in F2, we cannot use insertCells or insertRow.
  // We must clear the manual columns (A-E) to make space for correct alignment,
  // effectively shifting existing manual data down by 1 row to match the new Query result in F2.

  const lastRow = ws.getLastRow();
  if (lastRow >= 2) {
    // 1. Shift Manual Data Down Separately to avoid corrupting B/C Formulas
    // Move Column A (Index 1)
    const rangeA = ws.getRange(2, 1, lastRow - 1, 1);
    const targetA = ws.getRange(3, 1, lastRow - 1, 1);
    rangeA.copyTo(targetA);

    // Move Columns D, E (Index 4, 5)
    const rangeDE = ws.getRange(2, 4, lastRow - 1, 2);
    const targetDE = ws.getRange(3, 4, lastRow - 1, 2);
    rangeDE.copyTo(targetDE);

    // 2. Clear Row 2 Manual Inputs (Clean Slate)
    ws.getRange("A2").clearContent();
    ws.getRange("D2:E2").clearContent();

    // 3. SAFETY CLEANUP: Clear B3:C to remove any accidental debris
    // Since B2 and C2 are Array Formulas, B3:C must be empty.
    if (lastRow >= 2) {
      ws.getRange(3, 2, lastRow - 1, 2).clearContent();
    }

    // 4. Restore/Ensure Formulas in B2/C2
    // These match the new top row logic.
    const B2_FORMULA = '=ARRAYFORMULA(IF(A2:A="", "", IFERROR(VLOOKUP(TO_TEXT(A2:A), TO_TEXT(\'Student Lookup\'!A:D), 4, FALSE), "⚠️ ID Not Found / Fully Funded")))';
    const C2_FORMULA = '=ARRAYFORMULA(IF(G2:G="", "", IFERROR(VLOOKUP(G2:G, \'Pledge Lookup\'!A:D, 4, FALSE), "Loading...")))';

    ws.getRange("B2").setFormula(B2_FORMULA);
    ws.getRange("C2").setFormula(C2_FORMULA);
  }
}

/**
 * Robustly parses a currency string into a number.
 * Handles inputs like "100,000", "PKR 50,000", "15k", "1.2m".
 * @param {string|number} input The value to parse.
 * @return {number} The numeric value, or 0 if invalid.
 */
function parseCurrencyString(input) {
  if (input === null || input === undefined || input === '') {
    return 0;
  }

  if (typeof input === 'number') {
    return input;
  }

  // 1. Normalize String: Lowercase, remove commas/spaces/currencies
  // We keep digits, dots, and 'k'/'m' for multipliers
  let cleanString = String(input).toLowerCase().replace(/[^0-9.km]+/g, "");

  // 2. Handle Multipliers
  let multiplier = 1;
  if (cleanString.endsWith('k')) {
    multiplier = 1000;
    cleanString = cleanString.slice(0, -1);
  } else if (cleanString.endsWith('m')) {
    multiplier = 1000000;
    cleanString = cleanString.slice(0, -1);
  }

  // 3. Parse and Multiply
  const value = parseFloat(cleanString);

  return isNaN(value) ? 0 : value * multiplier;
}

/**
 * Generates a comma-separated string of CC emails.
 * Includes:
 * 1. The specific Chapter Lead(s) for the given chapter (if provided).
 * 2. The default 'alwaysCC' email from Config.
 * Handles arrays and single strings for chapter leads.
 * @param {string} [chapterName] The name of the chapter (optional).
 * @return {string} A clean, comma-separated string of emails.
 */
function getCCString(chapterName) {
  let ccEmails = [];

  // 1. Add Default CC (Always included)
  // 1. Add Default CC (Always included)
  if (EMAILS.alwaysCC) {
    if (Array.isArray(EMAILS.alwaysCC)) {
      ccEmails = ccEmails.concat(EMAILS.alwaysCC);
    } else {
      ccEmails.push(EMAILS.alwaysCC);
    }
  }

  // 2. Add Chapter Leads (if chapter is provided)
  // Fix: Fallback to 'Other' if chapterName is empty
  const safeChapter = chapterName || 'Other';
  const leads = MAPPINGS.chapterLeads[safeChapter] || MAPPINGS.chapterLeads['Other'] || [];

  if (leads) {
    if (Array.isArray(leads)) {
      ccEmails = ccEmails.concat(leads);
    } else {
      ccEmails.push(leads);
    }
  }

  // 3. Remove Duplicates and Empty strings
  // Set automatically removes duplicates
  const uniqueEmails = [...new Set(ccEmails)];

  // Filter out any null/undefined/empty values and join with comma
  return uniqueEmails.filter(email => email && email.trim() !== '').join(',');
}

/**
 * Sends an email and retrieves its Message ID by creating and sending a draft.
 * This is more robust than searching and allows immediate access to the ID.
 * @param {string} recipient - The email address(es) to send to.
 * @param {string} subject - The email subject.
 * @param {string} htmlBody - The HTML body of the email.
 * @param {Object} options - Additional options (cc, bcc, attachments, from).
 * @return {string} The Gmail API ID of the sent message (prefixed with 'id:').
 */
function sendEmailAndGetId(recipient, subject, htmlBody, options = {}) {
  const FUNC_NAME = 'sendEmailAndGetId';

  try {
    // 1. Create a Draft
    // createDraft(recipient, subject, body, options)
    // We pass an empty string for the plain text body as we are using htmlBody in options.
    const draft = GmailApp.createDraft(recipient, subject, '', {
      htmlBody: htmlBody,
      ...options
    });

    // 2. Send the Draft
    // This returns a GmailMessage object immediately.
    const sentMessage = draft.send();

    return getRfcIdFromMessage(sentMessage);

  } catch (e) {
    writeLog('ERROR', FUNC_NAME, `Failed to send email to ${recipient}: ${e.message}`);
    throw e; // Re-throw to stop the workflow
  }
}

/**
 * Helper to extract the RFC Message-Id from a GmailMessage object.
 * @param {GmailMessage} message The message to extract ID from.
 * @return {string} The RFC Message-Id (e.g. <...>) or API ID fallback.
 */
function getRfcIdFromMessage(message) {
  try {
    // Attempt to get the RFC ID using the native method
    // Note: getHeader matches keys case-insensitively usually, but "Message-ID" is standard.
    const rfcId = message.getHeader("Message-Id");

    if (rfcId) {
      return rfcId;
    } else {
      console.warn(`Native getHeader("Message-Id") returned empty for message ID: ${message.getId()}`);
    }
  } catch (e) {
    console.warn(`Failed to get header from message object: ${e.message}`);
  }

  // Fallback to the API ID if RFC ID extraction fails
  return `id:${message.getId()}`;
}

/**
 * Formats a Message ID for storage in the sheet.
 * Prefixes RFC IDs with 'rfc822msgid:' for easy Gmail searching.
 * @param {string} id The raw Message ID (RFC or API).
 * @return {string} The formatted ID.
 */
function formatIdForSheet(id) {
  if (!id) return '';
  if (id.startsWith('<')) {
    return `rfc822msgid:${id}`;
  }
  if (!id.startsWith('id:')) {
    return `id:${id}`;
  }
  return id;
}

/**
 * Intelligent Email Sender that prioritizes threading.
 * Tries to reply to an existing thread if a valid Message ID is found.
 * Falls back to sending a new email if threading fails.
 * 
 * @param {string} recipient - Email address.
 * @param {string} subject - Email subject.
 * @param {string} htmlBody - HTML content.
 * @param {Object} options - { cc, bcc, attachments, from }
 * @param {Array<string>} priorMessageIds - List of potential Message IDs to reply to.
 * @return {string} The Message ID of the sent email (RFC format if possible).
 */
function sendOrReply(recipient, subject, htmlBody, options = {}, priorMessageIds = []) {
  const FUNC_NAME = 'sendOrReply';

  // 1. Try to find a thread from prior IDs
  for (const rawId of priorMessageIds) {
    if (!rawId || rawId === 'NOT_FOUND' || rawId === 'NOT_SENT') continue;

    try {
      let thread = null;
      let id = String(rawId);

      // Clean up the ID for usage
      if (id.startsWith('rfc822msgid:')) {
        id = id.replace('rfc822msgid:', '');
      }

      // Handle RFC IDs (<...>) vs API IDs
      if (id.startsWith('<')) {
        // Search using the exact RFC ID
        const threads = GmailApp.search(`rfc822msgid:${id}`, 0, 1);
        if (threads.length > 0) thread = threads[0];
      } else {
        // Assume API ID (strip 'id:' prefix if present)
        const apiId = id.replace(/^id:/, '');
        const msg = GmailApp.getMessageById(apiId);
        if (msg) thread = msg.getThread();
      }

      if (thread) {
        writeLog('INFO', FUNC_NAME, `Found existing thread via ID: ${id}. Replying...`);

        // Create a Draft Reply to All (preserves CCs)
        const draft = thread.createDraftReplyAll('', {
          htmlBody: htmlBody,
          cc: options.cc,
          bcc: options.bcc,
          attachments: options.attachments,
          from: options.from
        });

        const sentMsg = draft.send();
        return getRfcIdFromMessage(sentMsg);
      }
    } catch (e) {
      writeLog('WARN', FUNC_NAME, `Failed to reply to ID ${rawId}: ${e.message}. Trying next ID...`);
    }
  }

  // 2. Fallback: Send New Email
  writeLog('INFO', FUNC_NAME, 'No valid thread found. Sending new email.');
  return sendEmailAndGetId(recipient, subject, htmlBody, options);
}

/**
 * Generates a 'mailto' link for the Hostel-led confirmation workflow.
 * Fetches the body text from a Google Doc Template (plain text).
 * @param {Object} data { donorEmail, donorName, pledgeId, allocationId, amount, chapterLeadEmail, cmsId, studentName, school }
 * @param {string} templateId The Google Doc ID for the email body.
 * @return {string} The full mailto URL.
 */
function generateHostelReplyLink(data, templateId) {
  const recipient = data.donorEmail;
  // CC Us + Chapter Lead (Robustness)
  // Merge alwaysCC and chapterLeads, split by comma, dedup, and rejoin
  const ccParts = Array.isArray(EMAILS.alwaysCC) ? EMAILS.alwaysCC : [EMAILS.alwaysCC];
  const rawCC = `${ccParts.join(',')},${data.chapterLeadEmail || ''}`;
  const ccList = rawCC.split(',').map(e => e.trim()).filter(e => e);
  const uniqueCC = [...new Set(ccList)];
  const ccString = uniqueCC.join(',');

  let subject = `Official Confirmation: Receipt of Funds (Ref: ${data.pledgeId})`;
  let body = "";

  // --- FETCH BODY & SUBJECT FROM GOOGLE DOC ---
  if (templateId && templateId.includes('ENTER') === false) {
    try {
      // 1. Get Subject from Filename
      const file = DriveApp.getFileById(templateId);
      subject = file.getName();

      // 2. Fetch Plain Text Body
      const url = `https://www.googleapis.com/drive/v3/files/${templateId}/export?mimeType=text/plain`;
      const options = {
        method: 'get',
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      };
      const response = UrlFetchApp.fetch(url, options);
      if (response.getResponseCode() === 200) {
        body = response.getContentText();
      } else {
        body = "Error loading template. Please check Doc ID.";
      }
    } catch (e) {
      console.warn(`Failed to fetch hostel intimation template: ${e.message}`);
      body = "Error loading template.";
    }
  } else {
    // Fallback if ID is missing
    body = `Dear {{donorName}},\n\nPayment Received for {{studentName}}.\nRef: {{pledgeId}}\n\n(Generated Reply)`;
  }

  // --- REPLACE PLACEHOLDERS ---
  // We use a simple regex replacement for all keys in 'data'
  for (const key in data) {
    const regex = new RegExp('{{' + key + '}}', 'g');
    body = body.replace(regex, data[key]);
    // Also replace in subject (if fetched from file name)
    subject = subject.replace(regex, data[key]);
  }

  // Clean up any remaining braces if keys were missing? No, leave them or clean them?
  // Let's leave them for debugging visibility.

  // Encode for URL
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  const encodedCC = encodeURIComponent(ccString);

  return `mailto:${recipient}?cc=${encodedCC}&subject=${encodedSubject}&body=${encodedBody}`;
}

/**
 * Generates a Batch Mailto link using BCC for privacy.
 * @param {Array} donors Array of {email, pledgeId, amount}
 * @param {Object} student {name, cms, school}
 */
/**
 * Generates a Batch Mailto link using BCC for privacy.
 * Uses a Google Doc Template for the body/subject.
 * @param {Array} donors Array of {email, pledgeId, amount}
 * @param {Object} student {name, cms, school}
 */
/**
 * Generates a Batch Mailto link using BCC for privacy.
 * Uses a Google Doc Template for the body/subject.
 * @param {Array} donors Array of {email, pledgeId, amount}
 * @param {Object} student {name, cms, school}
 * @param {string} batchId The Batch Reference ID (e.g., BATCH-123)
 */
function generateBatchMailtoLink(donors, student, batchId) {
  // 1. Extract Emails for BCC and CC
  const bccEmails = donors.map(d => d.email).join(',');

  // [FIX] Aggregate Chapter Leads for CC
  let ccEmails = [];
  // Add Always CC
  if (EMAILS.alwaysCC) {
    ccEmails = ccEmails.concat(Array.isArray(EMAILS.alwaysCC) ? EMAILS.alwaysCC : [EMAILS.alwaysCC]);
  }
  // Add Leads for each unique chapter in the batch
  const distinctChapters = [...new Set(donors.map(d => d.chapter))];
  distinctChapters.forEach(chapter => {
    const safeChapter = chapter || 'Other';
    const leads = MAPPINGS.chapterLeads[safeChapter] || MAPPINGS.chapterLeads['Other'] || [];
    ccEmails = ccEmails.concat(Array.isArray(leads) ? leads : [leads]);
  });
  // Dedup and Clean
  const uniqueCC = [...new Set(ccEmails)].filter(e => e && e.trim() !== '').join(',');

  // 2. Build the Reference Table for the Body
  let refTable = "Contributions Verified:\n";
  let totalAmount = 0;
  donors.forEach(d => {
    refTable += `- Ref: ${d.pledgeId} | PKR ${Number(d.amount).toLocaleString()} | ${d.chapter || 'Other'}\n`;
    totalAmount += Number(d.amount);
  });

  let subject = `Official Confirmation: Receipt of Funds | Student ID: ${student.cms} (Ref: ${batchId || 'BATCH'})`;
  let body = "";

  // 3. Fetch Content from Template (if configured)
  const templateId = CONFIG.batchDonorMailtoBody || TEMPLATES.batchDonorMailtoBody;

  if (templateId) {
    try {
      // 3.1 Get Subject from Filename (Optional/Overwritable)
      const file = DriveApp.getFileById(templateId);
      const filename = file.getName();
      // If filename looks like a template (contains {{), use it, otherwise use default
      if (filename.includes('{{')) subject = filename;

      // 3.2 Fetch Plain Text Body
      const url = `https://www.googleapis.com/drive/v3/files/${templateId}/export?mimeType=text/plain`;
      const options = {
        method: 'get',
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      };
      const response = UrlFetchApp.fetch(url, options);
      if (response.getResponseCode() === 200) {
        body = response.getContentText();
      } else {
        body = "Error loading template. Batch details below.";
      }
    } catch (e) {
      console.warn("Failed to fetch batch template: " + e.message);
      body = "Error loading template.";
    }
  } else {
    // Hardcoded Fallback
    body = `Dear NUST Supporters,\n\nOn behalf of NUST, we verify these contributions.\n\nStudent: {{studentName}} (CMS: {{cmsId}})\n\n{{refTable}}`;
  }

  // 4. Replace Placeholders
  // Supported Placeholders: {{studentName}}, {{cmsId}}, {{school}}, {{refTable}}, {{totalAamount}}, {{batchId}}, {{studentId}}
  const replacements = {
    studentName: student.name,
    cmsId: student.cms,
    studentId: student.cms, // Synonym
    school: student.school,
    refTable: refTable,
    totalAamount: totalAmount.toLocaleString(), // [User Request matches typo in Doc?]
    totalAmount: totalAmount.toLocaleString(), // Correct spelling just in case
    batchId: batchId || 'BATCH-Reference'
  };

  for (const key in replacements) {
    // Robust regex replacement
    const regex = new RegExp(`{{${key}}}`, 'g');
    body = body.replace(regex, replacements[key]);
    subject = subject.replace(regex, replacements[key]);
  }

  const encodedBCC = encodeURIComponent(bccEmails);
  const encodedCC = encodeURIComponent(uniqueCC); // [NEW] Encoded CC
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);

  // Note: 'to' field can be left blank or set to the admin email
  // [FIX] Added &cc=...
  return `mailto:?bcc=${encodedBCC}&cc=${encodedCC}&subject=${encodedSubject}&body=${encodedBody}`;
}

/**
 * Safely retrieves a Gmail label by name, creating it if it doesn't exist.
 * Prevents errors when trying to create a label that already exists.
 * @param {string} labelName The name of the label to get or create.
 * @returns {GmailLabel} The Gmail label object.
 */
function getOrCreateLabel(labelName) {
  let label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
  }
  return label;
}

/**
 * TEST FUNCTION: Verifies that sendEmailAndGetId works correctly.
 * Run this manually to confirm.
 */
function testEmailSending() {
  const recipient = Session.getActiveUser().getEmail();
  const subject = "Test Email - Robust ID Capture";
  const body = "This is a test email to verify that we can capture the Message ID robustly.";

  Logger.log(`Sending test email to ${recipient}...`);

  const msgId = sendEmailAndGetId(recipient, subject, body);

  if (msgId && msgId !== 'NOT_FOUND') {
    Logger.log(`SUCCESS: Captured Message ID: ${msgId}`);
  } else {
    Logger.log('FAILURE: Could not capture Message ID.');
  }
}

/**
 * Prepares file attachments for the Gemini API (Multimodal).
 * Converts Blobs to Base64 and formats them for the 'inline_data' part.
 * 
 * @param {GoogleAppsScript.Base.Blob[]} attachments - Array of file blobs (PDF/Image).
 * @returns {Array} Array of content parts for Gemini API.
 */
function prepareAttachmentsForGemini(attachments) {
  const parts = [];

  if (!attachments || attachments.length === 0) return parts;

  const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB Safety Limit

  attachments.forEach(blob => {
    // Basic validation
    const mimeType = blob.getContentType();

    // Gemini supports images, PDFs, text, etc.
    // Allow: image/png, image/jpeg, image/webp, application/pdf
    const validMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

    if (validMimes.includes(mimeType)) {
      if (blob.getBytes().length > MAX_SIZE_BYTES) {
        console.warn(`Skipping attachment ${blob.getName()} - Too large for inline API call.`);
        return;
      }

      const base64Data = Utilities.base64Encode(blob.getBytes());

      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: base64Data
        }
      });
    } else {
      console.warn(`Skipping attachment ${blob.getName()} - Unsupported MIME: ${mimeType}`);
    }
  });

  return parts;
}