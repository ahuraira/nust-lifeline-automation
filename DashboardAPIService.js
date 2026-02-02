/**
 * DashboardAPIService.js
 * 
 * Public API for the Lifeline Insights Dashboard.
 * Serves read-only data from the Reporting Data Warehouse.
 * 
 * SECURITY:
 * - Reads ONLY from anonymized Reporting DB
 * - All spreadsheet IDs stored in Script Properties (not code)
 * - API key required for all requests
 * - No PII is ever exposed
 * 
 * Endpoints:
 * - /summary   : KPIs, pipeline breakdown, processing times
 * - /flow      : Sankey fund flow data
 * - /chapters  : Chapter leaderboard with realization rates
 * - /composition : Zakat and duration breakdown
 * - /events    : Live activity feed (30s cache)
 * - /track     : Pledge tracker (search by ID)
 */

// API Key stored in Script Properties for security
function getDashboardApiKey_() {
    return PropertiesService.getScriptProperties().getProperty('DASHBOARD_API_KEY') || 'LIFELINE_DASHBOARD_2026';
}

const ALLOWED_ORIGINS = [
    'https://nust-lifeline-dashboard.web.app',
    'http://localhost:5173'
];

/**
 * Main entry point for GET requests.
 * Deploy as Web App with "Anyone" access.
 */
function doGet(e) {
    const startTime = Date.now();

    try {
        // API Key validation (from Script Properties)
        const apiKey = e.parameter.key || '';
        if (apiKey !== getDashboardApiKey_()) {
            return createJsonResponse({ error: 'Unauthorized' }, 401);
        }

        // Route to action
        const action = e.parameter.action || 'summary';
        let data;

        switch (action) {
            case 'summary':
                data = getSummaryData();
                break;
            case 'flow':
                data = getFlowData();
                break;
            case 'chapters':
                data = getChaptersData();
                break;
            case 'composition':
                data = getCompositionData();
                break;
            case 'events':
                data = getEventsData();
                break;
            case 'track':
                data = getTrackData(e.parameter.pledgeId);
                break;
            default:
                return createJsonResponse({ error: 'Unknown action: ' + action }, 400);
        }

        // Add timing metadata
        data._meta = {
            processingMs: Date.now() - startTime,
            action: action
        };

        return createJsonResponse(data, 200);

    } catch (error) {
        console.error('Dashboard API Error:', error);
        return createJsonResponse({
            error: 'Internal Server Error',
            message: error.message
        }, 500);
    }
}

/**
 * Creates a JSON response with CORS headers.
 */
function createJsonResponse(data, statusCode) {
    const output = ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
    return output;
}

/**
 * Get Reporting Spreadsheet (from Script Properties - secure)
 */
function getReportingSpreadsheet_() {
    const reportingSsId = PropertiesService.getScriptProperties().getProperty('REPORTING_SS_ID');
    if (!reportingSsId) {
        throw new Error('Reporting Data Warehouse not configured. Run setupReportingSandbox() first.');
    }
    return SpreadsheetApp.openById(reportingSsId);
}

/**
 * Get Operations Spreadsheet ID (from Script Properties - secure)
 */
function getOperationsSsId_() {
    return PropertiesService.getScriptProperties().getProperty('OPERATIONS_SS_ID') || CONFIG.ssId_operations;
}

// ============================================================================
// ENDPOINT: /summary - Command Center Data
// Cache: 15 minutes
// ============================================================================

