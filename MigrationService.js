/**
 * ONE-TIME MIGRATION SCRIPT
 * Backfills the 'Transaction Log' by processing existing receipts in the Raw Data sheet.
 */
/**
 * ONE-TIME MIGRATION SCRIPT
 * Backfills the 'Receipt Log' by processing existing receipts in the Raw Data sheet.
 * Updated for V2 Schema.
 */
function runReceiptBackfill() {
    const FUNC_NAME = 'runReceiptBackfill';
    writeLog('INFO', FUNC_NAME, 'Starting Receipt Backfill Job (V2)...');

    const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
    const rawWs = ss.getSheetByName(SHEETS.donations.name);
    const receiptWs = ss.getSheetByName(SHEETS.receipts.name); // [FIX] Target new Receipt Log

    if (!receiptWs) {
        writeLog('ERROR', FUNC_NAME, `Sheet "${SHEETS.receipts.name}" not found. Please create it first.`);
        return;
    }

    // 1. Get All Data
    const rawData = rawWs.getDataRange().getValues();
    const receiptData = receiptWs.getDataRange().getValues();

    // 2. Build Cache of Existing Pledge IDs in Receipt Log
    const existingPledgeMap = new Set();
    for (let i = 1; i < receiptData.length; i++) {
        const pId = String(receiptData[i][SHEETS.receipts.cols.pledgeId - 1]);
        existingPledgeMap.add(pId);
    }

    // 3. Iterate Raw Data (Skip Header)
    // LIMIT: Process max 5 receipts per run to avoid timeouts (LLM is slow).
    let processedCount = 0;
    const BATCH_SIZE = 5;

    for (let i = 1; i < rawData.length; i++) {
        if (processedCount >= BATCH_SIZE) break;

        const row = rawData[i];
        const pledgeId = row[SHEETS.donations.cols.pledgeId - 1];
        const proofLink = row[SHEETS.donations.cols.proofLink - 1];
        // Timestamps
        const timestamp = row[SHEETS.donations.cols.timestamp - 1];
        let pledgeDate = new Date();
        if (timestamp) pledgeDate = new Date(timestamp);

        // Skip conditions
        if (!pledgeId || !proofLink) continue; // No ID or No Receipt
        if (existingPledgeMap.has(String(pledgeId))) continue; // Already migrated

        writeLog('INFO', FUNC_NAME, `Processing legacy receipt for ${pledgeId}...`);

        try {
            // 4. Fetch File from Drive
            const fileId = extractFileIdFromUrl(proofLink);
            if (!fileId) {
                writeLog('WARN', FUNC_NAME, `Invalid Drive Link for ${pledgeId}: ${proofLink}`);
                continue;
            }

            let blob;
            try {
                const file = DriveApp.getFileById(fileId);
                blob = file.getBlob();
            } catch (err) {
                writeLog('WARN', FUNC_NAME, `File access failed for ${pledgeId}: ${err.message}`);
                continue;
            }

            // 5. Call AI (Reuse existing logic)
            // Mimic an email
            const dummyBody = "Legacy receipt backfill. Please analyze attached proof.";
            const aiResult = analyzeDonorEmail(dummyBody, [blob], pledgeDate, new Date());

            if (aiResult && aiResult.category === 'RECEIPT_SUBMISSION') {

                // 6. Generate Receipt Record (V2 Schema)
                const receiptId = `${pledgeId}-REC-MIG`;

                // Get Amount
                let verifiedAmount = 0;
                let date = new Date();

                if (aiResult.valid_receipts && aiResult.valid_receipts.length > 0) {
                    verifiedAmount = aiResult.valid_receipts[0].amount || 0;
                    if (aiResult.valid_receipts[0].date) date = aiResult.valid_receipts[0].date;
                } else if (aiResult.extracted_amount) {
                    verifiedAmount = aiResult.extracted_amount || 0;
                    if (aiResult.extracted_transfer_date) date = aiResult.extracted_transfer_date;
                }

                // If 0, flag it
                const status = (verifiedAmount > 0) ? 'VALID' : 'REQUIRES_REVIEW';
                const confidence = aiResult.confidence || 'LOW';

                // Prepare Row
                const newRow = [];
                newRow[SHEETS.receipts.cols.receiptId - 1] = receiptId;
                newRow[SHEETS.receipts.cols.pledgeId - 1] = pledgeId;
                newRow[SHEETS.receipts.cols.timestamp - 1] = new Date(); // Processed Now
                newRow[SHEETS.receipts.cols.emailDate - 1] = pledgeDate; // Use Pledge Date as proxy
                newRow[SHEETS.receipts.cols.transferDate - 1] = date;
                newRow[SHEETS.receipts.cols.amountDeclared - 1] = 0; // Legacy doesn't have explicit declared amount per receipt
                newRow[SHEETS.receipts.cols.amountVerified - 1] = verifiedAmount;
                newRow[SHEETS.receipts.cols.confidence - 1] = confidence;
                newRow[SHEETS.receipts.cols.driveLink - 1] = proofLink;
                newRow[SHEETS.receipts.cols.filename - 1] = 'Legacy File';
                newRow[SHEETS.receipts.cols.status - 1] = status;

                receiptWs.appendRow(newRow);

                writeLog('SUCCESS', FUNC_NAME, `Migrated ${pledgeId}. Verified: ${verifiedAmount}`, pledgeId);
                processedCount++;

            } else {
                writeLog('WARN', FUNC_NAME, `AI failed to verify legacy receipt for ${pledgeId}.`, pledgeId);
                // Optionally log a failed row so we skip next time, specific status?
            }

        } catch (e) {
            writeLog('ERROR', FUNC_NAME, `Failed to migrate ${pledgeId}: ${e.message}`);
        }
    }

    writeLog('INFO', FUNC_NAME, `Backfill Batch Complete. Processed ${processedCount} records.`);
}

