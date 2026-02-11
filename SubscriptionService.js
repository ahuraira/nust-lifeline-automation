/**
 * SubscriptionService.js
 * 
 * [V59] Manages recurring monthly pledge subscriptions.
 * 
 * Key Features:
 * - Creates and manages subscription records
 * - Generates installment schedules
 * - Sends payment reminders (Day 0, Day +7)
 * - Tracks payments and updates statuses
 * - Supports dual hostel intimation mode (individual + batched)
 */

// ==================================================================================
//                              SUBSCRIPTION CREATION
// ==================================================================================

/**
 * Creates a new monthly pledge subscription.
 * Called from processNewPledge when pledge type is "Monthly Recurring".
 * 
 * @param {string} pledgeId The parent pledge ID
 * @param {string} donorEmail Donor's email address
 * @param {string} donorName Donor's display name
 * @param {number} monthlyAmount PKR per month
 * @param {number} numStudents Number of students to support
 * @param {number} durationMonths Total months commitment
 * @param {string} chapter Donor's chapter/location
 * @param {string} [linkedStudentIds=''] Comma-separated CMS IDs (optional)
 * @returns {string} The generated subscription ID
 */
function createSubscription(pledgeId, donorEmail, donorName, monthlyAmount,
    numStudents, durationMonths, chapter, linkedStudentIds = '') {
    const FUNC_NAME = 'createSubscription';

    try {
        const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
        const subWs = ss.getSheetByName(SHEETS.monthlyPledges.name);
        const instWs = ss.getSheetByName(SHEETS.installments.name);

        // [V59.3] Use pledgeId directly as subscriptionId - no separate SUB- prefix
        // This ensures unified ID hierarchy: Pledge ID = Subscription ID
        const subscriptionId = pledgeId;

        // 2. Calculate start date (1st of current month - pledge month)
        // [V59.4] First installment is for the month the pledge is made
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), 1);

        // 3. Create subscription record (with email threading columns initialized)
        const subRow = [
            subscriptionId,                           // A: subscriptionId (same as pledgeId)
            pledgeId,                                 // B: pledgeId (FK to Donations)
            donorEmail,                               // C: donorEmail
            donorName,                                // D: donorName
            monthlyAmount,                            // E: monthlyAmount
            numStudents,                              // F: numStudents
            durationMonths,                           // G: durationMonths
            startDate,                                // H: startDate
            startDate,                                // I: nextDueDate (initially = start)
            0,                                        // J: paymentsReceived
            0,                                        // K: paymentsExpected (will increment)
            0,                                        // L: amountReceived
            0,                                        // M: amountExpected
            STATUS.subscription.ACTIVE,               // N: status
            '',                                       // O: lastReminderDate
            '',                                       // P: lastReceiptDate
            chapter,                                  // Q: chapter
            linkedStudentIds,                         // R: linkedStudentIds
            '',                                       // S: notes
            '',                                       // T: welcomeEmailId [V59.3]
            ''                                        // U: completionEmailId [V59.3]
        ];
        subWs.appendRow(subRow);

        // 4. Pre-generate installment records
        for (let i = 1; i <= durationMonths; i++) {
            const dueDate = new Date(startDate.getFullYear(), startDate.getMonth() + (i - 1), 1);
            const installmentId = `${subscriptionId}-M${String(i).padStart(2, '0')}`;

            const instRow = [
                installmentId,                          // A: installmentId (PLEDGE-ID-M01)
                subscriptionId,                         // B: subscriptionId (same as pledgeId)
                i,                                      // C: monthNumber
                dueDate,                                // D: dueDate
                STATUS.installment.PENDING,             // E: status
                '',                                     // F: receiptId
                0,                                      // G: amountReceived
                '',                                     // H: receivedDate
                0,                                      // I: reminderCount
                '',                                     // J: lastReminderDate
                '',                                     // K: reminderEmailId [V59.3]
                ''                                      // L: receiptConfirmId [V59.3]
            ];
            instWs.appendRow(instRow);
        }

        // 5. Send welcome email
        sendSubscriptionWelcomeEmail(subscriptionId, donorEmail, donorName,
            monthlyAmount, numStudents, durationMonths, startDate, chapter);

        // 6. Log audit event
        logAuditEvent(
            'SYSTEM',
            'NEW_SUBSCRIPTION',
            subscriptionId,
            `New Monthly Subscription Created (${durationMonths} months)`,
            '',
            STATUS.subscription.ACTIVE,
            { pledgeId, monthlyAmount, numStudents }
        );

        writeLog('SUCCESS', FUNC_NAME,
            `Created subscription ${subscriptionId} with ${durationMonths} installments`, pledgeId);

        return subscriptionId;

    } catch (e) {
        writeLog('ERROR', FUNC_NAME, `Failed to create subscription: ${e.message}`, pledgeId);
        throw e;
    }
}

/**
 * Sends the welcome email with payment schedule.
 */