function getSummaryData() {
    const FUNC = 'getSummaryData';
    const CACHE_KEY = 'dashboard_summary';
    const CACHE_TTL = 900; // 15 minutes

    // Check cache first
    const cache = CacheService.getScriptCache();
    const cached = cache.get(CACHE_KEY);
    if (cached) {
        return JSON.parse(cached);
    }

    // Get Data Warehouse
    const ss = getReportingSpreadsheet_();
    const pledgesSheet = ss.getSheetByName('Fact_Pledges');
    const allocSheet = ss.getSheetByName('Fact_Allocations');
    const studentsSheet = ss.getSheetByName('Dim_Students');

    // Handle missing sheets (not yet populated)
    if (!pledgesSheet || !allocSheet || !studentsSheet) {
        console.log(FUNC + ': Data Warehouse sheets not found. Run syncAnonymousReportingData() first.');
        return getEmptySummary();
    }

    // Fetch all data
    const pledgesData = pledgesSheet.getDataRange().getValues();
    const allocData = allocSheet.getDataRange().getValues();
    const studentsData = studentsSheet.getDataRange().getValues();

    // Skip headers
    const pledges = pledgesData.slice(1);
    const allocs = allocData.slice(1);
    const students = studentsData.slice(1);

    // If no data, return empty
    if (pledges.length === 0) {
        return getEmptySummary();
    }

    // === IMPACT METRICS ===
    // Students funded = students with any amount cleared
    const studentsFunded = students.filter(s => (Number(s[5]) || 0) > 0).length; // Amount_Funded_PKR > 0

    // Students awaiting = students with pending amount > 0 and NOT fully funded
    // Status column (index 9) could be: '1 - Need Identified', '2 - Allocation In Progress', etc.
    const studentsAwaiting = students.filter(s => {
        const pendingAmount = Number(s[8]) || 0; // Pending_Amount (index 8)
        const status = (s[9] || '').toString(); // Student_Status (index 9)
        // Awaiting = has pending funds AND not settled/fully funded
        return pendingAmount > 0 && !status.includes('Settled') && !status.includes('Fully Funded');
    }).length;

    // === FINANCIAL METRICS ===
    let totalPledged = 0, totalVerified = 0, totalAllocated = 0;

    // Track counts and amounts by status - using CORRECT amount type for each stage
    const pipelineData = {
        pendingProof: { count: 0, amount: 0 },      // Uses PLEDGED amount
        proofReceived: { count: 0, amount: 0 },     // Uses VERIFIED amount
        allocated: { count: 0, amount: 0 },          // Uses ALLOCATED amount (from allocs)
        hostelVerified: { count: 0, amount: 0 }      // Uses ALLOCATED amount (from allocs)
    };

    // Build allocation totals by pledge ID
    const allocByPledge = {};
    allocs.forEach(a => {
        const pledgeId = a[1]; // Pledge_ID
        const allocAmount = Number(a[3]) || 0; // Amount_Allocated
        const allocStatus = (a[8] || '').toString(); // Alloc Status

        if (!allocByPledge[pledgeId]) {
            allocByPledge[pledgeId] = { total: 0, verified: 0 };
        }
        allocByPledge[pledgeId].total += allocAmount;

        // Count as verified if hostel has confirmed
        if (allocStatus.includes('Verified') || allocStatus.includes('Completed')) {
            allocByPledge[pledgeId].verified += allocAmount;
        }

        totalAllocated += allocAmount;
    });

    pledges.forEach(p => {
        const pledgeId = p[0]; // Pledge_ID
        const pledgedAmount = Number(p[2]) || 0; // Amount_PKR (pledged)
        const verifiedAmount = Number(p[15]) || 0; // Verified_Total
        const status = (p[5] || 'Unknown').toString(); // Status column

        totalPledged += pledgedAmount;
        totalVerified += verifiedAmount;

        // Determine which pipeline stage and use correct amount
        if (status.includes('1 - Pledged') || status.includes('1a - Partial')) {
            // Pending Proof: use PLEDGED amount (what was promised)
            pipelineData.pendingProof.count++;
            pipelineData.pendingProof.amount += pledgedAmount;
        }
        else if (status.includes('2 - Proof') || status.includes('3 - Verified')) {
            // Proof Received: use VERIFIED amount (what was confirmed from receipts)
            pipelineData.proofReceived.count++;
            pipelineData.proofReceived.amount += verifiedAmount;
        }
        else if (status.includes('4 - Partial') || status.includes('5 - Fully Allocated')) {
            // Allocated: use ALLOCATED amount from allocations table
            pipelineData.allocated.count++;
            pipelineData.allocated.amount += (allocByPledge[pledgeId]?.total || 0);
        }
        else if (status.includes('6 - Closed')) {
            // Hostel Verified: use ALLOCATED amount that was verified by hostel
            pipelineData.hostelVerified.count++;
            pipelineData.hostelVerified.amount += (allocByPledge[pledgeId]?.verified || allocByPledge[pledgeId]?.total || 0);
        }
    });

    const balance = totalVerified - totalAllocated;
    const fundingGap = students.reduce((sum, s) => sum + (Number(s[8]) || 0), 0);

    // === PROCESSING TIMES ===
    const processingDays = calculateProcessingTimes(pledges, allocs);

    // === PIPELINE BREAKDOWN ===
    const pipeline = pipelineData;

    // === WEEKLY TRENDS ===
    const trends = calculateWeeklyTrends(pledges);

    const result = {
        impact: {
            studentsFunded,
            studentsAwaiting,
            pledgeCount: pledges.length
        },
        financials: {
            totalPledged,
            totalVerified,
            totalAllocated,
            balance,
            fundingGap
        },
        processingDays,
        pipeline,
        trends,
        lastUpdated: new Date().toISOString()
    };

    // Cache the result
    cache.put(CACHE_KEY, JSON.stringify(result), CACHE_TTL);

    return result;
}

