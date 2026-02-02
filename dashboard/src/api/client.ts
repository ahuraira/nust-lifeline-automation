// API Client for Dashboard (v2.1)

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_API_KEY || 'LIFELINE_DASHBOARD_2026';

interface ApiParams {
    [key: string]: string;
}

export const api = {
    async get<T>(action: string, params: ApiParams = {}): Promise<T> {
        const searchParams = new URLSearchParams({
            action,
            key: API_KEY,
            ...params,
        });

        const url = `${API_BASE_URL}?${searchParams.toString()}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    },
};
