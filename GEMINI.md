# NUST Lifeline: Automated Hostel Funds Management System

## Project Overview
**NUST Lifeline** is a serverless ERP system built on Google Workspace (Google Apps Script, Sheets, Gmail, Drive) to automate the management of student financial aid. It handles the complete lifecycle from donor pledges to verified hostel fund disbursements.

**Key Goals:**
- **Zero-Cost Infrastructure:** Runs entirely on Google's consumer/workspace tier.
- **Privacy by Design:** Physically segregates student identity data from operational financial data ("Air-gapped" architecture).
- **Transactional Integrity:** Uses optimistic concurrency control (locking) to prevent double-spending of funds.
- **AI Integration:** Uses Gemini 3 Flash for multimodal receipt analysis and semantic email verification.

## Architecture
The system follows a "Sanitized Proxy" pattern to protect student privacy.

- **Data Layer:**
    - `[CONFIDENTIAL] Student Database`: Contains sensitive PII (Name, Need, School). Accessible *only* by the script in Admin Context.
    - `[OPERATIONS] Hostel Fund Tracker`: Contains operational data (CMS IDs, Financials, Logs). Accessible by volunteers.
- **Compute Layer:**
    - Google Apps Script (V8 Runtime) handles all logic, triggers, and API integrations.
- **AI Layer:**
    - `LLM_Service.js` interfaces with Google Gemini 3 Flash for parsing receipts (images) and classifying email replies.
- **UI Layer:**
    - HTML Sidebar (`Sidebar.html`) embedded in Google Sheets for volunteers to allocate funds safely.

## Key Files & Directories

### Core Logic
- `Config.js`: Central configuration file. **Single Source of Truth** for IDs, email addresses, and constants.
- `CoreLogic.js`: Business logic for balance calculations, state transitions, and sanity checks.
- `StatusConfig.js`: Finite State Machine (FSM) definitions for Pledge and Allocation statuses.
- `StateManager.js`: Validates state transitions defined in `StatusConfig.js`.

### Workflows
- `DonorWorkflow.js`: Handles new form submissions (pledges) and sends initial confirmation emails.
- `AdminWorkflow.js`: Manages the "Allocation" phase (Sidebar interactions) and receipt processing.
- `Watchdog.js`: Autonomous cron job that scans Gmail for replies from Hostel Admin and "closes the loop" (verifies transactions).

### Services
- `LLM_Service.js`: Integration with Gemini API for multimodal tasks.
- `SidebarService.js`: RPC layer handling communication between the HTML Sidebar and the server-side script.
- `AuditService.js`: Logs every significant action to an immutable "Audit Trail" sheet.
- `studentServices.js`: The "Proxy" service that fetches sensitive data from the Confidential sheet and sanitizes it before returning it to the Sidebar.

### Documentation
- `docs/ARCHITECTURE.md`: Deep dive into security models and data flow.
- `docs/USER_GUIDE.md`: Operational manual for volunteers.
- `docs/API_REFERENCE.md`: Technical documentation for functions.

## Building and Deployment
The project uses `clasp` (Command Line Apps Script) for local development and deployment.

### Prerequisites
- Node.js & npm
- `@google/clasp` installed globally (`npm install -g @google/clasp`)
- A `.clasp.json` file linking to the Google Apps Script project.

### Common Commands
- **Push code to Google:**
  ```bash
  clasp push
  ```
- **Pull code from Google:**
  ```bash
  clasp pull
  ```
- **Open project in browser:**
  ```bash
  clasp open
  ```

## Development Conventions
- **Configuration:** NEVER hardcode IDs or emails. Always add them to `Config.js` and reference `CONFIG.section.key`.
- **Logging:** Use `console.log` for debug info (viewable in Apps Script dashboard) and `AuditService.logAuditEvent()` for business-critical events that must be persisted.
- **Locking:** Any function that writes to the ledger (Sheets) MUST utilize `LockService` to prevent race conditions.
- **Privacy:** NEVER return the full student object to the client-side (`Sidebar.html`). Always use the sanitized response from `studentServices.js`.