/**
 * Return empty summary when no data is available.
 */
function getEmptySummary() {
    const now = new Date();
    const trends = [];
    for (let i = 7; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (7 * i) - weekStart.getDay());
        trends.push({
            week: Utilities.formatDate(weekStart, 'GMT', 'yyyy-MM-dd'),
            pledges: 0,
            amount: 0
        });
    }

    return {
        impact: { studentsFunded: 0, studentsAwaiting: 0, pledgeCount: 0 },
        financials: { totalPledged: 0, totalVerified: 0, totalAllocated: 0, balance: 0, fundingGap: 0 },
        processingDays: { pledgeToReceipt: 0, receiptToAllocation: 0, allocationToHostel: 0 },
        pipeline: {
            pendingProof: { count: 0, amount: 0 },
            proofReceived: { count: 0, amount: 0 },
            allocated: { count: 0, amount: 0 },
            hostelVerified: { count: 0, amount: 0 }
        },
        trends,
        lastUpdated: new Date().toISOString()
    };
}

/**
 * Aggregate counts from multiple status values into one bucket.
 * @param {Object} statusCounts - Map of status -> {count, amount}
 * @param {string[]} statuses - Array of status strings to aggregate
 * @returns {Object} {count, amount}
 */
function aggregateStatusCounts(statusCounts, statuses) {
    let count = 0, amount = 0;
    statuses.forEach(status => {
        if (statusCounts[status]) {
            count += statusCounts[status].count;
            amount += statusCounts[status].amount;
        }
    });
    return { count, amount };
}

/**
 * Calculate average days for each processing stage.
 * 
 * Stages:
 * - pledgeToReceipt: Pledge Date → Proof Received Date
 * - receiptToAllocation: Proof Received Date → First Allocation Date
 * - allocationToHostel: Hostel Intimation Date → Hostel Reply Date
 */
function calculateProcessingTimes(pledges, allocs) {
    let pledgeToReceipt = [], receiptToAllocation = [], allocationToHostel = [];

    // Build a map of Pledge ID -> earliest allocation date
    const pledgeToAllocDate = {};
    allocs.forEach(a => {
        const pledgeId = a[1]; // Pledge_ID (index 1)
        const dateAllocated = a[4]; // Date_Allocated (index 4)
        if (pledgeId && dateAllocated) {
            if (!pledgeToAllocDate[pledgeId] || new Date(dateAllocated) < new Date(pledgeToAllocDate[pledgeId])) {
                pledgeToAllocDate[pledgeId] = dateAllocated;
            }
        }
    });

    // Calculate pledge to receipt time
    pledges.forEach(p => {
        const pledgeId = p[0]; // Pledge_ID (index 0)
        const datePledged = p[1]; // Date_Pledged (index 1)
        const dateProof = p[9]; // Date_Proof_Received (index 9)

        // Pledge to Receipt
        if (datePledged && dateProof) {
            const days = daysBetween(datePledged, dateProof);
            if (days >= 0 && days < 365) pledgeToReceipt.push(days);
        }

        // Receipt to Allocation
        if (dateProof && pledgeToAllocDate[pledgeId]) {
            const days = daysBetween(dateProof, pledgeToAllocDate[pledgeId]);
            if (days >= 0 && days < 365) receiptToAllocation.push(days);
        }
    });

    // Calculate allocation to hostel reply time
    allocs.forEach(a => {
        const dateHostelIntimation = a[5]; // Date_Hostel_Intimation (index 5)
        const dateHostelReply = a[6]; // Date_Hostel_Reply (index 6)

        if (dateHostelIntimation && dateHostelReply) {
            const days = daysBetween(dateHostelIntimation, dateHostelReply);
            if (days >= 0 && days < 90) allocationToHostel.push(days);
        }
    });

    return {
        pledgeToReceipt: average(pledgeToReceipt),
        receiptToAllocation: average(receiptToAllocation),
        allocationToHostel: average(allocationToHostel)
    };
}

