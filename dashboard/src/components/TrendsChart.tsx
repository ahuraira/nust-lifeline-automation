import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { WeeklyTrend } from '../types/api';

interface TrendsChartProps {
    data: WeeklyTrend[];
    isLoading?: boolean;
}

function formatWeekLabel(dateStr: string): string {
    const date = new Date(dateStr);
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
}

function formatCurrency(amount: number): string {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
    return amount.toString();
}

export function TrendsChart({ data, isLoading }: TrendsChartProps) {
    if (isLoading) {
        return (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                <div className="h-64 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-500/20 rounded-lg">
                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">Weekly Trends</h3>
                </div>
                <div className="h-48 flex items-center justify-center text-slate-500">
                    No trend data available yet
                </div>
            </div>
        );
    }

    // Data comes from API sorted oldest to newest (left to right)
    const chartData = data.map(item => ({
        week: formatWeekLabel(item.week),
        pledged: item.amount,
        verified: item.verified || 0
    }));

    // Calculate totals for summary
    const totalPledges = data.reduce((sum, d) => sum + d.pledges, 0);
    const totalPledged = data.reduce((sum, d) => sum + d.amount, 0);
    const totalVerified = data.reduce((sum, d) => sum + (d.verified || 0), 0);

    return (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 rounded-lg">
                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">Weekly Trends</h3>
                        <p className="text-sm text-slate-400">Last 8 weeks</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-bold text-emerald-400">{totalPledges}</p>
                    <p className="text-sm text-slate-400">
                        pledges • <span className="text-purple-400">PKR {formatCurrency(totalPledged)}</span> pledged • <span className="text-emerald-400">PKR {formatCurrency(totalVerified)}</span> verified
                    </p>
                </div>
            </div>

            {/* Chart */}
            <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="pledgedGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="verifiedGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#334155"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="week"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                            tickFormatter={(value) => formatCurrency(value)}
                            width={50}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
                            }}
                            labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                            formatter={(value, name) => {
                                const numValue = Number(value) || 0;
                                const label = name === 'pledged' ? 'Pledged' : 'Verified';
                                return [`PKR ${formatCurrency(numValue)}`, label];
                            }}
                        />
                        <Legend
                            wrapperStyle={{ paddingTop: '10px' }}
                            formatter={(value) => (
                                <span className="text-slate-400 text-sm">
                                    {value === 'pledged' ? 'Amount Pledged' : 'Amount Verified'}
                                </span>
                            )}
                        />
                        <Area
                            type="monotone"
                            dataKey="pledged"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            fill="url(#pledgedGradient)"
                            name="pledged"
                        />
                        <Area
                            type="monotone"
                            dataKey="verified"
                            stroke="#10b981"
                            strokeWidth={2}
                            fill="url(#verifiedGradient)"
                            name="verified"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
