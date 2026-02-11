/**
 * SetupTemplates.js
 * 
 * [V59] Automated Email Template Generator
 * 
 * This script automatically creates Google Doc email templates if the IDs 
 * in Config.js are empty or contain placeholder text.
 * 
 * Usage:
 * 1. Run setupAllSubscriptionTemplates() from Apps Script editor
 * 2. Copy the generated IDs from the logs
 * 3. Update Config.js with the new IDs
 * 
 * The script creates properly formatted Google Docs with:
 * - Subject line (as first heading)
 * - Email body with placeholders
 */

/**
 * Main function to set up all subscription email templates.
 * Run this manually from Apps Script editor.
 * 
 * @returns {Object} Map of template names to document IDs
 */
function setupAllSubscriptionTemplates() {
    const FUNC_NAME = 'setupAllSubscriptionTemplates';
    writeLog('INFO', FUNC_NAME, 'Starting automated template setup...');

    const templates = {
        subscriptionWelcome: null,
        subscriptionReminder: null,
        subscriptionReceiptConfirm: null,
        subscriptionOverdue: null,
        subscriptionCompleted: null,
        subscriptionHostelIntimation: null
    };

    const results = {};

    // Check each template
    for (const templateName in templates) {
        const existingId = TEMPLATES[templateName];

        // Check if template needs to be created
        if (needsCreation(existingId)) {
            writeLog('INFO', FUNC_NAME, `Creating template: ${templateName}`);

            try {
                const docId = createTemplate(templateName);
                results[templateName] = docId;
                writeLog('SUCCESS', FUNC_NAME, `Created ${templateName}: ${docId}`);
            } catch (e) {
                writeLog('ERROR', FUNC_NAME, `Failed to create ${templateName}: ${e.message}`);
                results[templateName] = 'ERROR: ' + e.message;
            }
        } else {
            writeLog('INFO', FUNC_NAME, `Template ${templateName} already exists: ${existingId}`);
            results[templateName] = existingId + ' (existing)';
        }
    }

    // Print summary
    Logger.log('\n========================================');
    Logger.log('TEMPLATE SETUP COMPLETE');
    Logger.log('========================================\n');
    Logger.log('Copy these IDs to Config.js → TEMPLATES:\n');

    for (const name in results) {
        Logger.log(`${name}: '${results[name]}',`);
    }

    Logger.log('\n========================================\n');

    writeLog('SUCCESS', FUNC_NAME, 'Template setup complete. Check logs for IDs.');

    return results;
}

/**
 * Checks if a template ID needs to be created.
 * @param {string} templateId The existing template ID
 * @returns {boolean} True if needs creation
 */
function needsCreation(templateId) {
    if (!templateId) return true;
    if (templateId.includes('ENTER')) return true;
    if (templateId.length < 20) return true; // Google Doc IDs are longer
    return false;
}

/**
 * Creates a Google Doc template based on the template name.
 * @param {string} templateName The name of the template (e.g., 'subscriptionWelcome')
 * @returns {string} The document ID
 */
function createTemplate(templateName) {
    const content = getTemplateContent(templateName);

    if (!content) {
        throw new Error(`No content defined for template: ${templateName}`);
    }

    // Create the document
    const doc = DocumentApp.create(content.title);
    const docId = doc.getId();
    const body = doc.getBody();

    // Clear default content
    body.clear();

    // Add subject line as heading
    const subjectParagraph = body.appendParagraph(content.subject);
    subjectParagraph.setHeading(DocumentApp.ParagraphHeading.HEADING1);

    // Add blank line
    body.appendParagraph('');

    // Add body content (split by paragraphs)
    const paragraphs = content.body.split('\n');
    for (const para of paragraphs) {
        if (para.trim()) {
            body.appendParagraph(para.trim());
        } else {
            body.appendParagraph(''); // Keep blank lines
        }
    }

    // Move to proper folder (optional - if you have a templates folder)
    try {
        const file = DriveApp.getFileById(docId);
        const folders = DriveApp.getFoldersByName('Email Templates');
        if (folders.hasNext()) {
            const folder = folders.next();
            file.moveTo(folder);
        }
    } catch (e) {
        // Folder doesn't exist, leave in root
    }

    return docId;
}

/**
 * Returns the content for each template.
 * @param {string} templateName The template name
 * @returns {Object} {title, subject, body}
 */
