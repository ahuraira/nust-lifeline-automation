import { motion } from 'framer-motion';
import { useEvents } from '../hooks/useData';
import type { DashboardEvent } from '../types/api';

// Color mapping based on event type
const eventColors: Record<string, string> = {
    NEW_PLEDGE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    PLEDGE_RECEIVED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    RECEIPT_PROCESSED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    RECEIPT_PROCESSED_V2: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    RECEIPT_VERIFIED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    ALLOCATION: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    ALLOCATION_COMPLETE: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    HOSTEL_VERIFICATION: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    HOSTEL_CONFIRMED: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    HOSTEL_QUERY: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    DONOR_NOTIFIED: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    STATUS_CHANGE: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    ALERT: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function formatTimeAgo(timestamp: string): string {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
}

export function EventTicker() {
    const { data, isLoading } = useEvents();

    if (isLoading || !data?.events?.length) {
        return null;
    }

    // Duplicate events for seamless loop
    const events = [...data.events.slice(0, 8), ...data.events.slice(0, 8)];

    return (
        <div className="bg-[var(--color-bg-secondary)]/80 backdrop-blur-md border-b border-[var(--color-border)] overflow-hidden">
            <div className="flex items-center">
                {/* Live indicator - fixed on left */}
                <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] shrink-0 px-4 py-2 bg-[var(--color-bg-secondary)] z-10 border-r border-[var(--color-border)]">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-status-success)] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--color-status-success)]"></span>
                    </span>
                    <span className="font-medium">Live</span>
                </div>

                {/* Scrolling marquee container */}
                <div className="overflow-hidden flex-1 relative">
                    {/* Fade edges - using CSS mask or simple gradients to transparent */}
                    <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[var(--color-bg-secondary)] to-transparent z-10 pointer-events-none" />
                    <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--color-bg-secondary)] to-transparent z-10 pointer-events-none" />

                    {/* Scrolling content */}
                    <motion.div
                        className="flex items-center gap-3 py-2"
                        animate={{
                            x: ['0%', '-50%']
                        }}
                        transition={{
                            x: {
                                duration: 60, // Slow scroll - 60 seconds for full loop
                                repeat: Infinity,
                                ease: 'linear'
                            }
                        }}
                    >
                        {events.map((event: DashboardEvent, index: number) => {
                            const colorClass = eventColors[event.type] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
                            const icon = event.icon || '⚙️';

                            return (
                                <div
                                    key={`${event.timestamp}-${index}`}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full shrink-0 border ${colorClass}`}
                                >
                                    <span className="text-sm" role="img" aria-label={event.type}>
                                        {icon}
                                    </span>
                                    <span className="text-xs font-medium whitespace-nowrap">
                                        {event.message}
                                    </span>
                                    <span className="text-xs opacity-60">
                                        {formatTimeAgo(event.timestamp)}
                                    </span>
                                </div>
                            );
                        })}
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
