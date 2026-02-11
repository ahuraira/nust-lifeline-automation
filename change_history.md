# Changelog

All notable changes to the **Hostel Funds Management System** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to loose semantic versioning.

## [Unreleased]

## [Version 60] - 2026-02-11
### Dashboard
- **Financial Metrics Overhaul:**
    - Implemented "Effective Amount" logic: combines verified one-time/completed pledges with pledged active subscriptions.
    - Updated "Students Funded" calculation: `Total Effective / Cost Per Student (240k)`.
    - Integrated `Dim_External_Transfers` sheet for manually tracking off-platform verified amounts (per-donor cumulative).
- **Visualization & UX:**
    - **Light Theme Support:** Full light/dark mode compatibility using native Tailwind v4 CSS variants (`@variant dark`).
    - **Leaderboard:** Now displays "Students Funded" progress bars instead of raw count, sorted by % target achievement.
    - **Campaign Progress:** Added "Pledged vs Verified" visibility with dashed line indicator for effective/committed amounts.
    - **Chapter Targets:** Hardcoded targets in `Config.js` for real-time progress tracking against goals.
### Frontend Architecture
- **Tailwind v4 Configuration:**
    - Migrated to Tailwind v4 native configuration (removed legacy `tailwind.config.js`).
    - Implemented CSS-native dark mode using `@variant` directive in `index.css`.
    - Added CSS variables for theme-aware charts (Recharts).

## [Version 59.4] - 2026-02-09
### Multi-Student Batch Allocation Enhancement
- **Enhanced `processBatchAllocation()` in AdminWorkflow.js**
    - Now accepts multiple students: array of CMS IDs or objects with amounts
    - Backward compatible: single string CMS ID still works
    - Three distribution modes:
        - Explicit amounts: `[{ cmsId: '123', amount: 25000 }]`
        - Equal distribution: `['123', '456']` (splits available funds equally)
        - Monthly mode: 25,000 per student
    - Greedy distribution: fills each student's need from available pledges
    - Creates one allocation row per pledge-student pair (full auditability)
    - Sends **ONE consolidated hostel email** with both donorTable and studentTable
    - `generateBatchMailtoLink()` now includes text-only studentTable for watchdog parsing
- **Updated `runMonthlySubscriptionBatch()` in Triggers.js**
    - Removed per-student loop that caused multiple hostel emails
    - Now calls processBatchAllocation once with all students (25,000 each)
- **Email Format Improvements**
    - studentTable now uses matching format as donorTable (Name | CMS ID | School | Allocated)
    - Template variables: `{{studentCount}}`, `{{studentIds}}`, `{{studentTable}}`

### Subscription Fixes
- **First Installment Date Fix**
    - Changed from 1st of next month to **1st of current month** (pledge month)
    - Ensures first installment aligns with when the pledge is made
- **Message ID Storage** (proper format using `formatIdForSheet`)
    - `reminderEmailId` stored in Pledge Installments after reminder sent
    - `receiptConfirmId` stored in Pledge Installments after payment confirmed
    - `completionEmailId` stored in Monthly Pledges after subscription completed
    - `hostelIntimationId` + `hostelIntimationDate` stored in Allocation Log for batch allocations

## [Version 59.3] - 2026-02-09
### Subscription Downstream Integration (Simplified)
- **Unified ID Hierarchy**
    - Eliminated SUB- prefix: Subscription ID = Pledge ID (PLEDGE-YYYY-NNN)
    - Installment IDs use PLEDGE-ID-MNN format (e.g., PLEDGE-2026-042-M01)
    - All systems now use single ID format for maximum traceability
- **Config Updates**
    - Added `installmentId` (Col 19) to Allocation Log for tracking specific payments
    - Added email threading columns: `welcomeEmailId`, `completionEmailId` (Monthly Pledges)
    - Added `reminderEmailId`, `receiptConfirmId` (Pledge Installments)
- **DonorWorkflow.js Enhancements**
    - Calculates total pledge amount: monthlyAmount × numStudents × durationMonths
    - Writes to Response Sheet: pledgeOutstanding, verifiedTotalAmount, balanceAmount
    - Dashboard consistency maintained with one-time pledges
- **SubscriptionService.js Improvements**
    - Uses pledgeId directly as subscriptionId (no SUB- prefix)
    - FIFO installment matching for payment processing
    - Updates Response Sheet verified/balance columns on each payment
    - Stores welcome email ID for threading all subscription communications
    - Audit trail uses installmentId as targetId for granular tracking
- **AdminWorkflow.js Fixes**
    - Subscription detection via Monthly Pledges sheet lookup (not prefix matching)
    - Unified regex: only matches PLEDGE-YYYY-NNN format
- **Triggers.js Additions**
    - New `runMonthlySubscriptionBatch()` for 10th of month allocation
    - New `sendProcessOwnerStudentAlert()` for missing student assignments
    - Test function: `test_monthlySubscriptionBatch()`
- **Audit & Transparency**
    - All emails thread to welcome email for complete audit trail
    - installmentId stored in Allocation Log for payment-to-allocation mapping
    - Full logging via writeLog() and logAuditEvent()

## [Version 59] - 2026-02-08
### Monthly Pledge Subscription System (Major Feature)
- **New Capability: Recurring Monthly Donations**
    - Donors can now pledge monthly amounts (e.g., PKR 50k/month for 6 months)
    - Supports upfront student linking with contingency change option
    - Full subscription lifecycle: Active → Overdue → Lapsed → Completed
