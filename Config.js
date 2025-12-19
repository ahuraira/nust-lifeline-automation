// =========================================================================================
//                             MASTER CONFIGURATION FILE
//        This file contains all settings for the Hostel Fund Automation Project.
//
//        To update settings, email templates, or workflow statuses, edit the values 
//        in this file. Avoid making changes directly in the other script files.
// =========================================================================================


// SECTION 1: SPREADSHEET & FOLDER IDENTIFIERS
// -----------------------------------------------------------------------------------------
// To get an ID, open the file or folder in Google Drive/Sheets. The ID is the long 
// string of characters in the URL.
// e.g., docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit

const CONFIG = {
  // --- File IDs ---
  ssId_operations: '1o1myu2ADAdfs-CEQBpd1CkILpP7tX5surOg3Fw1Xebw',       // For "[OPERATIONS] Hostel Fund Tracker"
  ssId_confidential: '1eGAsIbeEeFjikmJI2JtCuQexVrotbzWQK1b2IhnBt5Y', // For "[CONFIDENTIAL] Student Database"

  // --- Folder IDs ---
  folderId_receipts: '1Lz5FvbuToCJmIWCuBf3SDNZ8kapxkBxZ',
  folderId_emailTemplates: '1S1RRlYvj8t2g_nUGupNuRIRPyY-rIeNP', // Optional, but good for organization

  // --- Standard Pledge Amounts (PKR) ---
  pledgeAmounts: {
    oneMonth: 25000,
    oneSemester: 150000,
    oneYear: 300000,
    fourYears: 1200000
  },

  // --- AI Configuration ---
  GEMINI_MODEL: 'gemini-3-flash-preview' // Centralized AI Model Name
};


// SECTION 2: SHEET & COLUMN CONFIGURATION
// -----------------------------------------------------------------------------------------
// Maps sheet names and column numbers. If you add/remove a column in your sheet, 
// you only need to update the number here, not the entire script.

const SHEETS = {
  // --- Raw Form Responses (Source of truth) ---
  donations: {
    name: '(RAW) Form Responses', // CRITICAL UPDATE: This MUST point to the raw data sheet.
    cols: {
      timestamp: 1,         // Column A
      donorEmail: 2,          // Column B
      donorName: 3,           // Column C
      isZakat: 4,             // Column D
      affiliation: 5,         // Column E
      cityCountry: 6,         // Column F (Used for Chapter mapping)
      mobile: 7,              // Column G
      studentPref: 8,         // Column H
      programPref: 9,         // Column I
      degreePref: 10,         // Column J
      duration: 11,           // Column K
      reqReceipt: 12,         // Column L
      // --- Manually Added Columns in the RAW Sheet ---
      pledgeId: 13,           // Column M -> CRITICAL UPDATE: Reflects new column position.
      status: 14,             // Column N -> CRITICAL UPDATE: Reflects new column position.
      proofLink: 15,          // Column O -> CRITICAL UPDATE: Reflects new column position.
      dateProofReceived: 16,  // Column P -> CRITICAL UPDATE: Reflects new column position.
      notes: 17,              // Column Q -> CRITICAL UPDATE: Reflects new column position.
      cmsIdAssigned: 18,      // Column R -> For volunteer to enter student ID.
      amountAllocated: 19,     // Column S -> For volunteer to enter amount.
      actualTransferDate: 20,  // Column T -> Extracted date or "As per attached receipt"
      receiptMessageId: 21,    // Column U -> For Audit Trail (Gmail Message ID)
      pledgeEmailId: 22        // Column V -> Initial Pledge Confirmation ID (for threading)
    }
  },
  // --- Donations Tracker (QUERY View) ---
  donationsTracker: {
    name: 'Donations Tracker',
    cols: {
      pledgeId: 7 // Column G in the Tracker sheet
    }
  },
  students: {
    name: 'Student Database',
    cols: {
      cmsId: 1,             // Column A
      name: 2,              // Column B
      gender: 3,            // Column C
      school: 4,            // Column D
      degree: 5,            // Column E
      totalDue: 6,          // Column F
      amountCleared: 7,     // Column G
      pendingAmount: 8,     // Column H
      status: 9             // Column I
    }
  },
  allocations: {
    name: 'Allocation Log',
    cols: {
      allocId: 1,           // Column A
      cmsId: 2,
      pledgeId: 3,
      pledgeAmount: 4,      // [NEW] Total Pledge Amount
      amount: 5,            // Allocated Amount
      date: 6,
      status: 7,            // Column G -> This column drives the admin workflow.
      hostelIntimationId: 8,   // Column H
      hostelIntimationDate: 9, // Column I
      donorAllocId: 10,        // Column J (Intermediate)
      donorAllocDate: 11,      // Column K
      hostelReplyId: 12,       // Column L matches user request "Hostel Reply ID"
      hostelReplyDate: 13,     // Column M matches user request "Hostel Reply Time"
      donorNotifyId: 14,       // Column N (Final Loop Close)
      donorNotifyDate: 15,     // Column O (Final Loop Close)
      studentConfirmId: 16,    // Column P (Student Confirmation - Future)
      studentConfirmDate: 17   // Column Q (Student Confirmation - Future)
    }
  },
  log: {
    name: 'Log',
    cols: {
      pledgeId: 5 // Column E
    }
  },
  audit: {
    name: 'Audit Trail',
    cols: {
      timestamp: 1,
      actor: 2,
      eventType: 3,
      targetId: 4,
      action: 5,
      previousValue: 6,
      newValue: 7,
      metadata: 8
    }
  }
};


