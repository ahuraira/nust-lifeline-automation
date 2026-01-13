/**
 * Synchronizes student financial data between the Confidential DB and the Operations Lookup.
 * Calculates live pending amounts based on the Allocation Log.
 */
function syncStudentData() {
  const FUNC_NAME = 'syncStudentData';
  writeLog('INFO', FUNC_NAME, 'Starting Student Data Sync...');

  try {
    // 1. Get Allocation Data (Credits)
    const allocWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.allocations.name);
    const allocData = allocWs.getDataRange().getValues();

    // Create a map of total allocations per student: { '12345': 50000, '67890': 20000 }
    const allocationMap = {};
    for (let i = 1; i < allocData.length; i++) { // Skip header
      const cmsId = String(allocData[i][SHEETS.allocations.cols.cmsId - 1]);
      const amount = Number(allocData[i][SHEETS.allocations.cols.amount - 1]) || 0;

      if (allocationMap[cmsId]) {
        allocationMap[cmsId] += amount;
      } else {
        allocationMap[cmsId] = amount;
      }
    }

    // 2. Get Student Data (Debits/Needs) from Confidential Workbook
    const studentWs = SpreadsheetApp.openById(CONFIG.ssId_confidential).getSheetByName(SHEETS.students.name);
    const studentData = studentWs.getDataRange().getValues();

    const lookupData = [];    // For Operations Sheet (Mirror)
    const writeBackData = []; // For Confidential Sheet (Update)

    // Loop through confidential student list (Skip header)
    for (let i = 1; i < studentData.length; i++) {
      const cmsId = String(studentData[i][SHEETS.students.cols.cmsId - 1]); // Access via Config col index
      const totalDue = Number(studentData[i][SHEETS.students.cols.totalDue - 1]) || 0;

      const allocatedSoFar = allocationMap[cmsId] || 0;
      const pendingAmount = totalDue - allocatedSoFar;

      // Determine Status based on FSM
      let status = STATUS.student.NEED_IDENTIFIED;
      if (pendingAmount <= 0) {
        status = STATUS.student.FULLY_FUNDED;
      } else if (allocatedSoFar > 0) {
        status = STATUS.student.ALLOCATION_IN_PROGRESS;
      }

      // Prepare data for Write-Back (Columns 7, 8, 9: Amount Cleared, Pending Amount, Status)
      writeBackData.push([allocatedSoFar, pendingAmount, status]);

      // Prepare data for Lookup Sheet (Only active needs)
      if (pendingAmount > 0) {
        lookupData.push([cmsId, totalDue, allocatedSoFar, pendingAmount]);
      }
    }

    // 3. WRITE BACK to Confidential DB (Columns 7, 8, 9)
    // We start from Row 2, Column 7. Dimensions: numRows x 3 columns.
    if (writeBackData.length > 0) {
      studentWs.getRange(2, 7, writeBackData.length, 3).setValues(writeBackData);
      writeLog('INFO', FUNC_NAME, `Updated financial totals and status for ${writeBackData.length} students in Confidential DB.`);
    }

    // 4. Update the Mirror Sheet in Operations Workbook
    const mirrorWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName('Student Lookup');

    // Clear old data to prevent stale records
    if (mirrorWs.getLastRow() > 1) {
      mirrorWs.getRange(2, 1, mirrorWs.getLastRow() - 1, 4).clearContent();
    }

    if (lookupData.length > 0) {
      mirrorWs.getRange(2, 1, lookupData.length, 4).setValues(lookupData);
      writeLog('SUCCESS', FUNC_NAME, `Synced ${lookupData.length} active student records to Lookup.`);
    } else {
      writeLog('INFO', FUNC_NAME, 'Sync complete. No students with pending amounts found.');
    }

  } catch (e) {
    writeLog('ERROR', FUNC_NAME, `Sync failed: ${e.toString()}`);
  }
}

/**
 * Synchronizes Pledge financial data.
 * Calculates how much is remaining in each pledge based on the Allocation Log.
 */
function syncPledgeData() {
  const FUNC_NAME = 'syncPledgeData';

  try {
    // 1. Get Totals from Allocation Log
    const allocWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.allocations.name);
    const allocData = allocWs.getDataRange().getValues();

    // Map: { 'PLEDGE-2025-1': 5000, 'PLEDGE-2025-2': 10000 }
    const usedMap = {};
    for (let i = 1; i < allocData.length; i++) {
      const pId = String(allocData[i][SHEETS.allocations.cols.pledgeId - 1]);
      const amt = Number(allocData[i][SHEETS.allocations.cols.amount - 1]) || 0;
      usedMap[pId] = (usedMap[pId] || 0) + amt;
    }

    // 2. Get Original Pledge Amounts from Raw Data
    const rawWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(SHEETS.donations.name);
    const rawData = rawWs.getDataRange().getValues();

    const outputData = [];

    for (let i = 1; i < rawData.length; i++) {
      const pId = String(rawData[i][SHEETS.donations.cols.pledgeId - 1]);
      const durationText = String(rawData[i][SHEETS.donations.cols.duration - 1]);
      const totalPledged = getPledgeAmountFromDuration(durationText);
      const verifiedTotal = Number(rawData[i][SHEETS.donations.cols.verifiedTotalAmount - 1]) || 0; // Col 23

      const used = usedMap[pId] || 0;

      // V2 Logic:
      // Cash Balance (Available) = Verified - Used
      const cashBalance = verifiedTotal - used;

      // Pledge Outstanding = Pledged - Verified
      const pledgeOutstanding = Math.max(0, totalPledged - verifiedTotal);

      if (pId && pId.startsWith("PLEDGE")) {
        // Col 1: ID, Col 2: Total, Col 3: Used, Col 4: Cash Balance (Available), Col 5: Pledge Outstanding, Col 6: Verified
        outputData.push([pId, totalPledged, used, cashBalance, pledgeOutstanding, verifiedTotal]);
      }
    }

    // 3. Update the Mirror Sheet
    const mirrorWs = SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName('Pledge Lookup');
    if (mirrorWs.getLastRow() > 1) {
      // Clear up to 6 columns now
      mirrorWs.getRange(2, 1, mirrorWs.getLastRow() - 1, 6).clearContent();
    }
    if (outputData.length > 0) {
      mirrorWs.getRange(2, 1, outputData.length, 6).setValues(outputData);
    }
    // writeLog('INFO', FUNC_NAME, 'Pledge data synced.');

  } catch (e) {
    writeLog('ERROR', FUNC_NAME, `Sync failed: ${e.toString()}`);
  }
}