function sendSubscriptionWelcomeEmail(subscriptionId, donorEmail, donorName,
    monthlyAmount, numStudents, durationMonths, startDate, chapter) {
    const FUNC_NAME = 'sendSubscriptionWelcomeEmail';

    // Skip if template not configured
    if (!TEMPLATES.subscriptionWelcome || TEMPLATES.subscriptionWelcome.includes('ENTER')) {
        writeLog('WARN', FUNC_NAME, 'Subscription welcome template not configured. Skipping email.');
        return;
    }

    const emailData = {
        donorName: donorName,
        subscriptionId: subscriptionId,
        monthlyAmount: monthlyAmount.toLocaleString(),
        numStudents: numStudents,
        durationMonths: durationMonths,
        totalAmount: (monthlyAmount * durationMonths).toLocaleString(),
        firstDueDate: Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'MMMM d, yyyy'),
        chapter: chapter || ''
    };

    const emailContent = createEmailFromTemplate(TEMPLATES.subscriptionWelcome, emailData);

    // [V59.3] Send email and store message ID for threading
    const messageId = sendEmailAndGetId(
        donorEmail,
        emailContent.subject,
        emailContent.htmlBody,
        { from: EMAILS.processOwner, cc: getCCString(chapter) }
    );

    // [V59.3] Store welcome email ID in Monthly Pledges for threading all future emails
    if (messageId) {
        try {
            const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
            const formattedId = formatIdForSheet(messageId);

            // Store in Monthly Pledges sheet
            const subWs = ss.getSheetByName(SHEETS.monthlyPledges.name);
            const subRow = findRowByValue(subWs, SHEETS.monthlyPledges.cols.subscriptionId, subscriptionId);
            if (subRow) {
                subWs.getRange(subRow.row, SHEETS.monthlyPledges.cols.welcomeEmailId).setValue(formattedId);
            }

            // [V59.4] Also store in main Form Responses sheet (pledgeEmailId) for audit trail
            const rawWs = ss.getSheetByName(SHEETS.donations.name);
            const donRow = findRowByValue(rawWs, SHEETS.donations.cols.pledgeId, subscriptionId);
            if (donRow) {
                rawWs.getRange(donRow.row, SHEETS.donations.cols.pledgeEmailId).setValue(formattedId);
            }

            writeLog('INFO', FUNC_NAME, `Stored welcome email ID for threading: ${messageId}`, subscriptionId);
        } catch (e) {
            writeLog('WARN', FUNC_NAME, `Failed to store welcome email ID: ${e.message}`, subscriptionId);
        }
    }

    writeLog('INFO', FUNC_NAME, `Welcome email sent to ${donorEmail}`, subscriptionId);
}


// ==================================================================================
//                              REMINDER SYSTEM
// ==================================================================================

/**
 * Daily trigger function to check for due payments and send reminders.
 * Run this via a time-driven trigger at 9:00 AM.
 */
function runSubscriptionReminders() {
    const FUNC_NAME = 'runSubscriptionReminders';
    writeLog('INFO', FUNC_NAME, 'Starting subscription reminder job...');

    try {
        const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
        const subWs = ss.getSheetByName(SHEETS.monthlyPledges.name);
        const instWs = ss.getSheetByName(SHEETS.installments.name);

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to midnight

        const instData = instWs.getDataRange().getValues();
        const subData = subWs.getDataRange().getValues();

        // Build subscription map for quick lookup
        const subMap = new Map();
        for (let i = 1; i < subData.length; i++) {
            const subId = subData[i][SHEETS.monthlyPledges.cols.subscriptionId - 1];
            subMap.set(subId, {
                row: i + 1,
                data: subData[i]
            });
        }

        let remindersSent = 0;
        const reminderDays = MAPPINGS.subscription.reminderDays || [0, 7];
        const maxReminders = MAPPINGS.subscription.maxReminders || 2;

        // Check each installment
        for (let i = 1; i < instData.length; i++) {
            const instRow = i + 1;
            const subscriptionId = instData[i][SHEETS.installments.cols.subscriptionId - 1];
            const dueDate = new Date(instData[i][SHEETS.installments.cols.dueDate - 1]);
            const status = instData[i][SHEETS.installments.cols.status - 1];
            const reminderCount = instData[i][SHEETS.installments.cols.reminderCount - 1] || 0;

            // Skip if already received or maxed out on reminders
            if (status === STATUS.installment.RECEIVED) continue;
            if (reminderCount >= maxReminders) continue;

            // Get subscription data
            const sub = subMap.get(subscriptionId);
            if (!sub || sub.data[SHEETS.monthlyPledges.cols.status - 1] !== STATUS.subscription.ACTIVE) {
                continue; // Skip inactive subscriptions
            }

            // Calculate days since due
            dueDate.setHours(0, 0, 0, 0);
            const daysSinceDue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

            // Check if we should send a reminder today
            const shouldRemind = reminderDays.includes(daysSinceDue);

            if (shouldRemind) {
                // Send reminder
                const donorEmail = sub.data[SHEETS.monthlyPledges.cols.donorEmail - 1];
                const donorName = sub.data[SHEETS.monthlyPledges.cols.donorName - 1];
                const monthlyAmount = sub.data[SHEETS.monthlyPledges.cols.monthlyAmount - 1];
                const monthNumber = instData[i][SHEETS.installments.cols.monthNumber - 1];
                const totalMonths = sub.data[SHEETS.monthlyPledges.cols.durationMonths - 1];

                const templateId = daysSinceDue === 0 ?
                    TEMPLATES.subscriptionReminder : TEMPLATES.subscriptionOverdue;

                if (templateId && !templateId.includes('ENTER')) {
                    const reminderMsgId = sendSubscriptionReminderEmail(
                        subscriptionId, donorEmail, donorName,
                        monthlyAmount, monthNumber, totalMonths, templateId
                    );

                    // Update installment record
                    instWs.getRange(instRow, SHEETS.installments.cols.reminderCount).setValue(reminderCount + 1);
                    instWs.getRange(instRow, SHEETS.installments.cols.lastReminderDate).setValue(new Date());
                    instWs.getRange(instRow, SHEETS.installments.cols.status).setValue(STATUS.installment.REMINDED);
                    // [V59.4] Store reminder email ID
                    if (reminderMsgId) {
                        instWs.getRange(instRow, SHEETS.installments.cols.reminderEmailId).setValue(formatIdForSheet(reminderMsgId));
                    }

                    // Update subscription lastReminderDate
                    subWs.getRange(sub.row, SHEETS.monthlyPledges.cols.lastReminderDate).setValue(new Date());

                    remindersSent++;
                }
            }
        }

        writeLog('INFO', FUNC_NAME, `Reminder job complete. Sent ${remindersSent} reminders.`);

    } catch (e) {
        writeLog('ERROR', FUNC_NAME, `Reminder job failed: ${e.message}`);
    }
}

