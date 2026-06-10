import { ENV } from '$lib/server/env.server.js';

export interface DeepResearchResult {
  plan: string;
  answer: string;
  artifacts: string[];
  activeClusterIds: string[];
  contextPacket: Record<string, unknown> | null;
}

export async function executeDeepResearch(opts: {
  query: string;
  mode?: string;
  writeToObsidian?: boolean;
  userId?: number;
  sessionId?: string;
  caseId?: string;
  parentTaskId?: string;
}): Promise<DeepResearchResult> {
  const base = ENV.LDR_BASE_URL;

  // Authenticate
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ENV.LDR_USERNAME ?? 'admin',
      password: ENV.LDR_PASSWORD ?? 'admin',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const setCookie = loginRes.headers.get('set-cookie') ?? '';
  const sessionCookie = setCookie.split(';')[0] ?? '';
  const authHeaders: Record<string, string> = sessionCookie ? { Cookie: sessionCookie } : {};

  // Start research
  const startRes = await fetch(`${base}/api/start_research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      query: opts.query,
      mode: opts.mode === 'deep-research' ? 'deep' : (opts.mode ?? 'quick'),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!startRes.ok) {
    throw new Error(`LDR start_research failed (${startRes.status}): ${await startRes.text().catch(() => '')}`);
  }

  const { research_id } = (await startRes.json()) as { research_id: string };

  // Poll until complete (max 300s for deep research)
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000));
    const statusRes = await fetch(`${base}/api/status/${research_id}`, {
      headers: authHeaders,
      signal: AbortSignal.timeout(10_000),
    });
    if (!statusRes.ok) continue;
    const status = (await statusRes.json()) as { status: string };
    if (status.status === 'complete' || status.status === 'completed') break;
    if (status.status === 'error' || status.status === 'failed') {
      throw new Error(`LDR research failed: ${JSON.stringify(status)}`);
    }
  }

  // Fetch report
  const reportRes = await fetch(`${base}/api/report/${research_id}`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(15_000),
  });

  if (!reportRes.ok) {
    throw new Error(`LDR report fetch failed (${reportRes.status})`);
  }

  const report = (await reportRes.json()) as {
    content?: string;
    summary?: string;
    sources?: string[];
    findings?: Array<{ title?: string; content?: string }>;
    metadata?: Record<string, unknown>;
  };

  const answer = report.content ?? report.summary ?? '';
  const artifacts = (report.sources ?? []).slice(0, 20);

  return {
    plan: `LDR research completed (id: ${research_id})`,
    answer,
    artifacts,
    activeClusterIds: [],
    contextPacket: report.metadata
      ? { ...report.metadata, cacheKey: `ldr:${research_id}`, contextId: research_id }
      : null,
  };
}
