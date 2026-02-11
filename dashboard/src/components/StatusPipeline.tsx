import { motion } from 'framer-motion';
import type { PipelineBreakdown } from '../types/api';
import { Clock, FileCheck, Send, CheckCircle } from 'lucide-react';

interface StatusPipelineProps {
    data: PipelineBreakdown;
    isLoading?: boolean;
}

const stages = [
    { key: 'pendingProof', label: 'Pending Proof', icon: Clock, color: 'amber' },
    { key: 'proofReceived', label: 'Proof Received', icon: FileCheck, color: 'blue' },
    { key: 'allocated', label: 'Allocated', icon: Send, color: 'purple' },
    { key: 'hostelVerified', label: 'Verified', icon: CheckCircle, color: 'emerald' },
] as const;

const colorClasses = {
    amber: 'bg-[var(--color-status-warning)]/10 text-[var(--color-status-warning)] border-[var(--color-status-warning)]/20',
    blue: 'bg-[var(--color-status-info)]/10 text-[var(--color-status-info)] border-[var(--color-status-info)]/20',
    purple: 'bg-[var(--color-chart-5)]/10 text-[var(--color-chart-5)] border-[var(--color-chart-5)]/20',
    emerald: 'bg-[var(--color-status-success)]/10 text-[var(--color-status-success)] border-[var(--color-status-success)]/20',
};

export function StatusPipeline({ data, isLoading }: StatusPipelineProps) {
    const formatAmount = (amount: number) => {
        if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
        if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
        return amount.toLocaleString();
    };

    if (isLoading) {
        return (
            <div className="glass-card rounded-xl p-6">
                <div className="grid grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-20 bg-slate-200 dark:bg-slate-700/50 rounded-lg animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="glass-card rounded-xl p-6"
        >
            <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-4">
                Pipeline Status <span className="text-slate-500 dark:text-slate-500">(Where are funds?)</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {stages.map((stage, index) => {
                    const stageData = data[stage.key];
                    const Icon = stage.icon;

                    return (
                        <motion.div
                            key={stage.key}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 * index }}
                            className={`relative rounded-lg border p-4 ${colorClasses[stage.color]} backdrop-blur-sm`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Icon className="w-4 h-4" />
                                <span className="text-xs font-medium">{stage.label}</span>
                            </div>

                            <div className="text-2xl font-bold text-[var(--color-text-primary)]">
                                {stageData.count}
                            </div>

                            <div className="text-xs text-[var(--color-text-secondary)]">
                                PKR {formatAmount(stageData.amount)}
                            </div>

                            {/* Connector arrow (except last) */}
                            {index < stages.length - 1 && (
                                <div className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 z-10">
                                    →
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </motion.div>
    );
}