/**
 * Sends a payment reminder email.
 * [V59.4] Returns message ID for storage in installment record.
 */
function sendSubscriptionReminderEmail(subscriptionId, donorEmail, donorName,
    monthlyAmount, monthNumber, totalMonths, templateId) {
    const FUNC_NAME = 'sendSubscriptionReminderEmail';

    const emailData = {
        donorName: donorName,
        subscriptionId: subscriptionId,
        monthlyAmount: monthlyAmount.toLocaleString(),
        monthNumber: monthNumber,
        totalMonths: totalMonths,
        remainingMonths: totalMonths - monthNumber + 1
    };

    const emailContent = createEmailFromTemplate(templateId, emailData);

    const messageId = sendEmailAndGetId(
        donorEmail,
        emailContent.subject,
        emailContent.htmlBody,
        { from: EMAILS.processOwner }
    );

    writeLog('INFO', FUNC_NAME, `Reminder sent for month ${monthNumber}`, subscriptionId);
    return messageId;
}

/**
 * Checks for overdue subscriptions and updates their status.
 * Run daily after reminders.
 */
function checkOverdueSubscriptions() {
    const FUNC_NAME = 'checkOverdueSubscriptions';

    try {
        const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
        const subWs = ss.getSheetByName(SHEETS.monthlyPledges.name);
        const instWs = ss.getSheetByName(SHEETS.installments.name);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const overdueThreshold = MAPPINGS.subscription.overdueThresholdDays || 14;
        const lapsedThreshold = MAPPINGS.subscription.lapsedThresholdDays || 30;

        const instData = instWs.getDataRange().getValues();
        const subData = subWs.getDataRange().getValues();

        // Track subscriptions with overdue installments
        const overdueMap = new Map(); // subscriptionId -> maxDaysOverdue

        for (let i = 1; i < instData.length; i++) {
            const status = instData[i][SHEETS.installments.cols.status - 1];
            if (status === STATUS.installment.RECEIVED) continue;

            const dueDate = new Date(instData[i][SHEETS.installments.cols.dueDate - 1]);
            dueDate.setHours(0, 0, 0, 0);
            const daysSinceDue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

            if (daysSinceDue >= overdueThreshold) {
                const subscriptionId = instData[i][SHEETS.installments.cols.subscriptionId - 1];
                const existing = overdueMap.get(subscriptionId) || 0;
                overdueMap.set(subscriptionId, Math.max(existing, daysSinceDue));

                // Mark installment as Missed if past threshold
                if (daysSinceDue >= lapsedThreshold && status !== STATUS.installment.MISSED) {
                    instWs.getRange(i + 1, SHEETS.installments.cols.status).setValue(STATUS.installment.MISSED);
                }
            }
        }

        // Update subscription statuses
        for (let i = 1; i < subData.length; i++) {
            const subscriptionId = subData[i][SHEETS.monthlyPledges.cols.subscriptionId - 1];
            const currentStatus = subData[i][SHEETS.monthlyPledges.cols.status - 1];

            if (currentStatus === STATUS.subscription.COMPLETED ||
                currentStatus === STATUS.subscription.CANCELLED) {
                continue;
            }

            const maxDaysOverdue = overdueMap.get(subscriptionId) || 0;
            let newStatus = currentStatus;

            if (maxDaysOverdue >= lapsedThreshold) {
                newStatus = STATUS.subscription.LAPSED;
            } else if (maxDaysOverdue >= overdueThreshold) {
                newStatus = STATUS.subscription.OVERDUE;
            } else if (currentStatus === STATUS.subscription.OVERDUE) {
                // Was overdue but payment received - back to Active
                newStatus = STATUS.subscription.ACTIVE;
            }

            if (newStatus !== currentStatus) {
                subWs.getRange(i + 1, SHEETS.monthlyPledges.cols.status).setValue(newStatus);

                logAuditEvent(
                    'SYSTEM',
                    'SUBSCRIPTION_STATUS_CHANGE',
                    subscriptionId,
                    `Subscription status updated (${maxDaysOverdue} days overdue)`,
                    currentStatus,
                    newStatus
                );
            }
        }

        writeLog('INFO', FUNC_NAME, `Checked ${overdueMap.size} overdue subscriptions.`);

    } catch (e) {
        writeLog('ERROR', FUNC_NAME, `Overdue check failed: ${e.message}`);
    }
}


