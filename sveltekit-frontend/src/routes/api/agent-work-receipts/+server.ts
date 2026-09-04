import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { ENV } from '$lib/server/env.server.js';
import { AgentWorkReceiptV1Schema } from '$lib/server/observability/agent-work-receipt-v1.js';
import { recordAgentWorkReceiptV1 } from '$lib/server/observability/agent-work-receipt-store-v1.js';

export const POST: RequestHandler = async ({ request, locals }) => {
  const empty = { acknowledged: false, replayed: false, receiptId: null, ledgerId: null, error: null };
  const internalToken = request.headers.get('x-internal-token');
  const internalAuthorized = Boolean(ENV.SERVICE_AUTH_TOKEN && internalToken === ENV.SERVICE_AUTH_TOKEN);
  if (!locals.user && !internalAuthorized) return json({ ...empty, error: 'Unauthorized' }, { status: 401 });

  try {
    const parsed = AgentWorkReceiptV1Schema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ ...empty, error: 'Invalid AgentWorkReceiptV1 payload' }, { status: 400 });
    }
    const acknowledgement = await recordAgentWorkReceiptV1(parsed.data);
    return json({ ...acknowledgement, error: null }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Receipt persistence failed';
    const status = message === 'AGENT_WORK_RECEIPT_CHECKSUM_CONFLICT' ? 409 : 500;
    return json({ ...empty, error: message }, { status });
  }
};
