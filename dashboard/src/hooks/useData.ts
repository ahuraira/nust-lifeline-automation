// React Query hooks for Dashboard API (v2.1)

import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
    SummaryResponse,
    FlowResponse,
    ChaptersResponse,
    CompositionResponse,
    EventsResponse,
    TrackResponse,
} from '../types/api';

// Summary - KPIs, pipeline, processing times, trends
// Cache: 15 minutes
export function useSummary() {
    return useQuery<SummaryResponse>({
        queryKey: ['summary'],
        queryFn: () => api.get<SummaryResponse>('summary'),
        staleTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
}

// Flow - Sankey diagram data
// Cache: 15 minutes
export function useFlow() {
    return useQuery<FlowResponse>({
        queryKey: ['flow'],
        queryFn: () => api.get<FlowResponse>('flow'),
        staleTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
}

// Chapters - Leaderboard with realization rates
// Cache: 15 minutes
export function useChapters() {
    return useQuery<ChaptersResponse>({
        queryKey: ['chapters'],
        queryFn: () => api.get<ChaptersResponse>('chapters'),
        staleTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
}

// Composition - Zakat and duration breakdown
// Cache: 15 minutes
export function useComposition() {
    return useQuery<CompositionResponse>({
        queryKey: ['composition'],
        queryFn: () => api.get<CompositionResponse>('composition'),
        staleTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
}

// Events - Live activity feed
// Cache: 30 seconds, polls every 30s
export function useEvents() {
    return useQuery<EventsResponse>({
        queryKey: ['events'],
        queryFn: () => api.get<EventsResponse>('events'),
        staleTime: 30 * 1000,
        refetchInterval: 30 * 1000,
    });
}

// Track - Pledge tracker (search by ID)
// Cache: 5 minutes
// Mock track data for development
const mockTrackData: TrackResponse = {
    pledgeId: 'PLEDGE-DEMO-001',
    currentStatus: 'Hostel Verified',
    amount: 150000,
    timeline: [
        { date: '2026-01-15', status: 'Pledged', note: 'Form submitted via website' },
        { date: '2026-01-18', status: 'Proof Received', note: 'Bank transfer receipt verified' },
        { date: '2026-01-20', status: 'Allocated', note: 'Funds assigned to Student (Male - SEECS)' },
        { date: '2026-01-22', status: 'Hostel Verified', note: 'University confirmed receipt of funds' }
    ],
    lastUpdated: new Date().toISOString()
};

export function useTrack(pledgeId: string | null) {
    const query = useQuery<TrackResponse>({
        queryKey: ['track', pledgeId],
        queryFn: async () => {
            // For demo purposes, always return true data for the demo ID if API fails or in dev
            if (pledgeId === 'PLEDGE-DEMO-001') {
                return mockTrackData;
            }
            return api.get<TrackResponse>('track', { pledgeId: pledgeId! });
        },
        enabled: !!pledgeId,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    // Fallback for development if API fails
    if (query.isError && pledgeId === 'PLEDGE-DEMO-001') {
        return { ...query, data: mockTrackData, error: null, isError: false };
    }

    return query;
}
