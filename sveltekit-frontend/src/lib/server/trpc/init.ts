/**
 * tRPC server initialisation — typed application RPC boundary.
 *
 * tRPC sits between the Svelte UI and server modules when both sides
 * are TypeScript. It is NOT a durable queue, workflow engine, agent
 * protocol, analytics ledger, or boundary for Go/Python/external services.
 *
 * MCP JSON-RPC remains the tool interoperability boundary.
 * LangGraph owns workflow state. RabbitMQ owns async dispatch.
 */

import { initTRPC, TRPCError } from '@trpc/server';
import type { RequestEvent } from '@sveltejs/kit';

// ---------------------------------------------------------------------------
// Context
//
// userId is number (matches users.id serial PK in Postgres).
// App.User.id is string (Lucia always stringifies IDs) — we parse it once
// here at the trust boundary so every procedure receives a typed number.
// ---------------------------------------------------------------------------

export interface TRPCContext {
  userId: number | null;
  sessionId: string | null;
  requestId: string;
}

export async function createContext(event: RequestEvent): Promise<TRPCContext> {
  // App.Locals.user is typed in src/app.d.ts — no cast needed.
  const user = event.locals.user;
  const rawId = user?.id;

  // Lucia v3 stringifies serial integer IDs. Parse once here; NaN → null.
  const parsed = rawId !== undefined ? parseInt(rawId, 10) : NaN;
  const userId = Number.isFinite(parsed) ? parsed : null;

  return {
    userId,
    sessionId: event.locals.session?.id ?? null,
    requestId: event.locals.requestId ?? crypto.randomUUID(),
  };
}

// ---------------------------------------------------------------------------
// tRPC instance
// ---------------------------------------------------------------------------

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Requires an authenticated user — throws 401 otherwise.
 * Downstream procedures receive ctx.userId typed as number (not null).
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.userId === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