/**
 * Calculate weekly pledge trends for the last 12 weeks.
 * Includes both pledged and verified amounts.
 */
function calculateWeeklyTrends(pledges) {
    const weeks = {};
    const now = new Date();
    const timezone = Session.getScriptTimeZone() || 'Asia/Karachi';

    // Initialize weeks (newest to oldest) - extended to 12 weeks
    for (let i = 0; i < 12; i++) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (7 * i) - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekKey = Utilities.formatDate(weekStart, timezone, 'yyyy-MM-dd');
        weeks[weekKey] = { pledges: 0, amount: 0, verified: 0 };
    }

    let matchedCount = 0;
    pledges.forEach(p => {
        const datePledged = p[1];
        if (!datePledged) return;

        const pledgeDate = new Date(datePledged);
        if (isNaN(pledgeDate.getTime())) return; // Skip invalid dates

        const weekStart = new Date(pledgeDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekKey = Utilities.formatDate(weekStart, timezone, 'yyyy-MM-dd');

        if (weeks[weekKey]) {
            weeks[weekKey].pledges++;
            weeks[weekKey].amount += Number(p[2]) || 0;  // Pledged amount
            weeks[weekKey].verified += Number(p[15]) || 0;  // Verified amount
            matchedCount++;
        }
    });

    console.log(`calculateWeeklyTrends: ${pledges.length} pledges, ${matchedCount} matched to weeks`);

    // Return sorted oldest to newest (left to right on chart)
    const result = Object.entries(weeks)
        .map(([week, data]) => ({ week, ...data }))
        .sort((a, b) => new Date(a.week).getTime() - new Date(b.week).getTime());

    // Filter to only show last 8 weeks with data (or all if none have data)
    const withData = result.filter(w => w.pledges > 0 || w.amount > 0);
    return withData.length > 0 ? result.slice(-8) : result.slice(-8);
}

// ============================================================================
// ENDPOINT: /flow - Sankey Fund Flow Data
// ============================================================================

function getFlowData() {
    const CACHE_KEY = 'dashboard_flow';
    const CACHE_TTL = 900;

    const cache = CacheService.getScriptCache();
    const cached = cache.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);

    const summary = getSummaryData();

    const nodes = [
        { name: 'Pledged', value: summary.financials.totalPledged },
        { name: 'Verified', value: summary.financials.totalVerified },
        { name: 'Allocated', value: summary.financials.totalAllocated },
        { name: 'Pending Proof', value: summary.financials.totalPledged - summary.financials.totalVerified },
        { name: 'Unallocated', value: summary.financials.balance }
    ];

    const links = [
        { source: 0, target: 1, value: summary.financials.totalVerified },
        { source: 0, target: 3, value: summary.financials.totalPledged - summary.financials.totalVerified },
        { source: 1, target: 2, value: summary.financials.totalAllocated },
        { source: 1, target: 4, value: summary.financials.balance }
    ];

    const result = { nodes, links, lastUpdated: new Date().toISOString() };
    cache.put(CACHE_KEY, JSON.stringify(result), CACHE_TTL);

    return result;
}

// ============================================================================
// ENDPOINT: /chapters - Chapter Leaderboard
// ============================================================================

function getChaptersData() {
    const CACHE_KEY = 'dashboard_chapters';
    const CACHE_TTL = 900;

    const cache = CacheService.getScriptCache();
    const cached = cache.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);

    const ss = getReportingSpreadsheet_();
    const pledgesSheet = ss.getSheetByName('Fact_Pledges');

    if (!pledgesSheet) {
        return { data: [], lastUpdated: new Date().toISOString() };
    }

    const pledges = pledgesSheet.getDataRange().getValues().slice(1);
    const chapters = {};

    pledges.forEach(p => {
        const chapter = p[4] || 'Other';
        const pledged = Number(p[2]) || 0;
        const verified = Number(p[14]) || 0;

        if (!chapters[chapter]) {
            chapters[chapter] = { pledged: 0, verified: 0, count: 0 };
        }
        chapters[chapter].pledged += pledged;
        chapters[chapter].verified += verified;
        chapters[chapter].count++;
    });

    const data = Object.entries(chapters)
        .map(([chapter, stats]) => ({
            chapter,
            pledged: stats.pledged,
            verified: stats.verified,
            count: stats.count,
            realizationRate: stats.pledged > 0 ? Math.round((stats.verified / stats.pledged) * 100) : 0
        }))
        .sort((a, b) => b.pledged - a.pledged)
        .slice(0, 10);

    const result = { data, lastUpdated: new Date().toISOString() };
    cache.put(CACHE_KEY, JSON.stringify(result), CACHE_TTL);

    return result;
}

