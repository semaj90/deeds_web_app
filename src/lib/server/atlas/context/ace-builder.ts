import type { AceQueryPacket } from '../contracts/ace-query-packet';
import type { RetrievalCandidate } from '../contracts/retrieval-candidate';

export function buildAcePacket(input: {
  query: string;
  intent: AceQueryPacket['intent'];
  mode: AceQueryPacket['mode'];
  candidates?: RetrievalCandidate[];
  trace_id?: string | null;
}): AceQueryPacket {
  return {
    query: input.query,
    intent: input.intent,
    mode: input.mode,
    candidates: input.candidates ?? [],
    trace_id: input.trace_id ?? null,
    top_k: Math.max(1, input.candidates?.length ?? 0),
  };
}

