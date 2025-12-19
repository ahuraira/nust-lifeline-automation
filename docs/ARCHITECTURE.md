# 🏗️ System Architecture & Security Model

> **Scope:** High-Level Design, Data Flow, and Security Patterns.

This document details the architectural choices made to ensure data security, privacy compliance, and system scalability within the Google Workspace ecosystem.

## 1. System Context Diagram (C4 Level 1)

The following diagram illustrates the high-level interactions between the System, its Users (Volunteers, Donors), and External Systems (University, Gmail).

```mermaid
graph TD
    %% Actors
    Donor[Donor / Alumni]
    Vol[Volunteer Admin]
    Hostel[University Hostel Admin]
    
    %% Core System Boundary
    subgraph "NUST Lifeline System"
        Sheets[(Google Sheets DB)]
        Script[Apps Script Engine]
        AI[Gemini 1.5 Agent]
        Sidebar[Sidebar UI]
    end
    
    %% External Systems
    Gmail[Gmail Service]
    Drive[Google Drive]

    %% Relationships
    Donor -->|Submits Form| Sheets
    Sheets -->|Trigger| Script
    Script -->|Sends Confirmation| Gmail
    Gmail -->|Email| Donor
    
    Vol -->|Allocates Funds| Sidebar
    Sidebar -->|RPC Call| Script
    Script -->|Read/Write| Sheets
    Script -->|Store Receipt| Drive
    
    Script -->|Verify Context| AI
    AI -->|Verdict| Script
    
    Script -->|Request Verification| Gmail
    Gmail -->|Email| Hostel
    Hostel -->|Reply| Gmail
    Gmail -->|Thread Sync| Script
```

---

## 2. Data Segregation: The "Sanitized Proxy" Pattern

Direct access to student databases presents a significant privacy risk. We implemented a **Sanitized Proxy Pattern** to mitigate this.

### Sequence Diagram: The Safe Access Path
This diagram visualizes how the Volunteer accesses Student Data *without* ever touching the Confidential Database directly.

```mermaid
sequenceDiagram
    autonumber
    participant Vol as Volunteer (Sidebar)
    participant Server as Apps Script (Admin Rights)
    participant SecureDB as [CONFIDENTIAL] Sheet
    participant OpsDB as [OPERATIONS] Sheet

    Note over Vol, OpsDB: The Volunteer ONLY has Read/Write access to OpsDB
    
    Vol->>Server: Request Student Info (CMS ID: 12345)
    
    activate Server
    Note right of Server: Switch to Admin Context
    Server->>SecureDB: Open Spreadsheet (SpreadsheetApp.openById)
    Server->>SecureDB: Fetch Row [12345]
    SecureDB-->>Server: Return {Name, CNIC, Phone, Address, Need}
    
    Server->>Server: SANITIZE DATA
    Note right of Server: Remove CNIC, Phone, Address
    
    Server-->>Vol: Return JSON {Name, Need, School}
    deactivate Server
    
    Vol->>Vol: Make Financial Decision
    Vol->>Server: Commit Allocation (Amount: 50k)
    
    activate Server
    Server->>OpsDB: Write Allocation Record
    Server->>SecureDB: Update Student Ledger (Reduce Need)
    deactivate Server
```

---

## 3. Data Model (Entity Relationship Diagram)

The system uses a relational schema mapped to Spreadsheet Tabs.

```mermaid
erDiagram
    PLEDGE ||--|{ ALLOCATION : "funds"
    STUDENT ||--|{ ALLOCATION : "receives"
    ALLOCATION ||--|| AUDIT_LOG : "generates"

    PLEDGE {
        string PledgeID PK "PLEDGE-2025-001"
        string DonorEmail
        number Amount
        string Status "PLEDGED | CLOSED"
        string ProofLink
    }

    ALLOCATION {
        string AllocationID PK "ALLOC-2025-001-A"
        string PledgeID FK
        string StudentID FK
        number Amount
        string Status "PENDING_HOSTEL | VERIFIED"
        string MessageID "RFC-822 ID"
    }

    STUDENT {
        string CMS_ID PK
        string Name
        number TotalNormalNeed
        number AmountCleared
        number RemainingNeed
    }

    AUDIT_LOG {
        timestamp Time
        string Actor
        string EventType "ALLOCATION | VERIFICATION"
        string TargetID
        string PrevState
        string NewState
    }
```

---

## 4. Event-Driven Messaging Architecture

To decouple the allocation process from the verification process, the system uses an asynchronous, message-driven architecture dependent on persistent Email IDs.

1.  **Ingress:** A form submission creates a `Pledge` record.
2.  **Allocation Event:** A user action triggers the `Allocation Service`...
    *(See Sequence Diagram above for details)*
3.  **State Persistence:** The system captures the globally unique **RFC-822 Message-ID** of the outgoing email.
4.  **Asynchronous Verification (Watchdog):** A separate cron job (`Watchdog.js`) scans the inbox...

---

## 5. Technology Stack Rationale

*   **Runtime:** **Google Apps Script (V8)**. Selected for its managed identity/auth context.
*   **Data Layer:** **Google Sheets**. Selected for its ubiquity and zero-cost "admin UI".
*   **AI Layer:** **Google Gemini 1.5 Flash**. Selected for large context window.

---

## 6. Security Controls

*   **RBAC:** Implemented via Google Drive folder permissions.
*   **Concurrency:** Application-level locking (`LockService`).
*   **Auditability:** Immutable write-only logging.
