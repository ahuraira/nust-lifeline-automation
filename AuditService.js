/**
 * AuditService.js
 * 
 * Provides a robust, append-only logging mechanism for business-critical events.
 * Segregates "Audit" (Business history) from "Log" (System debug).
 * 
 * DASHBOARD INTEGRATION:
 * - Events are formatted for the Live Activity Ticker
 * - Sensitive data is anonymized before display
 * - Event types map to user-friendly messages
 */

// ============================================================================
// EVENT TEMPLATES - User-friendly messages for Dashboard
// ============================================================================
const EVENT_TEMPLATES = {
    NEW_PLEDGE: {
        icon: '🎁',
        template: 'New pledge of PKR {{amount}} received from {{chapter}}'
    },
    RECEIPT_PROCESSED: {
        icon: '✅',
        template: 'Receipt verified: PKR {{amount}} confirmed'
    },
    RECEIPT_PROCESSED_V2: {
        icon: '✅',
        template: '{{count}} receipt(s) verified totaling PKR {{amount}}'
    },
    ALLOCATION: {
        icon: '🎓',
        template: 'PKR {{amount}} allocated to support a student'
    },
    HOSTEL_VERIFICATION: {
        icon: '🏠',
        template: 'Hostel confirmed: Funds credited to student account'
    },
    HOSTEL_QUERY: {
        icon: '❓',
        template: 'Hostel requested clarification on allocation'
    },
    ALERT: {
        icon: '⚠️',
        template: 'System flagged item for manual review'
    },
    STATUS_CHANGE: {
        icon: '📋',
        template: 'Status updated: {{previousValue}} → {{newValue}}'
    },
    DONOR_NOTIFIED: {
        icon: '📧',
        template: 'Donor notified: {{message}}'
    },
    SYSTEM_EVENT: {
        icon: '⚙️',
        template: '{{action}}'
    }
};

/**
 * Formats a dashboard-friendly event message from audit data.
 * Used by the Dashboard API to create the live ticker.
 * 
 * @param {string} eventType The event type (e.g., 'NEW_PLEDGE')
 * @param {Object} data Object containing: { amount, chapter, count, message, action, previousValue, newValue }
 * @returns {Object} { icon: string, message: string }
 */
function formatDashboardEvent(eventType, data) {
    const template = EVENT_TEMPLATES[eventType] || EVENT_TEMPLATES.SYSTEM_EVENT;
    let message = template.template;

    // Replace placeholders
    Object.keys(data).forEach(key => {
        const value = data[key];
        const formatted = (typeof value === 'number')
            ? value.toLocaleString()
            : (value || '');
        message = message.replace(new RegExp(`{{${key}}}`, 'g'), formatted);
    });

    // Clean up any unreplaced placeholders
    message = message.replace(/\{\{[^}]+\}\}/g, '');

    return {
        icon: template.icon,
        message: message.trim()
    };
}

/**
 * Logs a high-level business event to the specialized Audit Trail sheet.
 * @param {string} actor The email of the user or system performing the action.
 * @param {string} eventType The category of the event (e.g., 'STATUS_CHANGE', 'ALLOCATION').
 * @param {string} targetId The ID of the entity adhering to (PledgeID, AllocID).
 * @param {string} actionDescription A human-readable summary of the action.
 * @param {string} [previousValue=''] The state before the change.
 * @param {string} [newValue=''] The state after the change.
 * @param {Object} [metadata={}] JSON object with additional context.
 */
function logAuditEvent(actor, eventType, targetId, actionDescription, previousValue = '', newValue = '', metadata = {}) {
    try {
        const ss = SpreadsheetApp.openById(CONFIG.ssId_operations);
        const auditWs = ss.getSheetByName(SHEETS.audit.name);

        if (!auditWs) {
            console.error('CRITICAL: Audit Trail sheet not found.');
            return;
        }

        const timestamp = new Date();
        const metadataString = JSON.stringify(metadata);

        // Using appendRow is atomic enough for this volume
        auditWs.appendRow([
            timestamp,
            actor,
            eventType,
            targetId,
            actionDescription,
            previousValue,
            newValue,
            metadataString
        ]);

    } catch (e) {
        // Fallback: Use the technical log if the audit log fails
        writeLog('CRITICAL', 'AuditService', `Failed to write audit entry: ${e.message}`, targetId);
    }
}

/**
 * Helper to determine the "Actor".
 * If called from a manual trigger, it uses the active user's email.
 * If called from a time-based trigger (System), it returns 'SYSTEM'.
 */
function getActor() {
    try {
        const email = Session.getActiveUser().getEmail();
        return email || 'SYSTEM';
    } catch (e) {
        return 'SYSTEM'; // Fallback for specialized triggers
    }
}
