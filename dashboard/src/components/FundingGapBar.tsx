import { motion } from 'framer-motion';

interface FundingGapBarProps {
    raised: number;
    gap: number;
    isLoading?: boolean;
}

export function FundingGapBar({ raised, gap, isLoading }: FundingGapBarProps) {
    const total = raised + gap;
    const raisedPercent = total > 0 ? (raised / total) * 100 : 0;

    const formatAmount = (amount: number) => {
        if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
        if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
        return amount.toLocaleString();
    };

    if (isLoading) {
        return (
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-6">
                <div className="h-8 bg-slate-700/50 rounded-full animate-pulse" />
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-6"
        >
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-300">Campaign Progress</h3>
                <span className="text-sm text-slate-400">
                    {raisedPercent.toFixed(0)}% Raised
                </span>
            </div>

            {/* Progress Bar */}
            <div className="relative h-8 bg-slate-700/50 rounded-full overflow-hidden">
                {/* Raised (Green) */}
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${raisedPercent}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                />

                {/* Center divider line */}
                <div
                    className="absolute inset-y-0 w-0.5 bg-slate-600"
                    style={{ left: `${raisedPercent}%` }}
                />
            </div>

            {/* Labels */}
            <div className="flex justify-between mt-3 text-sm">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-slate-300">
                        Raised: <span className="font-semibold text-emerald-400">PKR {formatAmount(raised)}</span>
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500/50" />
                    <span className="text-slate-300">
                        Gap: <span className="font-semibold text-rose-400">PKR {formatAmount(gap)}</span>
                    </span>
                </div>
            </div>
        </motion.div>
    );
}
