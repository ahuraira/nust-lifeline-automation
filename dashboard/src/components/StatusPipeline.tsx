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
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};

export function StatusPipeline({ data, isLoading }: StatusPipelineProps) {
    const formatAmount = (amount: number) => {
        if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
        if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
        return amount.toLocaleString();
    };

    if (isLoading) {
        return (
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-6">
                <div className="grid grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-20 bg-slate-700/50 rounded-lg animate-pulse" />
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
            className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-6"
        >
            <h3 className="text-sm font-medium text-slate-300 mb-4">
                Pipeline Status <span className="text-slate-500">(Where are funds?)</span>
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
                            className={`relative rounded-lg border p-4 ${colorClasses[stage.color]}`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Icon className="w-4 h-4" />
                                <span className="text-xs font-medium">{stage.label}</span>
                            </div>

                            <div className="text-2xl font-bold text-white">
                                {stageData.count}
                            </div>

                            <div className="text-xs text-slate-400">
                                PKR {formatAmount(stageData.amount)}
                            </div>

                            {/* Connector arrow (except last) */}
                            {index < stages.length - 1 && (
                                <div className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 text-slate-600">
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
