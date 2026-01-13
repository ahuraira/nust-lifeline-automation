# 🚀 Production Migration Guide

> **Scope:** Step-by-step runbook for migrating the NUST Lifeline System to a new Google Account.

This guide provides a complete procedure for performing a "Lift and Shift" migration of the system between Google accounts, including all assets, configurations, and verification steps.

---

## Table of Contents

- [Pre-Migration Checklist](#pre-migration-checklist)
- [Phase 1: Asset Inventory](#phase-1-asset-inventory)
- [Phase 2: Asset Creation](#phase-2-asset-creation)
- [Phase 3: Data Migration](#phase-3-data-migration)
- [Phase 4: Script Setup](#phase-4-script-setup)
- [Phase 5: Configuration Update](#phase-5-configuration-update)
- [Phase 6: Trigger Setup](#phase-6-trigger-setup)
- [Phase 7: Verification](#phase-7-verification)
- [Phase 8: Cutover](#phase-8-cutover)
- [Rollback Procedure](#rollback-procedure)
- [Post-Migration Checklist](#post-migration-checklist)

---

## Pre-Migration Checklist

### Required Access

| Access | Source Account | Target Account |
|--------|----------------|----------------|
| Google Drive | ✅ Owner | ✅ Owner |
| Google Forms | ✅ Owner | ✅ Owner |
| Google Apps Script | ✅ Owner | ✅ Owner |
| Gmail Labels | ✅ Owner | ✅ Owner |
| Google AI Studio | N/A | ✅ Access for API key |

### Pre-Migration Tasks

- [ ] Back up all spreadsheet data (Export → XLSX)
- [ ] Export Apps Script code (using clasp or copy/paste)
- [ ] Document all current Script Properties
- [ ] Note all current trigger configurations
- [ ] Notify stakeholders of migration window
- [ ] Plan for email sender change (from/CC addresses)

### Estimated Time

| Phase | Duration | Parallel? |
|-------|----------|-----------|
| Asset Inventory | 30 min | No |
| Asset Creation | 45 min | No |
| Data Migration | 30 min | Partial |
| Script Setup | 30 min | No |
| Configuration | 45 min | No |
| Trigger Setup | 15 min | No |
| Verification | 60 min | No |
| Cutover | 15 min | No |
| **Total** | **~5 hours** | |

---

## Phase 1: Asset Inventory

Document all assets from the source account.

### 1.1 Spreadsheets

| Asset | Source ID | Purpose |
|-------|-----------|---------|
| Operations Workbook | `_______________` | Main operational database |
| Confidential Workbook | `_______________` | Student identities database |
| Reporting Sandbox | `_______________` | Analytics warehouse |

### 1.2 Folders

| Asset | Source ID | Purpose |
|-------|-----------|---------|
| Receipt Storage | `_______________` | Uploaded receipt files |
| Email Templates | `_______________` | Google Doc templates |

### 1.3 Forms

| Asset | Source ID | Purpose |
|-------|-----------|---------|
| Pledge Form | `_______________` | Donor pledge submission |

### 1.4 Documents (Templates)

| Template | Source ID | Config Key |
|----------|-----------|------------|
| Pledge Confirmation | `_______________` | `TEMPLATES.pledgeConfirmation` |
| Hostel Verification | `_______________` | `TEMPLATES.hostelVerification` |
| Donor Allocation | `_______________` | `TEMPLATES.donorAllocationNotification` |
| Hostel Mailto | `_______________` | `TEMPLATES.hostelMailto` |
| Final Notification | `_______________` | `TEMPLATES.finalDonorNotification` |
| Batch Intimation | `_______________` | `TEMPLATES.batchIntimationToHostel` |
| Batch Mailto | `_______________` | `TEMPLATES.batchDonorMailtoBody` |

### 1.5 Script Properties

| Property | Value | Notes |
|----------|-------|-------|
| `GEMINI_API_KEY` | `_______________` | Generate new for target |
| `REPORTING_SS_ID` | `_______________` | Will change after migration |
| `REPORTING_SALT` | `_______________` | Carry over to maintain hash consistency |

### 1.6 Gmail Labels

- [ ] `Receipts/To-Process`
- [ ] `Receipts/Processed`
- [ ] `Watchdog/Processed`
- [ ] `Watchdog/Manual-Review`

---

## Phase 2: Asset Creation

Create all assets in the target account.

### 2.1 Create Folder Structure

```
📁 NUST Lifeline System
├── 📁 Receipts (for receipt storage)
├── 📁 Email Templates
│   ├── 📄 Pledge Confirmation
│   ├── 📄 Hostel Verification
│   └── ... (other templates)
└── 📁 Data
    ├── 📊 Operations Workbook
    └── 📊 Confidential Workbook
```

**Steps:**
1. Create main folder in Google Drive
2. Create subfolders: `Receipts`, `Email Templates`, `Data`
3. Record new folder IDs:

| Asset | New ID |
|-------|--------|
| Receipt Storage | `_______________` |
| Email Templates | `_______________` |

### 2.2 Copy Spreadsheets

**For each spreadsheet:**
1. Open source spreadsheet
2. File → Make a copy
3. Select target destination folder
4. Record new spreadsheet IDs:

| Asset | New ID |
|-------|--------|
| Operations Workbook | `_______________` |
| Confidential Workbook | `_______________` |

**Important:** Do NOT copy the Apps Script bound to the source spreadsheet. We will create fresh.

### 2.3 Copy Email Templates

**For each Google Doc template:**
1. Open source document
2. File → Make a copy
3. Move to target Email Templates folder
4. Record new document IDs:

| Template | New ID |
|----------|--------|
| Pledge Confirmation | `_______________` |
| Hostel Verification | `_______________` |
| Donor Allocation | `_______________` |
| Hostel Mailto | `_______________` |
| Final Notification | `_______________` |
| Batch Intimation | `_______________` |
| Batch Mailto | `_______________` |

### 2.4 Copy Google Form

1. Open source form
2. Click three-dot menu → Make a copy
3. Link to NEW Operations Workbook:
   - Form settings → Responses → Link to Sheets
   - Select the new Operations Workbook
4. Record new form ID:

| Asset | New ID |
|-------|--------|
| Pledge Form | `_______________` |

### 2.5 Create Gmail Labels

In the target Gmail account:
1. Click ⚙️ Settings → See all settings
2. Go to Labels tab
3. Create these labels:
   - `Receipts/To-Process`
   - `Receipts/Processed`
   - `Watchdog/Processed`
   - `Watchdog/Manual-Review`

---

## Phase 3: Data Migration

### 3.1 Migrate Sheet Data

If you copied the spreadsheets, data should already be included. Verify:

- [ ] Operations Workbook has all sheets with data intact
- [ ] Confidential Workbook has student data intact
- [ ] Formula references are working (some may need fixing)

### 3.2 Fix Cross-Workbook References

If the Operations Workbook has any `IMPORTRANGE()` formulas referencing Confidential:

1. Update the formula with new Confidential Workbook ID
2. Re-authorize the `IMPORTRANGE()` access

### 3.3 Migrate Receipts Folder

**Option A: Move Ownership** (Preferred)
1. In source account, share Receipt folder with target account (Editor)
2. In target account, make a shortcut or copy files
3. Update links in Receipt Log sheet

**Option B: Re-upload**
1. Download all receipt files from source
2. Upload to new Receipt folder in target
3. Update Drive links in Receipt Log sheet

### 3.4 Clear Sensitive Data (If Needed)

If migrating to a test environment, clear:
- [ ] Student names from Confidential Workbook
- [ ] Donor emails from Operations Workbook
- [ ] Receipt files

---

## Phase 4: Script Setup

### 4.1 Create New Apps Script Project

1. Open the NEW Operations Workbook
2. Extensions → Apps Script
3. This creates a bound script project

### 4.2 Copy Script Files

**Using clasp (Recommended):**
```bash
# Clone source project
clasp clone <source-script-id> --rootDir source/

# Login to target account
clasp login

# Create in target
cd target/
clasp create --type sheets --parentId <new-operations-workbook-id>

# Copy files
cp -r source/*.js target/
cp -r source/*.html target/
cp source/appsscript.json target/

# Push
clasp push
```

**Manual Method:**
1. Open source Apps Script project
2. Copy each file's content
3. Create corresponding files in target project
4. Paste content

### 4.3 Update Manifest

Ensure `appsscript.json` has correct scopes:

```json
{
  "timeZone": "Asia/Karachi",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

---

## Phase 5: Configuration Update

### 5.1 Update Config.js

Replace all IDs with new values:

```javascript
const CONFIG = {
  // SPREADSHEET IDS
  ssId_operations: 'NEW_OPERATIONS_ID_HERE',
  ssId_confidential: 'NEW_CONFIDENTIAL_ID_HERE',
  
  // FOLDER IDS
  folderId_receipts: 'NEW_RECEIPTS_FOLDER_ID_HERE',
  folderId_emailTemplates: 'NEW_TEMPLATES_FOLDER_ID_HERE',
  
  // ... other config unchanged
};

const TEMPLATES = {
  pledgeConfirmation: 'NEW_TEMPLATE_ID_HERE',
  hostelVerification: 'NEW_TEMPLATE_ID_HERE',
  donorAllocationNotification: 'NEW_TEMPLATE_ID_HERE',
  hostelMailto: 'NEW_TEMPLATE_ID_HERE',
  finalDonorNotification: 'NEW_TEMPLATE_ID_HERE',
  batchIntimationToHostel: 'NEW_TEMPLATE_ID_HERE',
  batchDonorMailtoBody: 'NEW_TEMPLATE_ID_HERE'
};

const EMAILS = {
  ddHostels: 'hostel.email@university.edu',
  uao: 'accounts@university.edu',
  processOwner: 'NEW_ACCOUNT_EMAIL_HERE',
  alwaysCC: ['NEW_ACCOUNT_EMAIL_HERE']
};
```

### 5.2 Set Script Properties

1. Open Apps Script Editor
2. ⚙️ Project Settings
3. Add Script Properties:

| Property | Value |
|----------|-------|
| `GEMINI_API_KEY` | (Generate new key from AI Studio) |
| `REPORTING_SALT` | (Copy from source to maintain hash consistency) |

### 5.3 Verify Chapter Mappings

Update `MAPPINGS.chapterLeads` if any email addresses changed.

---

## Phase 6: Trigger Setup

### 6.1 Create Triggers

Go to Extensions → Apps Script → Triggers (⏰ icon):

| Function | Type | Event | Frequency |
|----------|------|-------|-----------|
| `onFormSubmitTrigger` | From spreadsheet | On form submit | N/A |
| `onSheetEditTrigger` | From spreadsheet | On edit | N/A |
| `processIncomingReceipts` | Time-driven | Minutes timer | Every 10 minutes |
| `runWatchdog` | Time-driven | Minutes timer | Every 15 minutes |
| `onAuditSheetEdit` | From spreadsheet | On edit | N/A (optional) |
| `syncStudentData` | Time-driven | Day timer | Daily |
| `syncAnonymousReportingData` | Time-driven | Day timer | Daily |

### 6.2 Authorize Triggers

Each trigger will prompt for authorization on first run:
1. Run each function once manually
2. Grant requested permissions

---

## Phase 7: Verification

### 7.1 Unit Tests

Run these functions manually and check Log sheet:

| Test | Function | Expected Log |
|------|----------|--------------|
| AI Connection | `test_analyzeEmail()` | SUCCESS result |
| Sheet Access | `getSheet(SHEETS.donations.name)` | No error |
| Email Templates | `createEmailFromTemplate(TEMPLATES.pledgeConfirmation, {})` | HTML returned |

### 7.2 Integration Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Form Submission | Submit test pledge | - Row appears in sheet<br>- Email sent<br>- Audit logged |
| Receipt Processing | Send test receipt email | - Receipt extracted<br>- Logged to Receipt Log |
| Allocation | Use sidebar to allocate | - Emails sent<br>- Status updated |
| Watchdog | Send mock hostel reply | - Status updated<br>- Donor notified |

### 7.3 Verification Checklist

- [ ] Pledge form submits correctly
- [ ] Confirmation email arrives
- [ ] Receipt processing runs (check Log sheet)
- [ ] Sidebar opens and loads data
- [ ] Allocation transaction completes
- [ ] Hostel receives verification email
- [ ] Watchdog processes replies
- [ ] Audit Trail records events
- [ ] Reporting sync works

---

## Phase 8: Cutover

### 8.1 Final Data Sync

If running in parallel during migration:
1. Pause source triggers
2. Export any new data from source
3. Import to target
4. Resume target triggers

### 8.2 DNS/Form Updates

If using custom URLs:
1. Update form embed URLs
2. Update any website links

### 8.3 Stakeholder Notification

- [ ] Notify volunteers of new spreadsheet URL
- [ ] Update bookmarks/shortcuts
- [ ] Confirm email routing (if email addresses changed)

### 8.4 Decommission Source (After Burn-in)

After 2 weeks of stable operation:
1. Delete source triggers
2. Revoke source API keys
3. Archive source spreadsheets (don't delete yet)
4. Revoke volunteer access to source

---

## Rollback Procedure

If critical issues are discovered:

### Immediate Rollback (Within 1 Hour)

1. **Delete** all target triggers
2. **Restore** source triggers
3. **Notify** stakeholders to use source system
4. **Investigate** issues in target

### Late Rollback (After Data Divergence)

1. **Delete** target triggers
2. **Export** new data from target:
   - New pledges
   - New allocations
   - New receipts
3. **Import** to source
4. **Restore** source triggers
5. **Notify** stakeholders

---

## Post-Migration Checklist

### Day 1

- [ ] All triggers running successfully
- [ ] No ERROR entries in Log sheet
- [ ] Test pledge processed correctly

### Week 1

- [ ] Daily review of Log sheet
- [ ] Verify email delivery rates
- [ ] Check Watchdog processing
- [ ] Confirm volunteer access

### Week 2

- [ ] Full ledger reconciliation
- [ ] Review Audit Trail for anomalies
- [ ] Archive source system

### Month 1

- [ ] Remove source access
- [ ] Update documentation with new IDs
- [ ] Confirm all stakeholders using new system

---

## Asset ID Reference Template

Copy this table and fill in during migration:

```markdown
## Migration: [DATE]

### Spreadsheets
| Asset | Source ID | Target ID |
|-------|-----------|-----------|
| Operations | | |
| Confidential | | |
| Reporting | | |

### Folders
| Asset | Source ID | Target ID |
|-------|-----------|-----------|
| Receipts | | |
| Templates | | |

### Templates
| Template | Source ID | Target ID |
|----------|-----------|-----------|
| Pledge Confirmation | | |
| Hostel Verification | | |
| Donor Allocation | | |
| Hostel Mailto | | |
| Final Notification | | |
| Batch Intimation | | |
| Batch Mailto | | |

### Other
| Asset | Source | Target |
|-------|--------|--------|
| Form ID | | |
| Script ID | | |
| Gemini Key | N/A | |
| Salt | (copy) | (paste) |
```

---

## Support Contacts

| Issue | Contact |
|-------|---------|
| Migration Assistance | System Administrator |
| Access Issues | Google Workspace Admin |
| Script Errors | Developer Team |
| Urgent Production Issues | On-call Lead |
