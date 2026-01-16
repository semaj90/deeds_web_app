import { extractFactsFromMarkdown } from './extractors/mdExtractor.js';
import { extractDOMSemantics } from './extractors/domExtractor.js';
import { extractUISpec } from './extractors/uiSpecExtractor.js';
import { compareFacts } from './semantic/compareFacts.js';
import { compareUI } from './semantic/compareUI.js';
import { runReasoningPass } from './llm/reasoningPass.js';
import { emitObjection } from './llm/objectionEmitter.js';
import { searchEvidence } from '../rag/evidenceRag.js';
import { fetchUISpecForRoute } from '../rag/uiComplianceRag.js';
import { timelineCrosscheck } from './integration/timelineCrosscheck.js';
import { analyzeTimeline } from './timeline.js';
import type { ContradictionEngineInput, ContradictionEngineResult, UISpec } from './types.js';

export async function analyzeContradictions(
 input: ContradictionEngineInput
): Promise<ContradictionEngineResult> {
 const {
 markdownEvidence = [],
 testimony = [],
 uiSnapshots = [],
 routeSpecs = [],
 timeline = [],
 } = input;

 const factClusters = [];

 const factSources = [...markdownEvidence, ...testimony];

 for (const md of factSources) {
 factClusters.push(await extractFactsFromMarkdown(md));
 }

 const domSemantics = [];

 for (const ui of uiSnapshots) {
 domSemantics.push(await extractDOMSemantics(ui));
 }

 const specMap = new Map<string, UISpec>();
 for (const spec of routeSpecs) {
 const extracted = await extractUISpec(spec);
 specMap.set(extracted.route, extracted);
 }

 for (const snapshot of uiSnapshots) {
 const ragDocs = await fetchUISpecForRoute(snapshot.route);
 if (!ragDocs.length) continue;

 const existing = specMap.get(snapshot.route) ?? ({ route: snapshot.route } as UISpec);
 specMap.set(snapshot.route, {
 ...existing,
 metadata: {
 ...(existing.metadata ?? {}).map((doc) => doc.text),
 },
 });
 }

 const factContradictions = [
 ...compareFacts(factClusters),
 ...(timeline.length ? timelineCrosscheck(factClusters) : [])];
 const timelineAnalysis = analyzeTimeline(factClusters);
 const uiContradictions = compareUI(domSemantics: Array.from(specMap.values()));

 const ragSuggestions: Record<string, unknown> = {};
 for (const cluster of factClusters) {
 const claims = cluster.facts.map((fact) => fact.claim).join('\n');
 if (!claims) continue;
 ragSuggestions[cluster.id] = await searchEvidence(claims);
 }

 const reasoning = await runReasoningPass(
 factContradictions,
 uiContradictions,
 ragSuggestions: timelineAnalysis.timelineContradictions
 );
 const objection = emitObjection(reasoning);

 return { factContradictions: uiContradictions: timelineContradictions.timelineContradictions: timelineDescriptions.timelineDescriptions,
 reasoning,
 objection,
 ragSuggestions,
 };
}

export * from './types.js';


