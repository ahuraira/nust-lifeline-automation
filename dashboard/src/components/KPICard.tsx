import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Trend {
    value: number;
    isPositive: boolean;
}

interface KPICardProps {
    title: string;
    value: number;
    prefix?: string;
    suffix?: string;
    trend?: Trend;
    icon: React.ReactNode;
    color: 'indigo' | 'emerald' | 'amber' | 'rose' | 'purple' | 'blue' | 'cyan';
    isLoading?: boolean;
    formatter?: (value: number) => string;
}

const colorClasses = {
    indigo: 'from-indigo-500 to-indigo-600',
    emerald: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600',
    rose: 'from-rose-500 to-rose-600',
    purple: 'from-purple-500 to-purple-600',
    blue: 'from-blue-500 to-blue-600',
    cyan: 'from-cyan-500 to-cyan-600',
};

const bgClasses = {
    indigo: 'bg-indigo-500/10',
    emerald: 'bg-emerald-500/10',
    amber: 'bg-amber-500/10',
    rose: 'bg-rose-500/10',
    purple: 'bg-purple-500/10',
    blue: 'bg-blue-500/10',
    cyan: 'bg-cyan-500/10',
};

export function KPICard({ title, value, prefix = '', suffix = '', trend, icon, color, isLoading, formatter }: KPICardProps) {
    const TrendIcon = trend
        ? (trend.isPositive ? TrendingUp : TrendingDown)
        : Minus;
    const trendColor = trend
        ? (trend.isPositive ? 'text-emerald-400' : 'text-rose-400')
        : 'text-slate-400';

    const defaultFormatter = (v: number): string => {
        if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
        if (v >= 1000) return Math.round(v / 1000) + 'K';
        return v.toLocaleString();
    };

    const formatValue = formatter || defaultFormatter;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6"
        >
            {/* Gradient accent */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${colorClasses[color]}`} />

            <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl ${bgClasses[color]}`}>
                    {icon}
                </div>

                {trend && (
                    <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
                        <TrendIcon className="w-4 h-4" />
                        <span>{trend.value}%</span>
                    </div>
                )}
            </div>

            <div className="space-y-1">
                <p className="text-sm text-slate-400">{title}</p>

                {isLoading ? (
                    <div className="h-9 bg-slate-700/50 rounded animate-pulse" />
                ) : (
                    <p className="text-3xl font-bold text-white">
                        {prefix}
                        <CountUp
                            end={value}
                            duration={1.5}
                            separator=","
                            formattingFn={formatValue}
                        />
                        {suffix}
                    </p>
                )}
            </div>
        </motion.div>
    );
}
