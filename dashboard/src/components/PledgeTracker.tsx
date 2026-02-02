import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CheckCircle, Clock, FileCheck, Send, AlertCircle } from 'lucide-react';
import { useTrack } from '../hooks/useData';
import type { TimelineEntry } from '../types/api';

const statusIcons: Record<string, React.ReactNode> = {
    'Pledged': <Clock className="w-4 h-4" />,
    'Proof Received': <FileCheck className="w-4 h-4" />,
    'Allocated': <Send className="w-4 h-4" />,
    'Hostel Verified': <CheckCircle className="w-4 h-4" />,
};

const statusColors: Record<string, string> = {
    'Pledged': 'bg-amber-500',
    'Proof Received': 'bg-blue-500',
    'Allocated': 'bg-purple-500',
    'Hostel Verified': 'bg-emerald-500',
};

export function PledgeTracker() {
    const [searchId, setSearchId] = useState('');
    const [activeSearch, setActiveSearch] = useState<string | null>(null);

    const { data, isLoading, error } = useTrack(activeSearch);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchId.trim()) {
            setActiveSearch(searchId.trim().toUpperCase());
        }
    };

    const formatAmount = (amount: number) => {
        if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
        if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
        return amount.toLocaleString();
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-6"
        >
            <div className="flex items-center gap-2 mb-4">
                <Search className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-medium text-slate-300">Track Your Pledge</h3>
            </div>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                <input
                    type="text"
                    value={searchId}
                    onChange={(e) => setSearchId(e.target.value)}
                    placeholder="Enter Pledge ID (e.g., PLD-00042)"
                    className="flex-1 px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
                <button
                    type="submit"
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-medium"
                >
                    Track
                </button>
            </form>

            {/* Results */}
            <AnimatePresence mode="wait">
                {isLoading && (
                    <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="py-8 text-center"
                    >
                        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        <p className="text-slate-400 text-sm">Searching...</p>
                    </motion.div>
                )}

                {error && (
                    <motion.div
                        key="error"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="py-6 text-center"
                    >
                        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                        <p className="text-rose-400 text-sm">Failed to fetch pledge data</p>
                    </motion.div>
                )}

                {data && !data.error && (
                    <motion.div
                        key="result"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        {/* Pledge Summary */}
                        <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg mb-4">
                            <div>
                                <p className="font-semibold text-white">{data.pledgeId}</p>
                                <p className="text-xs text-slate-400">PKR {formatAmount(data.amount)}</p>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[data.currentStatus] || 'bg-slate-600'} text-white`}>
                                {data.currentStatus}
                            </div>
                        </div>

                        {/* Timeline */}
                        <div className="relative pl-6">
                            <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-600" />

                            {data.timeline.map((entry: TimelineEntry, index: number) => (
                                <motion.div
                                    key={`${entry.date}-${entry.status}`}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.1 * index }}
                                    className="relative pb-4 last:pb-0"
                                >
                                    {/* Dot */}
                                    <div className={`absolute -left-4 w-4 h-4 rounded-full flex items-center justify-center ${statusColors[entry.status] || 'bg-slate-600'}`}>
                                        {statusIcons[entry.status] || <div className="w-2 h-2 bg-white rounded-full" />}
                                    </div>

                                    {/* Content */}
                                    <div className="ml-4">
                                        <p className="text-sm font-medium text-white">{entry.status}</p>
                                        <p className="text-xs text-slate-400">{entry.note}</p>
                                        <p className="text-xs text-slate-500 mt-1">{entry.date}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {data?.error && (
                    <motion.div
                        key="not-found"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="py-6 text-center"
                    >
                        <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                        <p className="text-amber-400 text-sm">{data.error}</p>
                        <p className="text-slate-500 text-xs mt-1">Check your Pledge ID and try again</p>
                    </motion.div>
                )}

                {!activeSearch && !isLoading && (
                    <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="py-8 text-center text-slate-500"
                    >
                        <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Enter your Pledge ID to track your donation</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