// ============================================================================
// ENDPOINT: /composition - Zakat & Duration Breakdown
// ============================================================================

function getCompositionData() {
    const CACHE_KEY = 'dashboard_composition_v2';
    const CACHE_TTL = 900;

    const cache = CacheService.getScriptCache();
    const cached = cache.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);

    const ss = getReportingSpreadsheet_();
    const pledgesSheet = ss.getSheetByName('Fact_Pledges');

    if (!pledgesSheet) {
        return {
            zakat: { amount: 0, percent: 0 },
            general: { amount: 0, percent: 0 },
            duration: [],
            lastUpdated: new Date().toISOString()
        };
    }

    const pledges = pledgesSheet.getDataRange().getValues().slice(1);

    let zakatAmount = 0, generalAmount = 0;
    const affiliationCounts = {};

    // Helper to normalize affiliation names
    const normalizeAffiliation = (name) => {
        if (!name) return 'Other';
        // Remove extra spaces and convert to uppercase for consistency (e.g. " nbs " -> "NBS")
        return String(name).trim().replace(/\s+/g, ' ').toUpperCase();
    };

    pledges.forEach(p => {
        const amount = Number(p[2]) || 0;
        const isZakat = p[6];
        const affiliation = normalizeAffiliation(p[7]); // Donor_Affiliation at index 7

        if (isZakat === 'Yes' || isZakat === true) {
            zakatAmount += amount;
        } else {
            generalAmount += amount;
        }

        if (!affiliationCounts[affiliation]) {
            affiliationCounts[affiliation] = { count: 0, amount: 0 };
        }
        affiliationCounts[affiliation].count++;
        affiliationCounts[affiliation].amount += amount;
    });

    const total = zakatAmount + generalAmount;

    const result = {
        zakat: {
            amount: zakatAmount,
            percent: total > 0 ? Math.round((zakatAmount / total) * 100) : 0
        },
        general: {
            amount: generalAmount,
            percent: total > 0 ? Math.round((generalAmount / total) * 100) : 0
        },
        affiliation: Object.entries(affiliationCounts)
            .map(([type, stats]) => ({
                type,
                count: stats.count,
                amount: stats.amount,
                percent: total > 0 ? Math.round((stats.amount / total) * 100) : 0
            }))
            .sort((a, b) => b.amount - a.amount)
        // Group long tail into "Other" if too many categories? (Optional, skipping for now)
        ,
        lastUpdated: new Date().toISOString()
    };

    cache.put(CACHE_KEY, JSON.stringify(result), CACHE_TTL);
    return result;
}

// ============================================================================
// ENDPOINT: /events - Live Activity Feed
// ============================================================================

function getEventsData() {
    const CACHE_KEY = 'dashboard_events';
    const CACHE_TTL = 30;

    const cache = CacheService.getScriptCache();
    const cached = cache.get(CACHE_KEY);
    if (cached) return JSON.parse(cached);

    // Read from Operations Audit Trail
    const opsSsId = getOperationsSsId_();
    const ss = SpreadsheetApp.openById(opsSsId);
    const auditSheet = ss.getSheetByName(SHEETS.audit.name);

    if (!auditSheet) {
        return { events: [], lastUpdated: new Date().toISOString() };
    }

    const data = auditSheet.getDataRange().getValues();
    const rows = data.slice(1);

    // Get last 15 events (we'll filter down after processing)
    const events = rows
        .slice(-15)
        .reverse()
        .map(row => {
            const eventType = row[2] || 'SYSTEM_EVENT';
            const action = row[4] || '';
            const previousValue = row[5] || '';
            const newValue = row[6] || '';

            // Parse metadata if available
            let metadata = {};
            try {
                if (row[7]) {
                    metadata = JSON.parse(row[7]);
                }
            } catch (e) {
                // Ignore JSON parse errors
            }

            // Format the event message based on type and metadata
            const targetId = row[3] || '';
            const formatted = formatEventForDashboard(
                eventType,
                action,
                previousValue,
                newValue,
                metadata,
                targetId
            );

            return {
                timestamp: row[0] ? new Date(row[0]).toISOString() : null,
                type: eventType,
                icon: formatted.icon,
                message: formatted.message,
                targetId: targetId
            };
        })
        .filter(e => e.timestamp && e.message);

    const result = { events: events.slice(0, 10), lastUpdated: new Date().toISOString() };
    cache.put(CACHE_KEY, JSON.stringify(result), CACHE_TTL);

    return result;
}
/**
 * Format event for dashboard display with rich messaging.
 * Includes pledge IDs for authenticity and traceability.
 */