// ==================================================================================
//                              PAYMENT RECORDING
// ==================================================================================

/**
 * Links a receipt to a subscription installment and updates totals.
 * Called from processIncomingReceipts when receipt matches a subscription.
 * 
 * @param {string} subscriptionId The subscription ID
 * @param {string} receiptId The receipt ID from Receipt Log
 * @param {number} amount Verified amount
 * @returns {boolean} Success status
 */
function recordSubscriptionPayment(subscriptionId, receiptId, amount) {
    const FUNC_NAME = 'recordSubscriptionPayment';

    try {
        const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
        const subWs = ss.getSheetByName(SHEETS.monthlyPledges.name);
        const instWs = ss.getSheetByName(SHEETS.installments.name);
        const donationsWs = ss.getSheetByName(SHEETS.donations.name);

        // 1. Find subscription
        const subRow = findRowByValue(subWs, SHEETS.monthlyPledges.cols.subscriptionId, subscriptionId);
        if (!subRow) {
            writeLog('ERROR', FUNC_NAME, `Subscription not found: ${subscriptionId}`);
            return false;
        }

        // 2. Find the oldest PENDING or REMINDED installment (FIFO)
        const instData = instWs.getDataRange().getValues();
        let targetInstRow = null;
        let targetInstId = null;
        let targetMonthNumber = null;

        for (let i = 1; i < instData.length; i++) {
            if (instData[i][SHEETS.installments.cols.subscriptionId - 1] === subscriptionId) {
                const status = instData[i][SHEETS.installments.cols.status - 1];
                if (status === STATUS.installment.PENDING ||
                    status === STATUS.installment.REMINDED ||
                    status === STATUS.installment.MISSED) {
                    targetInstRow = i + 1;
                    targetInstId = instData[i][SHEETS.installments.cols.installmentId - 1];
                    targetMonthNumber = instData[i][SHEETS.installments.cols.monthNumber - 1];
                    break; // Take the first (oldest) pending installment
                }
            }
        }

        if (!targetInstRow) {
            writeLog('WARN', FUNC_NAME, `No pending installment found for ${subscriptionId}. Payment may be extra.`);
            // Could create a credit or handle as extra payment
            return false;
        }

        // 3. Update installment record
        instWs.getRange(targetInstRow, SHEETS.installments.cols.status).setValue(STATUS.installment.RECEIVED);
        instWs.getRange(targetInstRow, SHEETS.installments.cols.receiptId).setValue(receiptId);
        instWs.getRange(targetInstRow, SHEETS.installments.cols.amountReceived).setValue(amount);
        instWs.getRange(targetInstRow, SHEETS.installments.cols.receivedDate).setValue(new Date());

        // [V59.3] 3b. Log to Receipt Log (same as one-time pledges)
        // This ensures balance = Receipt Log verified - Allocation Log allocated
        try {
            const receiptsWs = ss.getSheetByName(SHEETS.receipts.name);
            if (receiptsWs) {
                receiptsWs.appendRow([
                    `${targetInstId}-R${Date.now().toString().slice(-4)}`, // Unique Receipt ID
                    subscriptionId, // Pledge ID (subscription uses same ID)
                    new Date(),     // Timestamp
                    new Date(),     // Email Date
                    new Date(),     // Transfer Date
                    amount,         // Amount Declared
                    amount,         // Verified Amount
                    'HIGH',         // Confidence (system verified)
                    receiptId || '', // File URL if available
                    `Installment ${targetMonthNumber}`, // Filename/Description
                    'VALID'         // Status
                ]);
                writeLog('INFO', FUNC_NAME, `Receipt logged for ${targetInstId}`, subscriptionId);
            }
        } catch (receiptErr) {
            writeLog('WARN', FUNC_NAME, `Failed to log receipt: ${receiptErr.message}`, subscriptionId);
        }

        // 4. Update subscription totals
        const currentReceived = subRow.data[SHEETS.monthlyPledges.cols.paymentsReceived - 1] || 0;
        const currentAmount = subRow.data[SHEETS.monthlyPledges.cols.amountReceived - 1] || 0;
        const durationMonths = subRow.data[SHEETS.monthlyPledges.cols.durationMonths - 1];

        subWs.getRange(subRow.row, SHEETS.monthlyPledges.cols.paymentsReceived).setValue(currentReceived + 1);
        subWs.getRange(subRow.row, SHEETS.monthlyPledges.cols.amountReceived).setValue(currentAmount + amount);
        subWs.getRange(subRow.row, SHEETS.monthlyPledges.cols.lastReceiptDate).setValue(new Date());

        // [V59.3] 4b. Update Response Sheet (same columns as one-time pledges for dashboard)
        const pledgeId = subRow.data[SHEETS.monthlyPledges.cols.pledgeId - 1];
        const donationsRow = findRowByValue(donationsWs, SHEETS.donations.cols.pledgeId, pledgeId);
        if (donationsRow) {
            const prevVerified = Number(donationsRow.data[SHEETS.donations.cols.verifiedTotalAmount - 1]) || 0;
            const newVerified = prevVerified + amount;
            const totalPledge = Number(donationsRow.data[SHEETS.donations.cols.pledgeOutstanding - 1]) + prevVerified;
            const newOutstanding = Math.max(0, totalPledge - newVerified);

            donationsWs.getRange(donationsRow.row, SHEETS.donations.cols.verifiedTotalAmount).setValue(newVerified);
            donationsWs.getRange(donationsRow.row, SHEETS.donations.cols.pledgeOutstanding).setValue(newOutstanding);

            // [V59.3 FIX] balanceAmount = Verified - Allocated (use real-time helper)
            // Update row data with new verified amount for accurate calculation
            const updatedRowData = [...donationsRow.data];
            updatedRowData[SHEETS.donations.cols.verifiedTotalAmount - 1] = newVerified;
            const cashBalance = getRealTimePledgeBalance(pledgeId, updatedRowData);
            donationsWs.getRange(donationsRow.row, SHEETS.donations.cols.balanceAmount).setValue(cashBalance);

            writeLog('INFO', FUNC_NAME, `Updated Response Sheet: Verified=${newVerified}, Outstanding=${newOutstanding}, CashBalance=${cashBalance}`, subscriptionId);
        }

        // 5. Calculate next due date (1st of next month after this installment's due)
        const completedInstallments = currentReceived + 1;
        if (completedInstallments >= durationMonths) {
            // All payments received - mark as Completed
            subWs.getRange(subRow.row, SHEETS.monthlyPledges.cols.status).setValue(STATUS.subscription.COMPLETED);
            sendSubscriptionCompletedEmail(subscriptionId);

            logAuditEvent(
                'SYSTEM',
                'SUBSCRIPTION_COMPLETED',
                subscriptionId,
                `Subscription completed after ${durationMonths} payments`,
                STATUS.subscription.ACTIVE,
                STATUS.subscription.COMPLETED,
                { totalReceived: currentAmount + amount }
            );
        } else {
            // Calculate next due date
            const startDate = new Date(subRow.data[SHEETS.monthlyPledges.cols.startDate - 1]);
            const nextDueDate = new Date(startDate.getFullYear(), startDate.getMonth() + completedInstallments, 1);
            subWs.getRange(subRow.row, SHEETS.monthlyPledges.cols.nextDueDate).setValue(nextDueDate);

            // If was overdue, reset to Active
            const currentStatus = subRow.data[SHEETS.monthlyPledges.cols.status - 1];
            if (currentStatus === STATUS.subscription.OVERDUE || currentStatus === STATUS.subscription.LAPSED) {
                subWs.getRange(subRow.row, SHEETS.monthlyPledges.cols.status).setValue(STATUS.subscription.ACTIVE);
            }
        }

        // 6. Send confirmation email and store message ID
        const confirmMsgId = sendSubscriptionReceiptConfirmEmail(subscriptionId, amount, targetMonthNumber,
            completedInstallments, durationMonths);
        // [V59.4] Store receipt confirm email ID in installment record
        if (confirmMsgId && targetInstRow) {
            instWs.getRange(targetInstRow, SHEETS.installments.cols.receiptConfirmId).setValue(formatIdForSheet(confirmMsgId));
        }

        // 7. Handle hostel intimation based on config
        processSubscriptionHostelIntimation(subscriptionId, receiptId, amount);

        // [V59.3] Log with installmentId as targetId for full traceability
        logAuditEvent(
            'SYSTEM',
            'SUBSCRIPTION_PAYMENT',
            targetInstId, // Use installmentId as targetId for specific payment tracking
            `Payment ${completedInstallments}/${durationMonths} received`,
            STATUS.installment.PENDING,
            STATUS.installment.RECEIVED,
            { subscriptionId, receiptId, amount, pledgeId }
        );

        writeLog('SUCCESS', FUNC_NAME,
            `Recorded payment ${completedInstallments}/${durationMonths} for ${subscriptionId} (Installment: ${targetInstId})`);

        return true;

    } catch (e) {
        writeLog('ERROR', FUNC_NAME, `Failed to record payment: ${e.message}`, subscriptionId);
        return false;
    }
}

