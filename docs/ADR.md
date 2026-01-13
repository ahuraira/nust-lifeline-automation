# 🧠 Architectural Decision Records (ADR)

> **Scope:** Documentation of key architectural decisions, their context, rationale, and consequences.

This document captures the significant architectural decisions made during the development of the NUST Lifeline System. Each ADR follows a standard format to ensure clarity and traceability.

---

## Table of Contents

- [ADR Format](#adr-format)
- [ADR-001: Serverless ERP on Google Apps Script](#adr-001-serverless-erp-on-google-apps-script)
- [ADR-002: Two-Workbook Security Model](#adr-002-two-workbook-security-model)
- [ADR-003: Optimistic Concurrency Control](#adr-003-optimistic-concurrency-control)
- [ADR-004: Commit-Last Transaction Pattern](#adr-004-commit-last-transaction-pattern)
- [ADR-005: HTML Sidebar for User Experience](#adr-005-html-sidebar-for-user-experience)
- [ADR-006: RFC-822 Message Threading](#adr-006-rfc-822-message-threading)
- [ADR-007: AI-Driven Verification Watchdog](#adr-007-ai-driven-verification-watchdog)
- [ADR-008: Multi-Receipt Support Architecture](#adr-008-multi-receipt-support-architecture)
- [ADR-009: Batch Allocation with BCC Privacy](#adr-009-batch-allocation-with-bcc-privacy)
- [ADR-010: Structured AI Output Enforcement](#adr-010-structured-ai-output-enforcement)
- [ADR-011: Mailto Protocol for External Verification](#adr-011-mailto-protocol-for-external-verification)
- [ADR-012: Anonymized Reporting Warehouse](#adr-012-anonymized-reporting-warehouse)

---

## ADR Format

Each ADR follows this structure:

| Section | Description |
|---------|-------------|
| **Status** | Proposed / Accepted / Deprecated / Superseded |
| **Context** | The situation and problem being addressed |
| **Decision** | What we decided to do |
| **Rationale** | Why this decision was made |
| **Consequences** | Trade-offs and implications |
| **Alternatives** | Options considered but not chosen |

---

## ADR-001: Serverless ERP on Google Apps Script

### Status
**Accepted** (2024-01)

### Context
The NUST Lifeline Campaign needed a financial tracking system that:
- Could be managed by non-technical volunteers
- Had zero infrastructure cost
- Would outlast any individual's involvement
- Required no ongoing maintenance fees

### Decision
Build the entire system on **Google Apps Script** using Google Sheets as the database and Gmail for communication.

### Rationale
1. **Zero Cost:** No hosting fees, database costs, or license fees
2. **Longevity:** Google Workspace will exist beyond any individual's tenure
3. **Familiarity:** Volunteers already use Google Sheets
4. **Built-in Auth:** OAuth handled by Google automatically
5. **Integrated Services:** Sheets, Gmail, Drive, Forms work seamlessly together

### Consequences
**Positive:**
- Immediate deployment with no infrastructure setup
- Version control via Apps Script's built-in history
- Automatic backups via Google's infrastructure

**Negative:**
- 6-minute execution time limit per function
- 90-minute daily runtime limit (consumer tier)
- 100 email recipients per day limit
- No native SQL—must query sheets manually

### Alternatives Considered
| Alternative | Rejection Reason |
|-------------|------------------|
| Custom web app (Node.js/Python) | Requires hosting, maintenance, and technical expertise |
| Airtable | Paid tier needed for automation; vendor lock-in |
| Microsoft 365 + Power Automate | Less accessible; higher learning curve |
| Firebase | Overkill for the use case; adds complexity |

---

## ADR-002: Two-Workbook Security Model

### Status
**Accepted** (2024-02)

### Context
The system handles student data (names, gender, school, degree, and financial need). Volunteers need to allocate funds but should not have access to student identities.

### Decision
Implement an **Air-Gapped Architecture** with two physically separate spreadsheets:
1. **CONFIDENTIAL Workbook:** Contains student information (CMS ID, name, gender, school, degree, financial need)
2. **OPERATIONS Workbook:** Contains sanitized data (CMS ID, need amount, school only)

Server-side code acts as a proxy, filtering sensitive fields before returning data to volunteers.

### Rationale
1. **Defense in Depth:** Even if a volunteer's account is compromised, student identities remain protected
2. **Compliance:** Aligns with data minimization principles (only expose what's necessary)
3. **Audit Trail:** Access to CONFIDENTIAL workbook is logged separately by Google
4. **Clear Boundary:** Makes access control policies simple and enforceable

### Consequences
**Positive:**
- Volunteers cannot accidentally expose student identities
- Admin can revoke OPERATIONS access without affecting data security
- Clear separation of concerns

**Negative:**
- Requires server-side code to bridge the gap
- Sync jobs needed to keep OPERATIONS data current
- Slightly more complex architecture

### Implementation
```javascript
// SidebarService.js - Sanitized Proxy Pattern
function getSidebarData() {
  // Only operational fields returned to volunteers
  return {
    cmsId: studentData.cmsId,
    need: studentData.pendingAmount,
    school: studentData.school
    // name is NOT returned to volunteers
  };
}
```

---

## ADR-003: Optimistic Concurrency Control

### Status
**Accepted** (2024-03)

### Context
Multiple volunteers might attempt to allocate funds from the same pledge simultaneously, risking:
- Double-spending (allocating more than available)
- Race conditions (stale balance reads)
- Data inconsistency (partial commits)

### Decision
Implement **Application-Level Locking** using `LockService.getScriptLock()` with:
- 30-second maximum wait time
- Re-read data inside the lock (not before)
- Fail-fast approach if lock unavailable

### Rationale
1. **Simplicity:** Google's built-in `LockService` requires no external infrastructure
2. **Fairness:** Script-level lock prevents any concurrent execution
3. **Fresh Data:** Reading inside lock guarantees the freshest state
4. **Fail-Safe:** Timeout prevents indefinite blocking

### Consequences
**Positive:**
- Guaranteed atomicity for financial transactions
- No double-spend possible
- Clear error message to users when system is busy

**Negative:**
- Users must wait if another allocation is in progress
- 30-second timeout may frustrate users during heavy usage
- Single-threaded bottleneck during peak times

### Implementation
```javascript
const lock = LockService.getScriptLock();
try {
  if (!lock.tryLock(30000)) {
    throw new Error('System busy. Please try again.');
  }
  // Critical section: read, validate, commit
} finally {
  lock.releaseLock();
}
```

---

## ADR-004: Commit-Last Transaction Pattern

### Status
**Accepted** (2024-03)

### Context
An allocation transaction involves multiple steps:
1. Read balance
2. Validate amount
3. Send email to hostel
4. Send email to donor
5. Write allocation record
6. Update pledge status

If step 3 fails, we don't want partial data in the sheet. If step 5 fails after emails are sent, we have orphaned emails.

### Decision
Order operations so that **all external/irreversible actions happen BEFORE data commits**:
1. Acquire lock
2. Read and validate
3. Send emails (external, irreversible)
4. **ONLY THEN:** Write to sheets (commit)
5. Release lock

### Rationale
1. **Atomicity:** If email fails, no data is written—transaction is cleanly aborted
2. **Idempotency:** Re-running after failure won't duplicate data
3. **Consistency:** Either the full transaction succeeds or nothing happens

### Consequences
**Positive:**
- Clean abort on any failure before commit
- No orphan records in sheets
- Easy to reason about transaction state

**Negative:**
- If commit fails after emails sent, emails are "orphaned" (rare but possible)
- Mitigation: Log email IDs to allow manual reconciliation

### Implementation Order
```javascript
// 1. Lock
lock.waitLock(30000);

// 2. Read & Validate
const balance = getRealTimePledgeBalance(pledgeId);
if (amount > balance) throw new Error('Insufficient');

// 3. External Operations (BEFORE commit)
const hostelEmailId = sendHostelEmail(...);
const donorEmailId = sendDonorEmail(...);

// 4. Commit (LAST)
allocSheet.appendRow([..., hostelEmailId, donorEmailId, ...]);

// 5. Release
lock.releaseLock();
```

---

## ADR-005: HTML Sidebar for User Experience

### Status
**Accepted** (2024-04)

### Context
The original allocation workflow used manual column editing:
1. Enter CMS ID in column A
2. Enter amount in column D
3. Select "Allocate" from dropdown in column E

This was error-prone (typos, wrong rows) and lacked validation feedback.

### Decision
Build an **HTML Sidebar UI** that:
- Shows a searchable list of students
- Displays real-time balance and need
- Provides a preview of receipt proofs
- Validates before submission
- Shows success/error feedback

### Rationale
1. **Validation:** Prevents invalid CMS IDs or amounts before submission
2. **Discovery:** Searchable dropdown vs. memorizing IDs
3. **Confidence:** Preview proof before allocating
4. **Error Reduction:** Clear UI vs. editing raw cells

### Consequences
**Positive:**
- Dramatic reduction in allocation errors
- Better user experience
- Real-time feedback

**Negative:**
- More complex codebase (HTML + JS + CSS)
- Sidebar must be explicitly opened (extra click)
- Limited screen space (400px width)

### UI Components
```html
<div class="section">
  <input list="studentList" placeholder="Search CMS ID...">
  <datalist id="studentList"></datalist>
</div>
<div id="previewArea"><!-- Receipt preview --></div>
<button onclick="runAllocation()">ALLOCATE</button>
```

---

## ADR-006: RFC-822 Message Threading

### Status
**Accepted** (2024-05)

### Context
When the hostel replies to a verification request, we need to:
1. Match the reply to the correct allocation
2. Track the complete email conversation
3. Maintain threading across forward/reply chains

Gmail's API ID changes between searches, breaking naive threading.

### Decision
Capture and store the **RFC-822 Message-ID** header from every sent email, enabling reliable thread matching.

### Rationale
1. **Immutable:** RFC-822 ID never changes, unlike Gmail API IDs
2. **Searchable:** Gmail supports `rfc822msgid:<id>` search syntax
3. **Standard:** Works across email clients and forwarding
4. **Robust:** Survives subject line modifications

### Consequences
**Positive:**
- 100% reliable thread matching
- Works even if subject line is modified
- Forensic audit trail links emails to transactions

**Negative:**
- Requires draft-then-send pattern (to capture ID)
- Slightly more complex email sending logic
- Storage of long ID strings in sheets

### Implementation
```javascript
function sendEmailAndGetId(recipient, subject, body, options) {
  const draft = GmailApp.createDraft(recipient, subject, '', { htmlBody: body });
  const sentMessage = draft.send();
  return sentMessage.getHeader("Message-Id"); // "<abc@mail.gmail.com>"
}
```

---

## ADR-007: AI-Driven Verification Watchdog

### Status
**Accepted** (2024-06)

### Context
Hostel replies are unpredictable:
- "Confirmed" vs "Done" vs "Received" (all mean verified)
- "Noted" vs "Forwarding" (ambiguous)
- "CMS doesn't match" (query/problem)

Regex-based parsing cannot handle natural language variation.

### Decision
Deploy **Google Gemini 3 Flash** as a semantic classifier:
- Analyze email content
- Match to pending allocations
- Classify as CONFIRMED / QUERY / AMBIGUOUS
- Escalate uncertain cases to humans

### Rationale
1. **Semantic Understanding:** AI understands intent, not just keywords
2. **Flexibility:** New phrasings don't require code changes
3. **Batch Matching:** Can match multiple allocations in one call
4. **Safety:** "I don't know" response triggers human review

### Consequences
**Positive:**
- 85-90% automatic verification rate
- Handles language variations gracefully
- Continuous improvement as model updates

**Negative:**
- External API dependency
- Small per-call cost (offset by low volume)
- Requires careful prompt engineering
- Edge cases still need human review

### Safety Rails
```javascript
if (analysis.status === 'AMBIGUOUS') {
  thread.addLabel(manualReviewLabel);
  sendAlertToAdmin(pledgeId, analysis.reasoning);
  // Do NOT auto-verify
}
```

---

## ADR-008: Multi-Receipt Support Architecture

### Status
**Accepted** (2024-08)

### Context
Donors often send multiple partial payments rather than a single lump sum. The original system expected one receipt per pledge.

### Decision
Create a dedicated **Receipt Log** sheet that:
- Stores multiple receipts per pledge
- Tracks individual transfer dates and amounts
- Aggregates verified total in the pledge record
- Supports partial payment workflows

### Rationale
1. **Reality Matching:** Donors actually send multiple payments
2. **Audit Trail:** Each receipt is a separate verifiable record
3. **Flexibility:** Partial allocations become possible
4. **AI Analysis:** Each receipt gets its own confidence score

### Consequences
**Positive:**
- Handles real-world partial payment scenarios
- Better audit trail per receipt
- More accurate verification

**Negative:**
- More complex data model
- Aggregation logic needed for balance calculation
- Migration needed for existing data

### Schema
```
Receipt Log
├── Receipt ID (unique)
├── Pledge ID (FK)
├── Email Date
├── Transfer Date (extracted by AI)
├── Amount Verified
├── Confidence Score
├── Drive Link
└── Status (VALID/DUPLICATE/REJECTED)
```

---

## ADR-009: Batch Allocation with BCC Privacy

### Status
**Accepted** (2024-09)

### Context
A student's need often requires multiple donors. Sending separate emails exposes each donor's identity to all recipients via CC.

### Decision
Implement **BCC-based batch allocation:**
- Single email to hostel with all donors listed
- Individual emails to each donor (not CC'd together)
- Mailto link for hostel reply uses BCC to protect donor privacy

### Rationale
1. **Donor Privacy:** Donors don't see each other's emails
2. **Efficiency:** Hostel gets one consolidated request
3. **Consistency:** All contributions toward student are tracked together

### Consequences
**Positive:**
- Protected donor privacy
- Simpler hostel workflow
- Grouped verification

**Negative:**
- More complex email generation
- Longer email body with contribution table
- Potential URL length limits for mailto links

### Mailto Generation
```javascript
function generateBatchMailtoLink(donors, student, batchId) {
  const bccEmails = donors.map(d => d.email).join(',');
  // Hostel clicks link, BCC'd to all donors
  return `mailto:?bcc=${bccEmails}&subject=...&body=...`;
}
```

---

## ADR-010: Structured AI Output Enforcement

### Status
**Accepted** (2024-10)

### Context
AI responses are inherently non-deterministic. Parsing free-form text is fragile and error-prone.

### Decision
Use Gemini's **structured output mode** with explicit JSON schemas:
- Force `responseMimeType: "application/json"`
- Define exact property types and enums
- Require specific fields

### Rationale
1. **Determinism:** Output is always valid JSON
2. **Type Safety:** Enums prevent unexpected values
3. **Parsability:** No regex or string manipulation needed
4. **Reliability:** Reduces AI hallucination in format

### Consequences
**Positive:**
- Reliable parsing
- Clear contract between AI and code
- Easier error handling

**Negative:**
- Schema must be maintained
- Less flexibility for AI to explain nuance
- Slightly more verbose prompt

### Schema Example
```javascript
responseSchema: {
  type: "OBJECT",
  properties: {
    status: { type: "STRING", enum: ["CONFIRMED_ALL", "PARTIAL", "AMBIGUOUS", "QUERY"] },
    confirmedAllocIds: { type: "ARRAY", items: { type: "STRING" } },
    reasoning: { type: "STRING" }
  },
  required: ["status", "confirmedAllocIds", "reasoning"]
}
```

---

## ADR-011: Mailto Protocol for External Verification

### Status
**Accepted** (2024-06)

### Context
University hostel staff use various email clients and may not have technical sophistication. We need them to confirm receipt of funds in a way that:
- Works universally
- Requires minimal effort
- Pre-populates the reply

### Decision
Generate `mailto:` links that pre-fill:
- Recipient (donor)
- CC (campaign email)
- Subject (with reference ID)
- Body (confirmation template)

### Rationale
1. **Universal:** Works in any email client
2. **Frictionless:** One click opens pre-filled email
3. **Auditable:** Resulting email has proper threading
4. **No Account Required:** Staff don't need system access

### Consequences
**Positive:**
- Zero training needed for hostel staff
- Works on mobile devices
- Maintains email as the audit trail

**Negative:**
- URL length limits (~2000 chars)
- Email body must be plain text
- No guarantee staff will use the link

### Implementation
```javascript
const mailto = `mailto:${donorEmail}?cc=${ccEmails}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
```

---

## ADR-012: Anonymized Reporting Warehouse

### Status
**Accepted** (2024-11)

### Context
External stakeholders (leadership, donors) need aggregate reports without accessing operational systems or seeing individual student identities.

### Decision
Create a separate **Reporting Sandbox** spreadsheet with:
- One-way hash for student IDs (irreversible)
- Aggregated financial fact tables
- Dimension tables with anonymized attributes only
- Financial reconciliation checks

### Rationale
1. **Privacy:** Student IDs are hashed with salt
2. **Governance:** Reporting data is physically separated
3. **Integrity:** ETL includes cross-check validation
4. **Flexibility:** Standard star schema for BI tools

### Consequences
**Positive:**
- Safe to share with external parties
- Supports aggregate analytics
- Immutable once generated

**Negative:**
- Cannot drill down to individual student
- Requires periodic ETL sync
- Salt must never be rotated (breaks linkage)

### Anonymization
```javascript
const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, cmsId + salt)
  .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
  .join('')
  .substring(0, 12);
// Result: "a1b2c3d4e5f6" (irreversible)
```

---

## Decision Status Summary

| ADR | Title | Status |
|-----|-------|--------|
| ADR-001 | Serverless ERP on Google Apps Script | ✅ Accepted |
| ADR-002 | Two-Workbook Security Model | ✅ Accepted |
| ADR-003 | Optimistic Concurrency Control | ✅ Accepted |
| ADR-004 | Commit-Last Transaction Pattern | ✅ Accepted |
| ADR-005 | HTML Sidebar for User Experience | ✅ Accepted |
| ADR-006 | RFC-822 Message Threading | ✅ Accepted |
| ADR-007 | AI-Driven Verification Watchdog | ✅ Accepted |
| ADR-008 | Multi-Receipt Support Architecture | ✅ Accepted |
| ADR-009 | Batch Allocation with BCC Privacy | ✅ Accepted |
| ADR-010 | Structured AI Output Enforcement | ✅ Accepted |
| ADR-011 | Mailto Protocol for External Verification | ✅ Accepted |
| ADR-012 | Anonymized Reporting Warehouse | ✅ Accepted |
