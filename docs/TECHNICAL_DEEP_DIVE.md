# ⚙️ Technical Deep Dive

> **Scope:** Codebase structure, core algorithms, design patterns, and implementation details for developers.

This document provides a comprehensive technical reference for developers who need to understand, maintain, or extend the NUST Lifeline System.

---

## Table of Contents

- [Codebase Organization](#codebase-organization)
- [Module Responsibilities](#module-responsibilities)
- [Core Algorithms](#core-algorithms)
- [Design Patterns](#design-patterns)
- [Concurrency Control](#concurrency-control)
- [Email Threading Strategy](#email-threading-strategy)
- [AI Integration Patterns](#ai-integration-patterns)
- [Error Handling](#error-handling)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Strategies](#testing-strategies)

---

## Codebase Organization

### File Structure

```
hostel_funds_management/
│
├── 📄 CONFIGURATION LAYER
│   ├── Config.js              # Master configuration
│   ├── StatusConfig.js        # FSM status definitions
│   └── StateManager.js        # Status transition validator
│
├── 🔄 WORKFLOW LAYER (Domain Logic)
│   ├── DonorWorkflow.js       # Pledge ingestion
│   ├── AdminWorkflow.js       # Allocation & receipts
│   └── Watchdog.js            # Verification automation
│
├── 🛠️ SERVICE LAYER (Business Logic)
│   ├── CoreLogic.js           # Shared business rules
│   ├── SidebarService.js      # UI-Backend bridge
│   ├── LLM_Service.js         # AI integration
│   ├── AuditService.js        # Event logging
│   ├── ReportingService.js    # Analytics ETL
│   ├── MigrationService.js    # Data migration tools
│   └── studentServices.js     # Data sync services
│
├── 🔧 INFRASTRUCTURE LAYER
│   ├── Utilities.js           # Email, parsing, helpers
│   └── Triggers.js            # Event handlers
│
├── 🖥️ UI LAYER
│   └── Sidebar.html           # Client-side UI
│
└── 📋 METADATA
    ├── appsscript.json        # Manifest
    └── .clasp.json            # Project binding
```

### Dependency Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        TRIGGERS.js                              │
│                     (Entry Points)                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ DonorWorkflow   │ │ AdminWorkflow   │ │ Watchdog        │
│   .js           │ │   .js           │ │   .js           │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └─────────────┬─────┴─────┬─────────────┘
                       ▼           ▼
              ┌─────────────────────────────┐
              │       CoreLogic.js          │
              │    (Shared Business Rules)  │
              └─────────────┬───────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ LLM_Service.js  │ │ AuditService.js │ │ Utilities.js    │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             ▼
                    ┌─────────────────┐
                    │   Config.js     │
                    │ StatusConfig.js │
                    └─────────────────┘
```

---

## Module Responsibilities

### Config.js

**Purpose:** Single source of truth for all environment-specific configuration.

```javascript
// Structure Overview
const CONFIG = {
  ssId_operations: '...',       // Operations spreadsheet
  ssId_confidential: '...',     // Confidential spreadsheet
  folderId_receipts: '...',     // Receipt storage
  pledgeAmounts: { ... },       // Duration → Amount mapping
  GEMINI_MODEL: '...'           // AI model identifier
};

const SHEETS = {
  donations: { name: '...', cols: { ... } },
  allocations: { name: '...', cols: { ... } },
  // ... other sheets
};

const EMAILS = { ... };
const MAPPINGS = { chapterLeads: { ... } };
const TEMPLATES = { ... };
const FORM_KEYS = { ... };
```

**Key Design Decision:** All column indices are 1-based to match `getRange()` conventions.

---

### StatusConfig.js

**Purpose:** Defines the Finite State Machine for entity lifecycles.

```javascript
// FSM Definition Structure
const STATUS = {
  pledge: {
    PLEDGED: '1 - Pledged',
    PROOF_SUBMITTED: '2 - Proof Submitted',
    // ...
  },
  allocation: { ... },
  student: { ... }
};

const STATUS_WORKFLOW = {
  PLEDGE: {
    '1 - Pledged': {
      label: 'Pledged',
      next: ['1a - Partial Receipt', '2 - Proof Submitted', '9 - Cancelled']
    },
    // ...
  }
};
```

---

### CoreLogic.js

**Purpose:** Centralized business logic to prevent duplication across workflows.

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `getSheet()` | Safe sheet accessor |
| `findRowByValue()` | Search utility with row/data return |
| `getPledgeAmountFromDuration()` | Duration text → Amount mapper |
| `getRealTimePledgeBalance()` | Live balance calculator |
| `getRealTimeStudentNeed()` | Live need calculator |
| `updatePledgeStatus()` | FSM-aware status updater |
| `getFormValue()` | Safe form event accessor |

---

### AdminWorkflow.js

**Purpose:** Core operational workflows for receipts and allocations.

**Key Functions:**

| Function | Lines | Purpose |
|----------|-------|---------|
| `processIncomingReceipts()` | ~200 | Email → Receipt → Sheet |
| `processAllocationTransaction()` | ~300 | Locked allocation with emails |
| `processBatchAllocation()` | ~250 | Multi-pledge allocation |
| `getVerifiedReceiptsForPledge()` | ~50 | Receipt aggregation |
| `monitorUniversityReplies()` | ~150 | Legacy verification (deprecated) |

---

### Watchdog.js

**Purpose:** Autonomous verification monitoring agent.

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `runWatchdog()` | Main entry point (trigger-bound) |
| `processThread()` | Single thread handler |
| `updateAllocations()` | Status update + notification |
| `sendFinalNotification()` | Donor loop closure |
| `extractContextFromSubject()` | ID extraction from subject line |

---

### LLM_Service.js

**Purpose:** AI integration layer for all Gemini API calls.

**Key Functions:**

| Function | Input | Output |
|----------|-------|--------|
| `analyzeEmailWithGemini()` | Email body | `{summary, newStatus}` |
| `analyzeDonorEmail()` | Body + Blobs | `{category, receipts[], ...}` |
| `analyzeHostelReply()` | Thread + Allocations | `{status, confirmedIds[], reasoning}` |
| `cleanJsonOutput()` | Raw AI text | Pure JSON string |

---

### Utilities.js

**Purpose:** Infrastructure functions shared across modules.

**Categories:**

| Category | Functions |
|----------|-----------|
| **Email** | `createEmailFromTemplate()`, `sendEmailAndGetId()`, `sendOrReply()` |
| **Threading** | `getRfcIdFromMessage()`, `formatIdForSheet()`, `getThreadContext()` |
| **Parsing** | `parseCurrencyString()`, `cleanEmailBody()` |
| **Gmail** | `getOrCreateLabel()`, `findBestAttachment()` |
| **Mailto** | `generateHostelReplyLink()`, `generateBatchMailtoLink()` |
| **Logging** | `writeLog()` |
| **AI Prep** | `prepareAttachmentsForGemini()` |

---

## Core Algorithms

### Algorithm 1: Real-Time Balance Calculation

The system calculates available pledge balance at transaction time, not from stored values.

```javascript
function getRealTimePledgeBalance(pledgeId, pledgeRowData, spreadsheet = null) {
  const FUNC_NAME = 'getRealTimePledgeBalance';
  
  // 1. Get verified amount from the pledge row
  const verifiedAmount = Number(pledgeRowData[SHEETS.donations.cols.verifiedTotalAmount - 1]) || 0;
  
  // 2. Sum all allocations for this pledge
  const ss = spreadsheet || SpreadsheetApp.openById(CONFIG.ssId_operations);
  const allocWs = ss.getSheetByName(SHEETS.allocations.name);
  const allocData = allocWs.getDataRange().getValues();
  
  let totalAllocated = 0;
  for (let i = 1; i < allocData.length; i++) {
    if (String(allocData[i][SHEETS.allocations.cols.pledgeId - 1]) === String(pledgeId)) {
      totalAllocated += Number(allocData[i][SHEETS.allocations.cols.amount - 1]) || 0;
    }
  }
  
  // 3. Return: Verified - Allocated
  return verifiedAmount - totalAllocated;
}
```

**Why not use stored balance?**
- Prevents stale data issues
- Eliminates need for sync jobs
- Guarantees consistency at transaction time

---

### Algorithm 2: Transactional Allocation (Commit-Last Pattern)

The allocation function follows a strict order to ensure atomicity.

```javascript
function processAllocationTransaction(pledgeId, cmsId, amount) {
  const lock = LockService.getScriptLock();
  
  try {
    // ======== STEP 1: ACQUIRE LOCK ========
    if (!lock.tryLock(30000)) {
      throw new Error('System busy. Try again.');
    }
    
    // ======== STEP 2: RE-READ & VALIDATE ========
    // Critical: Read AFTER acquiring lock for freshness
    const freshBalance = getRealTimePledgeBalance(pledgeId);
    if (amount > freshBalance) {
      throw new Error('Insufficient funds');
    }
    
    const freshNeed = getRealTimeStudentNeed(cmsId);
    if (amount > freshNeed) {
      throw new Error('Exceeds student need');
    }
    
    // ======== STEP 3: EXTERNAL OPERATIONS ========
    // Send emails BEFORE committing data
    // If email fails, we haven't changed any data
    const hostelEmailId = sendHostelEmail(...);
    const donorEmailId = sendDonorEmail(...);
    
    // ======== STEP 4: COMMIT DATA (Last!) ========
    // Only write after ALL external ops succeed
    allocWs.appendRow([
      allocId, cmsId, pledgeId, pledgeAmount, amount, new Date(),
      STATUS.allocation.PENDING_HOSTEL,
      hostelEmailId, new Date(), // Hostel intimation data
      donorEmailId, new Date()   // Donor notification data
    ]);
    
    // ======== STEP 5: UPDATE STATUS ========
    updatePledgeStatus(pledgeId);
    
    // ======== STEP 6: AUDIT LOG ========
    logAuditEvent(...);
    
    return true;
    
  } catch (e) {
    writeLog('ERROR', FUNC_NAME, e.message);
    return false;
    
  } finally {
    // ======== ALWAYS RELEASE LOCK ========
    lock.releaseLock();
  }
}
```

**Key Principle:** If any step fails before COMMIT, the system state is unchanged.

---

### Algorithm 3: Multi-Receipt Aggregation

When a donor sends multiple partial payments, the system aggregates them.

```javascript
function getVerifiedReceiptsForPledge(pledgeId) {
  const receiptWs = getSheet(SHEETS.receipts.name);
  const data = receiptWs.getDataRange().getValues();
  
  let totalVerified = 0;
  const uniqueDates = new Set();
  const files = [];
  
  for (let i = 1; i < data.length; i++) {
    const rowPledgeId = String(data[i][SHEETS.receipts.cols.pledgeId - 1]);
    const status = data[i][SHEETS.receipts.cols.status - 1];
    
    if (rowPledgeId === String(pledgeId) && status === 'VALID') {
      // Aggregate amount
      totalVerified += Number(data[i][SHEETS.receipts.cols.amountVerified - 1]) || 0;
      
      // Collect unique dates
      const transferDate = data[i][SHEETS.receipts.cols.transferDate - 1];
      if (transferDate) {
        uniqueDates.add(Utilities.formatDate(new Date(transferDate), tz, 'yyyy-MM-dd'));
      }
      
      // Fetch file from Drive
      const driveLink = data[i][SHEETS.receipts.cols.driveLink - 1];
      if (driveLink) {
        const fileId = extractFileIdFromUrl(driveLink);
        try {
          const file = DriveApp.getFileById(fileId);
          if (file.getSize() < MAX_ATTACHMENT_SIZE) {
            files.push(file.getBlob());
          }
        } catch (e) { /* Skip inaccessible files */ }
      }
    }
  }
  
  return {
    totalVerified: totalVerified,
    dates: Array.from(uniqueDates).sort(),
    files: files
  };
}
```

---

### Algorithm 4: Pledge ID Extraction

Robust extraction of Pledge IDs from email subjects with various formats.

```javascript
function extractPledgeIdFromSubject(subject) {
  // Pattern 1: Explicit format "PLEDGE-YYYY-NNN"
  const explicitMatch = subject.match(/PLEDGE-\d{4}-\d+/i);
  if (explicitMatch) return explicitMatch[0].toUpperCase();
  
  // Pattern 2: Reference format "Ref: PLEDGE-..."
  const refMatch = subject.match(/Ref:\s*(PLEDGE-\d{4}-\d+)/i);
  if (refMatch) return refMatch[1].toUpperCase();
  
  // Pattern 3: Batch format "BATCH-..."
  const batchMatch = subject.match(/BATCH-\d+/i);
  if (batchMatch) return { type: 'BATCH', id: batchMatch[0].toUpperCase() };
  
  // Pattern 4: Just the number after known prefix
  const numMatch = subject.match(/pledge[^\d]*(\d{4}-\d+)/i);
  if (numMatch) return `PLEDGE-${numMatch[1]}`;
  
  return null;
}
```

---

## Design Patterns

### Pattern 1: Sanitized Proxy

**Problem:** Volunteers need to allocate funds but shouldn't see student identities.

**Solution:** Server-side filtering before returning data to UI.

```javascript
// In SidebarService.js
function getSidebarData() {
  // Read from CONFIDENTIAL workbook (server context has access)
  const studentData = readFromConfidential(cmsId);
  
  // Return only operational fields needed for allocation
  return {
    cmsId: studentData.cmsId,
    school: studentData.school,    // Allowed
    need: studentData.pendingAmount // Allowed
    // name is NOT returned to volunteers
  };
}
```

---

### Pattern 2: Template Method for Emails

**Problem:** Multiple email types share common structure but differ in content.

**Solution:** Google Docs as templates with placeholder replacement.

```javascript
function createEmailFromTemplate(templateId, data) {
  // 1. Fetch Google Doc as HTML
  const url = `https://www.googleapis.com/drive/v3/files/${templateId}/export?mimeType=text/html`;
  let htmlBody = UrlFetchApp.fetch(url, authOptions).getContentText();
  
  // 2. Clean for mobile
  htmlBody = htmlBody.replace(/max-width:[^;]+;/g, 'max-width: 600px;');
  
  // 3. Replace placeholders
  for (const key in data) {
    const regex = new RegExp('{{' + key + '}}', 'g');
    htmlBody = htmlBody.replace(regex, data[key]);
  }
  
  return { subject: file.getName(), htmlBody };
}
```

---

### Pattern 3: Optimistic Locking

**Problem:** Multiple users might allocate the same funds simultaneously.

**Solution:** Lock at the start, re-read data inside lock, fail gracefully.

```javascript
// WRONG: Read-then-Lock (stale data risk)
const balance = getRealTimePledgeBalance(pledgeId); // Stale!
lock.waitLock(30000);
// Another user may have changed balance here

// RIGHT: Lock-then-Read (fresh data guaranteed)
lock.waitLock(30000);
const balance = getRealTimePledgeBalance(pledgeId); // Fresh!
```

---

### Pattern 4: Structured AI Output

**Problem:** AI responses are non-deterministic; parsing is fragile.

**Solution:** Force JSON schema in generation config.

```javascript
generationConfig: {
  responseMimeType: "application/json",
  responseSchema: {
    type: "OBJECT",
    properties: {
      status: { type: "STRING", enum: ["CONFIRMED", "QUERY", "AMBIGUOUS"] },
      confirmedAllocIds: { type: "ARRAY", items: { type: "STRING" } },
      reasoning: { type: "STRING" }
    },
    required: ["status", "confirmedAllocIds", "reasoning"]
  }
}
```

---

## Concurrency Control

### Lock Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOCK LIFECYCLE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  USER A                            USER B                        │
│    │                                 │                           │
│    ▼                                 │                           │
│  [Try Lock] ──────────────┐         │                           │
│    │                      │         │                           │
│    ▼                      │         ▼                           │
│  [Acquired]               │      [Try Lock]                     │
│    │                      │         │                           │
│    ▼                      │         ▼                           │
│  [Read Data]              │      [Waiting...] (up to 30s)       │
│    │                      │         │                           │
│    ▼                      │         │                           │
│  [Validate]               │         │                           │
│    │                      │         │                           │
│    ▼                      │         │                           │
│  [Send Email]             │         │                           │
│    │                      │         │                           │
│    ▼                      │         │                           │
│  [Commit Data]            │         │                           │
│    │                      │         │                           │
│    ▼                      │         │                           │
│  [Release Lock] ──────────┘         │                           │
│                                      ▼                           │
│                                   [Acquired]                     │
│                                      │                           │
│                                      ▼                           │
│                                   [Read FRESH Data]              │
│                                      │                           │
│                                      ▼                           │
│                                   [Validate → May Fail!]         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Lock Configuration

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Lock Type | Script Lock | Single lock per project |
| Timeout | 30 seconds | Long enough for transaction, short enough to fail fast |
| Retry Strategy | None (fail fast) | User should retry manually |

---

## Email Threading Strategy

### RFC-822 Message-ID Capture

```javascript
function sendEmailAndGetId(recipient, subject, htmlBody, options) {
  // 1. Create draft (not send directly)
  const draft = GmailApp.createDraft(recipient, subject, '', {
    htmlBody: htmlBody,
    ...options
  });
  
  // 2. Send draft → Returns GmailMessage object
  const sentMessage = draft.send();
  
  // 3. Extract RFC ID from headers
  const rfcId = sentMessage.getHeader("Message-Id");
  
  // 4. Return RFC ID (globally unique)
  return rfcId; // e.g., "<abc123@mail.gmail.com>"
}
```

### Threading Replies

```javascript
function sendOrReply(recipient, subject, htmlBody, options, priorMessageIds) {
  for (const rawId of priorMessageIds) {
    // Try to find existing thread
    if (rawId.startsWith('<')) {
      const threads = GmailApp.search(`rfc822msgid:${rawId}`, 0, 1);
      if (threads.length > 0) {
        // Reply to existing thread
        const draft = threads[0].createDraftReplyAll('', { htmlBody });
        return getRfcIdFromMessage(draft.send());
      }
    }
  }
  
  // Fallback: Send new email
  return sendEmailAndGetId(recipient, subject, htmlBody, options);
}
```

---

## AI Integration Patterns

### Request Structure

```javascript
const payload = {
  contents: [{ 
    parts: [
      { text: promptText },
      ...fileParts  // For multimodal (images/PDFs)
    ] 
  }],
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: { /* Strict schema */ }
  }
};

const response = UrlFetchApp.fetch(apiUrl, {
  method: 'post',
  contentType: 'application/json',
  payload: JSON.stringify(payload),
  muteHttpExceptions: true
});
```

### Multimodal File Preparation

```javascript
function prepareAttachmentsForGemini(attachments) {
  const parts = [];
  const validMimes = ['image/png', 'image/jpeg', 'application/pdf'];
  
  for (const blob of attachments) {
    if (validMimes.includes(blob.getContentType())) {
      parts.push({
        inline_data: {
          mime_type: blob.getContentType(),
          data: Utilities.base64Encode(blob.getBytes())
        }
      });
    }
  }
  
  return parts;
}
```

---

## Error Handling

### Error Categories

| Category | Example | Handling |
|----------|---------|----------|
| **Validation** | Insufficient funds | Return false, user message |
| **External** | Email send failed | Log, throw (abort transaction) |
| **Infrastructure** | Lock timeout | Return false, user retry |
| **AI** | API failure | Return null, retry next cycle |
| **Data** | Row not found | Log warning, graceful exit |

### Standard Error Pattern

```javascript
function myFunction() {
  const FUNC_NAME = 'myFunction';
  
  try {
    // Main logic
  } catch (e) {
    writeLog('ERROR', FUNC_NAME, e.message, contextId);
    throw e; // or return false
  }
}
```

---

## Code Style Guidelines

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Functions | camelCase | `processIncomingReceipts` |
| Constants | UPPER_SNAKE | `SHEETS`, `STATUS` |
| Config objects | PascalCase keys | `SHEETS.donations.cols.pledgeId` |
| Function-local | camelCase | `pledgeRowData` |
| IDs | UPPER-HYPHEN | `PLEDGE-2025-001` |

### JSDoc Requirements

```javascript
/**
 * Brief description of the function.
 * @param {string} pledgeId - The unique pledge identifier.
 * @param {Array} rowData - Raw data array from the sheet.
 * @returns {number} The available balance.
 */
function getRealTimePledgeBalance(pledgeId, rowData) { ... }
```

### Logging Standards

```javascript
// INFO: Normal operations
writeLog('INFO', FUNC_NAME, 'Starting process', pledgeId);

// SUCCESS: Completed operations
writeLog('SUCCESS', FUNC_NAME, 'Allocation complete', pledgeId);

// WARN: Recoverable issues
writeLog('WARN', FUNC_NAME, 'Row not found, skipping', pledgeId);

// ERROR: Failures requiring attention
writeLog('ERROR', FUNC_NAME, `Transaction failed: ${e.message}`, pledgeId);
```

---

## Testing Strategies

### Manual Test Functions

Each module includes `test_*` functions for manual verification:

```javascript
function test_analyzeEmail() { ... }
function test_processAllocation() { ... }
function test_watchdog() { ... }
```

### Test Data Strategy

1. Use non-production pledges with prefix `TEST-`
2. Use internal email addresses for testing
3. Clean up test data after verification

### Verification Checklist

| Component | Test Method |
|-----------|-------------|
| Form Processing | Submit test form, verify email |
| Receipt Analysis | Run `test_analyzeEmail()` with samples |
| Allocation | Use sidebar on test pledge |
| Watchdog | Manually send reply, run watchdog |
| Audit Trail | Verify events logged after actions |
