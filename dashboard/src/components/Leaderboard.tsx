import { motion } from 'framer-motion';
import type { ChapterData } from '../types/api';
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react';

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

    const getRealizationColor = (rate: number) => {
        if (rate >= 90) return 'text-emerald-400';
        if (rate >= 70) return 'text-amber-400';
        return 'text-rose-400';
    };

    if (isLoading) {
        return (
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-6">
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-12 bg-slate-700/50 rounded-lg animate-pulse" />
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
            className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-6"
        >
            <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-medium text-slate-300">Chapter Leaderboard</h3>
            </div>

            <div className="space-y-2">
                {data.map((chapter, index) => (
                    <motion.div
                        key={chapter.chapter}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 * index }}
                        className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/20 hover:bg-slate-700/40 transition-colors"
                    >
                        {/* Rank */}
                        <div className="w-8 text-center text-lg">
                            {getRankBadge(index + 1)}
                        </div>

                        {/* Chapter Name */}
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-white truncate">{chapter.chapter}</p>
                            <p className="text-xs text-slate-400">{chapter.count} pledges</p>
                        </div>

                        {/* Amount */}
                        <div className="text-right">
                            <p className="font-semibold text-white">PKR {formatAmount(chapter.pledged)}</p>
                            <p className="text-xs text-slate-400">
                                {formatAmount(chapter.verified)} verified
                            </p>
                        </div>

                        {/* Realization Rate */}
                        <div className={`flex items-center gap-1 min-w-[60px] justify-end ${getRealizationColor(chapter.realizationRate)}`}>
                            {chapter.realizationRate >= 70 ? (
                                <TrendingUp className="w-4 h-4" />
                            ) : (
                                <TrendingDown className="w-4 h-4" />
                            )}
                            <span className="text-sm font-medium">{chapter.realizationRate}%</span>
                        </div>
                    </motion.div>
                ))}
            </div>

            <p className="text-xs text-slate-500 mt-4 text-center">
                Realization Rate = Verified / Pledged
            </p>
        </motion.div>
    );
}
