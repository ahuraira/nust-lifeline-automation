/**
 * Serves the Sidebar HTML to the user.
 */
function showSidebar() {
    const html = HtmlService.createHtmlOutputFromFile('Sidebar')
        .setTitle('Review Allocation')
        .setWidth(400);
    SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Fetches data for the active row to populate the sidebar.
 * @return {Object} The data object containing pledge details and student list.
 */
function getSidebarData() {
    const activeSheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const activeRow = activeSheet.getActiveRange().getRow();

    if (activeRow === 1) {
        throw new Error('Please select a valid row (not the header).');
    }

    // --- STEP 1: RESOLVE PLEDGE ID BASED ON ACTIVE VIEW ---
    let pledgeId = null;
    const sheetName = activeSheet.getName();

    if (sheetName === SHEETS.donations.name) {
        // Case A: User is on the RAW sheet
        // Read directly from the configured column
        const rowValues = activeSheet.getRange(activeRow, 1, 1, SHEETS.donations.cols.pledgeId).getValues()[0];
        pledgeId = rowValues[SHEETS.donations.cols.pledgeId - 1];
    }
    else if (sheetName === 'Donations Tracker') {
        // Case B: User is on the Tracker sheet (QUERY view)
        // We know the Tracker has Pledge ID in Column G (Index 7) based on the QUERY.
        // We hardcode this lookup ONLY for finding the ID.
        const TRACKER_PLEDGE_COL = SHEETS.donationsTracker.cols.pledgeId;
        pledgeId = activeSheet.getRange(activeRow, TRACKER_PLEDGE_COL).getValue();
    }
    else {
        throw new Error('Please open the sidebar from "Donations Tracker" or "(RAW) Form Responses".');
    }

    if (!pledgeId) {
        throw new Error('No Pledge ID found in this row.');
    }

    // --- STEP 2: FETCH DATA FROM SOURCE OF TRUTH (RAW SHEET) ---
    // Once we have the ID, we ignore the active sheet and go to the Raw Data.
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rawWs = ss.getSheetByName(SHEETS.donations.name);
    const donationRowData = findRowByValue(rawWs, SHEETS.donations.cols.pledgeId, pledgeId);

    if (!donationRowData) {
        throw new Error(`Pledge ID ${pledgeId} not found in Raw Data.`);
    }

    // Calculate Real-Time Balance
    const maxPledgeAvailable = getRealTimePledgeBalance(pledgeId, donationRowData.data, ss);
    let proofLink = donationRowData.data[SHEETS.donations.cols.proofLink - 1];

    // V2: Multi-Receipt Support
    let receiptList = [];
    let verifiedTotal = 0;

    try {
        const wsReceipts = ss.getSheetByName(SHEETS.receipts.name);
        if (wsReceipts) {
            const rRows = wsReceipts.getDataRange().getValues();
            for (let i = 1; i < rRows.length; i++) {
                // Col 2 = PledgeID (Index 1), Col 11 = Status (Index 10)
                if (String(rRows[i][1]) === String(pledgeId) && rRows[i][10] === "VALID") {
                    verifiedTotal += Number(rRows[i][6]) || 0; // Col 7 = Verified Amount
                    receiptList.push({
                        date: Utilities.formatDate(new Date(rRows[i][4]), Session.getScriptTimeZone(), "yyyy-MM-dd"), // Col 5 = Transfer Date
                        amount: rRows[i][6],
                        link: rRows[i][8], // Col 9 = Link
                        filename: rRows[i][9] // Col 10 = Filename
                    });
                }
            }
        }
    } catch (e) {
        console.warn("Sidebar Receipt Fetch Error: " + e.message);
    }

    // Fallback: Legacy Link
    if (receiptList.length === 0 && proofLink && String(proofLink).startsWith("http")) {
        receiptList.push({
            date: "Legacy",
            amount: "N/A",
            link: proofLink,
            filename: "Attached Receipt"
        });
    }

    // --- STEP 3: FETCH STUDENT LIST (Synced) ---
    const lookupWs = ss.getSheetByName('Student Lookup');
    const lookupData = lookupWs.getDataRange().getValues();
    const students = [];

    for (let i = 1; i < lookupData.length; i++) {
        const cmsId = String(lookupData[i][0]);
        const pendingAmount = Number(lookupData[i][3]);

        if (pendingAmount > 0) {
            students.push({
                cmsId: cmsId,
                need: pendingAmount
            });
        }
    }



    // --- STEP 4: CHECK STATUS ---
    // Allow allocation if status is Pledged, Proof Submitted, Verified, or Partially Allocated
    const status = donationRowData.data[SHEETS.donations.cols.status - 1];

    // We only return data if the status allows allocation. Otherwise UI should block.
    // Ideally we return the status to the UI so it can decide.
    // But per instructions to "allow allocation", we just return the object.

    // If we want to strictly enforce it:
    if (
        status === STATUS.pledge.PLEDGED ||
        status === STATUS.pledge.PROOF_SUBMITTED ||
        status === STATUS.pledge.VERIFIED ||
        status === STATUS.pledge.PARTIALLY_ALLOCATED ||
        status === "Partial Receipt" ||
        status === "Fully Funded / Proof Received"
    ) {
        return {
            pledgeId: pledgeId,
            maxPledgeAvailable: maxPledgeAvailable,
            proofLink: proofLink, // Deprecated but kept
            receipts: receiptList, // [NEW]
            verifiedTotal: verifiedTotal, // [NEW]
            students: students
        };
    } else {
        return { // [NEW] Return error state softly so UI can show it nicely? No, throw is better for now.
            error: `Pledge Status '${status}' does not allow allocation.`
        };
    }
}


/**
 * Fetches the real-time need for a specific student.
 * @param {string} cmsId The CMS ID to check.
 * @return {number} The remaining need.
 */
function getStudentDetails(cmsId) {
    return getRealTimeStudentNeed(cmsId);
}

/**
 * Processes the allocation from the sidebar.
 * @param {string} pledgeId
 * @param {string} cmsId
 * @param {number} amount
 * @return {boolean} True if successful.
 */
function processSidebarAllocation(pledgeId, cmsId, amount) {
    const isSuccess = processAllocationTransaction(pledgeId, cmsId, amount);

    // VISUAL FEEDBACK: Update Column E in Donations Tracker (the trigger column)
    // We find the row by Pledge ID (Column G in Tracker)
    const trackerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Donations Tracker');
    const trackerData = trackerSheet.getDataRange().getValues();
    const pledgeIdColIndex = SHEETS.donationsTracker.cols.pledgeId - 1; // Column G (index 6)

    for (let i = 1; i < trackerData.length; i++) {
        if (String(trackerData[i][pledgeIdColIndex]) === String(pledgeId)) {
            const row = i + 1;
            if (isSuccess) {
                trackerSheet.getRange(row, 5).setValue("Allocated").setFontColor("#4caf50"); // Column E
            } else {
                trackerSheet.getRange(row, 5).setValue("ERROR").setFontColor("red"); // Column E
            }
            break;
        }
    }

    return isSuccess;
}

/**
 * Fetches ALL pledges that have money but aren't allocated yet.
 * Used to populate the Multi-Select Picker in the Sidebar.
 */
function getAvailablePledgesForSidebar() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const rawWs = ss.getSheetByName(SHEETS.donations.name);
    const data = rawWs.getDataRange().getValues();

    const availablePledges = [];

    // Skip header
    // [NEW] Pre-fetch Receipt Links to fix "See Receipt Log" issue
    const receiptMap = new Map(); // PledgeID -> Latest Link
    try {
        const receiptWs = ss.getSheetByName(SHEETS.receipts.name);
        const receiptData = receiptWs.getDataRange().getValues();
        // Iterate receipts to find valid links
        for (let r = 1; r < receiptData.length; r++) {
            const rPledgeId = receiptData[r][SHEETS.receipts.cols.pledgeId - 1];
            const rStatus = receiptData[r][SHEETS.receipts.cols.status - 1];
            const rLink = receiptData[r][SHEETS.receipts.cols.driveLink - 1];

            if (rStatus === 'VALID' && rLink) {
                // Always overwrite -> Gets the latest one (assuming appended in order)
                // Or we could store an array? For now, UI expects one link.
                receiptMap.set(String(rPledgeId), rLink);
            }
        }
    } catch (e) {
        console.warn("Sidebar: Failed to fetch receipts map", e);
    }

    for (let i = 1; i < data.length; i++) {
        const pledgeId = data[i][SHEETS.donations.cols.pledgeId - 1];
        const status = data[i][SHEETS.donations.cols.status - 1];
        const donorName = data[i][SHEETS.donations.cols.donorName - 1];
        const proofLink = data[i][SHEETS.donations.cols.proofLink - 1];

        // Criteria: Proof Received OR Active Recurring
        // Criteria: Broad check for any potentially funded status
        // We include ad-hoc statuses from Receipt Processor and canonical ones.
        const validStatuses = [
            STATUS.pledge.PROOF_SUBMITTED,
            STATUS.pledge.PARTIALLY_ALLOCATED,
            STATUS.pledge.VERIFIED,
            STATUS.pledge.PARTIAL_RECEIPT,
            STATUS.pledge.FULLY_FUNDED
        ];

        // Also check if Verified Amount > 0 (Catch-all for weird statuses)
        const verifiedAmt = Number(data[i][SHEETS.donations.cols.verifiedTotalAmount - 1]) || 0;

        if (validStatuses.includes(status) || verifiedAmt > 0) {

            // Exclude explicitly cancelled/rejected
            if (status === STATUS.pledge.CANCELLED || status === STATUS.pledge.REJECTED) continue;

            // Calculate Real Balance (Expensive op, but necessary)
            // Optimization: In production, maybe cache this or trust a helper column?
            // For now, we calculate live.
            const balance = getRealTimePledgeBalance(pledgeId, data[i], ss);

            if (balance > 0) {
                // Resolve Proof Link: Use Receipt Log if available, else Raw Data
                let finalLink = proofLink;
                if (receiptMap.has(String(pledgeId))) {
                    finalLink = receiptMap.get(String(pledgeId));
                }

                availablePledges.push({
                    id: pledgeId,
                    name: donorName,
                    amount: balance,
                    proofLink: finalLink
                });
            }
        }
    }

    // Also fetch students (Reuse existing logic)
    // We can bundle this call to make the UI load faster
    const students = getPendingStudentsList(ss); // (Refactor your existing logic into a helper)

    return {
        pledges: availablePledges,
        students: students
    };
}

// Helper for Students (extracted from your previous getSidebarData)
function getPendingStudentsList(ss) {
    const lookupWs = ss.getSheetByName('Student Lookup');
    const lookupData = lookupWs.getDataRange().getValues();
    const list = [];
    for (let i = 1; i < lookupData.length; i++) {
        if (Number(lookupData[i][3]) > 0) { // Pending > 0
            list.push({ cmsId: String(lookupData[i][0]), need: Number(lookupData[i][3]) });
        }
    }
    return list;
}
