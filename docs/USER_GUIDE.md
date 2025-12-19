# 📘 User Operations Guide

This guide is for the volunteers and administrators managing the NUST Lifeline Fund.

---

## 1. The Dashboard Overview
Your main workspace is the **Donations Tracker** sheet.
*   **White Rows:** New, unallocated pledges.
*   **Green Rows:** Fully allocated pledges.
*   **Yellow/Orange Rows:** Donors who have pledged but not yet sent proof.

---

## 2. Dealing with New Pledges
1.  **Check Email:** The system automatically sends a "Where to Pay" email to the donor.
2.  **Wait for Proof:** When the donor replies with a screenshot, the **AI Processor** handles it.
    *   You will see the Status change to `Proof Submitted` automatically.
    *   A link to the receipt will appear in the "Proof" column.

---

## 3. Allocating Funds (The Sidebar)
Once a pledge is `Proof Submitted`:
1.  Click the custom menu **"Hostel Admin"** > **"Review Allocation"**.
2.  A Sidebar will open on the right.
3.  **Select a Row:** Click on any donor row in the tracker. The sidebar will load their live balance.
4.  **Find a Student:** Type a CMS ID (e.g., `123456`) in the sidebar search.
    *   The system will show the student's Name, School, and **Pending Need**.
5.  **Allocate:** Enter the amount (e.g., `50000`).
6.  **Submit:** Click "Allocate".
    *   The system will lock the transaction, deduct the balance, and email the hostel immediately.

---

## 4. Handling "Watchdog" Alerts
Sometimes, the Hostel's reply is confusing (e.g., *"We received this, but the shortage is different"*). The AI will not guess; it will flag it for you.
1.  **Check Inbox:** You will receive an email: `[ACTION REQUIRED] Ambiguous Hostel Reply`.
2.  **Read the Reasoning:** The email will say *why* the AI was unsure.
3.  **Manual Fix:**
    *   Open the linked email thread.
    *   Decide if it's Verified or not.
    *   Manually change the Status in the **Allocation Log** to `Hostel Verified` or `Hostel Query`.
    *   (Your manual change is logged in the Audit Trail).

---

## 5. The Audit Trail
**Do not edit this sheet.**
The `Audit Trail` sheet is a permanent record. If you are auditing a specific Pledge:
1.  Go to `Data` > `Filter Views`.
2.  Filter Column D (`Target ID`) by the Pledge ID (e.g., `PLEDGE-2025-101`).
3.  You will see every step: Form Submission -> Receipt Upload -> Allocation -> Hostel Verification -> Closure.
