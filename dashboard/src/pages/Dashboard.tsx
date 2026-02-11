import { useSummary, useChapters, useComposition } from '../hooks/useData';
import { KPICard } from '../components/KPICard';
import { FundingGapBar } from '../components/FundingGapBar';
import { ProcessingGauges } from '../components/ProcessingGauges';
import { StatusPipeline } from '../components/StatusPipeline';
import { Leaderboard } from '../components/Leaderboard';
import { CompositionCharts } from '../components/CompositionCharts';
import { PledgeTracker } from '../components/PledgeTracker';
import { TrendsChart } from '../components/TrendsChart';
import { Users, Wallet, TrendingUp, Heart, AlertCircle, Repeat } from 'lucide-react';

// Mock data for development (before API is deployed)
const mockSummary = {
    impact: { studentsFunded: 42, studentsAwaiting: 12, pledgeCount: 85 },
    financials: {
        totalPledged: 9500000,
        totalEffective: 9500000,  // For campaign progress bar
        totalVerified: 7200000,
        totalAllocated: 5800000,
        balance: 1400000,
        fundingGap: 2300000 // (Based on ~9.5M need)
    },
    processingDays: {
        pledgeToReceipt: 3.5,
        receiptToAllocation: 1.2,
        allocationToHostel: 2.8
    },
    pipeline: {
        pendingProof: { count: 15, amount: 850000 },
        proofReceived: { count: 8, amount: 450000 },
        allocated: { count: 42, amount: 5800000 },
        hostelVerified: { count: 38, amount: 5200000 },
    },
    trends: [
        { week: 'Week 1', pledges: 12, amount: 1200000, verified: 1000000 },
        { week: 'Week 2', pledges: 18, amount: 1800000, verified: 1500000 },
        { week: 'Week 3', pledges: 15, amount: 1500000, verified: 1200000 },
        { week: 'Week 4', pledges: 22, amount: 2200000, verified: 1800000 },
        { week: 'Week 5', pledges: 28, amount: 2500000, verified: 2100000 },
        { week: 'Week 6', pledges: 35, amount: 3200000, verified: 2800000 },
        { week: 'Week 7', pledges: 45, amount: 4500000, verified: 3500000 },
        { week: 'Week 8', pledges: 85, amount: 9500000, verified: 7200000 },
    ],
    subscriptions: {
        active: 12,
        total: 15,
        mrr: 300000,
        studentsFundedMonthly: 12,
        collectionRate: 87
    },
    lastUpdated: new Date().toISOString(),
};

const mockChapters = {
    data: [
        { chapter: 'Pakistan', effective: 3500000, verified: 2800000, count: 32, studentsFunded: 14, target: 2400000, targetStudents: 10, progress: 145 },
        { chapter: 'KSA', effective: 2200000, verified: 1800000, count: 20, studentsFunded: 9, target: 1920000, targetStudents: 8, progress: 114 },
        { chapter: 'UAE', effective: 1500000, verified: 1100000, count: 12, studentsFunded: 6, target: 1920000, targetStudents: 8, progress: 78 },
        { chapter: 'Germany', effective: 900000, verified: 700000, count: 8, studentsFunded: 3, target: 1920000, targetStudents: 8, progress: 46 },
        { chapter: 'Canada', effective: 600000, verified: 500000, count: 5, studentsFunded: 2, target: 1920000, targetStudents: 8, progress: 31 },
        { chapter: 'Australia', effective: 500000, verified: 400000, count: 4, studentsFunded: 2, target: 1920000, targetStudents: 8, progress: 26 },
        { chapter: 'UK', effective: 300000, verified: 300000, count: 4, studentsFunded: 1, target: 1920000, targetStudents: 8, progress: 15 },
    ],
    lastUpdated: new Date().toISOString(),
};

const mockComposition = {
    zakat: { amount: 5225000, percent: 55 },
    general: { amount: 4275000, percent: 45 },
    affiliation: [
        { type: 'SEECS', count: 25, amount: 2500000, percent: 26 },
        { type: 'NBS', count: 20, amount: 2100000, percent: 22 },
        { type: 'SMME', count: 15, amount: 1800000, percent: 19 },
        { type: 'SADA', count: 10, amount: 1200000, percent: 13 },
        { type: 'CEME', count: 8, amount: 1000000, percent: 11 },
        { type: 'SCME', count: 7, amount: 900000, percent: 9 },
    ],
    lastUpdated: new Date().toISOString(),
};

