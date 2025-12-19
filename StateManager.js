/**
 * State Manager Utility
 * Enforces Finite State Machine (FSM) rules for Pledges, Allocations, and Students.
 */
class StateManager {

    /**
     * Validates if a transition from current state to target state is allowed.
     * @param {string} type - 'PLEDGE', 'ALLOCATION', or 'STUDENT'.
     * @param {string} current - The current status string.
     * @param {string} target - The target status string.
     * @returns {boolean} - True if valid, throws Error if invalid.
     */
    static validateTransition(type, current, target) {
        const workflow = STATUS_WORKFLOW[type];
        if (!workflow) throw new Error(`Invalid Status Type: ${type}`);

        // If current state is not in workflow (e.g. old data), allow transition to a valid start state or any state?
        // Better to fail safe. But for migration, we might need flexibility.
        // Let's assume data is migrated.

        const stateConfig = workflow[current];
        if (!stateConfig) {
            // Handle case where current state is unknown/legacy
            console.warn(`Unknown current state: ${current} for type ${type}. Allowing transition to ${target} for recovery.`);
            return true;
        }

        if (!stateConfig.next.includes(target)) {
            throw new Error(`Invalid Transition for ${type}: Cannot move from '${current}' to '${target}'. Allowed: ${stateConfig.next.join(', ')}`);
        }

        return true;
    }

    /**
     * Gets the human-readable label for a status.
     * @param {string} type - 'PLEDGE', 'ALLOCATION', or 'STUDENT'.
     * @param {string} status - The status string.
     * @returns {string} - The label or the status itself if not found.
     */
    static getLabel(type, status) {
        const workflow = STATUS_WORKFLOW[type];
        if (workflow && workflow[status]) {
            return workflow[status].label;
        }
        return status;
    }

    /**
     * Gets the list of allowed next states for a given status.
     * @param {string} type - 'PLEDGE', 'ALLOCATION', or 'STUDENT'.
     * @param {string} current - The current status string.
     * @returns {Array<string>} - List of allowed next status strings.
     */
    static getAllowedNextStates(type, current) {
        const workflow = STATUS_WORKFLOW[type];
        if (workflow && workflow[current]) {
            return workflow[current].next;
        }
        return [];
    }

    /**
     * Checks if a status string is valid for a given type.
     * @param {string} type - 'PLEDGE', 'ALLOCATION', or 'STUDENT'.
     * @param {string} status - The status string to check.
     * @returns {boolean}
     */
    static isValidStatus(type, status) {
        const workflow = STATUS_WORKFLOW[type];
        return workflow && workflow.hasOwnProperty(status);
    }
}