function getTemplateContent(templateName) {
    const templates = {
        subscriptionWelcome: {
            title: 'Subscription Welcome Email',
            subject: '🎉 Welcome to NUST Lifeline Monthly Giving!',
            body: `Dear {{donorName}},

Thank you for committing to support NUST students through monthly giving!

📅 YOUR PLEDGE SCHEDULE
━━━━━━━━━━━━━━━━━━━━━━━
Monthly Amount: PKR {{monthlyAmount}}
Students Supported: {{numStudents}}
Duration: {{durationMonths}} months
Total Commitment: PKR {{totalAmount}}
First Payment Due: {{firstDueDate}}

💳 HOW TO PAY EACH MONTH
━━━━━━━━━━━━━━━━━━━━━━━
Please transfer to:
Account Title: NUST Lifeline Campaign
Bank: [Your Bank Name]
Account Number: [Your Account Number]

Reference: {{subscriptionId}}

After each transfer, simply reply to this email with a screenshot of your transfer receipt.

📧 REMINDERS
━━━━━━━━━━━━━━━━━━━━━━━
We'll send you a friendly reminder a few days before each monthly payment is due.

💚 YOUR IMPACT
━━━━━━━━━━━━━━━━━━━━━━━
Your monthly support will help {{numStudents}} NUST students stay in university hostel throughout their semester. You're making education accessible!

Thank you for your commitment to NUST students! 🙏

NUST Lifeline Campaign
nustlifelinecampaign@gmail.com`
        },

        subscriptionReminder: {
            title: 'Monthly Payment Reminder',
            subject: '[Action Required] Your Monthly Pledge to NUST Lifeline - Month {{monthNumber}}',
            body: `Dear {{donorName}},

It's time for your monthly contribution to NUST Lifeline!

📊 PAYMENT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━
Amount Due: PKR {{monthlyAmount}}
Payment: Month {{monthNumber}} of {{totalMonths}}
Subscription ID: {{subscriptionId}}

Your previous payment(s) have already helped students stay in university. This month's payment will continue that impact!

💳 PAYMENT INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━
Transfer to:
Account: NUST Lifeline Campaign
Reference: {{subscriptionId}}

After transfer, reply to this email with your receipt screenshot.

Thank you for your continued support! 💚

Remaining Payments: {{remainingMonths}}

NUST Lifeline Campaign
nustlifelinecampaign@gmail.com`
        },

        subscriptionReceiptConfirm: {
            title: 'Monthly Payment Received',
            subject: '✅ Payment Received - Thank You!',
            body: `Dear {{donorName}},

Thank you! We've received your monthly payment.

✅ PAYMENT CONFIRMED
━━━━━━━━━━━━━━━━━━━━━━━
Amount: PKR {{amount}}
Month: {{monthNumber}} of {{totalMonths}}
Subscription ID: {{subscriptionId}}

📊 YOUR PROGRESS
━━━━━━━━━━━━━━━━━━━━━━━
Completed Payments: {{completedPayments}} of {{totalMonths}}
Remaining Payments: {{remainingPayments}}

📅 NEXT PAYMENT
━━━━━━━━━━━━━━━━━━━━━━━
Next Due Date: {{nextDueDate}}

We'll send you a reminder a few days before your next payment is due.

💚 IMPACT UPDATE
━━━━━━━━━━━━━━━━━━━━━━━
Your contributions are making a real difference in students' lives. Thank you for being part of the NUST Lifeline community!

NUST Lifeline Campaign
nustlifelinecampaign@gmail.com`
        },

        subscriptionOverdue: {
            title: 'Overdue Payment Reminder',
            subject: 'Gentle Reminder: Your NUST Lifeline Pledge',
            body: `Dear {{donorName}},

We hope you're doing well!

We noticed we haven't received your monthly payment yet. No worries if you've been busy - we just wanted to send a gentle reminder.

📊 OUTSTANDING PAYMENT
━━━━━━━━━━━━━━━━━━━━━━━
Amount Due: PKR {{monthlyAmount}}
Month: {{monthNumber}} of {{totalMonths}}
Subscription ID: {{subscriptionId}}

💳 TO COMPLETE YOUR PAYMENT
━━━━━━━━━━━━━━━━━━━━━━━
Transfer to:
Account: NUST Lifeline Campaign
Reference: {{subscriptionId}}

Reply with your receipt screenshot when ready.

💬 NEED TO PAUSE OR ADJUST?
━━━━━━━━━━━━━━━━━━━━━━━
If circumstances have changed, please reply to this email. We're happy to:
- Pause your subscription
- Adjust the schedule
- Discuss alternative arrangements

We appreciate your support! 🙏

NUST Lifeline Campaign
nustlifelinecampaign@gmail.com`
        },

        subscriptionCompleted: {
            title: 'Subscription Completed Thank You',
            subject: '🎉 Pledge Completed - Your Impact Summary',
            body: `Dear {{donorName}},

Congratulations! You've completed your monthly pledge to NUST Lifeline!

🏆 YOUR COMMITMENT
━━━━━━━━━━━━━━━━━━━━━━━
Total Contributed: PKR {{totalAmount}}
Duration: {{durationMonths}} months
Students Supported: {{numStudents}}
Subscription ID: {{subscriptionId}}

💚 YOUR IMPACT
━━━━━━━━━━━━━━━━━━━━━━━
Your consistent monthly support helped {{numStudents}} NUST students stay in university hostel. Because of donors like you, these students could focus on their studies without worrying about accommodation.

You've made a lasting difference in their educational journey. 🎓

🙏 THANK YOU
━━━━━━━━━━━━━━━━━━━━━━━
We're incredibly grateful for your commitment to NUST students. Your support has been invaluable.

💚 STAY CONNECTED
━━━━━━━━━━━━━━━━━━━━━━━
If you'd like to continue supporting NUST students, we'd love to have you:
- Start a new monthly subscription
- Make one-time contributions
- Share our mission with fellow alumni

Thank you for being a NUST Lifeline champion! 🌟

With gratitude,
NUST Lifeline Campaign
nustlifelinecampaign@gmail.com`
        },

        subscriptionHostelIntimation: {
            title: 'Subscription Hostel Intimation',
            subject: '[NUST Lifeline] Monthly Subscription Payment Received - {{subscriptionId}}',
            body: `Dear DD Hostels,

We've received a monthly subscription payment for NUST student hostel support.

📊 PAYMENT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━
Donor: {{donorName}}
Subscription ID: {{subscriptionId}}
Amount: PKR {{amount}}
Chapter: {{chapter}}

🎓 STUDENT ALLOCATION
━━━━━━━━━━━━━━━━━━━━━━━
Linked Students (CMS IDs): {{studentIds}}

This is part of a recurring monthly pledge. Please process accordingly.

Regards,
NUST Lifeline Campaign (Automated System)`
        }
    };

    return templates[templateName] || null;
}

