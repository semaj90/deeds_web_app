const LANGFUSE_BASE_URL = process.env.LANGFUSE_HOST ?? process.env.LANGFUSE_BASE_URL ?? 'http://127.0.0.1:3030';
const LANGFUSE_PUBLIC_KEY =
  process.env.LANGFUSE_PUBLIC_KEY ?? 'pk-lf-4e3db8a0107de7872b894e309494252b';
const LANGFUSE_SECRET_KEY =
  process.env.LANGFUSE_SECRET_KEY ?? 'sk-lf-3941aba7500ce9fabbe0c513ad6c3a58';

if (!process.env.LANGFUSE_ENABLED) {
  process.env.LANGFUSE_ENABLED = 'true';
}
process.env.LANGFUSE_HOST = LANGFUSE_BASE_URL;
process.env.LANGFUSE_PUBLIC_KEY = LANGFUSE_PUBLIC_KEY;
process.env.LANGFUSE_SECRET_KEY = LANGFUSE_SECRET_KEY;

async function main() {
  const { getLangfuse, flushLangfuse } = await import('../src/lib/server/observability/langfuse.ts');
  const langfuse = await getLangfuse();
  if (!langfuse) {
    throw new Error('Langfuse SDK unavailable');
  }

  const trace = langfuse.trace({
    name: 'langfuse-smoke',
    metadata: {
      source: 'scripts/smoke-langfuse-trace.mjs',
      purpose: 'validate-local-trace-path',
      timestamp: new Date().toISOString(),
    },
    tags: ['smoke', 'langfuse'],
  });

  const span = trace.span({
    name: 'smoke-span',
    input: 'validate langfuse trace emission',
  });
  span.end({
    output: 'langfuse-smoke-ok',
    level: 'DEFAULT',
  });

  await flushLangfuse();

  const result = {
    ok: true,
    host: LANGFUSE_BASE_URL,
    traceId: trace.id ?? trace.traceId ?? null,
    publicKeyPrefix: LANGFUSE_PUBLIC_KEY.slice(0, 6),
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('[langfuse-smoke] failed:', err?.message ?? err);
  process.exit(1);
});
