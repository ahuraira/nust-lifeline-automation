# Changelog

All notable changes to the **Hostel Funds Management System** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to loose semantic versioning.

## [Unreleased]

## [Version 56] - 2025-12-19
### Intelligence
- **Multimodal Receipt Analysis:**
    - Upgraded `LLM_Service.js` to accept image/PDF attachments.
    - Implemented **Forensic Accountant** prompt logic to verify receipts visually.
    - Added extraction of **"Actual Transfer Date"** directly from banking slips.
    - Updated `AdminWorkflow.js` to store extracted dates in the `actualTransferDate` column.

## [Version 55] - 2025-12-19
### Documentation
- **Visual Architecture Upgrade (Mermaid.js):**
    - Added **System Context Diagram** to `docs/ARCHITECTURE.md` (High-level data flow).
    - Added **Entity Relationship Diagram (ERD)** to `docs/ARCHITECTURE.md` (Schema mapping).
    - Added **Security Sequence Diagram** to `docs/ARCHITECTURE.md` (Visualizing the 'Sanitized Proxy' flow).
    - Added **Watchdog State Machine Diagram** to `docs/AI_WATCHDOG.md` (Process flow).
- **Content Accuracy:**
    - Standardized AI Model references to **Gemini 3**.
    - Removed **CNIC** from data flow diagrams to accurately reflect PII minimization policies.

## [Version 54] - 2025-12-19
### Operations
- **Production Migration Guide:**
    - Released `docs/MIGRATION_GUIDE.md`. A comprehensive step-by-step Runbook for "Lifting and Shifting" the entire system application to a new Google Workspace account.
### Documentation
- **Enhanced Architectural Decisions (ADR):**
    - Expanded `docs/ADR.md` with 10 detailed decision records covering Security (Air-Gap), Logic (Commit-Last Pattern), and UX (Staging Gates).
    - Added rationale for choosing "HTML Sidebar" over "In-Cell Editing" and "Mailto Links" for friction-less verification.

## [Version 53] - 2025-12-18
### Documentation
- **Documentation Refinement:**
    - Updated `README.md`, `docs/ARCHITECTURE.md`, `docs/ADR.md`, and `docs/AI_WATCHDOG.md` to adopt a professional, "Senior Engineer" tone.
    - Replaced marketing terminology with technical architectural descriptions (e.g., "Air-Gapped Privacy", "Optimistic Concurrency").
    - Formalized the value propositions around "Serverless ERP" and "Auditable Workflows."

## [Version 52] - 2025-12-18
### Documentation
- **Professional Product Documentation:**
    - Replaced basic guides with a Technical Whitepaper structure.
    - Added `docs/ARCHITECTURE.md` (Security & Privacy Model).
    - Added `docs/TECHNICAL_DEEP_DIVE.md` (Algorithms & Codebase).
    - Added `docs/AI_WATCHDOG.md` (AI Logic & Forensics).
    - Added `docs/MAINTENANCE_RECOVERY.md` (SRE Guide).
    - Rewrote `README.md` with the "Zero-Cost ERP" narrative.
### Fixed
- **Cross-Processing Protection:**
    - Modified `processIncomingReceipts` in `AdminWorkflow.js` to strictly exclude emails from known internal addresses (`ddHostels`, `uao`).
    - Prevents Hostel Replies from being mistakenly processed as Donor Receipts, ensuring they are left for the `Watchdog` workflow to handle.

## [Version 51] - 2025-12-18
### Changed
- **RFC ID Retrieval:**
    - Simplified `getRfcIdFromMessage` in `Utilities.js` to use the native `GmailMessage.getHeader("Message-Id")` method.
    - Removed dependency on the Advanced Gmail Service for this specific task, improving reliability and cleaner code.

## [Version 50] - 2025-12-18
### Fixed
- **Watchdog Execution:**
    - Fixed specific `ReferenceError` where `pledgeId` was accessed before initialization during audit logging.
    - Added `SpreadsheetApp.flush()` in `Watchdog.js` to enforce immediate data consistency, ensuring `updatePledgeStatus` logic reliably closes pledges upon final allocation verification.
- **Audit Coverage:**
    - Expanded `logAuditEvent` calls to `monitorUniversityReplies` (legacy workflow) to ensure 100% audit coverage of system actions.

## [Version 49] - 2025-12-18
### Fixed
- **Watchdog Execution:**
    - Fixed specific `ReferenceError` where `pledgeId` was accessed before initialization during audit logging.
    - Added `SpreadsheetApp.flush()` in `Watchdog.js` to enforce immediate data consistency, ensuring `updatePledgeStatus` logic reliably closes pledges upon final allocation verification.
- **Audit Coverage:**
    - Expanded `logAuditEvent` calls to `monitorUniversityReplies` (legacy workflow) to ensure 100% audit coverage of system actions.

