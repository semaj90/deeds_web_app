// Observability state persistence for sustained monitoring and baselines
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const RUNTIME_DIR = '.runtime';
const STATE_FILE = join(RUNTIME_DIR, 'observability-state.json');

export interface ObservabilityState {
	baselines: {
	p99_latency_ms: number;
		error_rate_percent: number;
	connection_count: number;
		last_calculated: string;
	};
	sustained_counters: {
	p99_breaches: number;
		error_spikes: number;
	anomaly_spikes: number;
		last_reset: string;
	};
	daily_budgets: {
	max_p99_breaches: number;
		max_error_spikes: number;
	max_anomaly_spikes: number;
	};
	metadata: {
	created_at: string;
		last_updated: string;
	version: string;
	};
}

const DEFAULT_STATE: ObservabilityState = {
	baselines: {
	p99_latency_ms: 100,
		error_rate_percent: 1.0,
		connection_count: 10,
		last_calculated: new Date().toISOString()
	},
	sustained_counters: {
	p99_breaches: 0,
		error_spikes: 0,
		anomaly_spikes: 0,
		last_reset: new Date().toISOString()
	},
	daily_budgets: {
	max_p99_breaches: parseInt(import.meta.env?.DAILY_P99_BREACH_BUDGET ?? '10', 10),
		max_error_spikes: parseInt(import.meta.env?.DAILY_ERROR_SPIKE_BUDGET ?? '5', 10),
		max_anomaly_spikes: parseInt(import.meta.env?.DAILY_ANOMALY_SPIKE_BUDGET ?? '3', 10)
	},
	metadata: {
	created_at: new Date().toISOString(),
		last_updated: new Date().toISOString(),
		version: '1.0.0'
	}
};

let cached_state: ObservabilityState | null = null;

export async function ensureRuntimeDir(): Promise<void> {
	if (!existsSync(RUNTIME_DIR)) {
		await mkdir(RUNTIME_DIR, { recursive: true });
	}
}

export async function loadObservabilityState(): Promise<ObservabilityState> {
	if (cached_state) return cached_state;

	try {
		await ensureRuntimeDir();

		if (!existsSync(STATE_FILE)) {
			console.log('[observability] State file not found, creating default state');
			await saveObservabilityState(DEFAULT_STATE);
			cached_state = DEFAULT_STATE;
			return DEFAULT_STATE;
		}

		const raw = await readFile(STATE_FILE, 'utf-8');
		const parsed = JSON.parse(raw) as ObservabilityState;

		// Validate and merge with defaults for missing fields
		cached_state = {
			...DEFAULT_STATE,
			...parsed,
			baselines: {
				...DEFAULT_STATE.baselines,
				...parsed.baselines
			},
	sustained_counters: {
				...DEFAULT_STATE.sustained_counters,
				...parsed.sustained_counters
			},
	daily_budgets: {
				...DEFAULT_STATE.daily_budgets,
				...parsed.daily_budgets
			},
	metadata: {
				...DEFAULT_STATE.metadata,
				...parsed.metadata,
				last_updated: new Date().toISOString()
			}
		};

		console.log('[observability] Loaded state from disk:', {
			p99_breaches: cached_state.sustained_counters.p99_breaches,
			last_reset: cached_state.sustained_counters.last_reset,
			baseline_p99: cached_state.baselines.p99_latency_ms
		});

		return cached_state;
	} catch (error) {
		console.error('[observability] Failed to load state, using defaults:', error);
		cached_state = DEFAULT_STATE;
		return DEFAULT_STATE;
	}
}

export async function saveObservabilityState(state: ObservabilityState): Promise<void> {
	try {
		await ensureRuntimeDir();
		state.metadata.last_updated = new Date().toISOString();
		await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
		cached_state = state;
		console.log('[observability] Saved state to disk');
	} catch (error) {
		console.error('[observability] Failed to save state:', error);
	}
}

export async function updateBaseline(
	metric: keyof ObservabilityState['baselines'],
	value: number
): Promise<void> {
	const state = await loadObservabilityState();
	if (metric !== 'last_calculated') {
		(state.baselines as any)[metric] = value;
	}
	state.baselines.last_calculated = new Date().toISOString();
	await saveObservabilityState(state);
}

export async function incrementSustainedCounter(
	counter: keyof Omit<ObservabilityState['sustained_counters'], 'last_reset'>
): Promise<number> {
	const state = await loadObservabilityState();
	const currentValue = (state.sustained_counters as any)[counter] ?? 0;
	(state.sustained_counters as any)[counter] = currentValue + 1;
	await saveObservabilityState(state);
	return currentValue + 1;
}

export async function resetSustainedCounter(
	counter: keyof Omit<ObservabilityState['sustained_counters'], 'last_reset'>
): Promise<void> {
	const state = await loadObservabilityState();
	(state.sustained_counters as any)[counter] = 0;
	await saveObservabilityState(state);
}

export async function resetAllCounters(): Promise<void> {
	const state = await loadObservabilityState();
	state.sustained_counters = {
		p99_breaches: 0,
		error_spikes: 0,
		anomaly_spikes: 0,
		last_reset: new Date().toISOString()
	};
	await saveObservabilityState(state);
	console.log('[observability] Daily reset complete at', new Date().toISOString());
}

// Startup initialization
export async function initializeObservabilityPersistence(): Promise<ObservabilityState> {
	const state = await loadObservabilityState();

	// Check if daily reset is needed
	const lastReset = new Date(state.sustained_counters.last_reset);
	const now = new Date();
	const daysSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24);

	if (daysSinceReset >= 1) {
		console.log(
			'[observability] Performing daily reset (days since last reset:',
			daysSinceReset.toFixed(2),
			')'
		);
		await resetAllCounters();
		return await loadObservabilityState();
	}

	return state;
}

// Schedule daily reset at midnight
export function scheduleDailyReset(): NodeJS.Timeout {
	const now = new Date();
	const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
	const msUntilMidnight = tomorrow.getTime() - now.getTime();

	console.log(
		'[observability] Scheduling daily reset in',
		Math.round(msUntilMidnight / 1000 / 60),
		'minutes'
	);

	const timeout = setTimeout(async () => {
		await resetAllCounters();
		// Schedule next reset
		setInterval(async () => {
			await resetAllCounters();
		},
	24 * 60 * 60 * 1000); // Every 24 hours
	},
	msUntilMidnight);

	return timeout;
}






