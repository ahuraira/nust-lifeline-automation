# 🏗️ System Architecture & Security Model

> **Scope:** High-Level Design, Data Flow, and Security Patterns.

This document details the architectural choices made to ensure data security, privacy compliance, and system scalability within the Google Workspace ecosystem.

---

## 1. Data Segregation: The "Sanitized Proxy" Pattern

Direct access to student databases presents a significant privacy risk. To mitigate this without impeding operations, we implemented a **Sanitized Proxy Pattern**.

### The Problem
Volunteers need to know a student's "Financial Need" to allocate funds, but they should not have access to the student's personal contact information (PII) or full academic record.

### The Solution
We physically separated the data into two distinct storage layers (Workbooks) and bridged them with a privileged server-side script.

#### Layer A: The Confidential Store (Secure)
*   **Asset:** `[CONFIDENTIAL] Student Database`
*   **Access Control:** Restricted to Core Administration only.
*   **Content:** Full PII Name, CNIC, Phone, Address, Full Ledger.

#### Layer B: The Operational Store (Shared)
*   **Asset:** `[OPERATIONS] Hostel Fund Tracker`
*   **Access Control:** Shared with Volunteers and Chapter Leads.
*   **Content:** Anonymized Transaction Logs, Donor Metadata, Status State.

#### The Bridge (Middleware)
When a volunteer queries a Student ID in the Sidebar:
1.  **Client Request:** Client sends `CMS_ID` to the Server.
2.  **Privileged Execution:** The Script (`StudentService.js`) runs with the Owner's permissions. It opens the Confidential Store via API.
3.  **Sanitization:** The script extracts the record but **whitelists** only non-sensitive fields (`Name`, `School`, `Remaining_Amount`). PII is stripped in memory.
4.  **Response:** The volunteer receives a JSON object containing only the data necessary for the financial decision.

---

## 2. Event-Driven Messaging Architecture

To decouple the allocation process from the verification process, the system uses an asynchronous, message-driven architecture dependent on persistent Email IDs.

1.  **Ingress:** A form submission creates a `Pledge` record.
2.  **Allocation Event:** A user action triggers the `Allocation Service`. This service commits the transaction and emits an **Email Event** to the University.
3.  **State Persistence:** The system captures the globally unique **RFC-822 Message-ID** of the outgoing email and stores it in the ledger.
4.  **Asynchronous Verification (Watchdog):** A separate cron job (`Watchdog.js`) scans the inbox. It uses the stored Message-IDs to thread replies accurately, ensuring that a reply from the University is deterministically mapped back to the specific transaction, regardless of time elapsed.
5.  **State Transition:** Upon verification, the `Audit Service` updates the state from `PENDING_HOSTEL` to `HOSTEL_VERIFIED`.

---

## 3. Technology Stack Rationale

*   **Runtime:** **Google Apps Script (V8)**. Selected for its managed identity/auth context and native bindings to Workspace APIs, eliminating the need for third-party OAuth management.
*   **Data Layer:** **Google Sheets**. Selected for its ubiquity and zero-cost "admin UI" (the grid itself), allowing rapid data manipulation by stakeholders without custom tooling.
*   **AI Layer:** **Google Gemini 1.5 Flash**. Selected for its large context window, enabling the analysis of full email thread histories to derive semantic intent.

---

## 4. Security Controls

*   **RBAC (Role-Based Access Control):** Implemented via Google Drive folder permissions.
*   **Concurrency Control:** Application-level locking (`LockService`) prevents race conditions during write operations.
*   **Auditability:** Immutable write-only logging to the `Audit Trail` sheet ensures non-repudiation of actions.
