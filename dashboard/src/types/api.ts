// API Types for Dashboard (v2.1)

// === /summary endpoint ===
export interface ImpactMetrics {
    studentsFunded: number;
    studentsAwaiting: number;
    pledgeCount: number;
}

export interface FinancialMetrics {
    totalPledged: number;      // Now using effective amounts
    totalEffective: number;    // For campaign progress bar dashed line
    totalVerified: number;
    totalAllocated: number;
    balance: number;
    fundingGap: number;
}

export interface ProcessingDays {
    pledgeToReceipt: number;
    receiptToAllocation: number;
    allocationToHostel: number;
}

export interface PipelineStage {
    count: number;
    amount: number;
}

export interface PipelineBreakdown {
    pendingProof: PipelineStage;
    proofReceived: PipelineStage;
    allocated: PipelineStage;
    hostelVerified: PipelineStage;
}

export interface WeeklyTrend {
    week: string;
    pledges: number;
    amount: number;
    verified: number;
}

export interface SubscriptionMetrics {
    active: number;
    total: number;
    mrr: number;                  // Monthly Recurring Revenue (PKR)
    studentsFundedMonthly: number; // Students covered by active subscriptions
    collectionRate: number;        // 0-100 percentage
}

export interface SummaryResponse {
    impact: ImpactMetrics;
    financials: FinancialMetrics;
    processingDays: ProcessingDays;
    pipeline: PipelineBreakdown;
    trends: WeeklyTrend[];
    subscriptions?: SubscriptionMetrics;
    lastUpdated: string;
}

// === /flow endpoint ===
export interface SankeyNode {
    name: string;
    value: number;
}

export interface SankeyLink {
    source: number;
    target: number;
    value: number;
}

export interface FlowResponse {
    nodes: SankeyNode[];
    links: SankeyLink[];
    lastUpdated: string;
}

// === /chapters endpoint ===
export interface ChapterData {
    chapter: string;
    effective: number;       // Effective amount (replaces pledged)
    verified: number;
    count: number;
    studentsFunded: number;  // Students fully funded by this chapter
    target: number;          // Target amount
    targetStudents: number;  // Target students
    progress: number;        // Progress % (0-100)
}

export interface ChaptersResponse {
    data: ChapterData[];
    lastUpdated: string;
}

// === /composition endpoint ===
export interface ZakatBreakdown {
    amount: number;
    percent: number;
}

export interface AffiliationBreakdown {
    type: string;
    count: number;
    amount: number;
    percent: number;
}

export interface CompositionResponse {
    zakat: ZakatBreakdown;
    general: ZakatBreakdown;
    affiliation: AffiliationBreakdown[];
    lastUpdated: string;
}

// === /events endpoint ===
export type EventType =
    | 'NEW_PLEDGE'
    | 'PLEDGE_RECEIVED'
    | 'RECEIPT_PROCESSED'
    | 'RECEIPT_PROCESSED_V2'
    | 'RECEIPT_VERIFIED'
    | 'ALLOCATION'
    | 'ALLOCATION_COMPLETE'
    | 'HOSTEL_VERIFICATION'
    | 'HOSTEL_INTIMATED'
    | 'HOSTEL_CONFIRMED'
    | 'HOSTEL_QUERY'
    | 'DONOR_NOTIFIED'
    | 'STATUS_CHANGE'
    | 'ALERT'
    | 'SYSTEM_EVENT';

export interface DashboardEvent {
    timestamp: string;
    type: EventType;
    icon?: string;  // Emoji icon from API (e.g., 🎁, ✅, 🎓)
    message: string;
    targetId?: string;
}

export interface EventsResponse {
    events: DashboardEvent[];
    lastUpdated: string;
}

// === /track endpoint ===
export interface TimelineEntry {
    date: string;
    status: string;
    note: string;
}

export interface TrackResponse {
    pledgeId: string;
    currentStatus: string;
    amount: number;
    timeline: TimelineEntry[];
    lastUpdated: string;
    error?: string;
}
