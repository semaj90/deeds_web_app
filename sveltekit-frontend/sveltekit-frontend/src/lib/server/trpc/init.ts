import { initTRPC, TRPCError } from '@trpc/server';
import type { RequestEvent } from '@sveltejs/kit';

export interface TRPCContext {
  userId: string | null;
  sessionId: string | null;
  requestId: string;
}

export async function createContext(event: RequestEvent): Promise<TRPCContext> {
  const user = event.locals.user as { id: string } | undefined;
  const session = event.locals.session as { id: string } | undefined;

  return {
    userId: user ? String(user.id) : null,
    sessionId: session?.id ?? null,
    requestId: crypto.randomUUID(),
  };
}

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
