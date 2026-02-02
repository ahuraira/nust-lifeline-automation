# 📖 API Reference

> **Scope:** Complete function reference for all public APIs in the NUST Lifeline System.

This document provides a comprehensive reference for all functions exposed by the system's service modules. Functions are organized by module and include signatures, parameters, return types, and usage examples.

---

## Table of Contents

- [CoreLogic.js](#corelogicjs)
- [AdminWorkflow.js](#adminworkflowjs)
- [DonorWorkflow.js](#donorworkflowjs)
- [Watchdog.js](#watchdogjs)
- [SidebarService.js](#sidebarservicejs)
- [LLM_Service.js](#llm_servicejs)
- [AuditService.js](#auditservicejs)
- [ReportingService.js](#reportingservicejs)
- [Utilities.js](#utilitiesjs)
- [Triggers.js](#triggersjs)

---

## CoreLogic.js

Core business logic and data access layer.

### `getSheet(sheetName)`

Opens a sheet by name from the Operations spreadsheet.

```javascript
/**
 * @param {string} sheetName - The name of the sheet
 * @returns {Sheet} The Google Sheet object
 */
const sheet = getSheet('Allocation Log');
```

---

### `findRowByValue(sheet, col, value)`

Searches a sheet for a specific value in a column and returns the row data.

```javascript
/**
 * @param {Sheet} sheet - The Google Sheet object to search
 * @param {number} col - The 1-indexed column number to search
 * @param {string} value - The value to search for
 * @returns {Object|null} { row: number, data: Array } or null if not found
 */
const result = findRowByValue(sheet, SHEETS.donations.cols.pledgeId, 'PLEDGE-2025-1');
if (result) {
  Logger.log(`Found at row ${result.row}`);
  Logger.log(`Donor name: ${result.data[SHEETS.donations.cols.donorName - 1]}`);
}
```

---

### `getPledgeAmountFromDuration(durationText)`

Maps duration text to a numeric pledge amount using the configuration.

```javascript
/**
 * @param {string} durationText - Duration text (e.g., "One Year", "Four Years")
 * @returns {number} The numeric pledge amount in PKR
 */
const amount = getPledgeAmountFromDuration("One Year"); // Returns 300000
const custom = getPledgeAmountFromDuration("PKR 50,000"); // Returns 50000
```

---

### `getRealTimePledgeBalance(pledgeId, pledgeRowData, spreadsheet?)`

Calculates the available balance for a pledge by summing all allocations.

```javascript
/**
 * @param {string} pledgeId - The Pledge ID to check
 * @param {Array} pledgeRowData - The raw data row for this pledge
 * @param {Spreadsheet} [spreadsheet] - Optional spreadsheet object for optimization
 * @returns {number} The remaining balance (Verified Amount - Allocated Amount)
 */
const balance = getRealTimePledgeBalance(pledgeId, rowData.data);
if (allocationAmount > balance) {
  throw new Error('Insufficient funds');
}
```

> **Important:** This function uses the `verifiedTotalAmount` column (Column 23), not the pledged amount. Allocations are based on actual funds received, not promises.

---

### `getRealTimeStudentNeed(cmsId, spreadsheet?)`

Calculates the pending need for a student by summing all allocations.

```javascript
/**
 * @param {string} cmsId - The Student CMS ID
 * @param {Spreadsheet} [spreadsheet] - Optional spreadsheet for optimization
 * @returns {number|null} The pending amount, or null if student not found
 */
const need = getRealTimeStudentNeed('123456');
if (need === null) {
  throw new Error('Student not found');
}
```

---

### `updatePledgeStatus(pledgeId)`

Updates the status of a Pledge based on its allocations. Automatically closes pledges when all allocations are verified.

```javascript
/**
 * @param {string} pledgeId - The Pledge ID to check
 * @returns {void}
 */
updatePledgeStatus(pledgeId);
// If pledge is FULLY_ALLOCATED and all allocations are HOSTEL_VERIFIED,
// transitions to CLOSED automatically
```

---

### `getFormValue(e, key)`

Safe accessor for Google Form event values.

```javascript
/**
 * @param {Object} e - The form submit event object
 * @param {string} key - The exact question title
 * @returns {string} The value, or empty string if not found
 */
const name = getFormValue(e, FORM_KEYS.donorName);
```

---

## AdminWorkflow.js

Handles receipt processing, fund allocation, and hostel communication.

### `processIncomingReceipts()`

Scans Gmail for new receipts, processes them with AI, updates the sheet, and files them.

```javascript
/**
 * Designed to be run on a time-based trigger (Every 10 minutes)
 * @returns {void}
 * 
 * Workflow:
 * 1. Fetches threads with label "Receipts/To-Process"
 * 2. Extracts Pledge ID from subject
 * 3. Skips internal emails (sent to Watchdog)
 * 4. Analyzes attachments with Gemini AI
 * 5. Logs receipts to Receipt Log sheet
 * 6. Updates pledge totals and status
 * 7. Labels thread as "Receipts/Processed"
 */
```

---

### `processAllocationTransaction(pledgeId, cmsId, amount)`

Creates an allocation record and sends verification email to the hostel. Fully transactional.

```javascript
/**
 * @param {string} pledgeId - The Pledge ID to allocate from
 * @param {string} cmsId - The Student CMS ID to allocate to
 * @param {number} amount - The amount to allocate
 * @returns {boolean} True if successful, false otherwise
 * 
 * Transaction Steps:
 * 1. Acquire lock (30s timeout)
 * 2. Validate inputs and balances
 * 3. Send hostel verification email
 * 4. Send donor notification email
 * 5. Commit allocation record
 * 6. Update pledge status
 * 7. Sync lookup data
 * 8. Release lock
 */
const success = processAllocationTransaction('PLEDGE-2025-1', '123456', 50000);
```

---

### `processBatchAllocation(pledgeIds, cmsId)`

Processes multiple pledges allocated to a single student.

```javascript
/**
 * @param {Array<Object>} pledgeIds - Array of {id: string, amount: number}
 * @param {string} cmsId - The Student CMS ID
 * @throws {Error} If processing fails
 * 
 * Features:
 * - Greedy allocation (caps at student need)
 * - Single email to hostel with all donors
 * - Individual donor notifications
 * - Mailto link for hostel confirmation with BCC
 */
processBatchAllocation([
  { id: 'PLEDGE-2025-1', amount: 25000 },
  { id: 'PLEDGE-2025-2', amount: 25000 }
], '123456');
```

---

### `getVerifiedReceiptsForPledge(pledgeId)`

Fetches all valid receipts for a pledge from the Receipt Log.

```javascript
/**
 * @param {string} pledgeId - The Pledge ID
 * @returns {Object} { totalVerified: number, dates: string[], files: Blob[] }
 */
const receipts = getVerifiedReceiptsForPledge('PLEDGE-2025-1');
Logger.log(`Total verified: ${receipts.totalVerified}`);
Logger.log(`Transfer dates: ${receipts.dates.join(', ')}`);
```

---

## DonorWorkflow.js

Handles new pledge processing and donor communication.

### `processNewPledge(e)`

Processes a new form submission, generates Pledge ID, and sends confirmation.

```javascript
/**
 * @param {Object} e - The form submit event object
 * @returns {void}
 * 
 * Triggered by: onFormSubmit trigger
 * 
 * Actions:
 * 1. Generate unique Pledge ID (PLEDGE-YYYY-RR)
 * 2. Set initial status to PLEDGED
 * 3. Send confirmation email with payment instructions
 * 4. Log NEW_PLEDGE audit event
 */
```

---

### `sendPledgeConfirmationEmail(donorName, donorEmail, pledgeId, country, amount)`

Sends the initial pledge confirmation email to the donor.

```javascript
/**
 * @param {string} donorName - Donor's name
 * @param {string} donorEmail - Donor's email
 * @param {string} pledgeId - The unique pledge ID
 * @param {string} country - Chapter/location for CC routing
 * @param {number} amount - The pledge amount
 * @returns {void}
 * 
 * Uses template: TEMPLATES.pledgeConfirmation
 * CCs: Chapter leads + alwaysCC addresses
 */
```

---

### `retryFailedConfirmationEmails()`

Recovery tool to resend confirmation emails for pledges with missing email IDs.

```javascript
/**
 * Run manually from the Apps Script editor
 * Processes up to 5 pledges per run to avoid quota issues
 */
retryFailedConfirmationEmails();
```

---

## Watchdog.js

Autonomous verification monitoring and loop closure.

### `runWatchdog()`

Main entry point for the verification monitoring job.

```javascript
/**
 * Designed to be run on a time-based trigger (Every 15 minutes)
 * @returns {void}
 * 
 * Workflow:
 * 1. Search for hostel replies matching "Ref: PLEDGE-" or "Ref: BATCH-"
 * 2. Fetch open allocations for matching entities
 * 3. Analyze reply with Gemini AI
 * 4. Update allocation statuses
 * 5. Send final donor notifications
 * 6. Update pledge status if fully verified
 */
```

---

### `processThread(thread, openAllocationsMap, processedLabel, manualLabel)`

Processes a single email thread for verification.

```javascript
/**
 * @param {GmailThread} thread - The email thread to process
 * @param {Map} openAllocationsMap - Map<PledgeID, Array<Allocation>>
 * @param {GmailLabel} processedLabel - Label for processed threads
 * @param {GmailLabel} manualLabel - Label for manual review
 */
```

---

### `updateAllocations(confirmedAllocIds, hostelReplyMessageId)`

Updates the Allocation Log for confirmed items and triggers final notifications.

```javascript
/**
 * @param {Array<string>} confirmedAllocIds - List of confirmed Allocation IDs
 * @param {string} hostelReplyMessageId - The RFC Message-ID of the reply
 * @returns {number} The count of updated allocations
 */
```

---

### `sendFinalNotification(email, name, pledgeId, allocId, cmsId, amount)`

Sends the final "donation verified" email to the donor.

```javascript
/**
 * @param {string} email - Donor email
 * @param {string} name - Donor name
 * @param {string} pledgeId - Pledge ID
 * @param {string} allocId - Allocation ID
 * @param {string} cmsId - Student CMS ID
 * @param {number} amount - Allocated amount
 * @returns {string} The Message ID of the sent email
 */
```

---

## SidebarService.js

Client-server bridge for the HTML Sidebar UI.

### `showSidebar()`

Displays the allocation sidebar in the spreadsheet.

```javascript
/**
 * Called from menu: Hostel Admin → Review Allocation
 */
showSidebar();
```

---

### `getSidebarData()`

Fetches data for the active row to populate the sidebar.

```javascript
/**
 * @returns {Object} {
 *   pledgeId: string,
 *   maxPledgeAvailable: number,
 *   proofLink: string,
 *   receipts: Array<{date, amount, link, filename}>,
 *   verifiedTotal: number,
 *   students: Array<{cmsId, need}>
 * }
 * @throws {Error} If no valid row is selected
 */
```

---

### `getAvailablePledgesForSidebar()`

Fetches all pledges with available funds for the batch allocation picker.

```javascript
/**
 * @returns {Object} {
 *   pledges: Array<{id, name, amount, proofLink}>,
 *   students: Array<{cmsId, need}>
 * }
 */
```

---

### `processSidebarAllocation(pledgeId, cmsId, amount)`

Processes an allocation request from the sidebar.

```javascript
/**
 * @param {string} pledgeId - The Pledge ID
 * @param {string} cmsId - The Student CMS ID
 * @param {number} amount - The allocation amount
 * @returns {boolean} True if successful
 */
```

---

## LLM_Service.js

Gemini AI integration for email analysis and receipt verification.

### `analyzeEmailWithGemini(emailBody)`

Analyzes university email communications for verification status.

```javascript
/**
 * @param {string} emailBody - The plain text email content
 * @returns {Object|null} { summary: string, newStatus: 'Confirmed'|'Query'|'Acknowledged' }
 */
const result = analyzeEmailWithGemini(emailContent);
if (result.newStatus === 'Confirmed') {
  // Mark as verified
}
```

---

### `analyzeDonorEmail(emailBody, attachments, pledgeDate, emailDate, pledgedAmount)`

Analyzes donor email with multimodal receipt verification.

```javascript
/**
 * @param {string} emailBody - The email text content
 * @param {Blob[]} attachments - Array of file blobs (images/PDFs)
 * @param {Date} pledgeDate - The pledge date (lower bound for transfer date)
 * @param {Date} emailDate - The email date (upper bound for transfer date)
 * @param {number} pledgedAmount - The expected pledge amount
 * @returns {Object|null} {
 *   category: 'RECEIPT_SUBMISSION'|'QUESTION'|'IRRELEVANT',
 *   summary: string,
 *   valid_receipts: Array<{filename, amount, date, confidence_score, ...}>,
 *   suggested_reply: string (if QUESTION),
 *   reasoning: string
 * }
 */
```

---

### `analyzeHostelReply(emailText, openAllocations)`

Analyzes a hostel reply to match with open allocations.

```javascript
/**
 * @param {string} emailText - The full email thread content
 * @param {Array<Object>} openAllocations - List of pending allocations
 * @returns {Object} {
 *   status: 'CONFIRMED_ALL'|'PARTIAL'|'AMBIGUOUS'|'QUERY',
 *   confirmedAllocIds: string[],
 *   reasoning: string
 * }
 */
```

---

## AuditService.js

Centralized, immutable logging for business events.

### `logAuditEvent(actor, eventType, targetId, actionDescription, previousValue?, newValue?, metadata?)`

Logs a business event to the Audit Trail sheet.

```javascript
/**
 * @param {string} actor - Email of user or 'SYSTEM'
 * @param {string} eventType - Category (e.g., 'NEW_PLEDGE', 'ALLOCATION', 'STATUS_CHANGE')
 * @param {string} targetId - Entity ID (PledgeID, AllocID)
 * @param {string} actionDescription - Human-readable summary
 * @param {string} [previousValue=''] - State before change
 * @param {string} [newValue=''] - State after change
 * @param {Object} [metadata={}] - Additional context as JSON
 */
logAuditEvent(
  getActor(),
  'ALLOCATION',
  'ALLOC-123456789',
  'Funds Allocated',
  '',
  STATUS.allocation.PENDING_HOSTEL,
  { amount: 50000, cmsId: '123456' }
);
```

---

### `getActor()`

Determines the current actor for audit logging.

```javascript
/**
 * @returns {string} User email if manual trigger, 'SYSTEM' if time-based
 */
const actor = getActor(); // e.g., "user@example.com" or "SYSTEM"
```

---

## ReportingService.js

ETL pipeline for analytics data warehouse.

### `setupReportingSandbox()`

Creates the reporting data warehouse spreadsheet.

```javascript
/**
 * One-time setup function
 * Creates:
 * - Fact_Pledges sheet
 * - Fact_Allocations sheet
 * - Dim_Students sheet
 */
setupReportingSandbox();
```

---

### `syncAnonymousReportingData()`

Main ETL job with financial reconciliation.

```javascript
/**
 * Designed to be run on a time-based trigger (e.g., Daily at midnight)
 * 
 * ETL Steps:
 * 1. Extract from Operations & Confidential databases
 * 2. Transform with hash anonymization for students
 * 3. Reconcile totals (aborts if mismatch)
 * 4. Load to reporting warehouse
 */
syncAnonymousReportingData();
```

---

## Utilities.js

Shared utilities for email, parsing, and common operations.

### `createEmailFromTemplate(templateId, data)`

Generates email content from a Google Doc template.

```javascript
/**
 * @param {string} templateId - Google Doc ID
 * @param {Object} data - Key-value pairs for placeholder replacement
 * @returns {Object} { subject: string, htmlBody: string }
 */
const content = createEmailFromTemplate(TEMPLATES.pledgeConfirmation, {
  donorName: 'John Doe',
  pledgeId: 'PLEDGE-2025-1',
  amount: '50,000'
});
GmailApp.sendEmail(email, content.subject, '', { htmlBody: content.htmlBody });
```

---

### `sendEmailAndGetId(recipient, subject, htmlBody, options?)`

Sends an email and retrieves its RFC Message ID.

```javascript
/**
 * @param {string} recipient - Email address(es)
 * @param {string} subject - Email subject
 * @param {string} htmlBody - HTML body
 * @param {Object} [options] - { cc, bcc, attachments, from }
 * @returns {string} The RFC Message ID (e.g., "<abc123@mail.gmail.com>")
 */
const msgId = sendEmailAndGetId(email, subject, htmlBody, { cc: ccList });
```

---

### `sendOrReply(recipient, subject, htmlBody, options?, priorMessageIds?)`

Intelligent email sender that prioritizes threading.

```javascript
/**
 * @param {string} recipient - Email address
 * @param {string} subject - Email subject
 * @param {string} htmlBody - HTML content
 * @param {Object} [options] - { cc, bcc, attachments, from }
 * @param {string[]} [priorMessageIds] - List of Message IDs to reply to
 * @returns {string} The Message ID of the sent email
 * 
 * Tries to reply to existing thread if possible, falls back to new email
 */
```

---

### `parseCurrencyString(input)`

Parses currency strings into numbers.

```javascript
/**
 * @param {string|number} input - Value to parse
 * @returns {number} Numeric value
 * 
 * Handles: "100,000", "PKR 50,000", "15k", "1.2m", etc.
 */
parseCurrencyString("100,000");  // 100000
parseCurrencyString("15k");      // 15000
parseCurrencyString("1.2m");     // 1200000
```

---

### `getCCString(chapterName?)`

Generates CC email list for a given chapter.

```javascript
/**
 * @param {string} [chapterName] - The chapter name
 * @returns {string} Comma-separated list of CC emails
 * 
 * Includes: alwaysCC addresses + chapter-specific leads
 */
const cc = getCCString('UK'); // "admin@example.com,uk.lead@example.com"
```

---

### `getThreadContext(thread, maxHistoryMessages?)`

Extracts structured email content for LLM analysis.

```javascript
/**
 * @param {GmailThread} thread - The Gmail thread
 * @param {number} [maxHistoryMessages=3] - Max history messages to include
 * @returns {Object} {
 *   currentEmail: string,
 *   threadHistory: string,
 *   formattedForLLM: string
 * }
 */
```

---

### `writeLog(level, funcName, message, pledgeId?)`

Writes a log entry to the Log sheet.

```javascript
/**
 * @param {string} level - 'INFO', 'WARN', 'ERROR', 'SUCCESS'
 * @param {string} funcName - The function name
 * @param {string} message - The log message
 * @param {string} [pledgeId] - Optional Pledge ID for context
 */
writeLog('INFO', 'myFunction', 'Processing started', 'PLEDGE-2025-1');
```

---

## Triggers.js

Event handlers and UI setup.

### `onOpen()`

Creates the custom menu when the spreadsheet opens.

```javascript
/**
 * Bound to simple onOpen trigger
 * Creates: Hostel Admin → Review Allocation
 */
```

---

### `onFormSubmitTrigger(e)`

Entry point for new form submissions.

```javascript
/**
 * @param {Object} e - Form submit event
 * Installable trigger: From spreadsheet → On form submit
 */
```

---

### `onSheetEditTrigger(e)`

Handles user edits to the Donations Tracker sheet.

```javascript
/**
 * @param {Object} e - Edit event
 * Installable trigger: From spreadsheet → On edit
 * 
 * Monitors Column E ("Action") for allocation triggers
 */
```

---

### `onAuditSheetEdit(e)`

Logs manual status changes to the Audit Trail.

```javascript
/**
 * @param {Object} e - Edit event (installable, includes user email)
 * Installable trigger: From spreadsheet → On edit
 * 
 * Monitors status columns in Raw Data and Allocation Log
 */
```

---

## Status Constants Reference

### Pledge Statuses

```javascript
STATUS.pledge.PLEDGED             // '1 - Pledged'
STATUS.pledge.PARTIAL_RECEIPT     // '1a - Partial Receipt'
STATUS.pledge.PROOF_SUBMITTED     // '2 - Proof Submitted'
STATUS.pledge.VERIFIED            // '3 - Verified'
STATUS.pledge.PARTIALLY_ALLOCATED // '4 - Partially Allocated'
STATUS.pledge.FULLY_ALLOCATED     // '5 - Fully Allocated'
STATUS.pledge.CLOSED              // '6 - Closed'
STATUS.pledge.CANCELLED           // '9 - Cancelled'
STATUS.pledge.REJECTED            // '9 - Rejected'
```

### Allocation Statuses

```javascript
STATUS.allocation.PENDING_HOSTEL              // '1 - Pending Hostel'
STATUS.allocation.HOSTEL_QUERY                // '2 - Hostel Query'
STATUS.allocation.HOSTEL_VERIFIED             // '3 - Hostel Verified'
STATUS.allocation.STUDENT_VERIFICATION_PENDING // '4 - Student Verification'
STATUS.allocation.COMPLETED                   // '5 - Completed'
STATUS.allocation.DISPUTED                    // '6 - Disputed'
STATUS.allocation.CANCELLED                   // '9 - Cancelled'
```

### Student Statuses

```javascript
STATUS.student.NEED_IDENTIFIED         // '1 - Need Identified'
STATUS.student.ALLOCATION_IN_PROGRESS  // '2 - Allocation In Progress'
STATUS.student.FULLY_FUNDED            // '3 - Fully Funded'
STATUS.student.SETTLED                 // '4 - Settled'
```

---

## Error Handling Patterns

### Lock Contention

```javascript
const lock = LockService.getScriptLock();
try {
  if (!lock.tryLock(30000)) {
    throw new Error('System busy. Please try again.');
  }
  // Critical section
} finally {
  lock.releaseLock();
}
```

### Safe Sheet Access

```javascript
const rowData = findRowByValue(sheet, col, value);
if (!rowData) {
  writeLog('WARN', FUNC_NAME, 'Row not found', pledgeId);
  return false; // or throw
}
```

### AI Fallback

```javascript
const result = analyzeEmailWithGemini(body);
if (!result) {
  writeLog('WARN', FUNC_NAME, 'AI analysis failed');
  thread.addLabel(manualReviewLabel);
  return; // Fail safe to manual review
}
```
