# 🧠 Architectural Decision Records (ADR)

This document captures the key architectural decisions made during the development of the NUST Lifeline System. It serves as a historical record of the "Why" behind technical choices, outlining the context, the decision, the trade-offs, and the value delivered.

---

## 1. Core Platform Strategy

### ADR-001: Serverless Runtime (Google Apps Script) vs. No-Code Platforms
**Status:** Accepted  
**Date:** 2025-11-01

#### Context
The project required a robust automation layer to orchestrate workflows between Forms, Sheets, and Gmail. Minimizing operational costs and ensuring long-term maintainability for the University were critical success factors. We evaluated No-Code solutions (Make/Zapier) versus custom scripting.

#### Decision
Adopt **Google Apps Script (GAS)** bound to the Operations Spreadsheet.

#### Consequences
*   **Cost Efficiency:** Leverages the free/consumer quotas of Google Workspace at $0 marginal cost, avoiding the transaction-based pricing of Make.com.
*   **Longevity:** Code resides within the institutional Google account, ensuring the system survives volunteer turnover.
*   **Technical Flexibility:** Enables complex logic (e.g., locking, cryptographic hashing) impossible in visual builders.
*   **Trade-off:** Requires JavaScript proficiency for maintenance (mitigated by this documentation).

### ADR-002: Air-Gapped Security Model ("Two-Workbook Pattern")
**Status:** Accepted  
**Date:** 2025-11-05

#### Context
Volunteers require access to "Financial Need" data to allocate funds, but granting them full read access to the master student registry exposes sensitive PII (CNIC, Phone, Address).

#### Decision
Physically separate storage into two distinct Drive artifacts:
1.  **[CONFIDENTIAL] Student Database:** Restricted to Core Admin.
2.  **[OPERATIONS] Fund Tracker:** Shared with Volunteers.

#### Consequences
*   **Privacy by Design:** Volunteers work in a sanitized environment. PII exposure is technically impossible via standard UI.
*   **Access Control:** Compromise of a volunteer credential does not yield the "Crown Jewels" (Student DB).
*   **Trade-off:** Requires a privileged "Bridge" script (`StudentService.js`) to proxy sanitized read requests.

---

## 2. Transactional Integrity

### ADR-003: Pessimistic Locking for Allocations
**Status:** Accepted  
**Date:** 2025-12-05

#### Context
In a collaborative spreadsheet environment, concurrent edits can cause "Double Spend" anomalies where the same Pledged Amount is allocated to multiple students simultaneously.

#### Decision
Implement **Application-Level Locking** using `LockService` for all financial write operations.

#### Consequences
*   **Integrity:** Mathematically guarantees that `Balance_Read` and `Balance_Write` occur in an atomic transaction.
*   **Stability:** Prevents "Row Shifting" corruption during form submissions.
*   **Trade-off:** Minimal latency (seconds) introduced during high concurrency.

### ADR-004: "Commit-Last" Consistency Pattern
**Status:** Accepted  
**Date:** 2025-12-07

#### Context
Distributed transactions involves heterogeneous systems (Gmail API + Sheets API). A failure in one (e.g., Email Quota) generally leaves the system in an inconsistent state ("Ghost Records").

#### Decision
Enforce a strict execution order: **Validate -> Notify (Email) -> Commit (Write)**.

#### Consequences
*   **Atomic Consistency:** If the email notification fails, the transaction aborts *before* persistence. The database never claims money was sent if the email didn't go out.
*   **Traceability:** Allows capturing the external `Message-ID` during the "Notify" phase and persisting it in the "Commit" phase.

---

## 3. User Experience (UX)

### ADR-005: HTML Sidebar for Data Entry
**Status:** Accepted  
**Date:** 2025-11-10

#### Context
Direct cell editing in large spreadsheets leads to data type errors, broken formulas, and a lack of context (volunteers cannot see the receipt proof while typing).

#### Decision
Migrate the allocation workflow to a custom **HTML Sidebar Application**.

#### Consequences
*   **Data Validation:** Enforces strict types via dropdowns and input masking.
*   **Contextual UI:** Displays the receipt proof (Image/PDF) side-by-side with the entry form.
*   **Sanitized Search:** Allows volunteers to search for students without exposing the full database list.

### ADR-006: Frictionless Verification (`mailto` Protocol)
**Status:** Accepted  
**Date:** 2025-12-01

#### Context
We require the University Hostel administration to verify receipt of funds, but we cannot mandate them to log in to our custom portal.

#### Decision
Use pre-generated **`mailto:` hyperlinks** in verification emails.

#### Consequences
*   **Adoption:** Zero friction for university staff; they simply click "Reply" in their existing email client.
*   **Authority:** Emails are sent from the University domain (`@nust.edu.pk`), increasing donor trust.
*   **Traceability:** We CC the system inbox to capture the reply via the Watchdog.

---

## 4. Intelligent Automation

### ADR-007: Semantic Analysis vs. Regex (Gemini 3 Flash)
**Status:** Accepted  
**Date:** 2025-11-15

#### Context
Rule-based parsing (Regex) of natural language replies failed to account for the variability in human responses (e.g., "Confirmed" vs. "Funds received, thanks").

#### Decision
Deploy **Gemini 3 Flash** with rigid JSON schema enforcement.

#### Consequences
*   **Resilience:** The system understands *intent*, resolving ambiguity based on thread context.
*   **Safety:** Capable of flagging "Ambiguous" or "Query" states that require human judgment, rather than misclassifying them.

### ADR-008: Persistent Threading Strategy
**Status:** Accepted  
**Date:** 2025-11-20

#### Context
Fragmentation of email communications confused donors and made auditing difficult.

#### Decision
Capture and persist RFC-822 `Message-ID` headers to enforce strict `thread.replyAll()` behavior.

#### Consequences
*   **UX:** Donors view the entire donation lifecycle (Pledge -> Receipt -> Allocation -> Verification) as a single, coherent conversation.
*   **Auditability:** Forensically links every database record to a specific, immutable email artifact in Gmail.
