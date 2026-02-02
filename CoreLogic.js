/**
 * CoreLogic.js
 * Centralized business logic and data access layer.
 * Reduces duplication and ensures consistency across the application.
 */

/**
 * Helper to open a sheet by name from the Operations spreadsheet.
 * @param {string} sheetName The name of the sheet.
 * @return {Sheet} The sheet object.
 */
function getSheet(sheetName) {
    return SpreadsheetApp.openById(CONFIG.ssId_operations).getSheetByName(sheetName);
}

/**
 * Searches a sheet for a specific value in a specific column and returns the row number and all its data.
 * MOVED FROM Utilities.js
 * @param {Sheet} sheet The Google Sheet object to search in.
 * @param {number} col The column number to search within.
 * @param {string} value The value to search for.
 * @returns {Object|null} An object containing the row number and an array of its data, or null if not found.
 */
function findRowByValue(sheet, col, value) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    // OPTIMIZATION: Read ONLY the search column (Dimensions: N x 1)
    const searchRange = sheet.getRange(2, col, lastRow - 1, 1);
    const searchValues = searchRange.getValues();

    for (let i = 0; i < searchValues.length; i++) {
        if (String(searchValues[i][0]) === String(value)) {
            const rowIndex = i + 2; // +2 because we started at row 2 and 0-indexed array
            const lastCol = sheet.getLastColumn();

            // Fetch ONLY the matched row
            const rowData = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
            return { row: rowIndex, data: rowData };
        }
    }
    return null;
}

/**
 * Maps duration text (e.g., "Four Years") to a numeric pledge amount.
 * Centralizes the logic previously scattered in AdminWorkflow and studentServices.
 * @param {string} durationText The text from the duration column.
 * @return {number} The numeric pledge amount.
 */
function getPledgeAmountFromDuration(durationText) {
    const text = String(durationText);
    if (text.includes("Month")) return CONFIG.pledgeAmounts.oneMonth;
    if (text.includes("Semester")) return CONFIG.pledgeAmounts.oneSemester;
    if (text.includes("Four Years") || text.includes("4 Years")) return CONFIG.pledgeAmounts.fourYears;
    if (text.includes("Year")) return CONFIG.pledgeAmounts.oneYear;

    // Fallback: Try to parse custom amount (e.g. "PKR 50000", "50k")
    return parseCurrencyString(text);
}

/**
 * Calculates the available balance for a pledge by summing all previous allocations in the log.
 * @param {string} pledgeId The Pledge ID to check.
 * @param {Array} pledgeRowData The raw data row for this pledge (to get total amount).
 * @param {Spreadsheet} [spreadsheet] Optional spreadsheet object for optimization.
 * @return {number} The remaining balance.
 */
function getRealTimePledgeBalance(pledgeId, pledgeRowData, spreadsheet = null) {
    // 1. Get Base Amount: STRICTLY CASH IN BANK (Verified Amount)
    // SOTA Requirement: "Allocating based on promises is a Leak."
    // We ignore duration/promise and look only at Verified Total (Col 23, Index 22)
    // Note: pledgeRowData is an array of values.

    const verifiedAmount = Number(pledgeRowData[SHEETS.donations.cols.verifiedTotalAmount - 1]) || 0;

    // 2. Sum all allocations for this Pledge ID
    const ss = spreadsheet || SpreadsheetApp.openById(CONFIG.ssId_operations);
    const allocWs = ss.getSheetByName(SHEETS.allocations.name);
    const allocData = allocWs.getDataRange().getValues();
    let totalAllocated = 0;

    for (let i = 1; i < allocData.length; i++) {
        if (String(allocData[i][SHEETS.allocations.cols.pledgeId - 1]) === pledgeId) {
            totalAllocated += (Number(allocData[i][SHEETS.allocations.cols.amount - 1]) || 0);
        }
    }

    return verifiedAmount - totalAllocated;
}

/**
 * Calculates the pending need for a student by summing all allocations and checking the Confidential DB.
 * @param {string} cmsId The Student CMS ID.
 * @param {Spreadsheet} [spreadsheet] Optional spreadsheet object for optimization.
 * @return {number|null} The pending amount, or null if student not found.
 */