/**
 * Sends confirmation email after payment received.
 * [V59.4] Returns message ID for storage in installment record.
 */
function sendSubscriptionReceiptConfirmEmail(subscriptionId, amount, monthNumber,
    completedPayments, totalMonths) {
    const FUNC_NAME = 'sendSubscriptionReceiptConfirmEmail';

    // Skip if template not configured
    if (!TEMPLATES.subscriptionReceiptConfirm || TEMPLATES.subscriptionReceiptConfirm.includes('ENTER')) {
        return null;
    }

    const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
    const subWs = ss.getSheetByName(SHEETS.monthlyPledges.name);
    const subRow = findRowByValue(subWs, SHEETS.monthlyPledges.cols.subscriptionId, subscriptionId);

    if (!subRow) return null;

    const donorEmail = subRow.data[SHEETS.monthlyPledges.cols.donorEmail - 1];
    const donorName = subRow.data[SHEETS.monthlyPledges.cols.donorName - 1];
    const nextDueDate = subRow.data[SHEETS.monthlyPledges.cols.nextDueDate - 1];

    const emailData = {
        donorName: donorName,
        subscriptionId: subscriptionId,
        amount: amount.toLocaleString(),
        monthNumber: monthNumber,
        completedPayments: completedPayments,
        remainingPayments: totalMonths - completedPayments,
        totalMonths: totalMonths,
        nextDueDate: nextDueDate ?
            Utilities.formatDate(new Date(nextDueDate), Session.getScriptTimeZone(), 'MMMM d, yyyy') :
            'N/A (Completed)'
    };

    const emailContent = createEmailFromTemplate(TEMPLATES.subscriptionReceiptConfirm, emailData);

    const messageId = sendEmailAndGetId(
        donorEmail,
        emailContent.subject,
        emailContent.htmlBody,
        { from: EMAILS.processOwner }
    );

    writeLog('INFO', FUNC_NAME, `Confirmation sent for payment ${completedPayments}/${totalMonths}`, subscriptionId);
    return messageId;
}

