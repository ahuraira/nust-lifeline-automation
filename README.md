# NUST Lifeline: Automated Funds Management System

## Executive Summary
The **NUST Lifeline System** is an engineered financial workflow solution designed to automate the lifecycle of student financial aid. By integrating **Google Workspace** services with **AI-driven logic**, the system aims to solve the "last mile" problem of fund allocation: efficient matching, verification, and forensic auditability.

**Core Objective:** To replace fragmented manual processes with a deterministic, event-driven architecture that ensures 100% transactional integrity and significantly reduces administrative latency.

---

## 🏛️ Core Architectural Principles

This system was architected around five key engineering pillars:

### 1. Cost-Effective Resource Management ("Serverless ERP")
Instead of deploying capital-intensive enterprise software, we utilized the scalable, serverless infrastructure of **Google Apps Script**. This provides enterprise-grade capabilities—RBAC, locking, and audit trails—with zero marginal infrastructure cost.

### 2. Privacy by Design: The "Two-Workbook" Model
Student financial data is sensitive PII. We implemented a strict **Air-Gap Architecture**:
*   **Confidential DB:** Accessible only to core administrators.
*   **Operations DB:** Accessible to volunteers.
*   **The Bridge:** A server-side proxy service that sanitizes data in real-time, allowing volunteers to allocate funds based on "Need" without ever exposing private contact details.

### 3. Transactional Integrity (Optimistic Concurrency)
To address the "Double-Spend" race condition inherent in collaborative spreadsheets, we implemented **Optimistic Concurrency Control**.
*   All financial writes are wrapped in `LockService` transactions.
*   The system enforces a **Read-Validate-Write** cycle within a strict lock window, guaranteeing that two volunteers cannot allocate the same funds simultaneously.

### 4. Agentic Workflow (The AI Watchdog)
We deployed **Google Gemini 3** not just as a text generator, but as a logical reasoning engine.
*   **Semantic Verification:** The AI analyzes unstructured email replies from university officials to determine if funds are "Verified," "Queried," or "Ambiguous."
*   **Reconciliation:** It cross-references email content against the pending Allocation Log to close specific line items automatically.

### 5. Human-in-the-Loop Governance
While automation handles data ingress and routing, key financial decisions remain strictly human-gated. The architecture uses automation to *prepare* the decision context (via a custom Sidebar UI) but requires explicit human approval to *commit* funds.

---

## 📈 Technical Impact Metrics

*   **Latency Reduction:** Automated receipt processing and email threading reduced the administrative cycle from days to minutes.
*   **Error Elimination:** Concurrency locking has mathematically eliminated the possibility of fund overallocation.
*   **Auditability:** A dedicated, immutable **Audit Service** logs every state change with Actor, Timestamp, and Metadata, providing forensic-level traceability.

---

## 📚 Documentation Suite

The documentation is structured to support distinct stakeholder personas:

| Module | Document | Target Audience |
| :--- | :--- | :--- |
| **System Decisions** | **[🧠 Architectural Decisions (ADR)](docs/ADR.md)** | Architects, Case Study Authors |
| **System Design** | **[🏗️ Architecture & Security](docs/ARCHITECTURE.md)** | Technical Leads, Security Officers |
| **AI Design** | **[🤖 The AI Watchdog Engine](docs/AI_WATCHDOG.md)** | AI Engineers, Data Scientists |
| **Codebase** | **[⚙️ Technical Deep Dive](docs/TECHNICAL_DEEP_DIVE.md)** | Developers, Maintainers |
| **Operations** | **[📘 User & Volunteer Guide](docs/USER_GUIDE.md)** | Volunteers, Admin Staff |
| **Maintenance** | **[🔧 Maintenance & Recovery](docs/MAINTENANCE_RECOVERY.md)** | DevOps, Site Reliability Engineers |

---

## 🚀 Deployment Guide

1.  **Clone:** `clasp clone <script-id>`
2.  **Configuration:** Update `Config.js` with specific Sheet and Folder IDs.
3.  **Deploy:** `clasp push`
4.  **Triggers:** Configure Time-Driven triggers for `runWatchdog` (15m) and `processIncomingReceipts` (10m).

---

*Version 53*
