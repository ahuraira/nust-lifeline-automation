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
    impact: { studentsFunded: 28, studentsAwaiting: 15, pledgeCount: 42 },
    financials: {
        totalPledged: 2500000,
        totalVerified: 1800000,
        totalAllocated: 1400000,
        balance: 400000,
        fundingGap: 1200000
    },
    processingDays: {
        pledgeToReceipt: 4.2,
        receiptToAllocation: 1.5,
        allocationToHostel: 3.8
    },
    pipeline: {
        pendingProof: { count: 8, amount: 400000 },
        proofReceived: { count: 5, amount: 250000 },
        allocated: { count: 12, amount: 600000 },
        hostelVerified: { count: 17, amount: 550000 },
    },
    trends: [],
    lastUpdated: new Date().toISOString(),
};

const mockChapters = {
    data: [
        { chapter: 'Karachi', pledged: 850000, verified: 720000, count: 15, realizationRate: 85 },
        { chapter: 'Dubai', pledged: 480000, verified: 480000, count: 8, realizationRate: 100 },
        { chapter: 'Lahore', pledged: 420000, verified: 350000, count: 10, realizationRate: 83 },
        { chapter: 'UK', pledged: 380000, verified: 280000, count: 5, realizationRate: 74 },
        { chapter: 'USA', pledged: 220000, verified: 180000, count: 4, realizationRate: 82 },
    ],
    lastUpdated: new Date().toISOString(),
};

const mockComposition = {
    zakat: { amount: 1200000, percent: 48 },
    general: { amount: 1300000, percent: 52 },
    affiliation: [
        { type: 'NBS', count: 18, amount: 450000, percent: 18 },
        { type: 'SEECS', count: 12, amount: 900000, percent: 36 },
        { type: 'SMME', count: 8, amount: 800000, percent: 32 },
        { type: 'SADA', count: 4, amount: 350000, percent: 14 },
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
