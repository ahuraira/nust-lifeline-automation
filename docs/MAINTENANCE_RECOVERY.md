# 🔧 Operational Sustainability Guide

> **Scope:** Maintenance procedures, quota management, disaster recovery, and system health monitoring.

This guide outlines the operational parameters required to sustain the NUST Lifeline System long-term, including quota management, credential rotation, and emergency procedures.

---

## Table of Contents

- [System Health Overview](#system-health-overview)
- [Platform Quotas](#platform-quotas)
- [Scheduled Maintenance](#scheduled-maintenance)
- [Credential Management](#credential-management)
- [Data Integrity Checks](#data-integrity-checks)
- [Backup & Recovery](#backup--recovery)
- [Emergency Procedures](#emergency-procedures)
- [Performance Optimization](#performance-optimization)
- [Monitoring & Alerting](#monitoring--alerting)
- [Runbooks](#runbooks)

---

## System Health Overview

### Key Components to Monitor

| Component | Health Indicator | Check Frequency |
|-----------|------------------|-----------------|
| **Triggers** | Running on schedule | Daily |
| **AI Service** | API responding | Per execution |
| **Email Delivery** | Messages sent | Per execution |
| **Sheet Integrity** | No formula errors | Weekly |
| **Audit Trail** | Events logging | Per execution |

### Dashboard Metrics

Access the **Log** sheet to review recent activity:

```
┌─────────────────────────────────────────────────────────────────┐
│ Log Sheet - Recent Entries                                       │
├───────────┬─────────┬─────────────────────┬────────────────────┤
│ Timestamp │ Level   │ Function            │ Message            │
├───────────┼─────────┼─────────────────────┼────────────────────┤
│ 14:30:00  │ SUCCESS │ processIncoming...  │ Finished run       │
│ 14:15:00  │ INFO    │ runWatchdog         │ Found 0 threads    │
│ 14:00:00  │ SUCCESS │ processAllocation   │ Transaction done   │
└───────────┴─────────┴─────────────────────┴────────────────────┘
```

**Red Flags to Watch For:**
- ❌ `ERROR` level entries
- ❌ `CRITICAL` level entries
- ❌ Gaps in scheduled trigger runs
- ❌ Repeated failures for same entity

---

## Platform Quotas

The system is architected to operate within free-tier limits, but scale triggers must be monitored.

### Google Apps Script Consumer Tier

| Resource | Daily Limit | Estimated Usage* | Mitigation |
|----------|-------------|-----------------|------------|
| **Email Recipients** | 100 | Low-Medium | Upgrade to Workspace (1,500/day) |
| **Script Runtime** | 90 min | Depends on volume | Reduce trigger frequency |
| **Gmail Read Ops** | 20,000 | Low | Headers-only scan |
| **URL Fetch (AI)** | 20,000 | Low | N/A |
| **Spreadsheet Cells** | 10M | Low | Archive old data |
| **Drive Storage** | 15 GB | Variable | Clean old receipts |

*Actual usage varies based on donation volume. The system does not currently track quota consumption.

### Checking Current Usage

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select the project linked to the script
3. APIs & Services → Dashboard
4. View usage for Gmail API, Sheets API

### Quota Exhaustion Symptoms

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Emails not sending | 100/day limit hit | Wait for reset or upgrade |
| Script timeout | 6-minute execution limit | Reduce batch size |
| "Quota exceeded" error | API limit hit | Implement backoff |
| "Service unavailable" | Transient overload | Retry with delay |

---

## Scheduled Maintenance

### Daily Checks (Automated)

These happen via triggers:
- `processIncomingReceipts` - Every 10 minutes
- `runWatchdog` - Every 15 minutes

### Weekly Checks (Manual)

| Task | Purpose | How To |
|------|---------|--------|
| Review Log sheet | Identify recurring errors | Filter by `ERROR` level |
| Check Audit completeness | Ensure events logged | Spot check recent allocations |
| Verify trigger health | Confirm all triggers active | Extensions → Apps Script → Triggers |

### Monthly Checks (Manual)

| Task | Purpose | How To |
|------|---------|--------|
| Ledger reconciliation | Verify financial integrity | Run `recalculateAllPledgeTotals()` |
| Archive old data | Free up quota | Export closed pledges to archive sheet |
| Review access permissions | Security hygiene | Check Drive sharing settings |
| Update chapter leads | Keep routing current | Review `MAPPINGS.chapterLeads` in Config |

### Quarterly Checks (Manual)

| Task | Purpose | How To |
|------|---------|--------|
| Full reconciliation | Forensic audit | Export all data, cross-check totals |
| API key rotation | Security best practice | Generate new Gemini key |
| Template review | Message freshness | Review email templates in Docs |
| Documentation update | Keep current | Review and update docs |

---

## Credential Management

### Gemini API Key

**Storage:** Script Properties (`GEMINI_API_KEY`)

**Rotation Procedure:**

1. Generate new key in [Google AI Studio](https://aistudio.google.com/)
2. Open Apps Script Editor
3. Go to Project Settings (⚙️ gear icon)
4. Scroll to Script Properties
5. Update the `GEMINI_API_KEY` value
6. **No deployment required** - properties inject at runtime
7. Test by running `test_analyzeEmail()`

**Rotation Schedule:** Every 90 days recommended

### OAuth Tokens

Managed automatically by Google. No manual rotation needed.

### Reporting Salt

**Storage:** Script Properties (`REPORTING_SALT`)

**⚠️ WARNING:** Never rotate this! It would break linkage between reporting data and source records.

---

## Data Integrity Checks

### Ledger Reconciliation Protocol

Run quarterly or when discrepancies are suspected.

**Manual Check:**

1. Export `Allocation Log` to CSV
2. Export `(RAW) Form Responses` to CSV
3. Pivot: `SUM(Allocation Amount)` grouped by `Pledge ID`
4. Compare: Each pledge's `Sum(Allocations) <= Verified Total`
5. If discrepancy: Check Audit Trail for manual overrides

**Automated Check:**

```javascript
// Run this function to recalculate all totals
recalculateAllPledgeTotals();
// Check Log sheet for results
```

### Orphan Detection

Find allocations without valid pledges:

```javascript
function findOrphanAllocations() {
  const allocWs = getSheet(SHEETS.allocations.name);
  const rawWs = getSheet(SHEETS.donations.name);
  const allocData = allocWs.getDataRange().getValues();
  const rawData = rawWs.getDataRange().getValues();
  
  const pledgeIds = new Set(rawData.slice(1).map(r => r[SHEETS.donations.cols.pledgeId - 1]));
  
  for (let i = 1; i < allocData.length; i++) {
    const pid = allocData[i][SHEETS.allocations.cols.pledgeId - 1];
    if (!pledgeIds.has(pid)) {
      Logger.log(`Orphan: Row ${i + 1}, Pledge ${pid}`);
    }
  }
}
```

### Floating Balance Check

Find pledges where calculated balance differs from stored:

```javascript
function verifyBalances() {
  // Run recalculateAllPledgeTotals() and compare
  // before/after values in columns W, X, Y
}
```

---

## Backup & Recovery

### Backup Strategy

| Data | Backup Method | Frequency | Retention |
|------|---------------|-----------|-----------|
| **Spreadsheet Data** | Google Sheets version history | Auto | 90 days |
| **Script Code** | Git repository | On change | Indefinite |
| **Templates** | Version history | Auto | 90 days |
| **Receipts** | Google Drive | Permanent | Indefinite |

### Creating Manual Backups

1. Open the spreadsheet
2. File → Download → Microsoft Excel (.xlsx)
3. Store in secure location with date

### Recovery Procedures

**Scenario: Corrupted Data Row**

1. Open Version History: File → Version History → See version history
2. Find version before corruption
3. Copy the correct data
4. Paste into current version

**Scenario: Script Error After Update**

1. Go to Extensions → Apps Script
2. Open File → View → Show File History
3. Restore previous version

**Scenario: Accidental Mass Deletion**

1. Open Version History
2. Select clean version
3. Click "Restore this version"
4. Run sync functions to update lookups

---

## Emergency Procedures

### The "Kill Switch" (Stop All Automation)

If the AI behaves erratically or emails are wrong:

1. Go to Extensions → Apps Script → Triggers
2. **Delete** all time-driven triggers:
   - `runWatchdog`
   - `processIncomingReceipts`
3. **Result:** System reverts to manual mode

**To Resume:**
1. Investigate and fix the issue
2. Recreate triggers

### Stuck State Recovery

**Symptom:** A valid pledge doesn't appear in the Sidebar search.

**Cause:** Data corruption in `Donations Tracker` (often from copy-paste errors).

**Fix:**
1. Identify the broken row index
2. Delete values in Columns B:E (helper formula columns)
3. Copy formulas from the row above
4. Paste Special → Formulas Only

### Lock Stuck (Rare)

**Symptom:** All allocations fail with "System busy" error for >5 minutes.

**Cause:** A script execution crashed while holding the lock.

**Fix:** Locks auto-expire after 30 seconds. If issue persists:
1. Wait 5 minutes (Google clears stale locks)
2. If still stuck, contact Google Workspace support

### Mass Email Failure

**Symptom:** Emails not sending, "Quota exceeded" errors.

**Diagnosis:**
1. Check Log sheet for email errors
2. Verify daily quota hasn't been hit
3. Check for service outage at [Google Status](https://www.google.com/appsstatus)

**Recovery:**
1. Wait for quota reset (midnight PT)
2. Or upgrade to Google Workspace
3. Run `retryFailedConfirmationEmails()` to resend

---

## Performance Optimization

### Current Optimizations

| Optimization | Implementation | Impact |
|--------------|----------------|--------|
| Batch reads | `getDataRange().getValues()` | Reduces API calls |
| Column-only scan | `getRange(2, col, rows, 1)` | Faster searches |
| Lookup tables | Pre-computed summaries | Faster sidebar load |
| Lock timeout | 30s max wait | Fail fast |
| Lazy AI calls | Only when needed | Saves quota |

### If Performance Degrades

**Symptom:** Sidebar takes >10 seconds to load.

**Fixes:**
1. Archive old data (closed pledges >1 year)
2. Clear the Log sheet (keep last 1000 rows)
3. Reduce lookup table recalculation frequency

**Symptom:** Trigger runtime approaching 6 minutes.

**Fixes:**
1. Reduce batch size in `processIncomingReceipts`
2. Increase trigger interval (10 min → 15 min)
3. Add early exits for empty queues

---

## Monitoring & Alerting

### Built-in Monitoring

The system logs all activity to the **Log** sheet:
- Filter by `Level = ERROR` to see problems
- Filter by `Function` to trace specific workflows

### Setting Up Email Alerts

Create a time-driven trigger for a monitoring function:

```javascript
function dailyHealthCheck() {
  const logWs = getSheet(SHEETS.log.name);
  const data = logWs.getRange(2, 1, 50, 4).getValues(); // Last 50 entries
  
  const errors = data.filter(r => r[1] === 'ERROR' || r[1] === 'CRITICAL');
  
  if (errors.length > 5) {
    MailApp.sendEmail({
      to: EMAILS.processOwner,
      subject: '[ALERT] NUST Lifeline - High Error Rate',
      body: `Found ${errors.length} errors in the last 50 log entries.\n\nPlease investigate.`
    });
  }
}
```

### External Monitoring

For production, consider:
- [UptimeRobot](https://uptimerobot.com/) - Monitor a web app trigger
- Google Cloud Monitoring - If using Cloud projects
- Manual daily check of Log sheet

---

## Runbooks

### Runbook: New Semester Setup

1. **Archive Old Data**
   - Export closed pledges to archive sheet
   - Clear old log entries

2. **Update Student Database**
   - Import new student list to CONFIDENTIAL workbook
   - Verify columns match schema

3. **Reset Lookup Tables**
   - Run `syncStudentData()`
   - Run `syncPledgeData()`

4. **Test Full Cycle**
   - Submit test pledge
   - Process test receipt
   - Make test allocation
   - Verify emails

### Runbook: Onboarding New Volunteer

1. **Grant Access**
   - Share OPERATIONS spreadsheet (Editor)
   - Do NOT share CONFIDENTIAL spreadsheet

2. **Training**
   - Walk through USER_GUIDE.md
   - Shadow experienced volunteer

3. **First Allocation**
   - Supervised allocation
   - Verify audit trail entry

### Runbook: Monthly Reporting

1. **Sync Reporting Warehouse**
   ```javascript
   syncAnonymousReportingData();
   ```

2. **Export Data**
   - Open Reporting Sandbox spreadsheet
   - Download as CSV for analysis

3. **Verify Reconciliation**
   - Check that `SUM(Fact_Allocations.Amount) == SUM(Dim_Students.Amount_Funded)`

### Runbook: API Key Rotation

See [Credential Management](#credential-management) section.

### Runbook: Production Migration

See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for complete procedure.