/**
 * Sends the subscription completed thank you email.
 * [V59.4] Stores completion email ID in subscription record.
 */
function sendSubscriptionCompletedEmail(subscriptionId) {
    const FUNC_NAME = 'sendSubscriptionCompletedEmail';

    if (!TEMPLATES.subscriptionCompleted || TEMPLATES.subscriptionCompleted.includes('ENTER')) {
        return;
    }

    const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
    const subWs = ss.getSheetByName(SHEETS.monthlyPledges.name);
    const subRow = findRowByValue(subWs, SHEETS.monthlyPledges.cols.subscriptionId, subscriptionId);

    if (!subRow) return;

    const donorEmail = subRow.data[SHEETS.monthlyPledges.cols.donorEmail - 1];
    const donorName = subRow.data[SHEETS.monthlyPledges.cols.donorName - 1];
    const totalAmount = subRow.data[SHEETS.monthlyPledges.cols.amountReceived - 1];
    const numStudents = subRow.data[SHEETS.monthlyPledges.cols.numStudents - 1];
    const durationMonths = subRow.data[SHEETS.monthlyPledges.cols.durationMonths - 1];

    const emailData = {
        donorName: donorName,
        subscriptionId: subscriptionId,
        totalAmount: totalAmount.toLocaleString(),
        numStudents: numStudents,
        durationMonths: durationMonths
    };

    const emailContent = createEmailFromTemplate(TEMPLATES.subscriptionCompleted, emailData);

    const messageId = sendEmailAndGetId(
        donorEmail,
        emailContent.subject,
        emailContent.htmlBody,
        { from: EMAILS.processOwner }
    );

    // [V59.4] Store completion email ID for reference
    if (messageId) {
        subWs.getRange(subRow.row, SHEETS.monthlyPledges.cols.completionEmailId).setValue(formatIdForSheet(messageId));
    }

    writeLog('INFO', FUNC_NAME, `Completion email sent for ${subscriptionId}`);
}


// ==================================================================================
//                              HOSTEL INTIMATION
// ==================================================================================

/**
 * Handles hostel intimation based on configured mode.
 * Mode: 'individual' | 'batched' | 'both'
 */
function processSubscriptionHostelIntimation(subscriptionId, receiptId, amount) {
    const FUNC_NAME = 'processSubscriptionHostelIntimation';
    const mode = MAPPINGS.subscription.hostelIntimationMode || 'both';

    if (mode === 'individual' || mode === 'both') {
        sendIndividualSubscriptionIntimation(subscriptionId, receiptId, amount);
    }

    // Batched intimation is handled by runBatchedHostelIntimation() trigger
    writeLog('INFO', FUNC_NAME, `Hostel intimation mode: ${mode}`, subscriptionId);
}

/**
 * Sends individual hostel intimation for a subscription payment.
 * [V59.3] Uses same batchIntimationToHostel template as one-time pledges for consistent formatting.
 */
