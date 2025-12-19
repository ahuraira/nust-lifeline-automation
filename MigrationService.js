/**
 * Migration Service
 * Updates existing data in spreadsheets to use the new numbered status format.
 * Run this function once manually.
 */
function migrateStatuses() {
    const FUNC_NAME = 'migrateStatuses';
    writeLog('INFO', FUNC_NAME, 'Starting Status Migration...');

    const ssOp = SpreadsheetApp.openById(CONFIG.ssId_operations);
    const ssConf = SpreadsheetApp.openById(CONFIG.ssId_confidential);

    // --- 1. MIGRATE DONATIONS (PLEDGES) ---
    const donationsWs = ssOp.getSheetByName(SHEETS.donations.name);
    const donationsData = donationsWs.getDataRange().getValues();
    const donationUpdates = [];

    // Map Old -> New (includes both legacy text statuses and old numbered format)
    const pledgeMap = {
        // Legacy text statuses
        'Pledge Made': STATUS.pledge.PLEDGED,
        'Proof Received': STATUS.pledge.PROOF_SUBMITTED,
        'Hostel Notified': STATUS.pledge.FULLY_ALLOCATED,
        'Hostel Confirmed': STATUS.pledge.CLOSED,
        'Hostel Query': STATUS.pledge.FULLY_ALLOCATED,
        // Old numbered format (10_PLEDGED style)
        '10_PLEDGED': STATUS.pledge.PLEDGED,
        '20_PROOF_SUBMITTED': STATUS.pledge.PROOF_SUBMITTED,
        '30_VERIFIED': STATUS.pledge.VERIFIED,
        '40_PARTIALLY_ALLOCATED': STATUS.pledge.PARTIALLY_ALLOCATED,
        '50_FULLY_ALLOCATED': STATUS.pledge.FULLY_ALLOCATED,
        '60_CLOSED': STATUS.pledge.CLOSED,
        '99_CANCELLED': STATUS.pledge.CANCELLED,
        '99_REJECTED': STATUS.pledge.REJECTED,
        // Old hybrid format (1 - Pledge Made)
        '1 - Pledge Made': STATUS.pledge.PLEDGED,
        '2 - Proof Received': STATUS.pledge.PROOF_SUBMITTED,
        '4 - Hostel Intimated': STATUS.pledge.FULLY_ALLOCATED,
        '4.5 - Hostel Query/Issue': STATUS.pledge.FULLY_ALLOCATED,
        '5 - Hostel Confirmed': STATUS.pledge.CLOSED
    };

    for (let i = 1; i < donationsData.length; i++) {
        const currentStatus = donationsData[i][SHEETS.donations.cols.status - 1];
        const newStatus = pledgeMap[currentStatus] || currentStatus; // Keep if no match (or already migrated)

        if (newStatus !== currentStatus) {
            // Store update: [row, col, value]
            // Batching is harder with random access, but here we are updating a single column.
            // Let's just collect the values for the column.
        }
    }

    // Optimized Batch Update for Donations
    const donationStatusCol = donationsData.map((row, index) => {
        if (index === 0) return row[SHEETS.donations.cols.status - 1]; // Header
        const current = row[SHEETS.donations.cols.status - 1];
        return [pledgeMap[current] || current];
    });

    // Write back column (skip header)
    if (donationStatusCol.length > 1) {
        donationsWs.getRange(1, SHEETS.donations.cols.status, donationStatusCol.length, 1).setValues(donationStatusCol);
        writeLog('SUCCESS', FUNC_NAME, `Migrated ${donationStatusCol.length - 1} rows in Donations Sheet.`);
    }


    // --- 2. MIGRATE ALLOCATIONS ---
    const allocWs = ssOp.getSheetByName(SHEETS.allocations.name);
    const allocData = allocWs.getDataRange().getValues();

    const allocMap = {
        // Legacy text statuses
        'Pending Hostel': STATUS.allocation.PENDING_HOSTEL,
        'Hostel Verified': STATUS.allocation.HOSTEL_VERIFIED,
        'Hostel Query': STATUS.allocation.HOSTEL_QUERY,
        'Payment Approved': STATUS.allocation.HOSTEL_VERIFIED,
        'Paid': STATUS.allocation.COMPLETED,
        // Old numbered format (10_PENDING_HOSTEL style)
        '10_PENDING_HOSTEL': STATUS.allocation.PENDING_HOSTEL,
        '20_HOSTEL_QUERY': STATUS.allocation.HOSTEL_QUERY,
        '30_HOSTEL_VERIFIED': STATUS.allocation.HOSTEL_VERIFIED,
        '40_STUDENT_VERIFICATION_PENDING': STATUS.allocation.STUDENT_VERIFICATION_PENDING,
        '50_COMPLETED': STATUS.allocation.COMPLETED,
        '60_DISPUTED': STATUS.allocation.DISPUTED,
        '99_CANCELLED': STATUS.allocation.CANCELLED,
        // Old hybrid format
        '1 - Pending Hostel Confirmation': STATUS.allocation.PENDING_HOSTEL,
        '2 - Confirmed by Hostel': STATUS.allocation.HOSTEL_VERIFIED
    };

    const allocStatusCol = allocData.map((row, index) => {
        if (index === 0) return row[SHEETS.allocations.cols.status - 1];
        const current = row[SHEETS.allocations.cols.status - 1];
        return [allocMap[current] || current];
    });

    if (allocStatusCol.length > 1) {
        allocWs.getRange(1, SHEETS.allocations.cols.status, allocStatusCol.length, 1).setValues(allocStatusCol);
        writeLog('SUCCESS', FUNC_NAME, `Migrated ${allocStatusCol.length - 1} rows in Allocation Log.`);
    }

    // --- 3. MIGRATE STUDENTS ---
    // Student status is re-calculated by syncStudentData(), so we just run that!
    syncStudentData();
    writeLog('SUCCESS', FUNC_NAME, 'Triggered Student Sync to update student statuses.');

    writeLog('SUCCESS', FUNC_NAME, 'Migration Complete.');
}
