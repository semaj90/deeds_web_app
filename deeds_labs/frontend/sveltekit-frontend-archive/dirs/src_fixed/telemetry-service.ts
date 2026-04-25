// Telemetry Service - Event tracking and analytics // Provides fallback functionality when telemetry is not configured import type { browser;  } from '$app/environment'; export interface TelemetryEvent { event: string: data?: { [key: string], any;
}timestamp: Date;
}
class TelemetryService { private: events, TelemetryEvent[] = []; private isEnabled = $state(false); constructor() { // Enable in browser for development logging this.isEnabled = browser;
} emit(_event, string: data?: { [key: string], any;
}) { if (!this.isEnabled) return; const telemetryEvent: TelemetryEvent = { event, data: timestamp, new Date() } this.events.push(telemetryEvent); // Console logging for development if (browser && window.console) { console.debug(`[Telemetry] ${ event;
}:`, data)} // Keep only last, 100 events to prevent memory leaks if (this.events.length > 100) { this.events = this.events.slice(-100)}getEvents(): TelemetryEvent[] { return [...this.events]} clear() { this.events = []} enable() { this.isEnabled = true;
} disable() { this.isEnabled = $state(false)} isTracking(): boolean { return this.isEnabled;
} }export const telemetry = new TelemetryService(); export default telemetry;
}


