# 📘 User Operations Guide

> **Scope:** Step-by-step guide for volunteers and administrators managing the NUST Lifeline Fund.

This guide covers daily operations, common workflows, and troubleshooting for the Hostel Funds Management System.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Understanding the Dashboard](#understanding-the-dashboard)
- [Workflow 1: Processing New Pledges](#workflow-1-processing-new-pledges)
- [Workflow 2: Allocating Funds](#workflow-2-allocating-funds)
- [Workflow 3: Batch Allocations](#workflow-3-batch-allocations)
- [Workflow 4: Handling Watchdog Alerts](#workflow-4-handling-watchdog-alerts)
- [Using the Audit Trail](#using-the-audit-trail)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Getting Started

### Prerequisites

Before you begin, ensure you have:
- ✅ Access to the **Donations Tracker** spreadsheet
- ✅ Permissions to use the **Hostel Admin** menu
- ✅ Basic understanding of the donation lifecycle

### Key Concepts

| Term | Definition |
|------|------------|
| **Pledge** | A donor's commitment to contribute funds |
| **Receipt/Proof** | Bank transfer confirmation from donor |
| **Allocation** | Assigning pledged funds to a specific student |
| **Verification** | Hostel confirming they received the funds |
| **Closure** | Complete lifecycle with all parties notified |

### The Donation Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  PLEDGE  │───▶│  PROOF   │───▶│ ALLOCATE │───▶│  VERIFY  │───▶│  CLOSED  │
│ (Form)   │    │(Receipt) │    │(Sidebar) │    │(Hostel)  │    │(Complete)│
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │               │
     ▼               ▼               ▼               ▼               ▼
  Auto Email     AI Process      You Action      Watchdog       Donor Notified
  to Donor       & Store         Required        Monitors       (Thank You)
```

---

## Understanding the Dashboard

Your main workspace is the **Donations Tracker** sheet.

### Status Colors

| Color | Meaning | Action Required |
|-------|---------|-----------------|
| 🟡 Yellow/Orange | Pledged, awaiting proof | Wait for donor receipt |
| 🔵 Blue | Proof submitted | Ready for allocation |
| 🟢 Green | Allocated or closed | Monitor or complete |
| 🔴 Red | Error or rejected | Review and fix |
| ⬜ White | New, unprocessed | Check and categorize |

### Column Guide

| Column | Purpose |
|--------|---------|
| **A** | Student CMS ID (you enter) |
| **B** | Student Need (auto-calculated) |
| **C** | Pledge Balance (auto-calculated) |
| **D** | Amount to Allocate (you enter) |
| **E** | Action Trigger (dropdown) |
| **F** | (Reserved) |
| **G** | Pledge ID (auto) |

### Reading the Status

```
┌─────────────────────────────────────────────────────────────────┐
│ Donations Tracker                                               │
├─────┬────────────┬─────────┬────────┬──────────┬───────────────┤
│ CMS │ Need       │ Balance │ Amount │ Action   │ Pledge ID     │
├─────┼────────────┼─────────┼────────┼──────────┼───────────────┤
│     │ ⚠️ Not Found│ 50,000  │        │ ▼        │ PLEDGE-2025-1 │ ← Ready
│ 123 │ 25,000     │ 25,000  │ 10,000 │ Allocate │ PLEDGE-2025-2 │ ← In progress
│     │            │ 0       │        │ Allocated│ PLEDGE-2025-3 │ ← Complete
└─────┴────────────┴─────────┴────────┴──────────┴───────────────┘
```

---

## Workflow 1: Processing New Pledges

### What Happens Automatically

When a donor submits the pledge form:
1. ✅ System generates unique Pledge ID (`PLEDGE-2025-XXX`)
2. ✅ Status set to "1 - Pledged"
3. ✅ Confirmation email sent to donor with payment instructions
4. ✅ Chapter lead CC'd on the email

### Your Role: Wait and Monitor

At this stage, you simply wait for the donor to send their payment receipt.

### When Receipt Arrives

The system automatically:
1. ✅ Scans incoming emails (every 10 minutes)
2. ✅ Extracts receipt using AI
3. ✅ Verifies transfer amount and date
4. ✅ Updates status to "2 - Proof Submitted"
5. ✅ Stores receipt in Google Drive

**You will see:**
- Status changes in the tracker
- Proof link appears in the row
- Balance column shows available funds

---

## Workflow 2: Allocating Funds

Once a pledge shows "Proof Submitted" and has a balance > 0, you can allocate funds.

### Method A: Single Allocation (Quick)

1. **Click** on the pledge row in the Donations Tracker
2. **Open** the Sidebar: Menu → **Hostel Admin** → **Review Allocation**
3. **Review** the pledge details and proof preview
4. **Enter** the Student CMS ID in the search box
5. **Verify** the student's need is displayed
6. **Enter** the amount to allocate
7. **Click** "Allocate"

```
┌────────────────────────────────────┐
│ Review Allocation                   │
├────────────────────────────────────┤
│ Pledge: PLEDGE-2025-1              │
│ Balance: PKR 50,000                │
│                                    │
│ [Proof Preview / Receipt Image]    │
│                                    │
│ Student CMS ID: [________] 🔍      │
│ Student Need: PKR 25,000           │
│                                    │
│ Amount: [25000________]            │
│                                    │
│ [      ALLOCATE      ]             │
└────────────────────────────────────┘
```

### What Happens After Allocation

1. ✅ System locks the balance (prevents double-spend)
2. ✅ Allocation record created
3. ✅ Email sent to Hostel (DD Hostels + UAO)
4. ✅ Donor notified of allocation
5. ✅ Pledge status updated

### Method B: Using the Tracker Directly

If you prefer not to use the Sidebar:

1. Enter Student CMS ID in Column A
2. Enter Amount in Column D
3. Select "Allocate the selected student" from Column E dropdown
4. Wait for status to change to "Allocated" (green) or "ERROR" (red)

---

## Workflow 3: Batch Allocations

When you need to allocate multiple pledges to one student (e.g., funding a student's full need).

### Step-by-Step

1. **Open Sidebar:** Menu → Hostel Admin → Review Allocation

2. **Select Pledges:**
   - Check the boxes next to pledges you want to include
   - Adjust individual amounts if needed (partial allocation)
   - Watch the "Selected Total" update

3. **Preview:**
   - Single selection: Shows receipt preview
   - Multiple selections: Shows summary table with links

4. **Select Student:**
   - Enter CMS ID in the search box
   - Verify the displayed need

5. **Execute:**
   - Click "ALLOCATE BATCH"
   - Wait for "Success" message

```
┌────────────────────────────────────┐
│ Select Pledges (Available Funds)   │
├────────────────────────────────────┤
│ ☑ Ahmed Khan     PLEDGE-2025-1     │
│   [25,000] (max: 25,000)           │
│ ☑ Sara Ali       PLEDGE-2025-2     │
│   [15,000] (max: 20,000)           │
│ ☐ Other Donor    PLEDGE-2025-3     │
│   [50,000] (max: 50,000)           │
├────────────────────────────────────┤
│ Selected Total: PKR 40,000         │
├────────────────────────────────────┤
│ Student CMS ID: [123456____] 🔍    │
│ Student Need: PKR 45,000           │
│                                    │
│ [    ALLOCATE BATCH    ]           │
└────────────────────────────────────┘
```

### What Happens After Batch Allocation

1. Individual allocation records created
2. Single email to Hostel with all donors listed
3. Each donor notified individually
4. Hostel gets a "mailto" link to BCC all donors in response

---

## Workflow 4: Handling Watchdog Alerts

The AI Watchdog monitors for hostel replies. Sometimes it needs your help.

### Understanding Alert Types

| Alert | Meaning | Action |
|-------|---------|--------|
| **CONFIRMED_ALL** | Hostel verified everything | Auto-processed ✅ |
| **PARTIAL** | Some verified, some not | Check specifics |
| **AMBIGUOUS** | AI unsure about meaning | Manual review needed |
| **QUERY** | Hostel has questions | Respond and resolve |

### When You Receive an Alert Email

Subject: `[ACTION REQUIRED] Ambiguous Hostel Reply for PLEDGE-2025-XXX`

```
┌─────────────────────────────────────────────────────────┐
│ The AI Watchdog could not automatically verify the     │
│ hostel reply.                                          │
│                                                        │
│ Reasoning: The email says "Noted" which is ambiguous.  │
│ It does not explicitly confirm receipt of funds.       │
│                                                        │
│ [Open Email Thread]                                    │
└─────────────────────────────────────────────────────────┘
```

### Steps to Resolve

1. **Click** "Open Email Thread" to read the original conversation

2. **Analyze** the hostel's response:
   - Did they confirm receipt? → Verified
   - Did they ask a question? → Query
   - Did they say "no" or dispute? → Investigate

3. **Update Manually:**
   - Go to the **Allocation Log** sheet
   - Find the row with matching Pledge ID
   - Change Status column to appropriate value:
     - `3 - Hostel Verified` if confirmed
     - `2 - Hostel Query` if they have questions
     - `9 - Cancelled` if rejected

4. **Your change is logged** in the Audit Trail automatically

### Important: Gmail Labels

The Watchdog uses these labels:
- `Watchdog/Processed` - Already handled
- `Watchdog/Manual-Review` - Needs your attention

Don't manually remove these labels unless you know what you're doing.

---

## Using the Audit Trail

The **Audit Trail** sheet is a permanent record of all system actions.

### Viewing Audit History

1. Go to the `Audit Trail` sheet
2. Use Data → Filter Views
3. Filter by:
   - **Column D (Target ID):** Enter a Pledge ID
   - **Column C (Event Type):** Filter by action type
   - **Column B (Actor):** See who did what

### Understanding Audit Events

| Event Type | Meaning |
|------------|---------|
| `NEW_PLEDGE` | New form submission |
| `RECEIPT_PROCESSED` | Receipt analyzed |
| `ALLOCATION` | Funds allocated |
| `HOSTEL_VERIFICATION` | Hostel confirmed |
| `HOSTEL_QUERY` | Hostel had questions |
| `STATUS_CHANGE` | Manual status update |
| `ALERT` | Watchdog flagged for review |

### Example Audit Entry

```
Timestamp: 2025-12-19 14:30:00
Actor: volunteer@example.com
Event: ALLOCATION
Target: ALLOC-123456789 (PLEDGE-2025-1)
Action: Funds Allocated & Verified Email Sent
Previous: 
New: 1 - Pending Hostel
Metadata: {"amount": 50000, "cmsId": "123456"}
```

### ⚠️ Warning

**Do not edit the Audit Trail sheet.** It is designed to be immutable for forensic purposes.

---

## Common Tasks

### Finding a Specific Pledge

1. Use Ctrl+F (Cmd+F on Mac)
2. Search for Pledge ID or Donor name
3. Or use Data → Filter Views

### Checking Available Balance

The balance is calculated in real-time:
```
Balance = Verified Total - Already Allocated
```

If a pledge shows balance but you can't allocate, check:
- Is the status correct (not Cancelled/Rejected)?
- Are there pending allocations not yet visible?

### Re-sending a Confirmation Email

If a donor never received their pledge confirmation:

1. Open Apps Script Editor (Extensions → Apps Script)
2. Run `retryFailedConfirmationEmails()`
3. Check the Log sheet for results

### Viewing Receipt Details

For pledges with "See Receipt Log" in proof column:
1. Go to the **Receipt Log** sheet
2. Filter by Pledge ID
3. Click the Drive link to view the file

---

## Troubleshooting

### Error: "System is busy"

**Cause:** Another person is allocating simultaneously.

**Solution:** Wait 30 seconds and try again.

### Error: "Insufficient Funds"

**Cause:** Amount exceeds available balance.

**Solution:** Check the real balance or reduce allocation amount.

### Error: "Student not found"

**Cause:** CMS ID doesn't exist in the database.

**Solution:** Verify the CMS ID with the admin team.

### Sidebar Won't Load

**Cause:** Header row or invalid row selected.

**Solution:** Click on a data row (not row 1) and try again.

### Status Shows "ERROR"

**Cause:** Allocation failed due to validation error.

**Solution:** 
1. Check the **Log** sheet for details
2. Look for errors with the Pledge ID
3. Fix the issue and retry

### Donor Didn't Receive Email

**Possible Causes:**
- Email quota exceeded (100/day on consumer tier)
- Email went to spam
- Invalid email address

**Solution:**
1. Check the Log sheet for email errors
2. Ask donor to check spam
3. Manually forward if needed

---

## FAQ

### Q: How long does receipt processing take?
**A:** Receipts are processed every 10 minutes. Allow up to 15 minutes for status to update.

### Q: Can I undo an allocation?
**A:** Once allocated, contact an admin. Manual status changes require justification.

### Q: Why is a pledge showing zero balance but isn't closed?
**A:** The hostel hasn't verified yet. Check the Allocation Log for "Pending Hostel" status.

### Q: Can multiple people allocate the same pledge?
**A:** The system uses locking to prevent this. One person must wait for the other to finish.

### Q: How do I know if verification is complete?
**A:** When status shows "6 - Closed" in the Raw Data sheet, the full loop is complete.

### Q: What if the hostel rejects an allocation?
**A:** The AI will flag it for review. You'll need to investigate and possibly reallocate.

### Q: Can I allocate to multiple students from one pledge?
**A:** Yes, allocate partial amounts in sequence. The balance updates in real-time.

### Q: How do I add a new chapter lead?
**A:** Contact the system administrator to update Config.js.

---

## Quick Reference Card

### Keyboard Shortcuts (Spreadsheet)

| Shortcut | Action |
|----------|--------|
| Ctrl+F | Find in sheet |
| Ctrl+Shift+L | Apply filter |
| Alt+Enter | New line in cell |

### Status Quick Reference

| Pledge Status | Next Action |
|---------------|-------------|
| 1 - Pledged | Wait for proof |
| 1a - Partial Receipt | Wait for more proof |
| 2 - Proof Submitted | Ready to allocate |
| 4 - Partially Allocated | Allocate remaining |
| 5 - Fully Allocated | Wait for verification |
| 6 - Closed | ✅ Complete |

### Emergency Contacts

| Issue | Contact |
|-------|---------|
| System Down | System Administrator |
| Urgent Allocation | Chapter Lead |
| Donor Inquiry | nustlifelinecampaign@gmail.com |