/**
 * Helper to extract ID from standard Drive URLs
 */
function extractFileIdFromUrl(url) {
    try {
        const match = url.match(/[-\w]{25,}/);
        return match ? match[0] : null;
    } catch (e) {
        return null;
    }
}

/**
 * ONE-TIME FIX SCRIPT
 * Force Recalculates Columns W, X, Y in Donations Sheet based on Receipt Log + Allocation Log.
 * Run this AFTER running runReceiptBackfill.
 */
function recalculateAllPledgeTotals() {
    const FUNC_NAME = 'recalculateAllPledgeTotals';
    writeLog('INFO', FUNC_NAME, 'Starting Bulk Recalculation of Pledge Totals...');

    const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
    const donationWs = ss.getSheetByName(SHEETS.donations.name);
    const receiptWs = ss.getSheetByName(SHEETS.receipts.name);
    const allocWs = ss.getSheetByName(SHEETS.allocations.name);

    // 1. Load All Data
    const donationData = donationWs.getDataRange().getValues();
    const receiptData = receiptWs.getDataRange().getValues();
    const allocData = allocWs.getDataRange().getValues();

    // 2. Aggregate Verified Amounts (Map<PledgeId, Amount>)
    const verifiedMap = new Map();
    for (let i = 1; i < receiptData.length; i++) {
        // Col 2 = Pledge ID (Index 1), Col 7 = Verified Amount (Index 6), Col 11 = Status (Index 10)
        const pId = String(receiptData[i][SHEETS.receipts.cols.pledgeId - 1]);
        const amt = Number(receiptData[i][SHEETS.receipts.cols.amountVerified - 1]) || 0;
        const status = receiptData[i][SHEETS.receipts.cols.status - 1];

        if (status === 'VALID') {
            verifiedMap.set(pId, (verifiedMap.get(pId) || 0) + amt);
        }
    }

    // 3. Aggregate Allocated Amounts (Map<PledgeId, Amount>)
    const allocMap = new Map();
    for (let i = 1; i < allocData.length; i++) {
        // Col 3 = Pledge ID (Index 2), Col 5 = Amount (Index 4)
        const pId = String(allocData[i][SHEETS.allocations.cols.pledgeId - 1]);
        const amt = Number(allocData[i][SHEETS.allocations.cols.amount - 1]) || 0;
        allocMap.set(pId, (allocMap.get(pId) || 0) + amt);
    }

    // 4. Update Donations Sheet
    // We update row by row. For speed, we could build an array, but this is safer for one-off.
    let updateCount = 0;

    // Determine Col Indices (0-based for array vs 1-based for getRange)
    // verifiedTotalAmount: 23, balanceAmount: 24, pledgeOutstanding: 25
    const colVerified = SHEETS.donations.cols.verifiedTotalAmount;
    const colBalance = SHEETS.donations.cols.balanceAmount;
    const colOutstanding = SHEETS.donations.cols.pledgeOutstanding;

    // We can update the whole block at once for speed if we map it carefully.
    const updates = []; // Array of arrays [verified, balance, outstanding]

    for (let i = 1; i < donationData.length; i++) {
        const pledgeId = String(donationData[i][SHEETS.donations.cols.pledgeId - 1]); // Col 13
        const pledgeAmount = getPledgeAmountFromDuration(donationData[i][SHEETS.donations.cols.duration - 1]);

        const totalVerified = verifiedMap.get(pledgeId) || 0;
        const totalAllocated = allocMap.get(pledgeId) || 0;

        const balance = totalVerified - totalAllocated;
        const outstanding = Math.max(0, pledgeAmount - totalVerified);

        updates.push([totalVerified, balance, outstanding]);
        updateCount++;
    }

    // Write Back (Starting from Row 2, Col 23)
    if (updates.length > 0) {
        // Range: Row 2, Col 23, NumRows, 3 Columns
        donationWs.getRange(2, colVerified, updates.length, 3).setValues(updates);
    }

    writeLog('SUCCESS', FUNC_NAME, `Recalculated totals for ${updateCount} pledges.`);
}