function sendIndividualSubscriptionIntimation(subscriptionId, receiptId, amount) {
    const FUNC_NAME = 'sendIndividualSubscriptionIntimation';

    // [V59.3] Use same template as one-time pledges
    if (!TEMPLATES.batchIntimationToHostel ||
        TEMPLATES.batchIntimationToHostel.includes('ENTER')) {
        writeLog('WARN', FUNC_NAME, 'batchIntimationToHostel template not configured. Skipping.');
        return;
    }

    const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
    const subWs = ss.getSheetByName(SHEETS.monthlyPledges.name);
    const subRow = findRowByValue(subWs, SHEETS.monthlyPledges.cols.subscriptionId, subscriptionId);

    if (!subRow) return;

    const donorName = subRow.data[SHEETS.monthlyPledges.cols.donorName - 1];
    const donorEmail = subRow.data[SHEETS.monthlyPledges.cols.donorEmail - 1];
    const linkedStudentIds = subRow.data[SHEETS.monthlyPledges.cols.linkedStudentIds - 1] || '';
    const chapter = subRow.data[SHEETS.monthlyPledges.cols.chapter - 1];
    const pledgeId = subRow.data[SHEETS.monthlyPledges.cols.pledgeId - 1];

    // Get student details for the linked student(s)
    const primaryStudentId = linkedStudentIds.split(',')[0]?.trim() || '';
    let studentDetails = { name: 'N/A', cms: primaryStudentId, school: 'N/A' };

    if (primaryStudentId) {
        const studentWs = SpreadsheetApp.openById(CONFIG.ssId_confidential).getSheetByName(SHEETS.students.name);
        const studentRow = findRowByValue(studentWs, SHEETS.students.cols.cms, primaryStudentId);
        if (studentRow) {
            studentDetails = {
                name: studentRow.data[SHEETS.students.cols.name - 1] || 'N/A',
                cms: primaryStudentId,
                school: studentRow.data[SHEETS.students.cols.school - 1] || 'N/A'
            };
        }
    }

    // Build donorTable (same format as one-time)
    const donorTableHtml = `<table style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; font-family: Arial, sans-serif; font-size: 10pt;">
        <thead>
            <tr>
                <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: left; font-weight: bold;">Donor</th>
                <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: left; font-weight: bold;">Amount</th>
                <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: left; font-weight: bold;">Pledge ID</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${donorName}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">PKR ${amount.toLocaleString()}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${pledgeId} (Monthly)</td>
            </tr>
        </tbody>
    </table>`;

    // Build studentTable (same format as one-time)
    const studentTableHtml = `<table style="width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; font-family: Arial, sans-serif; font-size: 10pt;">
        <thead>
            <tr>
                <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: left; font-weight: bold;">Field</th>
                <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2; text-align: left; font-weight: bold;">Value</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">Name</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${studentDetails.name}</td>
            </tr>
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">CMS ID</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${studentDetails.cms}</td>
            </tr>
            <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">School</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${studentDetails.school}</td>
            </tr>
        </tbody>
    </table>`;

    const templateData = {
        batchId: `${subscriptionId}-${new Date().getTime()}`,
        studentName: studentDetails.name,
        studentId: studentDetails.cms,
        cmsId: studentDetails.cms,
        studentIds: linkedStudentIds || studentDetails.cms,
        studentTable: studentTableHtml,
        receiptCount: '1',
        donorTable: donorTableHtml,
        totalAmount: amount.toLocaleString(),
        mailtoLink: '', // No mailto for individual intimation
        school: studentDetails.school
    };

    const emailContent = createEmailFromTemplate(TEMPLATES.batchIntimationToHostel, templateData);
    const recipients = [EMAILS.ddHostels, EMAILS.uao].filter(e => e).join(',');

    if (recipients) {
        sendEmailAndGetId(
            recipients,
            emailContent.subject,
            emailContent.htmlBody,
            { from: EMAILS.processOwner, cc: getCCString(chapter) }
        );

        writeLog('INFO', FUNC_NAME, `Individual intimation sent for ${subscriptionId} using unified template`);
    }
}

/**
 * Monthly batch intimation trigger.
 * Run on the configured batch day (default: 10th of each month).
 */
