function getGlobalSimdUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const gw = window as unknown as Record<string, unknown>;
  const val = gw['__SIMD_QUIC_URL__'];
  return typeof val === 'string' ? val : undefined;
}

const QUIC_URL: string =
  getGlobalSimdUrl() ?? process.env.SIMD_QUIC_URL ?? 'https://localhost:8095/json';

export async function parseJSON_QUIC(payload: string): Promise<unknown> {
  const res: Response = await fetch(QUIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  if (!res.ok) throw new Error(`QUIC parser error: ${res.status} ${res.statusText}`);
  return res.json();
}
