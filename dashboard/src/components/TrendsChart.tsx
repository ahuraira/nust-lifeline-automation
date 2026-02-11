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
            <div className="glass-card rounded-xl p-6">
                <div className="h-64 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="glass-card rounded-xl p-6">
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
        <div className="glass-card rounded-xl p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[var(--color-status-success)]/10 rounded-lg">
                        <TrendingUp className="w-5 h-5 text-[var(--color-status-success)]" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Weekly Trends</h3>
                        <p className="text-sm text-[var(--color-text-secondary)]">Last 8 weeks</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-2xl font-bold text-[var(--color-status-success)]">{totalPledges}</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        pledges • <span className="text-[var(--color-chart-5)]">PKR {formatCurrency(totalPledged)}</span> pledged • <span className="text-[var(--color-status-success)]">PKR {formatCurrency(totalVerified)}</span> verified
                    </p>
                </div>
            </div>

            {/* Chart */}
            <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="pledgedGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-chart-5)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="var(--color-chart-5)" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="verifiedGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-status-success)" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="var(--color-status-success)" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--color-grid)"
                            vertical={false}
                        />
                        <XAxis
                            dataKey="week"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                            tickFormatter={(value) => formatCurrency(value)}
                            width={50}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--glass-bg)',
                                backdropFilter: 'var(--glass-blur)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: '12px',
                                boxShadow: 'var(--glass-shadow)',
                                padding: '12px',
                                color: 'var(--color-text-primary)'
                            }}
                            itemStyle={{ color: 'var(--color-text-primary)' }}
                            labelStyle={{ color: 'var(--color-text-primary)', fontWeight: '600', marginBottom: '8px' }}
                            formatter={(value, name) => {
                                const numValue = Number(value) || 0;
                                const label = name === 'pledged' ? 'Pledged' : 'Verified';
                                return [`PKR ${formatCurrency(numValue)}`, label];
                            }}
                        />
                        <Legend
                            wrapperStyle={{ paddingTop: '10px' }}
                            formatter={(value) => (
                                <span className="text-slate-500 dark:text-slate-400 text-sm">
                                    {value === 'pledged' ? 'Amount Pledged' : 'Amount Verified'}
                                </span>
                            )}
                        />
                        <Area
                            type="monotone"
                            dataKey="pledged"
                            stroke="var(--color-chart-5)"
                            strokeWidth={2}
                            fill="url(#pledgedGradient)"
                            name="pledged"
                        />
                        <Area
                            type="monotone"
                            dataKey="verified"
                            stroke="var(--color-status-success)"
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
