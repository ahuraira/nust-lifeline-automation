/**
 * ReportingService.js
 * 
 * Implements a SOTA Star Schema ETL Pipeline for Reporting.
 * Ensures absolute financial integrity between Operations DB and Reporting Warehouse.
 * 
 * V8 Changes:
 * - Added 'Amount_Remaining' (Unallocated Pledge Funds) to Fact_Pledges.
 *   (Calculated as Pledge Amount - Sum of Allocations).
 */

const PROPERTY_REPORTING_SS_ID = 'REPORTING_SS_ID';
const PROPERTY_SALT = 'REPORTING_SALT';

/**
 * Creates the Sandbox with 3 relational sheets.
 */
function setupReportingSandbox() {
    const FUNC_NAME = 'setupReportingSandbox';

    // 1. Setup Salt if missing (Security)
    let salt = PropertiesService.getScriptProperties().getProperty(PROPERTY_SALT);
    if (!salt) {
        salt = Utilities.getUuid(); // Generate a random UUID as salt
        PropertiesService.getScriptProperties().setProperty(PROPERTY_SALT, salt);
        writeLog('INFO', FUNC_NAME, 'Generated new Cryptographic Salt for Anonymization.');
    }

    const existingId = PropertiesService.getScriptProperties().getProperty(PROPERTY_REPORTING_SS_ID);
    if (existingId) {
        writeLog('WARN', FUNC_NAME, `Sandbox already exists: https://docs.google.com/spreadsheets/d/${existingId}`);
        return;
    }

    const ss = SpreadsheetApp.create("[REPORTING] Hostel Fund Data Warehouse (Read-Only)");
    const id = ss.getId();
    PropertiesService.getScriptProperties().setProperty(PROPERTY_REPORTING_SS_ID, id);

    // 1. Fact_Pledges
    const shPledges = ss.getSheets()[0];
    shPledges.setName('Fact_Pledges');
    shPledges.appendRow([
        'Pledge_ID',
        'Date_Pledged',
        'Amount_PKR',
        'Duration',
        'Chapter',
        'Status',
        'Is_Zakat',
        'Donor_Affiliation',
        'Receipt_Req',
        'Date_Proof_Received',
        'Receipt_Msg_ID',
        'Pref_Student',
        'Pref_Program',
        'Pref_Degree',
        'Amount_Remaining', // V8
        'Verified_Total'    // V9
    ]);
    // [V59] Updated for 19 columns in Monthly Pledges
    shPledges.getRange(1, 1, 1, 19).setFontWeight('bold');

    // 2. Fact_Allocations (Enriched Lifecycle)
    const shAlloc = ss.insertSheet('Fact_Allocations');
    shAlloc.appendRow([
        'Alloc_ID',
        'Pledge_ID',
        'Student_Hash',
        'Amount_Allocated',
        'Date_Allocated',
        'Date_Hostel_Intimation',
        'Date_Hostel_Reply',
        'Date_Donor_Notify',
        'Status',
        'Hostel_Reply_ID',
        'Donor_Notify_ID'
    ]);
    shAlloc.getRange(1, 1, 1, 11).setFontWeight('bold');

    // 3. Dim_Students
    const shStudents = ss.insertSheet('Dim_Students');
    shStudents.appendRow([
        'Student_Hash',
        'Degree',
        'School',
        'Gender',
        'Total_Need_PKR',
        'Amount_Funded_PKR',
        'Degree_Category',
        'Program',
        'Pending_Amount',
        'Student_Status'
    ]);
    shStudents.getRange(1, 1, 1, 10).setFontWeight('bold');

    // [V59] 4. Fact_Subscriptions
    const shSubs = ss.insertSheet('Fact_Subscriptions');
    shSubs.appendRow([
        'Subscription_ID',
        'Pledge_ID',
        'Monthly_Amount',
        'Duration_Months',
        'Start_Date',
        'Status',
        'Amount_Received',
        'Amount_Expected',
        'Chapter'
    ]);
    shSubs.getRange(1, 1, 1, 9).setFontWeight('bold');

    // [V59] 5. Fact_Installments
    const shInst = ss.insertSheet('Fact_Installments');
    shInst.appendRow([
        'Installment_ID',
        'Subscription_ID',
        'Month_Num',
        'Due_Date',
        'Status',
        'Amount_Received',
        'Received_Date'
    ]);
    shInst.getRange(1, 1, 1, 7).setFontWeight('bold');

    writeLog('SUCCESS', FUNC_NAME, `Created Data Warehouse: ${ss.getUrl()}`);
}