function runBatchedHostelIntimation() {
    const FUNC_NAME = 'runBatchedHostelIntimation';
    const mode = MAPPINGS.subscription.hostelIntimationMode || 'both';
    const batchDay = MAPPINGS.subscription.batchIntimationDay || 10;

    // Only run on batch day (or if mode is 'batched')
    const today = new Date();
    if (today.getDate() !== batchDay && mode !== 'batched') {
        return; // Not batch day and not batch-only mode
    }

    writeLog('INFO', FUNC_NAME, 'Starting batched hostel intimation...');

    try {
        const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
        const instWs = ss.getSheetByName(SHEETS.installments.name);
        const subWs = ss.getSheetByName(SHEETS.monthlyPledges.name);

        const instData = instWs.getDataRange().getValues();
        const subData = subWs.getDataRange().getValues();

        // Build subscription lookup
        const subMap = new Map();
        for (let i = 1; i < subData.length; i++) {
            const subId = subData[i][SHEETS.monthlyPledges.cols.subscriptionId - 1];
            subMap.set(subId, subData[i]);
        }

        // Find all payments received this month
        const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

        const batchPayments = [];
        let totalAmount = 0;

        for (let i = 1; i < instData.length; i++) {
            const status = instData[i][SHEETS.installments.cols.status - 1];
            if (status !== STATUS.installment.RECEIVED) continue;

            const receivedDate = new Date(instData[i][SHEETS.installments.cols.receivedDate - 1]);
            if (receivedDate >= thisMonth && receivedDate < nextMonth) {
                const subscriptionId = instData[i][SHEETS.installments.cols.subscriptionId - 1];
                const amount = instData[i][SHEETS.installments.cols.amountReceived - 1];
                const sub = subMap.get(subscriptionId);

                if (sub) {
                    batchPayments.push({
                        subscriptionId: subscriptionId,
                        donorName: sub[SHEETS.monthlyPledges.cols.donorName - 1],
                        amount: amount,
                        studentIds: sub[SHEETS.monthlyPledges.cols.linkedStudentIds - 1] || 'Pool'
                    });
                    totalAmount += amount;
                }
            }
        }

        if (batchPayments.length === 0) {
            writeLog('INFO', FUNC_NAME, 'No payments to batch for this month.');
            return;
        }

        // Generate batch email
        const monthName = Utilities.formatDate(thisMonth, Session.getScriptTimeZone(), 'MMMM yyyy');

        let bodyHtml = `<h2>Monthly Subscription Payments Summary - ${monthName}</h2>`;
        bodyHtml += `<p>Total Payments: <strong>${batchPayments.length}</strong> | Total Amount: <strong>PKR ${totalAmount.toLocaleString()}</strong></p>`;
        bodyHtml += '<table border="1" style="border-collapse: collapse; width: 100%;">';
        bodyHtml += '<tr><th>Subscription ID</th><th>Donor</th><th>Amount</th><th>Students</th></tr>';

        for (const p of batchPayments) {
            bodyHtml += `<tr>
        <td>${p.subscriptionId}</td>
        <td>${p.donorName}</td>
        <td>PKR ${p.amount.toLocaleString()}</td>
        <td>${p.studentIds}</td>
      </tr>`;
        }
        bodyHtml += '</table>';

        const recipients = [EMAILS.ddHostels, EMAILS.uao].filter(e => e).join(',');

        if (recipients) {
            sendEmailAndGetId(
                recipients,
                `[NUST Lifeline] Monthly Subscription Summary - ${monthName}`,
                bodyHtml,
                { from: EMAILS.processOwner }
            );

            writeLog('SUCCESS', FUNC_NAME,
                `Batched intimation sent: ${batchPayments.length} payments, PKR ${totalAmount.toLocaleString()}`);
        }

    } catch (e) {
        writeLog('ERROR', FUNC_NAME, `Batched intimation failed: ${e.message}`);
    }
}


// ==================================================================================
//                              STUDENT MANAGEMENT
// ==================================================================================

/**
 * Updates the linked students for a subscription.
 * Allowed if MAPPINGS.subscription.allowStudentChange is true.
 * 
 * @param {string} subscriptionId The subscription ID
 * @param {string} newStudentIds Comma-separated CMS IDs
 * @returns {boolean} Success status
 */
function updateSubscriptionStudents(subscriptionId, newStudentIds) {
    const FUNC_NAME = 'updateSubscriptionStudents';

    if (!MAPPINGS.subscription.allowStudentChange) {
        writeLog('WARN', FUNC_NAME, 'Student changes not allowed by config.', subscriptionId);
        return false;
    }

    try {
        const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
        const subWs = ss.getSheetByName(SHEETS.monthlyPledges.name);
        const subRow = findRowByValue(subWs, SHEETS.monthlyPledges.cols.subscriptionId, subscriptionId);

        if (!subRow) {
            writeLog('ERROR', FUNC_NAME, 'Subscription not found.', subscriptionId);
            return false;
        }

        const oldStudentIds = subRow.data[SHEETS.monthlyPledges.cols.linkedStudentIds - 1];

        subWs.getRange(subRow.row, SHEETS.monthlyPledges.cols.linkedStudentIds).setValue(newStudentIds);

        logAuditEvent(
            getActor(),
            'SUBSCRIPTION_STUDENT_CHANGE',
            subscriptionId,
            'Linked students updated',
            oldStudentIds,
            newStudentIds
        );

        writeLog('SUCCESS', FUNC_NAME, `Students updated: ${newStudentIds}`, subscriptionId);
        return true;

    } catch (e) {
        writeLog('ERROR', FUNC_NAME, `Failed to update students: ${e.message}`, subscriptionId);
        return false;
    }
}


// ==================================================================================
//                              UTILITY FUNCTIONS
// ==================================================================================

/**
 * Finds a subscription by pledge ID.
 * @param {string} pledgeId The pledge ID
 * @returns {Object|null} Subscription data or null
 */
function findSubscriptionByPledgeId(pledgeId) {
    const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
    const subWs = ss.getSheetByName(SHEETS.monthlyPledges.name);
    return findRowByValue(subWs, SHEETS.monthlyPledges.cols.pledgeId, pledgeId);
}

/**
 * Gets the actor (current user email or SYSTEM).
 */
function getActor() {
    try {
        return Session.getActiveUser().getEmail() || 'SYSTEM';
    } catch (e) {
        return 'SYSTEM';
    }
}


// ==================================================================================
//                              TEST FUNCTIONS
// ==================================================================================

/**
 * Test function: Create a sample subscription.
 */
function test_createSubscription() {
    const result = createSubscription(
        'PLEDGE-2026-TEST',
        'test@example.com',
        'Test Donor',
        50000,
        2,
        6,
        'Test Chapter',
        ''
    );
    Logger.log('Created subscription: ' + result);
}

/**
 * Test function: Run reminders manually.
 */
function test_runReminders() {
    runSubscriptionReminders();
    checkOverdueSubscriptions();
}

/**
 * Test function: Run batched intimation manually.
 */
function test_runBatchedIntimation() {
    runBatchedHostelIntimation();
}