// SECTION 3: WORKFLOW STATUS DEFINITIONS
// -----------------------------------------------------------------------------------------
// These exact text values should be used in your Sheet's dropdown menus for the Status columns.

// --- STATUS CONFIGURATION MOVED TO StatusConfig.js ---
// The STATUS object is now defined in StatusConfig.js to support FSM logic.
// Please refer to that file for all status constants.


// SECTION 4: CORE EMAIL ADDRESSES
// -----------------------------------------------------------------------------------------

const EMAILS = {
  ddHostels: 'ddhostel@university.edu',
  uao: 'uao@university.edu',
  processOwner: 'nustlifelinecampaign@gmail.com', // The "From" address for automated emails
  alwaysCC: 'nustlifelinecampaign@gmail.com'      // Default email to ALWAYS CC on every email
};


// SECTION 5: MAPPINGS & DYNAMIC DATA
// -----------------------------------------------------------------------------------------
// Use this section for data that might change, like adding new chapters.
// You can now use an Array ['email1', 'email2'] for multiple leads.

const MAPPINGS = {
  chapterLeads: {
    'North America': 'na.lead@email.com',
    'United Kingdom': ['uk.lead1@email.com', 'uk.lead2@email.com'], // Example of multiple leads
    'Local Chapter': 'local.lead@email.com',
    'Other': 'default.lead@email.com' // Fallback for unlisted chapters
  }
};


// SECTION 6: EMAIL TEMPLATE GOOGLE DOC IDs
// -----------------------------------------------------------------------------------------
// This uses the "Option C" method. Each email template is a separate Google Doc.
// To get the ID, open the Google Doc and copy the long string of characters from the URL.

const TEMPLATES = {
  pledgeConfirmation: '1WsVPRjz0QFNcYVoaQXASkH3UJtdmbug82TQ9fqPE46Y',
  hostelVerification: '1t666h1OjFtqlippCnXiVUGmlG-A0yCpTwEfMG5HP6EM',
  donorAllocationNotification: '1uX6rgb9EMr5HlwhzewDN9LvEEjHcUJJ3plH6B55GuRk', // Placeholder
  finalDonorNotification: 'ENTER_FINAL_DONOR_NOTIFICATION_DOC_ID_HERE',
  studentPaymentNotification: 'ENTER_STUDENT_PAYMENT_NOTIFICATION_DOC_ID_HERE'
};