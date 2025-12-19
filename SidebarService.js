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
    const proofLink = donationRowData.data[SHEETS.donations.cols.proofLink - 1];

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
        status === STATUS.pledge.PARTIALLY_ALLOCATED
    ) {
        return {
            pledgeId: pledgeId,
            maxPledgeAvailable: maxPledgeAvailable,
            proofLink: proofLink,
            students: students
        };
    } else {
        throw new Error(`Pledge Status '${status}' does not allow allocation.`);
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
