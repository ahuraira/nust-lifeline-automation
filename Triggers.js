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


// ==================================================================================
//                      [V59] SUBSCRIPTION TRIGGERS
// ==================================================================================

/**
 * Daily trigger for subscription management tasks.
 * Schedule this to run at 9:00 AM via Apps Script Dashboard -> Triggers.
 * 
 * Tasks performed:
 * 1. Send payment reminders (Day 0 + Day 7)
 * 2. Check and update overdue subscriptions
 * 3. Send batched hostel intimation (on configured day)
 */
function runDailySubscriptionTasks() {
  const FUNC_NAME = 'runDailySubscriptionTasks';
  writeLog('INFO', FUNC_NAME, 'Starting daily subscription tasks...');

  try {
    // 1. Send reminders for due and overdue payments
    runSubscriptionReminders();

    // 2. Check and update subscription statuses (Active -> Overdue -> Lapsed)
    checkOverdueSubscriptions();

    // 3. Run batched hostel intimation (only on configured day)
    runBatchedHostelIntimation();

    writeLog('SUCCESS', FUNC_NAME, 'Daily subscription tasks completed.');

  } catch (e) {
    writeLog('ERROR', FUNC_NAME, `Daily subscription tasks failed: ${e.message}`);
  }
}

/**
 * Helper function to manually test subscription triggers.
 * Run this from the Apps Script editor.
 */
function test_dailySubscriptionTasks() {
  runDailySubscriptionTasks();
}

/**
 * [V59.3] Monthly batch trigger for subscription allocations.
 * Schedule this to run on the 10th of each month via Apps Script Dashboard -> Triggers.
 * 
 * Process:
 * 1. Find all installments marked RECEIVED in current month
 * 2. Group by subscriptionId (pledgeId)
 * 3. For each subscription with linked students, call processBatchAllocation
 * 4. If no student linked, alert process owner
 */
