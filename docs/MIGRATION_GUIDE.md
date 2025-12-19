# 🚀 Production Migration Guide (Runbook)

> **Goal:** Safely transfer the NUST Lifeline System from the Development Google Account to the Production Google Account.
> **Strategy:** "Lift and Shift" (Clone & Re-Wire).

This guide is designed for the System Administrator. Follow these steps sequentially.

---

## Phase 1: Preparation (In DEV Account)

*   [ ] **1. Create Deployment Folder**
    *   Go to Google Drive.
    *   Create a new folder named `NUST_Lifeline_DEPLOY_PACKAGE`.
*   [ ] **2. Consolidate Assets**
    *   Move (or Create Shortcuts to) the following files into this folder:
        *   `[OPERATIONS] Hostel Fund Tracker` (Sheet)
        *   `[CONFIDENTIAL] Student Database` (Sheet)
        *   All Email Template Docs (e.g., `Pledge Confirmation`, `Hostel Verification`).
        *   The `Receipts` Folder.
*   [ ] **3. Share with PROD**
    *   Right-click `NUST_Lifeline_DEPLOY_PACKAGE`.
    *   Click **Share**.
    *   Enter the Production Email Address (e.g., `nustlifeline@gmail.com`).
    *   **Role:** Editor.

---

## Phase 2: Instantiation (In PROD Account)

*   [ ] **4. Log in to PROD Account**
    *   Switch browser profiles to the Production Google Account.
    *   Go to Google Drive > "Shared with me".
    *   Open `NUST_Lifeline_DEPLOY_PACKAGE`.
*   [ ] **5. Clone the Assets (CRITICAL STEP)**
    *   **Do not use the shared files directly.** You must make copies to own them.
    *   Right-click `[OPERATIONS]...` > **Make a copy**.
    *   Right-click `[CONFIDENTIAL]...` > **Make a copy**.
    *   Right-click each Email Template > **Make a copy**.
    *   *Note:* You cannot "Copy" a folder structure easily. You may need to create a new `Receipts` folder in Prod Drive manually.
*   [ ] **6. Rename & Organize**
    *   Rename the files to remove "Copy of".
    *   Move them into a permanent `My Drive` folder structure (e.g., `My Drive > NUST Lifeline`).

---

## Phase 3: Script Setup (In PROD Account)

*   [ ] **7. Create the Script**
    *   Open the **new** `[OPERATIONS]` Sheet (the Prod copy).
    *   Go to **Extensions** > **Apps Script**.
    *   This creates a blank project bound to the sheet.
*   [ ] **8. Transfer Code**
    *   **Option A (Manual):** Copy/Paste the code from each file in the Dev project to the Prod project. Ensure filenames match exactly (`AdminWorkflow.js`, `Config.js`, etc.).
    *   **Option B (CLASP - Advanced):**
        1.  Get the Script ID from the Prod URL.
        2.  Run `clasp clone <PROD_SCRIPT_ID>` in a new local folder.
        3.  Copy the `.js` files from your Dev codebase to this folder.
        4.  Run `clasp push`.

---

## Phase 4: Re-Wiring (Configuration)

*   [ ] **9. Harvest New IDs**
    *   Open the **new** `[OPERATIONS]` Sheet. Copy the ID from the browser URL (string between `/d/` and `/edit`).
    *   Open the **new** `[CONFIDENTIAL]` Sheet. Copy the ID.
    *   Open each **new** Email Template Doc. Copy the IDs.
    *   Open the **new** `Receipts` Folder. Copy the ID.
*   [ ] **10. Update `Config.js`**
    *   Open `Config.js` in the Prod Script Editor.
    *   Replace the values in `CONFIG.ssId_operations`, `CONFIG.ssId_confidential`, `CONFIG.folderId_receipts`, and `TEMPLATES` with the **NEW IDs** you just copied.
    *   **Verify:** Ensure `EMAILS.processOwner` matches the Prod email address.

---

## Phase 5: Activation

*   [ ] **11. Set Script Properties (Keys)**
    *   In Script Editor: **Project Settings** (Gear Icon) > **Script Properties**.
    *   Add Property: `GEMINI_API_KEY`.
    *   Value: Your Gemini API Key (Generate a new one for Prod in Google AI Studio if needed).
*   [ ] **12. Enable Services**
    *   In Script Editor (Left Sidebar): **Services** (+).
    *   Add **Gmail API**.
    *   Add **Google Sheets API**.
*   [ ] **13. Deploy Triggers**
    *   Run the function `setupTriggers()` (if available) OR manually create:
        *   **`runWatchdog`**: Time-driven (Every 15 Minutes).
        *   **`processIncomingReceipts`**: Time-driven (Every 10 Minutes).
        *   **`onAuditSheetEdit`**: From spreadsheet -> On edit.
*   [ ] **14. Final Test**
    *   Run `test_Integration` (or `test_Connectivity`) to ensure the script can read the sheets and access Gmail.

---

### 🎉 Migration Complete
The system is now live on Production. Use the **[Maintenance Guide](MAINTENANCE_RECOVERY.md)** for ongoing support.
