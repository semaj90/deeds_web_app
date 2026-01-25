import type { RequestHandler } from '@sveltejs/kit';
import type { ZodTypeAny } from 'zod';
import { RedisCacheService } from '$lib/server/services/redis-cache'; // Use class import

type RateOptions = {
    capacity?: number; // max tokens
    refillPerSecond?: number; // tokens per second
    keyPrefix?: string; // redis key prefix
    identifierFromRequest?: (req: Request) => string; // extracts id (ip / api key)
};

/**
 * Wrap a SvelteKit RequestHandler with Zod validation and a Redis-backed token-bucket rate limiter.
 */
export function withValidationAndRate(
    handler: RequestHandler,
    schema: ZodTypeAny | null,
    opts: RateOptions = {}
): RequestHandler {
    const capacity = opts.capacity ?? 60;
    const refillPerSecond = opts.refillPerSecond ?? 1;
    const keyPrefix = opts.keyPrefix ?? 'rl:';

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const identifierFromRequest = opts.identifierFromRequest ??
        ((req: Request) => req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'anon');

    return async (event) => {
        // Validate body if schema provided
        if (schema) {
            try {
                const body = await event.request.json().catch(() => ({}));
                schema.parse(body);
            } catch (err) {
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Invalid request',
                    details: err instanceof Error ? err.message : String(err)
                }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
        }

        // Rate limiting
        try {
            const id = identifierFromRequest(event.request) ?? 'anon';
            const key = `${keyPrefix}${id}`;

            // Use Redis-backed token-bucket
            const service = RedisCacheService.getInstance(); // Ensure singleton access

            const raw = await service.get<{ tokens: number; last: number }>(key);
            const now = Date.now() / 1000;

            let tokens = capacity;
            let last = now;

            if (raw && typeof raw === 'object') {
                const parsed = raw;
                if (typeof parsed.tokens === 'number' && typeof parsed.last === 'number') {
                    tokens = Math.min(capacity, parsed.tokens + (now - parsed.last) * refillPerSecond);
                    last = now;
                }
            }

            if (tokens >= 1) {
                tokens = tokens - 1;
                // Expiry: enough time to refill to capacity
                await service.set(key, { tokens, last }, { ttlSeconds: Math.ceil((capacity / refillPerSecond) * 2) });
            } else {
                const retryAfter = Math.ceil((1 - tokens) / refillPerSecond);
                return new Response(JSON.stringify({
                    success: false,
                    error: 'Rate limit exceeded',
                    retryAfter
                }), {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': String(retryAfter)
                    }
                });
            }
        } catch (err) {
            // On Redis error, fail-open but log
            console.error('Rate limiter internal error', err);
        }

        // Call the original handler
        return handler(event);
    };
}

export function schemaFor<T extends ZodTypeAny>(s: T): T {
    return s;
}
