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
  ssId_operations: '1V8pQ7l7Rz0I2PTyQIHUCVnqI8qNyr_gQVPF1rEg3w6s',       // For "[OPERATIONS] Hostel Fund Tracker"
  ssId_confidential: '1FBmrmAuS5eddtkbILpKkmwoms1jIA6Tz3ejCvEFUUB4', // For "[CONFIDENTIAL] Student Database"

  // --- Folder IDs ---
  folderId_receipts: '1UGhJvsulQ02Q0b6Ugr8zLzIIApg8Ptwp',
  folderId_emailTemplates: '1H-69TXZjZVRkZM404kc5IyLMCzc8gwO-', // Optional, but good for organization

  // --- Standard Pledge Amounts (PKR) ---
  pledgeAmounts: {
    oneMonth: 25000,
    oneSemester: 135000,
    oneYear: 270000,
    fourYears: 1080000
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
      donorName: 3,           // Column C: Name
      affiliation: 4,         // Column D: School/ College of Contributor
      mobile: 5,              // Column E: Mobile Contact
      cityCountry: 6,         // Column F: City / Country
      isZakat: 7,             // Column G: Are you donating as Zakat?
      studentPref: 8,         // Column H: Student Support Preference
      programPref: 9,         // Column I: Program Support - Preference
      degreePref: 10,         // Column J: Degree Support - Preference
      // --- [V59] Subscription Form Fields ---
      pledgeType: 11,         // Column K: Pledge Type (One-Time / Monthly Recurring)
      monthlyAmount: 12,      // Column L: Monthly Contribution Amount
      monthlyDuration: 13,    // Column M: Number of Months
      numStudents: 14,        // Column N: Number of Students to Support
      duration: 15,           // Column O: Select the Duration for Hostel Support
      reqReceipt: 16,         // Column P: Requirement of Receipt
      // --- Manually Added Columns in the RAW Sheet ---
      pledgeId: 17,           // Column Q: PLEDGE-YYYY-NNN
      status: 18,             // Column R: Current status
      proofLink: 19,          // Column S: Proof of Payment
      dateProofReceived: 20,  // Column T: Date Proof Received
      notes: 21,              // Column U: Notes
      cmsIdAssigned: 22,      // Column V: For volunteer to enter student ID
      amountAllocated: 23,    // Column W: For volunteer to enter amount
      aiComments: 24,         // Column X: AI Comments
      receiptMessageId: 25,   // Column Y: Donor Receipt Message ID (Gmail)
      pledgeEmailId: 26,      // Column Z: Pledge Confirmation Message ID (for threading)
      // --- V2: Multi-Receipt Support ---
      verifiedTotalAmount: 27, // Column AA: Sum of all verified receipts
      balanceAmount: 28,       // Column AB: Cash Balance (Verified - Allocated)
      pledgeOutstanding: 29,   // Column AC: Pledge GAP (Pledge Amount - Verified)
      actualTransferDate: 30   // Column AD: Latest Transfer Date from Receipt (auto-populated)
    }
  },
  // --- Donations Tracker (QUERY View) ---
  donationsTracker: {
    name: 'Donations Tracker',
    cols: {
      pledgeId: 7 // Column G in the Tracker sheet
    }
  },
  // --- [NEW] Receipt Log (Multi-Receipt Support) ---
  receipts: {
    name: 'Receipt Log',
    cols: {
      receiptId: 1,        // Column A: Unique ID (e.g. P101-R1)
      pledgeId: 2,         // Column B
      timestamp: 3,        // Column C: When we processed it
      emailDate: 4,        // Column D: Email Date
      transferDate: 5,     // Column E: Extracted from Image
      amountDeclared: 6,   // Column F: What user said
      amountVerified: 7,   // Column G: What LLM saw
      confidence: 8,       // Column H: High/Med/Low
      driveLink: 9,        // Column I: Link to file
      filename: 10,       // Column J: File Name
      status: 11           // Column K: Valid/Duplicate/Rejected
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
      status: 9,            // Column I
      degreeCategory: 10,   // Column J
      program: 11           // Column K
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
      studentConfirmDate: 17,   // Column Q (Student Confirmation - Future)
      batchId: 18,           // Column R [NEW] Shared ID for Batch Allocations
      installmentId: 19      // Column S [V59.3] Monthly subscription installment reference
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
  },
  // --- [V59.3] AI Audit Log for tracking AI analysis ---
  aiAuditLog: {
    name: 'AI Audit Log',
    cols: {
      timestamp: 1,          // A: When AI was called
      pledgeId: 2,           // B: PLEDGE-YYYY-NNN
      sender: 3,             // C: Email sender
      subject: 4,            // D: Email subject
      category: 5,           // E: AI category (RECEIPT, QUESTION, etc.)
      summary: 6,            // F: AI summary
      receiptsFound: 7,      // G: Number of valid receipts
      totalAmount: 8,        // H: Total verified amount
      confidence: 9,         // I: AI confidence score
      receiptLinks: 10,      // J: Links to receipt files
      rawResponse: 11,       // K: Full AI response (JSON)
      processingTime: 12,    // L: Time taken (ms)
      success: 13            // M: TRUE/FALSE
    }
  },
  // --- [V59] Monthly Pledge Subscription Sheets ---
  monthlyPledges: {
    name: 'Monthly Pledges',
    cols: {
      subscriptionId: 1,      // Column A: PLEDGE-YYYY-NNN (same as pledgeId, no separate SUB-)
      pledgeId: 2,            // Column B: FK to Donations (same value as subscriptionId)
      donorEmail: 3,          // Column C
      donorName: 4,           // Column D
      monthlyAmount: 5,       // Column E: PKR per month
      numStudents: 6,         // Column F
      durationMonths: 7,      // Column G: Total commitment
      startDate: 8,           // Column H: First payment due
      nextDueDate: 9,         // Column I: Computed
      paymentsReceived: 10,   // Column J: Count
      paymentsExpected: 11,   // Column K: Elapsed months
      amountReceived: 12,     // Column L: Sum verified
      amountExpected: 13,     // Column M: monthly × expected
      status: 14,             // Column N: Active/Overdue/Completed
      lastReminderDate: 15,   // Column O
      lastReceiptDate: 16,    // Column P
      chapter: 17,            // Column Q
      linkedStudentIds: 18,   // Column R: Comma-separated CMS IDs
      notes: 19,              // Column S
      welcomeEmailId: 20,     // Column T [V59.3] Thread root for all subscription emails
      completionEmailId: 21   // Column U [V59.3] Final completion email ID
    }
  },
  installments: {
    name: 'Pledge Installments',
    cols: {
      installmentId: 1,       // Column A: PLEDGE-2025-001-M03 (pledgeId + month suffix)
      subscriptionId: 2,      // Column B: FK to Monthly Pledges (same as pledgeId)
      monthNumber: 3,         // Column C: 1, 2, 3...
      dueDate: 4,             // Column D
      status: 5,              // Column E: Pending/Reminded/Received/Missed
      receiptId: 6,           // Column F: FK to Receipt Log
      amountReceived: 7,      // Column G
      receivedDate: 8,        // Column H
      reminderCount: 9,       // Column I: 0, 1, 2
      lastReminderDate: 10,   // Column J
      reminderEmailId: 11,    // Column K [V59.3] Last reminder message ID
      receiptConfirmId: 12    // Column L [V59.3] Receipt confirmation message ID
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
  ddHostels: 'ddhostels@nust.edu.pk',
  uao: '',
  processOwner: 'sohail.sarwar@seecs.edu.pk', // The "From" address for automated emails
  alwaysCC: ['nustlifelinecampaign@gmail.com', 'sohail.sarwar@seecs.edu.pk']     // Default email to ALWAYS CC on every email
};


// SECTION 5: MAPPINGS & DYNAMIC DATA
// -----------------------------------------------------------------------------------------
// Use this section for data that might change, like adding new chapters.
// You can now use an Array ['email1', 'email2'] for multiple leads.

const MAPPINGS = {
  chapterLeads: {
    'Test': ['uk.lead1@email.com', 'uk.lead2@email.com'], // Example of multiple leads
    'Other': ['irtizaali@gmail.com', 'uaurakzai@gmail.com', 'zulqarnain.ahmad@gmail.com', 'haroonraees@gmail.com', 'abc.huraira@gmail.com', 'khurrum@itelsol.com', 'rasool.ahmad@gmai.com', 'president.ksa@alumni.nust.edu.pk', 'maamerzaman@gmail.com', 'sanamay1@gmail.com'] // Fallback for unlisted chapters
  },

  // --- [V59] Subscription Configuration ---
  subscription: {
    // Reminder Schedule (days relative to due date)
    reminderDays: [0, 7],             // Day 0: due date, Day +7: gentle reminder
    maxReminders: 2,                   // Stop after 2 reminders
    overdueThresholdDays: 14,          // Mark as Overdue after this many days
    lapsedThresholdDays: 30,           // Mark as Lapsed after this many days

    // Hostel Intimation Mode: 'individual' | 'batched' | 'both'
    hostelIntimationMode: 'both',
    batchIntimationDay: 10,            // Day of month to send batched intimation

    // Student Linking
    allowStudentChange: true           // Whether donors can change linked students
  }
};


// SECTION 6: EMAIL TEMPLATE GOOGLE DOC IDs
// -----------------------------------------------------------------------------------------
// This uses the "Option C" method. Each email template is a separate Google Doc.
// To get the ID, open the Google Doc and copy the long string of characters from the URL.

const TEMPLATES = {
  // --- Core Templates (from Production) ---
  pledgeConfirmation: '18uGt2E36TUyR1nPy0gwrFtCps8ct8VnZd0K8aqTW-T4',
  hostelVerification: '1am2-qVGLXE2ALCnQR6MQK5hUfeRURaHwRXyH0RjylYQ',
  donorAllocationNotification: '1pEqEi8dipiiqvHgj-_h28nEe0eRyt39Ceje-rrc-z5U',
  hostelMailto: '1beC3R7xnDAc8XH-pstaif-f2zOVX-fA4UjVzau7JkfY',
  finalDonorNotification: 'ENTER_FINAL_DONOR_NOTIFICATION_DOC_ID_HERE',
  studentPaymentNotification: 'ENTER_STUDENT_PAYMENT_NOTIFICATION_DOC_ID_HERE',
  batchIntimationToHostel: '19-8SNfj34ZaYWUOyATFGzeEQPrp7ifhZvZ5W-A27evY',
  batchDonorMailtoBody: '1X2jH_ZkIraOhmNXdPqdf2Aukd0J9mO4TMl1jKuOZBuU',

  // --- [V59] Subscription Email Templates (from Dev) ---
  subscriptionWelcome: '1XQEtiV8fqSLnt0dCEY6Klce8df0qOobPlVu0eP5RrL8',
  subscriptionReminder: '1ChoPRqv0uvlCb8OFJlTw23NA6jx5oFnf7EJdjpOvqZc',
  subscriptionReceiptConfirm: '1P94dFVX5vUkxGgOWSsjOICAVvB1dwi__aggtQT2RSLw',
  subscriptionOverdue: '1K4j9Tu8qYrmoFHy9y9uTCVWUAsou_cEI8JWZSVJEP3k',
  subscriptionCompleted: '1IZDqduRIfcBiPQOWCSlORF1X6_irF8VTdLsu0QojnBI',
  subscriptionHostelIntimation: '1LJW9JKIDV7yo088Z2jV54nL_mQ8Gwbi0cRzUSVJcCI8'
};

// SECTION 7: FORM QUESTION TITLES (KEYS)
// -----------------------------------------------------------------------------------------
// Helper for mapping Google Form Question Titles (e.namedValues) to our code.
// Update these if the Question Title on the Form changes.

const FORM_KEYS = {
  // Exact text from the Google Form Question Title
  donorName: 'Name',
  donorEmail: 'Email Address',
  country: 'City / Country (of Contributor)',
  duration: 'Select the Duration for Hostel Support',

  // --- [V59] Subscription Form Fields ---
  pledgeType: 'Pledge Type',                          // 'One-Time' or 'Monthly Recurring'
  monthlyAmount: 'Monthly Contribution Amount',       // PKR per month
  monthlyDuration: 'Number of Months',                // Duration in months
  numStudents: 'Number of Students to Support'        // How many students
};