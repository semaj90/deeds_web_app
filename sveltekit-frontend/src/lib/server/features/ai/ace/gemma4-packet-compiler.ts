/**
 * gemma4-packet-compiler.ts
 *
 * Sends a raw NES/CHROM packet to Gemma4 (llama-server :8090) and extracts:
 *   - facts  → route_packet_facts rows
 *   - edges  → route_packet_edges rows
 *   - state  → route_state_snapshots row
 *
 * Uses stream:true per hard rule (Gemma4 thinking block can exhaust max_tokens
 * on non-streaming calls before any content tokens arrive).
 */

const LLAMA_URL = (process.env.TURBOQUANT_URL ?? 'http://127.0.0.1:8090').replace(
  /^0\.0\.0\.0/,
  '127.0.0.1'
);
const MODEL = process.env.HERMES_MODEL ?? 'gemma4-hermes-64k:latest';
const TIMEOUT_MS = 90_000;
const MAX_PACKET_CHARS = 24_000;

export interface PacketFact {
  fact_type: string;
  fact_key: string;
  fact_value?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface PacketEdge {
  src: string;
  dst: string;
  edge_type: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface PacketState {
  summary?: string;
  token_hints?: string[];
  next_route_recommendation?: string;
}

export interface CompiledPacket {
  facts: PacketFact[];
  edges: PacketEdge[];
  state: PacketState;
}

const EMPTY: CompiledPacket = { facts: [], edges: [], state: {} };

export async function compilePacketWithGemma4(packet: unknown): Promise<CompiledPacket> {
  const packetStr = JSON.stringify(packet).slice(0, MAX_PACKET_CHARS);

  const prompt = `Extract routing facts and graph edges from this NES/CHROM packet.
Return strict JSON with no markdown fences:
{
  "facts": [{"fact_type":"","fact_key":"","fact_value":"","score":0,"metadata":{}}],
  "edges": [{"src":"","dst":"","edge_type":"","weight":1,"metadata":{}}],
  "state": {"summary":"","token_hints":[],"next_route_recommendation":""}
}

Packet:
${packetStr}`;

  let res: Response;
  try {
    res = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 2048,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error('[gemma4-packet-compiler] fetch error:', e);
    return EMPTY;
  }

  if (!res.ok) {
    console.error('[gemma4-packet-compiler] Gemma4 error:', res.status);
    return EMPTY;
  }

  // Assemble SSE content deltas
  let assembled = '';
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') break;
        try {
          const parsed = JSON.parse(payload);
          assembled += parsed.choices?.[0]?.delta?.content ?? '';
        } catch {
          // skip malformed SSE line
        }
      }
    }
  } catch (e) {
    console.error('[gemma4-packet-compiler] stream error:', e);
    if (!assembled) return EMPTY;
  }

  const text = assembled.trim();
  // Strip markdown fences if model adds them anyway
  const jsonStr = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  try {
    const parsed = JSON.parse(jsonStr) as Partial<CompiledPacket>;
    return {
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
      state: parsed.state ?? {},
    };
  } catch {
    console.error('[gemma4-packet-compiler] JSON parse failed, raw:', jsonStr.slice(0, 300));
    return EMPTY;
  }
}
