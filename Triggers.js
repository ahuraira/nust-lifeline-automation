/**
 * Creates a custom menu when the spreadsheet opens.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Hostel Admin')
    .addItem('Review Allocation', 'showSidebar')
    .addToUi();
}

/**
 * This is the main function that will be triggered by Google when a new form is submitted.
 * It acts as an entry point and passes the event data to the appropriate workflow.
 * @param {Object} e The event object from the form submission.
 */
function onFormSubmitTrigger(e) {
  alignManualInputs(e);
  processNewPledge(e);
}

/**
 * This is the main function that will be triggered by Google whenever a user edits the spreadsheet.
 * VERSION 4.2: Removes premature data writes for transactional integrity.
 * @param {Object} e The event object from the onEdit trigger.
 */
function onSheetEditTrigger(e) {
  const FUNC_NAME = 'onSheetEditTrigger';
  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName();
  const row = range.getRow();
  const col = range.getColumn();
  const newValue = e.value;

  if (sheetName !== 'Donations Tracker' || row === 1) {
    return;
  }

  if (col === 5 && newValue === STATUS.donations.toBeAllocated) {

    range.setFontColor("#999999").setValue("Processing...");

    const cmsId = sheet.getRange(row, 1).getValue();
    const amount = sheet.getRange(row, 4).getValue();
    const pledgeId = sheet.getRange(row, 7).getValue();

    if (!pledgeId) {
      writeLog('WARN', FUNC_NAME, `onEdit triggered on row ${row}, but no Pledge ID was found. Halting.`, pledgeId);
      range.setValue("ERROR").setFontColor("red");
      return;
    }

    // --- CRITICAL CHANGE: We no longer write to the raw sheet here. ---
    // We simply pass the data to the main function and let it handle the transaction.

    writeLog('INFO', FUNC_NAME, `User action: Allocate. Triggering verification for Pledge ID: ${pledgeId}.`, pledgeId);

    const isSuccess = processAllocationTransaction(pledgeId, cmsId, amount);

    if (isSuccess) {
      // VISUAL FEEDBACK: Update the trigger cell to "Allocated" (Green)
      // Re-fetch range to be safe
      sheet.getRange(row, 5).setValue("Allocated").setFontColor("#4caf50");

      // OPTIONAL: Clear the manual inputs (CMS ID and Amount) to prepare for the next entry
      // CMS ID is Column 1, Amount to Allocate is Column 4
      sheet.getRange(row, 1).clearContent(); // Clear CMS ID
      sheet.getRange(row, 4).clearContent(); // Clear Amount
    } else {
      // VISUAL FEEDBACK: Update the trigger cell to "ERROR" (Red)
      sheet.getRange(row, 5).setValue("ERROR").setFontColor("red");
    }
  }
}

/**
 * INSTALLABLE TRIGGER: Logs manual edits to critical columns.
 * Requires manual setup in Apps Script Dashboard -> Triggers.
 * @param {Object} e The event object.
 */
function onAuditSheetEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName();
  const column = range.getColumn();
  const newValue = e.value;
  const oldValue = e.oldValue;
  const userEmail = e.user.email; // Only available in Installable Triggers

  // 1. Audit Changes in 'Raw Form Responses' (Pledge Status)
  if (sheetName === SHEETS.donations.name) {
    // Status Column Change
    if (column === SHEETS.donations.cols.status) {
      // Get Piedge ID for context (Row, PledgeId Column)
      const pledgeId = sheet.getRange(range.getRow(), SHEETS.donations.cols.pledgeId).getValue();

      logAuditEvent(
        userEmail,
        'STATUS_CHANGE',
        pledgeId,
        'Manual Status Update',
        oldValue,
        newValue,
        { sheet: sheetName, row: range.getRow() }
      );
    }
  }

  // 2. Audit Changes in 'Allocation Log' (Allocation Status)
  if (sheetName === SHEETS.allocations.name) {
    // Status Column Change
    if (column === SHEETS.allocations.cols.status) {
      // Get Alloc ID & Pledge ID
      const allocId = sheet.getRange(range.getRow(), SHEETS.allocations.cols.allocId).getValue();
      const pledgeId = sheet.getRange(range.getRow(), SHEETS.allocations.cols.pledgeId).getValue();

      logAuditEvent(
        userEmail,
        'STATUS_CHANGE',
        `${allocId} (${pledgeId})`,
        'Manual Allocation Status Update',
        oldValue,
        newValue,
        { sheet: sheetName, row: range.getRow() }
      );
    }
  }
}