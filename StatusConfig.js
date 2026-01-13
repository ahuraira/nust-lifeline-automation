/**
 * Status Configuration for Hostel Funds Management
 * Defines the Finite State Machine (FSM) rules for Pledges, Allocations, and Students.
 * Uses numbered prefixes (e.g., "1 - Pledged") for sorting and dashboard readability.
 */

const STATUS_WORKFLOW = {
    PLEDGE: {
        '1 - Pledged': {
            next: ['1a - Partial Receipt', '2 - Proof Submitted', '9 - Cancelled'],
            label: 'Pledged'
        },
        '1a - Partial Receipt': {
            next: ['1a - Partial Receipt', '2 - Proof Submitted', '9 - Cancelled'],
            label: 'Partial Receipt'
        },
        '2 - Proof Submitted': {
            next: ['3 - Verified', '4 - Partially Allocated', '9 - Rejected'],
            label: 'Proof Submitted'
        },
        '3 - Verified': {
            next: ['4 - Partially Allocated', '5 - Fully Allocated'],
            label: 'Verified'
        },
        '4 - Partially Allocated': {
            next: ['5 - Fully Allocated', '3 - Verified'],
            label: 'Partially Allocated'
        },
        '5 - Fully Allocated': {
            next: ['6 - Closed', '4 - Partially Allocated'],
            label: 'Fully Allocated'
        },
        '6 - Closed': {
            next: ['ARCHIVED'],
            label: 'Closed'
        },
        '9 - Cancelled': {
            next: ['1 - Pledged'],
            label: 'Cancelled'
        },
        '9 - Rejected': {
            next: ['1 - Pledged'],
            label: 'Rejected'
        }
    },

    ALLOCATION: {
        '1 - Pending Hostel': {
            next: ['3 - Hostel Verified', '2 - Hostel Query', '9 - Cancelled'],
            label: 'Pending Hostel'
        },
        '2 - Hostel Query': {
            next: ['1 - Pending Hostel', '9 - Cancelled'],
            label: 'Hostel Query'
        },
        '3 - Hostel Verified': {
            next: ['4 - Student Verification'],
            label: 'Hostel Verified'
        },
        '4 - Student Verification': {
            next: ['5 - Completed', '6 - Disputed'],
            label: 'Student Verification'
        },
        '5 - Completed': {
            next: ['ARCHIVED'],
            label: 'Completed'
        },
        '6 - Disputed': {
            next: ['1 - Pending Hostel'],
            label: 'Disputed'
        },
        '9 - Cancelled': {
            next: ['1 - Pending Hostel'],
            label: 'Cancelled'
        }
    },

    STUDENT: {
        '1 - Need Identified': {
            next: ['2 - Allocation In Progress', '3 - Fully Funded'],
            label: 'Need Identified'
        },
        '2 - Allocation In Progress': {
            next: ['3 - Fully Funded', '1 - Need Identified'],
            label: 'Allocation In Progress'
        },
        '3 - Fully Funded': {
            next: ['4 - Settled'],
            label: 'Fully Funded'
        },
        '4 - Settled': {
            next: ['ARCHIVED'],
            label: 'Settled'
        }
    }
};

// Helper constants for easy access in code
const STATUS = {
    pledge: {
        PLEDGED: '1 - Pledged',
        PARTIAL_RECEIPT: '1a - Partial Receipt', // [CHANGED] Start of funding, but still pledged
        PROOF_SUBMITTED: '2 - Proof Submitted',
        FULLY_FUNDED: '2 - Proof Submitted', // [CHANGED] Alias for standard success
        VERIFIED: '3 - Verified',
        PARTIALLY_ALLOCATED: '4 - Partially Allocated',
        FULLY_ALLOCATED: '5 - Fully Allocated',
        CLOSED: '6 - Closed',
        CANCELLED: '9 - Cancelled',
        REJECTED: '9 - Rejected'
    },
    allocation: {
        PENDING_HOSTEL: '1 - Pending Hostel',
        HOSTEL_QUERY: '2 - Hostel Query',
        HOSTEL_VERIFIED: '3 - Hostel Verified',
        STUDENT_VERIFICATION_PENDING: '4 - Student Verification',
        COMPLETED: '5 - Completed',
        DISPUTED: '6 - Disputed',
        CANCELLED: '9 - Cancelled'
    },
    student: {
        NEED_IDENTIFIED: '1 - Need Identified',
        ALLOCATION_IN_PROGRESS: '2 - Allocation In Progress',
        FULLY_FUNDED: '3 - Fully Funded',
        SETTLED: '4 - Settled'
    },
    // Legacy/UI-specific status values (used for dropdown triggers in Donations Tracker)
    donations: {
        toBeAllocated: 'Allocate the selected student' // Dropdown value that triggers allocation
    }
};
