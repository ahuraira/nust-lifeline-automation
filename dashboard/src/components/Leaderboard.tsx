import { motion } from 'framer-motion';
import type { ChapterData } from '../types/api';
import { Trophy } from 'lucide-react';

interface LeaderboardProps {
    data: ChapterData[];
    isLoading?: boolean;
}

export function Leaderboard({ data, isLoading }: LeaderboardProps) {
    const formatAmount = (amount: number) => {
        if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
        if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
        return amount.toLocaleString();
    };

    const getRankBadge = (rank: number) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    };

    const getProgressColor = (progress: number) => {
        if (progress >= 80) return 'bg-[var(--color-status-success)]';
        if (progress >= 50) return 'bg-[var(--color-status-warning)]';
        return 'bg-[var(--color-status-error)]';
    };

    if (isLoading) {
        return (
            <div className="glass-card rounded-xl p-6">
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-16 bg-slate-700/50 rounded-lg animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="glass-card rounded-xl p-8"
        >
            <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Chapter Leaderboard</h3>
            </div>

            <div className="space-y-3">
                {data.map((chapter, index) => (
                    <motion.div
                        key={chapter.chapter}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 * index }}
                        className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                        title={`${chapter.targetStudents} of ${chapter.targetStudents} students funded`}
                    >
                        {/* Header Row */}
                        <div className="flex items-center gap-3 mb-2">
                            {/* Rank */}
                            <div className="w-8 text-center text-lg">
                                {getRankBadge(index + 1)}
                            </div>

                            {/* Chapter Name */}
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-900 dark:text-white truncate">{chapter.chapter}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {chapter.studentsFunded} / {chapter.targetStudents} students funded
                                </p>
                            </div>

                            {/* Amount & Progress */}
                            <div className="text-right">
                                <p className="font-semibold text-slate-900 dark:text-white">
                                    PKR {formatAmount(chapter.effective)} / {formatAmount(chapter.target)}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{chapter.progress}%</p>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700/50 rounded-full overflow-hidden">
                            <div
                                className={`h-full ${getProgressColor(chapter.progress)} transition-all duration-500`}
                                style={{ width: `${Math.min(chapter.progress, 100)}%` }}
                            />
                        </div>
                    </motion.div>
                ))}
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500 mt-4 text-center">
                Progress = Effective Amount / Target
            </p>
        </motion.div>
    );
}
