# 🔧 Operational Sustainability Guide

> **Scope:** Maintenance, Quotas, and Disaster Recovery.

This guide outlines the operational parameters required to sustain the NUST Lifeline System long-term, including quota management and emergency procedures.

---

## 1. Platform Quotas (Google Apps Script Consumer Tier)
The system is architected to operate within free-tier limits, but scale triggers must be monitored.

| Resource | Limit (Free) | System Usage Estimate | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Email Recipients** | 100 / day | ~10-20 allocations/day | Upgrade to Google Workspace (Increases limit to 1,500/day). |
| **Triggers (Runtime)** | 90 min / day | ~40-60 min / day | Decrease Watchdog frequency (10m -> 15m). Optimize loop logic. |
| **Gmail Read Ops** | 20,000 / day | < 500 / day | We scan headers only; full body read is lazy-loaded. |
| **URL Fetch (AI)** | 20,000 / day | < 100 / day | Low impact. |

## 2. Credential Rotation (Gemini API)
The AI system relies on an API Key stored in **Script Properties**.
**Rotation Procedure:**
1.  Generate new key in `Google AI Studio`.
2.  Open Apps Script Editor > **Project Settings** (Gear Icon).
3.  Scroll to **Script Properties**.
4.  Update value for `GEMINI_API_KEY`.
5.  **No Deployment Required:** Script properties are injected at runtime.

## 3. Ledger Reconciliation Protocol
To verify system integrity, a quarterly audit is recommended:
1.  **Extract Data:** Export `Allocation Log` and `Raw Form Responses` to CSV.
2.  **Pivot:** Sum `Allocation Log.Amount` grouped by `Pledge ID`.
3.  **Compare:** Ensure `Sum(Allocations) <= Pledge Total`.
4.  **Audit Check:** If any discrepancy exists, cross-reference the `Audit Trail` sheet for manual overrides (Status changes) that bypassed the locking mechanism.

## 4. Emergency Procedures

### The "Kill Switch" (Stop Automation)
If the AI behaves erratically (e.g., hallucinated verifications):
1.  Go to `Extensions` > `Apps Script` > `Triggers`.
2.  **Delete** the time-driven trigger for `runWatchdog`.
3.  **Result:** The system reverts to **Manual Verification Mode**. Volunteers can still allocate funds, but Verification must be done by humans reading emails and manually updating the Sheet status.

### Stuck State Recovery
**Symptom:** A valid Pledge does not appear in the Sidebar search.
**Cause:** Data corruption in `Donations Tracker` row (often due to copy-paste errors breaking formulas).
**Fix:**
1.  Identify the broken row index.
2.  Delete the values in Columns `B:E` (The helper formula columns).
3.  Copy the formulas from the row above and Paste Special > Formulas Only.
