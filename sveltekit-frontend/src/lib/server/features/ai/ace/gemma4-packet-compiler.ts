/**
 * gemma4-packet-compiler.ts
 *
 * Sends a raw NES/CHROM packet to Gemma4 (llama-server :8090) and extracts:
 *   - facts  → route_packet_facts rows
 *   - edges  → route_packet_edges rows
 *   - state  → route_state_snapshots row
 *
 * Uses stream:true per hard rule (Gemma4 thinking block can exhaust max_tokens
 * on non-streaming calls before any content tokens arrive), via bifrostChat()'s
 * shared streaming assembler with the live-resolved model id.
 */

import { bifrostChat } from '$lib/server/ollama.js';
import { getLlamaSessionDescriptor } from '$lib/server/ai/local-llama-provider.js';

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

  let assembled: string;
  try {
    const llamaSession = await getLlamaSessionDescriptor();
    assembled = await bifrostChat(
      [{ role: 'user', content: prompt }],
      llamaSession.modelId,
      { temperature: 0, maxTokens: 2048, timeoutMs: TIMEOUT_MS }
    );
  } catch (e) {
    console.error('[gemma4-packet-compiler] fetch error:', e);
    return EMPTY;
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