function formatEventForDashboard(eventType, action, previousValue, newValue, metadata, targetId) {
    // Extract pledge ID from multiple possible sources
    const extractPledgeId = () => {
        // 1. Direct targetId
        if (targetId && String(targetId).trim()) return String(targetId).trim();

        // 2. From metadata
        if (metadata.pledgeId) return String(metadata.pledgeId);
        if (metadata.pledge_id) return String(metadata.pledge_id);

        // 3. Extract from action text (look for PLEDGE-XXXX-XXX pattern)
        const actionMatch = String(action).match(/PLEDGE[-_]?\d{4}[-_]?\d{1,3}/i);
        if (actionMatch) return actionMatch[0].toUpperCase();

        // 4. Look for row numbers in format like "Row 15" or "pledge #15"
        const rowMatch = String(action).match(/(?:row|pledge|#)\s*(\d+)/i);
        if (rowMatch) return `PLEDGE-${rowMatch[1]}`;

        return '';
    };

    const pledgeRef = extractPledgeId();
    const pledgeTag = pledgeRef ? ` [${pledgeRef}]` : '';

    // Event templates with icons
    const templates = {
        'NEW_PLEDGE': {
            icon: '🎁',
            getMessage: (m) => {
                const amount = m.amount || extractAmount(action);
                const chapter = m.chapter || m.country || 'a supporter';
                return amount
                    ? `New pledge of PKR ${formatNumber(amount)} from ${chapter}${pledgeTag}`
                    : `New pledge received from ${chapter}${pledgeTag}`;
            }
        },
        'RECEIPT_PROCESSED': {
            icon: '✅',
            getMessage: (m) => {
                const amount = m.amount || extractAmount(action);
                return amount
                    ? `Receipt verified: PKR ${formatNumber(amount)}${pledgeTag}`
                    : `Receipt verified${pledgeTag}`;
            }
        },
        'RECEIPT_PROCESSED_V2': {
            icon: '✅',
            getMessage: (m) => {
                const count = m.receipts || 1;
                const amount = m.amount || extractAmount(action);
                return amount
                    ? `${count} receipt(s) verified: PKR ${formatNumber(amount)}${pledgeTag}`
                    : `${count} receipt(s) verified${pledgeTag}`;
            }
        },
        'ALLOCATION': {
            icon: '🎓',
            getMessage: (m) => {
                const amount = m.amount || extractAmount(action);
                return amount
                    ? `PKR ${formatNumber(amount)} allocated to student${pledgeTag}`
                    : `Funds allocated to student${pledgeTag}`;
            }
        },
        'HOSTEL_VERIFICATION': {
            icon: '🏠',
            getMessage: () => `Hostel verified: Funds credited${pledgeTag}`
        },
        'HOSTEL_QUERY': {
            icon: '❓',
            getMessage: () => `Hostel query received${pledgeTag}`
        },
        'ALERT': {
            icon: '⚠️',
            getMessage: () => `Flagged for review${pledgeTag}`
        },
        'STATUS_CHANGE': {
            icon: '📋',
            getMessage: () => {
                if (previousValue && newValue) {
                    return `${previousValue} → ${newValue}${pledgeTag}`;
                }
                return `Status updated${pledgeTag}`;
            }
        }
    };

    const template = templates[eventType];

    if (template) {
        return {
            icon: template.icon,
            message: template.getMessage(metadata)
        };
    }

    // Default: anonymize and use the action description
    return {
        icon: '⚙️',
        message: (anonymizeMessage(action) || 'System activity') + pledgeTag
    };
}

/**
 * Extract amount from action string (e.g., "Total: 150000")
 */
function extractAmount(text) {
    if (!text) return null;
    const match = text.match(/(\d{1,3}(?:,?\d{3})*)/);
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : null;
}

/**
 * Format number with commas
 */
function formatNumber(num) {
    return Number(num).toLocaleString();
}

/**
 * Anonymize target ID for public display (keep format, truncate specifics)
 */
function anonymizeTargetId(targetId) {
    if (!targetId) return '';
    // Keep the format like PLEDGE-2024-XX or ALLOC-XXXXX
    if (targetId.includes('PLEDGE-')) {
        return targetId.replace(/(\d{4}-)\d+/, '$1***');
    }
    if (targetId.includes('ALLOC-')) {
        return 'ALLOC-***';
    }
    return '***';
}

/**
 * Anonymize event messages to remove any PII.
 */
function anonymizeMessage(message) {
    if (!message) return '';
    // Remove email addresses
    message = message.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[email]');
    // Remove phone numbers
    message = message.replace(/\+?[\d\s-]{10,}/g, '[phone]');
    // Remove names that look like "Name: Something"
    message = message.replace(/Name:\s*[^,\n]+/gi, 'Name: [redacted]');
    // Remove CMS IDs
    message = message.replace(/\d{6,}/g, '***');
    return message;
}

// ============================================================================
// ENDPOINT: /track - Pledge Tracker
// ============================================================================

function getTrackData(pledgeId) {
    if (!pledgeId) {
        return { error: 'pledgeId parameter required' };
    }

    const ss = getReportingSpreadsheet_();
    const pledgesSheet = ss.getSheetByName('Fact_Pledges');

    if (!pledgesSheet) {
        return { error: 'Data not available', pledgeId };
    }

    const pledges = pledgesSheet.getDataRange().getValues();

    let pledge = null;
    for (let i = 1; i < pledges.length; i++) {
        if (pledges[i][0] === pledgeId) {
            pledge = pledges[i];
            break;
        }
    }

    if (!pledge) {
        return { error: 'Pledge not found', pledgeId };
    }

    // Find allocations
    const allocSheet = ss.getSheetByName('Fact_Allocations');
    const allocs = allocSheet ? allocSheet.getDataRange().getValues().slice(1) : [];
    const pledgeAllocs = allocs.filter(a => a[1] === pledgeId);

    // Build timeline (anonymized)
    const timeline = [];

    timeline.push({
        date: formatDate(pledge[1]),
        status: 'Pledged',
        note: 'Form submitted'
    });

    if (pledge[9]) {
        timeline.push({
            date: formatDate(pledge[9]),
            status: 'Proof Received',
            note: 'Receipt verified'
        });
    }

    pledgeAllocs.forEach(a => {
        if (a[4]) {
            timeline.push({
                date: formatDate(a[4]),
                status: 'Allocated',
                note: 'Assigned to beneficiary'
            });
        }

        if (a[6]) {
            timeline.push({
                date: formatDate(a[6]),
                status: 'Hostel Verified',
                note: 'Confirmed by DD Hostels'
            });
        }
    });

    timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
        pledgeId,
        currentStatus: pledge[5],
        amount: pledge[2],
        timeline,
        lastUpdated: new Date().toISOString()
    };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffMs = d2 - d1;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function average(arr) {
    if (!arr || arr.length === 0) return 0;
    return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}

function formatDate(date) {
    if (!date) return null;
    return Utilities.formatDate(new Date(date), 'GMT', 'yyyy-MM-dd');
}

// ============================================================================
// SETUP FUNCTION - Run once to configure Script Properties
// ============================================================================

/**
 * Run this function ONCE from the Apps Script Editor to set up security.
 * This stores sensitive IDs in Script Properties (not visible in source code).
 */
function setupDashboardSecurity() {
    const props = PropertiesService.getScriptProperties();

    // Set the API key (change this to something unique!)
    props.setProperty('DASHBOARD_API_KEY', 'YOUR_SECURE_API_KEY_HERE');

    // Set the Operations SS ID (from CONFIG - do this once then it's stored securely)
    props.setProperty('OPERATIONS_SS_ID', CONFIG.ssId_operations);

    console.log('✅ Dashboard security configured.');
    console.log('📝 Remember to:');
    console.log('   1. Run setupReportingSandbox() to create the Data Warehouse');
    console.log('   2. Run syncAnonymousReportingData() to populate it');
    console.log('   3. Update DASHBOARD_API_KEY in Script Properties to a unique value');
}
