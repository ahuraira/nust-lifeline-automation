/**
 * AuditService.js
 * 
 * Provides a robust, append-only logging mechanism for business-critical events.
 * Segregates "Audit" (Business history) from "Log" (System debug).
 */

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
