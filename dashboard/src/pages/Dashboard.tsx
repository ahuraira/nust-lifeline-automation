import { useSummary, useChapters, useComposition } from '../hooks/useData';
import { KPICard } from '../components/KPICard';
import { FundingGapBar } from '../components/FundingGapBar';
import { ProcessingGauges } from '../components/ProcessingGauges';
import { StatusPipeline } from '../components/StatusPipeline';
import { Leaderboard } from '../components/Leaderboard';
import { CompositionCharts } from '../components/CompositionCharts';
import { PledgeTracker } from '../components/PledgeTracker';
import { TrendsChart } from '../components/TrendsChart';
import { Users, Wallet, TrendingUp, Heart, AlertCircle } from 'lucide-react';

// Mock data for development (before API is deployed)
const mockSummary = {
    impact: { studentsFunded: 42, studentsAwaiting: 12, pledgeCount: 85 },
    financials: {
        totalPledged: 9500000,
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
    lastUpdated: new Date().toISOString(),
};

const mockChapters = {
    data: [
        { chapter: 'Karachi', pledged: 3500000, verified: 2800000, count: 32, realizationRate: 80 },
        { chapter: 'Islamabad', pledged: 2200000, verified: 1800000, count: 20, realizationRate: 82 },
        { chapter: 'Lahore', pledged: 1500000, verified: 1100000, count: 12, realizationRate: 73 },
        { chapter: 'USA (North America)', pledged: 1200000, verified: 900000, count: 5, realizationRate: 75 },
        { chapter: 'UK', pledged: 600000, verified: 600000, count: 8, realizationRate: 100 },
        { chapter: 'KSA', pledged: 500000, verified: 0, count: 8, realizationRate: 0 },
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
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KPICard
                    title="Students Funded"
                    value={summaryData.impact.studentsFunded}
                    icon={<Heart className="w-5 h-5 text-emerald-400" />}
                    color="emerald"
                    isLoading={summaryLoading}
                />
                <KPICard
                    title="Awaiting Support"
                    value={summaryData.impact.studentsAwaiting}
                    icon={<AlertCircle className="w-5 h-5 text-amber-400" />}
                    color="amber"
                    isLoading={summaryLoading}
                />
                <KPICard
                    title="Total Pledges"
                    value={summaryData.impact.pledgeCount}
                    icon={<Users className="w-5 h-5 text-blue-400" />}
                    color="blue"
                    isLoading={summaryLoading}
                />
            </section>

            {/* Funding Gap Bar */}
            <FundingGapBar
                raised={summaryData.financials.totalVerified}
                gap={summaryData.financials.fundingGap}
                isLoading={summaryLoading}
            />

            {/* Financial KPIs Row */}
            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPICard
                    title="Total Pledged"
                    value={summaryData.financials.totalPledged}
                    prefix="PKR "
                    formatter={formatCurrency}
                    icon={<Wallet className="w-5 h-5 text-purple-400" />}
                    color="purple"
                    isLoading={summaryLoading}
                />
                <KPICard
                    title="Verified"
                    value={summaryData.financials.totalVerified}
                    prefix="PKR "
                    formatter={formatCurrency}
                    icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
                    color="emerald"
                    isLoading={summaryLoading}
                />
                <KPICard
                    title="Allocated"
                    value={summaryData.financials.totalAllocated}
                    prefix="PKR "
                    formatter={formatCurrency}
                    icon={<Users className="w-5 h-5 text-blue-400" />}
                    color="blue"
                    isLoading={summaryLoading}
                />
                <KPICard
                    title="Balance"
                    value={summaryData.financials.balance}
                    prefix="PKR "
                    formatter={formatCurrency}
                    icon={<Wallet className="w-5 h-5 text-cyan-400" />}
                    color="cyan"
                    isLoading={summaryLoading}
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