export function Dashboard() {
    const { data: summary, isLoading: summaryLoading } = useSummary();
    const { data: chapters, isLoading: chaptersLoading } = useChapters();
    const { data: composition, isLoading: compositionLoading } = useComposition();

    // Use mock data if API not connected
    const summaryData = summary || mockSummary;
    const chaptersData = chapters || mockChapters;
    const compositionData = composition || mockComposition;

    const formatCurrency = (amount: number) => {
        if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
        return `${(amount / 1000).toFixed(0)}K`;
    };

    return (
        <div className="space-y-6">
            {/* Impact KPIs Row */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Students Funded"
                    value={summaryData.impact.studentsFunded}
                    icon={<Heart className="w-5 h-5 text-emerald-400" />}
                    color="emerald"
                    isLoading={summaryLoading}
                    tooltip="Students fully funded based on effective amount (PKR 270K per student)"
                />
                <KPICard
                    title="Awaiting Support"
                    value={summaryData.impact.studentsAwaiting}
                    icon={<AlertCircle className="w-5 h-5 text-amber-400" />}
                    color="amber"
                    isLoading={summaryLoading}
                    tooltip="Students with pending hostel dues who need funding"
                />
                <KPICard
                    title="Total Pledges"
                    value={summaryData.impact.pledgeCount}
                    icon={<Users className="w-5 h-5 text-blue-400" />}
                    color="blue"
                    isLoading={summaryLoading}
                    tooltip="Total number of donation pledges received (one-time + recurring)"
                />
                <KPICard
                    title="Funded Monthly"
                    value={summaryData.subscriptions?.studentsFundedMonthly ?? 0}
                    suffix=" students"
                    icon={<Repeat className="w-5 h-5 text-cyan-400" />}
                    color="cyan"
                    isLoading={summaryLoading}
                    tooltip="Students with recurring monthly support from subscription donors"
                />
            </section>

            {/* Funding Gap Bar */}
            <FundingGapBar
                raised={summaryData.financials.totalVerified}
                pledged={summaryData.financials.totalEffective}
                gap={summaryData.financials.fundingGap}
                isLoading={summaryLoading}
            />

            {/* Financial KPIs Row */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Total Pledged"
                    value={summaryData.financials.totalPledged}
                    prefix="PKR "
                    formatter={formatCurrency}
                    icon={<Wallet className="w-5 h-5 text-purple-400" />}
                    color="purple"
                    isLoading={summaryLoading}
                    tooltip="Total amount promised by all donors (one-time + recurring)"
                />
                <KPICard
                    title="Monthly Recurring"
                    value={summaryData.subscriptions?.mrr ?? 0}
                    prefix="PKR "
                    formatter={formatCurrency}
                    suffix="/mo"
                    icon={<Repeat className="w-5 h-5 text-cyan-400" />}
                    color="cyan"
                    isLoading={summaryLoading}
                    tooltip="Monthly revenue from active subscription donors"
                />
                <KPICard
                    title="Verified"
                    value={summaryData.financials.totalVerified}
                    prefix="PKR "
                    formatter={formatCurrency}
                    icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
                    color="emerald"
                    isLoading={summaryLoading}
                    tooltip="Total funds verified through receipt submission"
                />
                <KPICard
                    title="Balance"
                    value={summaryData.financials.balance}
                    prefix="PKR "
                    formatter={formatCurrency}
                    icon={<Wallet className="w-5 h-5 text-cyan-400" />}
                    color="cyan"
                    isLoading={summaryLoading}
                    tooltip="Available funds ready for allocation (Verified - Allocated)"
                />
            </section>

            {/* Processing Gauges & Status Pipeline */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ProcessingGauges
                    data={summaryData.processingDays}
                    isLoading={summaryLoading}
                />
                <StatusPipeline
                    data={summaryData.pipeline}
                    isLoading={summaryLoading}
                />
            </section>

            {/* Leaderboard & Composition */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Leaderboard
                    data={chaptersData.data}
                    isLoading={chaptersLoading}
                />
                <CompositionCharts
                    data={compositionData}
                    isLoading={compositionLoading}
                />
            </section>

            {/* Weekly Trends */}
            <section>
                <TrendsChart
                    data={summaryData.trends}
                    isLoading={summaryLoading}
                />
            </section>

            {/* Pledge Tracker */}
            <PledgeTracker />
        </div>
    );
}