function runMonthlySubscriptionBatch() {
  const FUNC_NAME = 'runMonthlySubscriptionBatch';

  // [V59.3 FIX] Add lock to prevent concurrent runs
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    writeLog('WARN', FUNC_NAME, 'Could not acquire lock. Another batch may be running.');
    return;
  }

  writeLog('INFO', FUNC_NAME, 'Starting monthly subscription batch allocation...');

  const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
  const subWs = ss.getSheetByName(SHEETS.monthlyPledges.name);
  const instWs = ss.getSheetByName(SHEETS.installments.name);
  const allocWs = ss.getSheetByName(SHEETS.allocations.name);

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  try {
    const instData = instWs.getDataRange().getValues();
    const subData = subWs.getDataRange().getValues();

    // Build subscription map for quick lookup
    const subMap = new Map();
    for (let i = 1; i < subData.length; i++) {
      const subId = subData[i][SHEETS.monthlyPledges.cols.subscriptionId - 1];
      subMap.set(subId, {
        row: i + 1,
        data: subData[i]
      });
    }

    // Find RECEIVED installments from this month
    const receivedThisMonth = [];
    for (let i = 1; i < instData.length; i++) {
      const status = instData[i][SHEETS.installments.cols.status - 1];
      const receivedDate = instData[i][SHEETS.installments.cols.receivedDate - 1];

      if (status === STATUS.installment.RECEIVED && receivedDate) {
        const rDate = new Date(receivedDate);
        if (rDate.getMonth() === currentMonth && rDate.getFullYear() === currentYear) {
          receivedThisMonth.push({
            installmentId: instData[i][SHEETS.installments.cols.installmentId - 1],
            subscriptionId: instData[i][SHEETS.installments.cols.subscriptionId - 1],
            amount: instData[i][SHEETS.installments.cols.amountReceived - 1],
            row: i + 1
          });
        }
      }
    }

    writeLog('INFO', FUNC_NAME, `Found ${receivedThisMonth.length} received installments this month`);

    // Group by subscription and process
    const groupedBySub = new Map();
    for (const inst of receivedThisMonth) {
      if (!groupedBySub.has(inst.subscriptionId)) {
        groupedBySub.set(inst.subscriptionId, []);
      }
      groupedBySub.get(inst.subscriptionId).push(inst);
    }

    let allocations = 0;
    let alerts = 0;

    for (const [subId, installments] of groupedBySub) {
      const subInfo = subMap.get(subId);
      if (!subInfo) {
        writeLog('WARN', FUNC_NAME, `Subscription ${subId} not found in Monthly Pledges`, subId);
        continue;
      }

      const linkedStudents = subInfo.data[SHEETS.monthlyPledges.cols.linkedStudentIds - 1] || '';

      if (!linkedStudents || linkedStudents.trim() === '') {
        // No student assigned - send alert
        sendProcessOwnerStudentAlert(subId, installments[0].amount);
        alerts++;
        writeLog('WARN', FUNC_NAME, `No student linked for ${subId}. Sent alert.`, subId);
        continue;
      }

      // Parse student IDs (comma-separated)
      const studentIds = linkedStudents.split(',').map(s => s.trim()).filter(s => s);

      // [V59.4] Build student allocation objects with 25,000 per student
      const studentAllocations = studentIds.map(id => ({ cmsId: id, amount: 25000 }));

      try {
        // [V59.4] Call processBatchAllocation ONCE with all students
        // This sends ONE consolidated email to hostel instead of per-student emails
        processBatchAllocation([subId], studentAllocations);

        // Update allocation log with installmentId for all new allocations
        const allocData = allocWs.getDataRange().getValues();
        for (let a = allocData.length - 1; a >= 1; a--) {
          if (allocData[a][SHEETS.allocations.cols.pledgeId - 1] === subId &&
            !allocData[a][SHEETS.allocations.cols.installmentId - 1]) {
            allocWs.getRange(a + 1, SHEETS.allocations.cols.installmentId).setValue(
              installments[0].installmentId
            );
            // Don't break - update all allocation rows for this batch
          }
        }

        allocations += studentIds.length;
        writeLog('SUCCESS', FUNC_NAME,
          `Created ${studentIds.length} allocations for ${subId} -> [${studentIds.join(', ')}]`, subId);
      } catch (allocErr) {
        writeLog('ERROR', FUNC_NAME, `Failed to allocate ${subId}: ${allocErr.message}`, subId);
      }

      // Mark installments as allocated (update status)
      for (const inst of installments) {
        instWs.getRange(inst.row, SHEETS.installments.cols.status).setValue(STATUS.installment.ALLOCATED);
      }
    }

    writeLog('SUCCESS', FUNC_NAME,
      `Monthly batch complete. Allocations: ${allocations}, Alerts: ${alerts}`);

  } catch (e) {
    writeLog('ERROR', FUNC_NAME, `Monthly batch failed: ${e.message}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * [V59.3] Sends alert to process owner when student not assigned to subscription.
 */
function sendProcessOwnerStudentAlert(subscriptionId, amount) {
  const subject = `ACTION REQUIRED: Assign Student for ${subscriptionId}`;
  const body = `
    <p>A subscription payment was received but no student is assigned.</p>
    <p><strong>Subscription ID:</strong> ${subscriptionId}</p>
    <p><strong>Amount:</strong> PKR ${Number(amount).toLocaleString()}</p>
    <p>Please assign a student in the Monthly Pledges sheet.</p>
  `;

  try {
    GmailApp.sendEmail(EMAILS.processOwner, subject, '', { htmlBody: body });
    writeLog('INFO', 'sendProcessOwnerStudentAlert', `Alert sent for ${subscriptionId}`);
  } catch (e) {
    writeLog('ERROR', 'sendProcessOwnerStudentAlert', `Failed to send alert: ${e.message}`);
  }
}

/**
 * Test function for monthly batch.
 */
function test_monthlySubscriptionBatch() {
  runMonthlySubscriptionBatch();
}