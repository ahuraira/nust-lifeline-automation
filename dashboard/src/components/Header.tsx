import { useState } from 'react';
import { Moon, Sun, RefreshCw, Activity } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

interface HeaderProps {
    isDark: boolean;
    onToggleTheme: () => void;
    lastUpdated?: string;
}

export function Header({ isDark, onToggleTheme, lastUpdated }: HeaderProps) {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const queryClient = useQueryClient();

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await queryClient.invalidateQueries();
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    return (
        <header className="sticky top-0 z-50 bg-[var(--color-bg-primary)]/80 backdrop-blur-md border-b border-[var(--color-border)] transition-colors">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo & Title */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                            <Activity className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Lifeline Insights</h1>
                            <p className="text-xs text-[var(--color-text-secondary)]">NUST Hostel Fund Campaign</p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-4">
                        {lastUpdated && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                                Updated: {new Date(lastUpdated).toLocaleTimeString()}
                            </span>
                        )}

                        {/* Refresh Button */}
                        <motion.button
                            onClick={handleRefresh}
                            className="p-2 rounded-lg bg-[var(--color-bg-secondary)] hover:opacity-80 text-[var(--color-text-secondary)] transition-colors"
                            whileTap={{ scale: 0.95 }}
                            title="Refresh Data"
                        >
                            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </motion.button>

                        {/* Theme Toggle */}
                        <motion.button
                            onClick={onToggleTheme}
                            className="p-2 rounded-lg bg-[var(--color-bg-secondary)] hover:opacity-80 text-[var(--color-text-secondary)] transition-colors"
                            whileTap={{ scale: 0.95 }}
                            title={isDark ? 'Light Mode' : 'Dark Mode'}
                        >
                            <AnimatePresence mode="wait">
                                {isDark ? (
                                    <motion.div
                                        key="sun"
                                        initial={{ rotate: -90, opacity: 0 }}
                                        animate={{ rotate: 0, opacity: 1 }}
                                        exit={{ rotate: 90, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <Sun className="w-5 h-5 text-amber-500" />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="moon"
                                        initial={{ rotate: 90, opacity: 0 }}
                                        animate={{ rotate: 0, opacity: 1 }}
                                        exit={{ rotate: -90, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <Moon className="w-5 h-5 text-slate-600" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.button>
                    </div>
                </div>
            </div>
        </header>
    );
}