/**
 * Creates a specific template manually.
 * @param {string} templateName The template to create
 */
function createSingleTemplate(templateName) {
    const FUNC_NAME = 'createSingleTemplate';

    try {
        const docId = createTemplate(templateName);
        Logger.log(`Created ${templateName}: ${docId}`);
        Logger.log(`\nUpdate Config.js:`);
        Logger.log(`${templateName}: '${docId}',`);

        writeLog('SUCCESS', FUNC_NAME, `Created ${templateName}: ${docId}`);
        return docId;
    } catch (e) {
        writeLog('ERROR', FUNC_NAME, `Failed to create ${templateName}: ${e.message}`);
        throw e;
    }
}

/**
 * Creates the email templates folder if it doesn't exist.
 */
function createTemplatesFolder() {
    const folderName = 'Email Templates';

    // Check if folder exists
    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
        const folder = folders.next();
        Logger.log(`Folder already exists: ${folder.getId()}`);
        return folder.getId();
    }

    // Create folder
    const folder = DriveApp.createFolder(folderName);
    Logger.log(`Created folder: ${folder.getId()}`);
    return folder.getId();
}

/**
 * Test function - creates just the welcome template.
 */
function test_createWelcomeTemplate() {
    const docId = createSingleTemplate('subscriptionWelcome');
    Logger.log('Welcome template created: ' + docId);
}

/**
 * Validates all existing template IDs.
 * Checks if they're accessible and valid Google Docs.
 */
function validateExistingTemplates() {
    const FUNC_NAME = 'validateExistingTemplates';
    Logger.log('Validating existing templates...\n');

    const templateNames = [
        'subscriptionWelcome',
        'subscriptionReminder',
        'subscriptionReceiptConfirm',
        'subscriptionOverdue',
        'subscriptionCompleted',
        'subscriptionHostelIntimation'
    ];

    for (const name of templateNames) {
        const id = TEMPLATES[name];

        if (!id || id.includes('ENTER')) {
            Logger.log(`❌ ${name}: NOT CONFIGURED`);
            continue;
        }

        try {
            const doc = DocumentApp.openById(id);
            Logger.log(`✅ ${name}: ${doc.getName()} (${id})`);
        } catch (e) {
            Logger.log(`⚠️  ${name}: INVALID ID (${id}) - ${e.message}`);
        }
    }

    Logger.log('\n');
}
