# ⚙️ Technical Deep Dive

> **Scope:** Codebase Structure, Key Algorithms, and Integrity Patterns.

This document serves as the reference manual for the system's codebase, detailing the service-oriented architecture and the specific algorithms used to maintain data integrity in a distributed spreadsheet environment.

---

## 1. Codebase Architecture

The project follows a generic **Service-Oriented Architecture (SOA)** adapted for Google Apps Script. Logic is decoupled from the UI and Data Access layers.

| Module | Responsibility | Key Functions |
| :--- | :--- | :--- |
| `CoreLogic.js` | **Business Domain.** Contains pure functions and business rules. | `updatePledgeStatus`, `getRealTimePledgeBalance` |
| `AdminWorkflow.js` | **Orchestration.** Manages multi-step workflows (Email + Database + logging). | `processIncomingReceipts`, `processAllocationTransaction` |
| `Watchdog.js` | **Event Processing.** Handles the asynchronous verification loop. | `runWatchdog`, `processThread`, `updateAllocations` |
| `SidebarService.js` | **Client-Server Bridge.** Handles requests from the HTML frontend. | `getSidebarData`, `processAllocation` |
| `AuditService.js` | **Instrumentation.** Centralized logging facility. | `logAuditEvent`, `onAuditSheetEdit` |
| `Utilities.js` | **Infrastructure.** Shared tooling for IO and parsing. | `LockService` wrappers, `parseCurrency`, `getRfcIdFromMessage` |

---

## 2. Core Integrity Algorithms

### A. Optimistic Concurrency Control (ScriptLock)
**Problem:** In collaborative spreadsheet environments, Read-Modify-Write cycles are subject to race conditions. If two execution contexts (Users or Triggers) read a balance simultaneously, they may both allocate against it, resulting in a negative balance (Double Spend).

**Implementation:**
We implement strict pessimistic locking around the critical section of the Allocation Transaction using `LockService`.

```javascript
const lock = LockService.getScriptLock();
try {
   // 1. ACQUIRE LOCK (Timeout: 30s)
   lock.waitLock(30000); 
   
   // 2. RE-READ STATE (Critical Freshness Check)
   // State must be fetched *inside* the lock boundary.
   const freshBalance = getRealTimePledgeBalance(pledgeId);
   
   // 3. VALIDATE
   if (amount > freshBalance) throw new Error("Insufficient Funds");
   
   // 4. COMMIT
   AllocLog.appendRow([...]);
   
} finally {
   // 5. RELEASE LOCK (Guaranteed execution)
   lock.releaseLock();
}
```

### B. Transactional Atomicity (Validate-Notify-Commit)
**Problem:** Distributed systems can fail partially (e.g., Email sent but Database write failed).
**Pattern:** The system enforces a **Validate -> Notify -> Commit** order to prioritize user communication (the "hard" side effect) before local persistence.
1.  **Validate:** Check locks and balances. Fail fast.
2.  **Notify:** Attempt to send the email via Gmail API and capture the `Message-ID`. If this fails, the transaction aborts.
3.  **Commit:** Write distinct records to the Database (Sheets), including the `Message-ID` for traceability.

### C. Persistent Threading via RFC-822 IDs
To mitigate the transient nature of Google API IDs, the system extracts the stable `Message-ID` header from all outgoing correspondence.
*   **Usage:** The `Watchdog` uses this ID to deterministically match incoming replies to specific transactions, regardless of "Subject Line" drift.
*   **Fallback:** If the RFC ID is unavailable, the system creates a cryptographic hash of the Subject+Time (implemented via `generateHostelReplyLink`) as a secondary correlation ID.

---

## 3. Data Integrity & Sync Models
To ensure the `Raw Data` (Pledge) sheet and `Allocation Log` sheet never drift apart:
*   **Dynamic Balance Calculation:** We do not rely on stored "Current Balance" fields. The balance is calculated at runtime by summing the immutable ledger (`Total Pledge - Sum(Allocations)`).
*   **Event Consistency:** The `updatePledgeStatus` function runs as a background job (post-verification) to reconcile the Pledge status (`CLOSED` vs `FULLY_ALLOCATED`) based on the aggregate status of its child allocations.
