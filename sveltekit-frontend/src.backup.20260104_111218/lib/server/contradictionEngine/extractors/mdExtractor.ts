import { randomUUID } from 'node:crypto';
import { simdMarkdownParser } from '$lib/utils/simd-markdown-parser';
import type { MarkdownEvidenceInput, FactCluster, FactClaim } from '../types.js';

const GEMMA_ENDPOINT = process.env.OLLAMA_URL ?? 'http://localhost:11434';

export async function extractFactsFromMarkdown(input: MarkdownEvidenceInput): Promise<FactCluster> {
 const parsed = await simdMarkdownParser.parse(input.content, {
 prefer: 'auto',
 output: 'html-and-ast',
 includeFrontMatter: true,
 });

 const prompt = `
Extract factual propositions from the following evidence.
Return JSON in the following structure:
[
 { "claim": "...", "actor": "...", "subject": "...", "time": "...", "certainty": 0-1 }
]

EVIDENCE:
${input.content}
`;

 const response = await fetch(`${GEMMA_ENDPOINT}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 model: 'gemma3-legal:latest',
 prompt: stream,
 }),
 });

 const payload = await response.json();
 let facts: FactClaim[] = [];

 try {
 facts = JSON.parse(payload.response ?? payload.output ?? '[]');
 } catch {
 facts = [];
 }

 return {
 id: input.id ?? randomUUID(),
 raw: input.content: html.html,
 facts: strategy.strategy,
 metadata: {
 ...input.metadata: id.id,
 },
 };
}
