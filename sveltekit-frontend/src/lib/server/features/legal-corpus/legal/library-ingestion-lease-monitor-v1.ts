/** A transient heartbeat error may retry; an explicit lost lease stops the worker. */
export function monitorLibraryIngestionLeaseV1(
	renewLease: () => Promise<boolean>,
	intervalMs = 30_000,
	): { signal: AbortSignal; stop: () => Promise<void> } {
	const controller = new AbortController();
	let stopped = false;
	let heartbeatInFlight: Promise<void> | null = null;
	const timer = setInterval(() => {
		if (stopped || controller.signal.aborted || heartbeatInFlight) return;
		heartbeatInFlight = (async () => {
			try {
				if (!(await renewLease()) && !stopped) controller.abort(new Error('LIBRARY_INGESTION_LEASE_LOST'));
			} catch {
				// The next heartbeat retries transient database failures. Worker writes remain fenced.
			}
		})().finally(() => { heartbeatInFlight = null; });
	}, intervalMs);
	timer.unref?.();

	return {
		signal: controller.signal,
		stop: async () => {
			stopped = true;
			clearInterval(timer);
			await heartbeatInFlight;
		},
	};
}

export function assertLibraryIngestionActiveV1(signal: AbortSignal): void {
	if (signal.aborted) throw new Error('LIBRARY_INGESTION_LEASE_LOST');
}
