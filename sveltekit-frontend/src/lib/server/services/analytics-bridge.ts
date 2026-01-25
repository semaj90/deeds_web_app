
const BASE = process.env?.PUBLIC_ANALYTICS_API ?? 'http://localhost:8001';

export async function postAnalytics(event: any): Promise<any> {
    const res = await fetch(`${BASE}/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
    });
    return res.json();
}

export async function fetchIntent(userId: string): Promise<any> {
    const res = await fetch(`${BASE}/intent/${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    return res.json();
}

import type { UserAnalyticsEvent } from '$lib/types/ai-bridge'; // Assumes types exist
type IntentPrediction = any; // Stub type

const ANALYTICS_API = process.env.PUBLIC_ANALYTICS_API ?? "http://localhost:8001";

export async function recordAnalytics(ev: UserAnalyticsEvent): Promise<void> {
    const payload = { ...ev, timestamp: ev.timestamp ?? new Date().toISOString() };
    await fetch(`${ANALYTICS_API}/analytics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
}