function getRealTimeStudentNeed(cmsId, spreadsheet = null) {
    // 1. Get Total Due from Confidential DB
    const studentWs = SpreadsheetApp.openById(CONFIG.ssId_confidential).getSheetByName(SHEETS.students.name);
    const studentData = studentWs.getDataRange().getValues();
    let totalDue = -1;

    for (let i = 1; i < studentData.length; i++) {
        if (String(studentData[i][SHEETS.students.cols.cmsId - 1]) === String(cmsId)) {
            totalDue = Number(studentData[i][SHEETS.students.cols.totalDue - 1]) || 0;
            break;
        }
    }

    if (totalDue === -1) return null; // Student not found

    // 2. Sum all allocations for this CMS ID
    const ss = spreadsheet || SpreadsheetApp.openById(CONFIG.ssId_operations);
    const allocWs = ss.getSheetByName(SHEETS.allocations.name);
    const allocData = allocWs.getDataRange().getValues();
    let totalAllocated = 0;

    for (let i = 1; i < allocData.length; i++) {
        if (String(allocData[i][SHEETS.allocations.cols.cmsId - 1]) === String(cmsId)) {
            totalAllocated += (Number(allocData[i][SHEETS.allocations.cols.amount - 1]) || 0);
        }
    }

    return totalDue - totalAllocated;
}

/**
 * Updates the status of a Pledge based on the status of its allocations.
 * LOGIC:
 * - If Pledge is FULLY_ALLOCATED and ALL allocations are HOSTEL_VERIFIED -> Set to CLOSED.
 * - Otherwise, leave as is (or potentially manage PARTIALLY_CLOSED if needed in future).
 * @param {string} pledgeId The Pledge ID to check.
 */
function updatePledgeStatus(pledgeId) {
    const FUNC_NAME = 'updatePledgeStatus';

    const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
    const rawWs = ss.getSheetByName(SHEETS.donations.name);
    const allocWs = ss.getSheetByName(SHEETS.allocations.name);

    // 1. Get Current Pledge Status
    const donorRow = findRowByValue(rawWs, SHEETS.donations.cols.pledgeId, pledgeId);
    if (!donorRow) {
        writeLog('WARN', FUNC_NAME, 'Pledge ID not found in Raw Data', pledgeId);
        return;
    }

    const currentStatus = donorRow.data[SHEETS.donations.cols.status - 1];

    // We only close if it's already "fully allocated" (meaning money is used up).
    // If it's "partially allocated", we can't close the PLEDGE even if the allocations are verified.
    if (currentStatus !== STATUS.pledge.FULLY_ALLOCATED) {
        return;
    }

    // 2. Check Allocation Statuses
    const allocData = allocWs.getDataRange().getValues();
    let allVerified = true;
    let hasAllocations = false;

    for (let i = 1; i < allocData.length; i++) {
        if (String(allocData[i][SHEETS.allocations.cols.pledgeId - 1]) === pledgeId) {
            hasAllocations = true;
            const allocStatus = allocData[i][SHEETS.allocations.cols.status - 1];
            if (allocStatus !== STATUS.allocation.HOSTEL_VERIFIED) {
                allVerified = false;
                break;
            }
        }
    }

    // 3. Update Status if Criteria Met
    if (hasAllocations && allVerified) {
        rawWs.getRange(donorRow.row, SHEETS.donations.cols.status).setValue(STATUS.pledge.CLOSED);
        writeLog('SUCCESS', FUNC_NAME, 'Pledge automatically CLOSED (All allocations verified).', pledgeId);

        logAuditEvent(
            'SYSTEM',
            'STATUS_CHANGE',
            pledgeId,
            'Pledge Closed (All Allocations Verified)',
            STATUS.pledge.FULLY_ALLOCATED,
            STATUS.pledge.CLOSED
        );
    }
}

/**
 * Safe accessor for Form Event values.
 * Prevents crashes if question titles change.
 * @param {Object} e The event object.
 * @param {string} key The exact question title.
 * @return {string} The value, or an empty string if not found.
 */
function getFormValue(e, key) {
    if (e && e.namedValues && e.namedValues[key]) {
        return e.namedValues[key][0];
    }
    // Log warning but don't crash
    if (e && e.namedValues) {
        const keys = Object.keys(e.namedValues).join(', ');
        // Fallback to console to be safe, or writeLog if confident
        console.warn(`[getFormValue] Key not found: "${key}". Available keys: ${keys}`);
        if (typeof writeLog === 'function') {
            writeLog('WARN', 'getFormValue', `Key not found: "${key}". Available keys: ${keys}`);
        }
    }
    return '';
}

