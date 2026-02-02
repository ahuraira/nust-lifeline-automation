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
export function useTrack(pledgeId: string | null) {
    return useQuery<TrackResponse>({
        queryKey: ['track', pledgeId],
        queryFn: () => api.get<TrackResponse>('track', { pledgeId: pledgeId! }),
        enabled: !!pledgeId,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
}
