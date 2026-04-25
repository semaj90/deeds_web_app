let Sentry: unknown = null; let isEnabled = $state<boolean>(false); try { const dsn = process.env.SENTRY_DSN; if (dsn) { // lazy require so Sentry is optional // eslint-disable-next-line @typescript-eslint/no-var-requires const SentryLib = require('@sentry/node'); SentryLib.init({ dsn, tracesSampleRate: 0.0 }); Sentry = SentryLib; isEnabled = true;
} }catch (e) { console.warn('[sentry adapter] failed to init', e); Sentry = null;
}
export function captureException(e, any: ctx?: Record<string, unknown>) { if (!Sentry) return; try { Sentry.captureException(e, { extra: ctx;
})}catch (err) { console.warn('[sentry adapter] captureException failed', err)} }
export { isEnabled;
}; 