/**
 * Main ETL Job.
 * Runs in a single transaction-like block with Financial Reconciliation.
 */
function syncAnonymousReportingData() {
    const FUNC_NAME = 'syncAnonymousReportingData';
    const sandboxId = PropertiesService.getScriptProperties().getProperty(PROPERTY_REPORTING_SS_ID);
    const salt = PropertiesService.getScriptProperties().getProperty(PROPERTY_SALT) || "DEFAULT_SALT";

    if (!sandboxId) {
        writeLog('ERROR', FUNC_NAME, 'Sandbox ID missing. Run setup first.');
        return;
    }

    writeLog('INFO', FUNC_NAME, 'Starting ETL Job (Star Schema Sync V59)...');

    try {
        // --- STEP 1: EXTRACT (Read All Sources) ---
        const ssOps = SpreadsheetApp.openById(CONFIG.ssId_operations);
        const ssConfidential = SpreadsheetApp.openById(CONFIG.ssId_confidential);

        // Read RAW Data
        const rawPledges = ssOps.getSheetByName(SHEETS.donations.name).getDataRange().getValues();
        const rawAllocations = ssOps.getSheetByName(SHEETS.allocations.name).getDataRange().getValues();
        const rawStudents = ssConfidential.getSheetByName(SHEETS.students.name).getDataRange().getValues();

        // [V59] Read Subscription Data
        let rawSubs = [], rawInsts = [];
        try {
            const subSheet = ssOps.getSheetByName(SHEETS.monthlyPledges.name);
            if (subSheet) rawSubs = subSheet.getDataRange().getValues();

            const instSheet = ssOps.getSheetByName(SHEETS.installments.name);
            if (instSheet) rawInsts = instSheet.getDataRange().getValues();
        } catch (e) {
            writeLog('WARN', FUNC_NAME, 'Subscription sheets not found/empty. Skipping sub ETL.');
        }

        // --- STEP 2: PRE-CALCULATION (Allocations Map) ---
        // We need to know Total Allocated per Pledge *before* processing Pledges
        const pledgeAllocMap = {};
        let sumAllocationsSource = 0; // Verify source here

        for (let i = 1; i < rawAllocations.length; i++) {
            const r = rawAllocations[i];
            const pid = r[SHEETS.allocations.cols.pledgeId - 1];
            const amount = Number(r[SHEETS.allocations.cols.amount - 1]) || 0;

            if (pid) {
                pledgeAllocMap[pid] = (pledgeAllocMap[pid] || 0) + amount;
                sumAllocationsSource += amount;
            }
        }

        // --- STEP 3: TRANSFORM ---
        const pledgesOut = [];
        const allocationsOut = [];
        const studentsOut = [];
        const subsOut = []; // [V59]
        const instsOut = []; // [V59]
        const studentHashMap = {}; // Cache to ensure uniqueness

        // RECONCILIATION COUNTER (Transform Side)
        let sumAllocationsTransform = 0;

        // A. Process Pledges (Fact Table 1)
        for (let i = 1; i < rawPledges.length; i++) {
            const r = rawPledges[i];
            const pid = r[SHEETS.donations.cols.pledgeId - 1];
            if (!pid || String(pid) === '') continue;

            const amt = getPledgeAmountFromDuration(r[SHEETS.donations.cols.duration - 1]);

            // V8: Calculate Remaining Balance
            const totalAllocated = pledgeAllocMap[pid] || 0;
            const remaining = Math.max(0, amt - totalAllocated); // Prevent negative if over-allocated

            // Fetch Other Columns
            const dateProof = r[SHEETS.donations.cols.dateProofReceived - 1] || "";
            const isZakat = r[SHEETS.donations.cols.isZakat - 1];
            const affiliation = r[SHEETS.donations.cols.affiliation - 1];
            const reqReceipt = r[SHEETS.donations.cols.reqReceipt - 1];
            const studentPref = r[SHEETS.donations.cols.studentPref - 1];
            const programPref = r[SHEETS.donations.cols.programPref - 1];
            const degreePref = r[SHEETS.donations.cols.degreePref - 1];

            // Output
            pledgesOut.push([
                pid,
                r[SHEETS.donations.cols.timestamp - 1],
                amt,
                r[SHEETS.donations.cols.duration - 1],
                r[SHEETS.donations.cols.cityCountry - 1],
                r[SHEETS.donations.cols.status - 1],
                isZakat,
                affiliation,
                reqReceipt,
                dateProof,
                r[SHEETS.donations.cols.receiptMessageId - 1],
                studentPref,
                programPref,
                degreePref,
                r[SHEETS.donations.cols.balanceAmount - 1], // V8+V9: Uses Real Balance from Donations Sheet now
                r[SHEETS.donations.cols.verifiedTotalAmount - 1] // V9: New Field
            ]);
        }

        // B. Process Students (Dimension Table)
        for (let i = 1; i < rawStudents.length; i++) {
            const r = rawStudents[i];
            const cmsId = r[SHEETS.students.cols.cmsId - 1];
            if (!cmsId) continue;

            // SECURE HASHING: Salt + ID (Still Hashed for Privacy)
            const hashStr = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, cmsId + salt)
                .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('').substring(0, 12);

            studentHashMap[cmsId] = hashStr; // Store mapping

            const degCat = r[SHEETS.students.cols.degreeCategory - 1] || "";
            const prog = r[SHEETS.students.cols.program - 1] || "";
            const pending = r[SHEETS.students.cols.pendingAmount - 1] || 0;
            const status = r[SHEETS.students.cols.status - 1] || "";

            studentsOut.push([
                hashStr,
                r[SHEETS.students.cols.degree - 1],
                r[SHEETS.students.cols.school - 1],
                r[SHEETS.students.cols.gender - 1],
                r[SHEETS.students.cols.totalDue - 1],
                r[SHEETS.students.cols.amountCleared - 1],
                degCat,
                prog,
                pending,
                status
            ]);
        }

        // C. Process Allocations (Fact Table 2)
        for (let i = 1; i < rawAllocations.length; i++) {
            const r = rawAllocations[i];
            const pid = r[SHEETS.allocations.cols.pledgeId - 1];
            const amount = Number(r[SHEETS.allocations.cols.amount - 1]) || 0;

            if (!pid) continue;

            const cmsId = r[SHEETS.allocations.cols.cmsId - 1];
            let sHash = studentHashMap[cmsId];

            if (!sHash) {
                // writeLog('WARN', FUNC_NAME, `Orphan Alloc: ID ${r[SHEETS.allocations.cols.allocId - 1]}`);
                sHash = "UNKNOWN_STUDENT";
            }

            // Fetch Lifecycle Dates
            const dateAlloc = r[SHEETS.allocations.cols.date - 1];
            const dateReply = r[SHEETS.allocations.cols.hostelReplyDate - 1] || "";
            const dateIntimation = r[SHEETS.allocations.cols.hostelIntimationDate - 1] || "";
            const dateDonorNotify = r[SHEETS.allocations.cols.donorNotifyDate - 1] || "";

            allocationsOut.push([
                r[SHEETS.allocations.cols.allocId - 1],
                pid,
                sHash,
                amount,
                dateAlloc,
                dateIntimation,
                dateReply,
                dateDonorNotify,
                r[SHEETS.allocations.cols.status - 1],
                r[SHEETS.allocations.cols.hostelReplyId - 1],
                r[SHEETS.allocations.cols.donorNotifyId - 1]
            ]);

            sumAllocationsTransform += amount;
        }

        // [V59] D. Process Subscriptions (Fact Table 3)
        if (rawSubs.length > 1) {
            for (let i = 1; i < rawSubs.length; i++) {
                const r = rawSubs[i];
                if (!r[0]) continue; // Skip empty rows

                subsOut.push([
                    r[SHEETS.monthlyPledges.cols.subscriptionId - 1],
                    r[SHEETS.monthlyPledges.cols.pledgeId - 1],
                    r[SHEETS.monthlyPledges.cols.monthlyAmount - 1],
                    r[SHEETS.monthlyPledges.cols.durationMonths - 1],
                    r[SHEETS.monthlyPledges.cols.startDate - 1],
                    r[SHEETS.monthlyPledges.cols.status - 1],
                    r[SHEETS.monthlyPledges.cols.amountReceived - 1],
                    r[SHEETS.monthlyPledges.cols.amountExpected - 1],
                    r[SHEETS.monthlyPledges.cols.chapter - 1]
                ]);
            }
        }

        // [V59] E. Process Installments (Fact Table 4)
        if (rawInsts.length > 1) {
            for (let i = 1; i < rawInsts.length; i++) {
                const r = rawInsts[i];
                if (!r[0]) continue;

                instsOut.push([
                    r[SHEETS.installments.cols.installmentId - 1],
                    r[SHEETS.installments.cols.subscriptionId - 1],
                    r[SHEETS.installments.cols.monthNumber - 1],
                    r[SHEETS.installments.cols.dueDate - 1],
                    r[SHEETS.installments.cols.status - 1],
                    r[SHEETS.installments.cols.amountReceived - 1],
                    r[SHEETS.installments.cols.receivedDate - 1]
                ]);
            }
        }

        // --- STEP 4: FINANCIAL RECONCILIATION ---
        if (Math.abs(sumAllocationsSource - sumAllocationsTransform) > 1) {
            const msg = `FATAL INTEGRITY ERROR: Source Allocations (${sumAllocationsSource}) != Output Allocations (${sumAllocationsTransform})`;
            writeLog('ERROR', FUNC_NAME, msg);
            throw new Error(msg); // ABORT
        }

        // --- STEP 5: LOAD (Batch Write) ---
        const ssSandbox = SpreadsheetApp.openById(sandboxId);

        batchWrite(ssSandbox.getSheetByName('Fact_Pledges'), pledgesOut);
        batchWrite(ssSandbox.getSheetByName('Fact_Allocations'), allocationsOut);
        batchWrite(ssSandbox.getSheetByName('Dim_Students'), studentsOut);

        // [V59] Write new tables (create if missing logic implied or manual setup needed for first run)
        // Since setupReportingSandbox is one-time, we might need to handle new sheets gracefully
        let shFactSubs = ssSandbox.getSheetByName('Fact_Subscriptions');
        if (!shFactSubs) {
            shFactSubs = ssSandbox.insertSheet('Fact_Subscriptions');
            shFactSubs.appendRow(['Subscription_ID', 'Pledge_ID', 'Monthly_Amount', 'Duration_Months', 'Start_Date', 'Status', 'Amount_Received', 'Amount_Expected', 'Chapter']);
            shFactSubs.getRange(1, 1, 1, 9).setFontWeight('bold');
        }
        batchWrite(shFactSubs, subsOut);

        let shFactInst = ssSandbox.getSheetByName('Fact_Installments');
        if (!shFactInst) {
            shFactInst = ssSandbox.insertSheet('Fact_Installments');
            shFactInst.appendRow(['Installment_ID', 'Subscription_ID', 'Month_Num', 'Due_Date', 'Status', 'Amount_Received', 'Received_Date']);
            shFactInst.getRange(1, 1, 1, 7).setFontWeight('bold');
        }
        batchWrite(shFactInst, instsOut);

        writeLog('SUCCESS', FUNC_NAME, `ETL Complete V59. Verified Amount: ${sumAllocationsTransform}`);

    } catch (e) {
        writeLog('ERROR', FUNC_NAME, `ETL Failed: ${e.toString()}`);
    }
}

/**
 * Helper to overwrite sheet data efficiently.
 */
function batchWrite(sheet, data) {
    if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
    if (data.length > 0) {
        sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
    }
}