- **New File: `SubscriptionService.js`**
    - Subscription creation with automatic installment pre-generation
    - Payment recording with installment matching
    - Reminder system (Day 0 + Day 7 only, no spam)
    - Dual-mode hostel intimation (individual + batched on 10th)
    - Student change support with audit logging
- **Config Updates: `Config.js`**
    - New sheets: `Monthly Pledges`, `Pledge Installments`
    - Subscription settings: reminder days, overdue thresholds, hostel intimation mode
    - New email templates for subscription lifecycle
    - New form keys for monthly pledge fields
- **FSM Updates: `StatusConfig.js`**
    - Added Subscription FSM: Active, Overdue, Paused, Lapsed, Completed, Cancelled
    - Added Installment FSM: Pending, Reminded, Received, Missed
- **Workflow Updates: `DonorWorkflow.js`**
    - Routes "Monthly Recurring" pledges to SubscriptionService
    - Marks pledges with "(Monthly)" suffix in status
    - Added `parseMonthlyAmount()` - parses "PKR 25,000" format
    - Added `parseMonthlyDuration()` - parses "1 Semester (6 Months)" format
- **Trigger Updates: `Triggers.js`**
    - New `runDailySubscriptionTasks()` for 9 AM scheduled execution
    - Handles reminders, overdue checks, and batched hostel intimation
- **Receipt Processing: `AdminWorkflow.js`**
    - Updated `processIncomingReceipts` to handle `SUB-` IDs
    - Automatically routes subscription receipts to `recordSubscriptionPayment()`
- **Reporting Updates: `ReportingService.js`**
    - Added `Fact_Subscriptions` and `Fact_Installments` to Data Warehouse
    - Updated ETL to sync subscription data for Dashboard reporting
- **New File: `SetupTemplates.js`**
    - Automated email template generator
    - Creates all 6 subscription templates with one function
    - Run `setupAllSubscriptionTemplates()` to generate


## [Version 58] - 2026-02-02
### Dashboard
- **Chart Update:**
    - Replaced "Donation Duration" chart with **"Donor Affiliation"** chart in the Composition view.
    - Updated `DashboardAPIService.js` to aggregate and normalize affiliation data (e.g., " seecs " -> "SEECS").
    - Updated TypeScript types (`api.ts`) and frontend component (`CompositionCharts.tsx`).
- **Deployment:**
    - Added GitHub Actions workflow for automated Firebase Hosting deployment.

## [Version 57] - 2026-01-13
### Documentation (SOTA Overhaul)
- **Comprehensive README Redesign:**
    - Added badges, table of contents, and visual architecture diagrams.
    - Included quick start guide, project structure, and deployment instructions.
    - Added troubleshooting section with common issues and solutions.
- **New API_REFERENCE.md:**
    - Complete function reference for all 50+ public APIs.
    - Organized by module with signatures, parameters, return types, and examples.
    - Includes status constants reference and error handling patterns.
- **New DATA_MODEL.md:**
    - Full schema documentation for all 6 sheet types.
    - Mermaid ERD diagram with entity relationships.
    - Complete FSM (Finite State Machine) documentation with state diagrams.
    - Message ID format reference and configuration schema.
- **Enhanced ARCHITECTURE.md:**
    - C4-style system context and container diagrams.
    - Detailed security architecture with defense-in-depth matrix.
    - Data flow architecture with event-driven messaging.
    - Technology stack rationale and integration points.
- **Enhanced USER_GUIDE.md:**
    - Step-by-step workflows with visual diagrams.
    - Status color guide and column reference.
    - Comprehensive troubleshooting and FAQ section.
    - Quick reference card for keyboard shortcuts.
- **Enhanced MAINTENANCE_RECOVERY.md:**
    - Platform quota management with usage metrics.
    - Scheduled maintenance calendar (daily/weekly/monthly/quarterly).
    - Complete backup and recovery procedures.
    - Emergency procedures including Kill Switch protocol.
    - Performance optimization guidelines.
    - Operational runbooks for common scenarios.
- **Enhanced AI_WATCHDOG.md:**
    - Component and execution flow diagrams.
    - Detailed AI capabilities documentation.
    - Prompt engineering strategy with examples.
    - Safety rails and failure mode handling.
    - Performance tuning and testing procedures.
- **Enhanced TECHNICAL_DEEP_DIVE.md:**
    - Complete codebase organization with dependency flow.
    - Module responsibility matrix.
    - Core algorithms with code examples.
    - Design patterns (Sanitized Proxy, Template Method, Optimistic Locking).
    - Concurrency control lifecycle diagram.
    - Email threading strategy and AI integration patterns.
    - Code style guidelines and testing strategies.
- **Enhanced ADR.md:**
    - Expanded to 12 Architectural Decision Records.
    - Standardized format with Status, Context, Decision, Rationale, Consequences.
    - Added ADRs for Multi-Receipt Support, Batch Allocation, Structured AI Output, Mailto Protocol, and Anonymized Reporting.
- **Enhanced MIGRATION_GUIDE.md:**
    - Complete 8-phase migration runbook.
    - Asset inventory templates.
    - Detailed verification checklists.
    - Rollback procedures.
    - Post-migration checklist (Day 1, Week 1, Week 2, Month 1).

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