## [Version 48] - 2025-12-18
### Fixed
- **Query/Table Alignment:**
    - Refactored `alignManualInputs` in `Utilities.js` to support Google Sheets Tables and the specific QUERY setup in Column F.
    - Replaced incompatible `insertCells` method with a robust "Value Shift" strategy (Read -> Copy Next Row -> Clear Top).
    - Ensured strictly only Columns A-E are cleared, protecting the QUERY formula in F2.

## [Version 47] - 2025-12-18
### Added
- **Robust Audit Trail:**
    - Created `AuditService.js` for centralized, immutable logging of business events.
    - Added `Audit Trail` sheet configuration to `Config.js`.
    - Implemented `logAuditEvent` calls across the entire lifecycle:
        - **New Pledge:** Logs `NEW_PLEDGE` in `DonorWorkflow.js`.
        - **Receipt Processing:** Logs `RECEIPT_PROCESSED` in `AdminWorkflow.js`.
        - **Allocations:** Logs `ALLOCATION` in `AdminWorkflow.js`.
        - **Hostel Verification:** Logs `HOSTEL_VERIFICATION` in `Watchdog.js`.
        - **Pledge Closure:** Logs `STATUS_CHANGE` in `CoreLogic.js`.
    - Added `onAuditSheetEdit` installable trigger in `Triggers.js` to capture manual status changes.

## [Version 46] - 2025-12-18
### Changed
- **Allocation Workflow:** Allowed allocations to proceed immediately from `PROOF_SUBMITTED` status.
    - Updated `StatusConfig.js` to permit transition: `Proof Submitted` -> `Partially Allocated`.
    - Updated `SidebarService.js` to allow the sidebar to load for items in `PROOF_SUBMITTED` state, removing the mandatory "Verified" blocker.

## [Version 45] - 2025-12-18
### Fixed
- **Message ID Capture:** 
    - Updated `AdminWorkflow.js` to correctly capture and assign the result of `sendOrReply` for donor notifications.
    - Added `formatIdForSheet` wrapper to donor notification ID storage to ensure `rfc822msgid:` prefix is saved.
    - Updated `Watchdog.js` to use `getRfcIdFromMessage` instead of `getId` for hostel replies, ensuring robust threading IDs are captured.
- **Watchdog Logic:** Added `-label:Watchdog/Manual-Review` to the search query to strictly ignore threads marked for human attention.

## [Version 44] - 2025-12-18
### Added
- **Intelligent Watchdog (`Watchdog.js`):** Automated service to close the donation loop. 
    - Scans for "Hostel Replies" using `Ref: PLEDGE-` pattern.
    - Uses Gemini AI (Forensic Accountant Persona) to verify allocations.
    - Updates Allocation Log status (`HOSTEL_VERIFIED`) and notifies donors.
- **AI Model Upgrade:** Switched to `gemini-3-flash-preview` for all LLM operations in `LLM_Service.js`.
- **Manual Testing Support:** Added `EMAILS.testHostel` logic (via config overrides) to allow admin email to simulate university replies.

### Changed
- **Allocation Log Schema:** Updated `AdminWorkflow.js` and `Config.js` to a **17-column layout**. Added:
    - `Total Pledge Amount` (Column D)
    - `Hostel Reply ID` & `Time`
    - `Final Notification ID` & `Time`
- **Crash Fix:** Replaced invalid `getLastMessageSubject` with `getFirstMessageSubject` in `Watchdog.js`.

## [Version 24] - 2025-12-18
### Refactored
- **Core Business Logic:** Created `CoreLogic.js` to centralize critical calculations.
    - Moved `getRealTimePledgeBalance`, `getRealTimeStudentNeed`, `findRowByValue` here.
    - Removed duplicate logic from `AdminWorkflow.js` and `studentServices.js`.
- **Utilities:** Enhanced `Utilities.js` with `sendEmailAndGetId` to capture robust RFC 822 Message-IDs for threading.

## [Version 20] - 2025-12-17
### Added
- **Reporting Layer:** Updated `studentServices.js` to maintain two student lists:
    1.  `Student Lookup`: For operational use (Open/Pending students only).
    2.  `Reporting_Students`: Anonymized dataset for Looker Studio visualization.

## [Version 15] - 2025-12-15
### Fixed
- **Sidebar UX:** Addressed "Fragile" Sidebar updates where writing back to a QUERY-based sheet caused data mismatches.
- **Config:** Added `donationsTracker` specific mapping in `Config.js` to handle column offsets in the Tracker view.

## [Version 10] - 2025-12-12
### Changed
- **Pledge Amounts:** Updated standard amounts in `Config.js` (25k, 150k, 300k, 1.2M).
- **Concurrency:** Added `LockService` to `Triggers.js` (30s wait) to prevent race conditions during Form Submits.

## [Version 5] - 2025-12-05
### Added
- **AI Context Cleaning:** Implemented cleaning in `LLM_Service.js` to strip email signatures and quoted replies before analysis, improving token usage and accuracy.
- **Chapter Config:** expanded `chapterLeads` in `Config.js` to support Array-based multiple recipients.

---
*Note: Versions prior to 5 were initial development commits.*
