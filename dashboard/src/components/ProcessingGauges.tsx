import { motion } from 'framer-motion';
import type { ProcessingDays } from '../types/api';

interface ProcessingGaugesProps {
    data: ProcessingDays;
    isLoading?: boolean;
}

interface GaugeProps {
    label: string;
    value: number;
    maxValue: number;
    color: string;
    description: string;
}

function Gauge({ label, value, maxValue, description }: GaugeProps) {
    const percent = Math.min((value / maxValue) * 100, 100);
    const circumference = 2 * Math.PI * 40; // radius = 40
    const strokeDashoffset = circumference - (percent / 100) * circumference * 0.75; // 270 degree arc

    // Color based on performance (lower is better)
    const getColor = () => {
        if (value <= maxValue * 0.3) return 'stroke-[var(--color-status-success)]';
        if (value <= maxValue * 0.6) return 'stroke-[var(--color-status-warning)]';
        return 'stroke-[var(--color-status-error)]';
    };

    return (
        <div className="flex flex-col items-center">
            <div className="relative w-24 h-24">
                {/* Background arc */}
                <svg className="w-full h-full -rotate-[135deg]" viewBox="0 0 100 100">
                    <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        className="stroke-slate-200 dark:stroke-slate-700"
                        strokeWidth="8"
                        strokeDasharray={circumference * 0.75}
                        strokeDashoffset={0}
                        strokeLinecap="round"
                    />
                    {/* Foreground arc */}
                    <motion.circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        className={getColor()}
                        strokeWidth="8"
                        strokeDasharray={circumference * 0.75}
                        initial={{ strokeDashoffset: circumference * 0.75 }}
                        animate={{ strokeDashoffset }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        strokeLinecap="round"
                    />
                </svg>

                {/* Center value */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold text-slate-900 dark:text-white">{value}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">days</span>
                </div>
            </div>

            <div className="text-center mt-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
            </div>
        </div>
    );
}

export function ProcessingGauges({ data, isLoading }: ProcessingGaugesProps) {
    if (isLoading) {
        return (
            <div className="glass-card rounded-xl p-6">
                <div className="grid grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex flex-col items-center">
                            <div className="w-24 h-24 rounded-full bg-slate-200 dark:bg-slate-700/50 animate-pulse" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="glass-card rounded-xl p-8"
        >
            <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-4 text-center">
                Processing Times (Avg Days)
            </h3>

            <div className="grid grid-cols-3 gap-4">
                <Gauge
                    label="Receipt"
                    value={data.pledgeToReceipt}
                    maxValue={14}
                    color="emerald"
                    description="Pledge → Proof"
                />
                <Gauge
                    label="Allocation"
                    value={data.receiptToAllocation}
                    maxValue={7}
                    color="amber"
                    description="Proof → Allocated"
                />
                <Gauge
                    label="Hostel"
                    value={data.allocationToHostel}
                    maxValue={10}
                    color="purple"
                    description="Sent → Verified"
                />
            </div>
        </motion.div>
    );
}
