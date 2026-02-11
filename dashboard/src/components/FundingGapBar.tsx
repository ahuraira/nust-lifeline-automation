import { motion } from 'framer-motion';

interface FundingGapBarProps {
    raised: number;          // Verified amount
    pledged: number;         // Effective amount (for dashed line)
    gap: number;
    isLoading?: boolean;
}

export function FundingGapBar({ raised, pledged, gap, isLoading }: FundingGapBarProps) {
    // Scale based on pledged + gap (total need including committed)
    const total = pledged + gap;
    const raisedPercent = total > 0 ? (raised / total) * 100 : 0;
    const pledgedPercent = total > 0 ? (pledged / total) * 100 : 0;

    const formatAmount = (amount: number) => {
        if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
        if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
        return amount.toLocaleString();
    };

    if (isLoading) {
        return (
            <div className="glass-card rounded-xl p-6">
                <div className="h-8 bg-slate-700/50 rounded-full animate-pulse" />
            </div>
        );
    }

    return (
        <div className="glass-card rounded-xl p-8 mb-6">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-[var(--color-text-primary)]">Campaign Progress</h3>
                <span className="text-sm text-[var(--color-text-secondary)]">
                    {raisedPercent.toFixed(0)}% Verified
                </span>
            </div>

            {/* Progress Bar */}
            <div className="relative h-8 bg-slate-200 dark:bg-slate-700/50 rounded-full overflow-hidden">
                {/* Raised/Verified (Success Color) */}
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${raisedPercent}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="absolute inset-y-0 left-0 bg-[var(--color-status-success)] rounded-full"
                />

                {/* Dashed line at pledged/effective position (Warning Color) */}
                {pledgedPercent < 100 && (
                    <div
                        className="absolute inset-y-0 w-0.5 z-10"
                        style={{
                            left: `${Math.min(pledgedPercent, 100)}%`,
                            borderLeft: '2px dashed var(--color-status-warning)',
                            height: '100%'
                        }}
                    />
                )}
            </div>

            {/* Labels */}
            <div className="flex justify-between mt-3 text-sm">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[var(--color-status-success)]" />
                    <span className="text-[var(--color-text-secondary)]">
                        Verified: <span className="font-semibold text-[var(--color-status-success)]">PKR {formatAmount(raised)}</span>
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border-2 border-dashed border-[var(--color-status-warning)]" />
                    <span className="text-[var(--color-text-secondary)]">
                        Pledged: <span className="font-semibold text-[var(--color-status-warning)]">PKR {formatAmount(pledged)}</span>
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[var(--color-status-error)]/50" />
                    <span className="text-[var(--color-text-secondary)]">
                        Gap: <span className="font-semibold text-[var(--color-status-error)]">PKR {formatAmount(gap)}</span>
                    </span>
                </div>
            </div>
        </div>
    );
}
