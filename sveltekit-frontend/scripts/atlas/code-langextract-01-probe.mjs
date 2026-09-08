#!/usr/bin/env node
/**
 * CODE-LANGEXTRACT-01b/c — real probe against llama-server's /v1/chat/completions (Ornith), using
 * the design.md section 2 prompt shape (SOURCE + STRUCTURAL OBSERVATIONS + TASK, exact-quote-only).
 * No new 8095 endpoint needed for this fixture proof (design.md section 3.2's model backend choice).
 * Read-only: no datastore writes, no production wiring, no cache writes.
 *
 * Byte-span grounding is computed by the harness itself via exact string search of the model's
 * quoted exactText against the fixture sourceText — asking the model to compute byte offsets
 * directly is unreliable; asking it to quote exact text and letting deterministic code locate that
 * text in the source is the honest, robust way to ground an LLM-produced extraction.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { FIXTURES } from './code-langextract-01-fixtures.mjs';
import {
  CodeEvidenceExtractionV1Schema,
  assertCodeEvidenceExtractionGrounded,
} from '../../src/lib/server/atlas/contracts/code-evidence-extraction-v1.ts';

const LLAMA = 'http://127.0.0.1:8090';
const REPORT_PATH = resolve(process.cwd(), 'docs/reports/code-langextract-01-probe-v1.json');

const ALLOWED_CLASSES = [
  'SYMBOL', 'API', 'CONSTRAINT', 'INVARIANT', 'FAILURE_MODE', 'TEST', 'REQUIREMENT', 'DATA_FLOW', 'OWNERSHIP',
];

function buildPrompt(fixture) {
  const astLines = fixture.astFacts.map(
    (f) => `symbol: ${f.symbol}\nkind: ${f.kind}${f.signature ? `\nsignature: ${f.signature}` : ''}`
  ).join('\n');
  return `SOURCE
${fixture.sourceText}

STRUCTURAL OBSERVATIONS (already computed by AST/ast-grep — do not re-derive symbols/signatures)
${astLines}

TASK
Extract ONLY semantic facts AST cannot label: invariants, ownership constraints, failure conditions,
API relationships, test obligations, requirements. Every extraction must be an EXACT VERBATIM QUOTE
from SOURCE above (copy-paste, do not paraphrase). Reply with ONLY a JSON object of this shape, no
other text:
{"extractions": [{"class": "SYMBOL|API|CONSTRAINT|INVARIANT|FAILURE_MODE|TEST|REQUIREMENT|DATA_FLOW|OWNERSHIP", "exactText": "...", "confidence": 0.0-1.0}]}
If nothing qualifies, reply {"extractions": []}.`;
}

async function callOrnith(prompt) {
  const res = await fetch(`${LLAMA}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'ornith-1.5-9b',
      messages: [
        { role: 'system', content: 'You are a precise code-evidence extractor. You only quote exact source text, never paraphrase.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 400,
      stream: false,
    }),
  });
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '{"extractions": []}';
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch {
    return { extractions: [], parseError: content.slice(0, 300) };
  }
}

function locateByteSpan(sourceText, exactText) {
  const idx = sourceText.indexOf(exactText);
  if (idx === -1) return null;
  const beforeBytes = Buffer.byteLength(sourceText.slice(0, idx), 'utf8');
  const textBytes = Buffer.byteLength(exactText, 'utf8');
  return { startByte: beforeBytes, endByte: beforeBytes + textBytes };
}

async function runFixture(fixture) {
  const prompt = buildPrompt(fixture);
  const t0 = performance.now();
  const raw = await callOrnith(prompt);
  const latencyMs = performance.now() - t0;

  const rawExtractions = Array.isArray(raw.extractions) ? raw.extractions : [];
  const grounded = [];
  const rejected = [];

  for (const ex of rawExtractions) {
    if (!ex || typeof ex.exactText !== 'string' || !ALLOWED_CLASSES.includes(ex.class)) {
      rejected.push({ reason: 'malformed', raw: ex });
      continue;
    }
    const span = locateByteSpan(fixture.sourceText, ex.exactText);
    if (!span) {
      rejected.push({ reason: 'exactText not found verbatim in sourceText', raw: ex });
      continue;
    }
    grounded.push({
      class: ex.class,
      exactText: ex.exactText,
      startByte: span.startByte,
      endByte: span.endByte,
      confidence: typeof ex.confidence === 'number' ? Math.max(0, Math.min(1, ex.confidence)) : 0.5,
      attributes: {},
    });
  }

  const extraction = {
    identity: {
      canonicalId: fixture.id,
      packetKey: `packet:${fixture.id}`,
      workspaceRevision: 'code-langextract-01-fixture-ws',
      sourceRevision: 'code-langextract-01-fixture-rev',
    },
    grounded,
    structuralRefs: fixture.astFacts.map((f) => `ast:${fixture.sourceRef}#${f.symbol}`),
    ontologyRefs: [],
    checksum: 'a'.repeat(64),
  };

  let schemaValid = false;
  let roundtripValid = false;
  let schemaError = null;
  let roundtripError = null;
  try {
    CodeEvidenceExtractionV1Schema.parse(extraction);
    schemaValid = true;
  } catch (err) {
    schemaError = err instanceof Error ? err.message : String(err);
  }
  if (schemaValid) {
    try {
      assertCodeEvidenceExtractionGrounded(extraction, fixture.sourceText, {
        canonicalId: fixture.id,
        sourceRevision: 'code-langextract-01-fixture-rev',
      });
      roundtripValid = true;
    } catch (err) {
      roundtripError = err instanceof Error ? err.message : String(err);
    }
  }

  const hasHandLabeledMatch = grounded.some((g) => g.exactText.includes(fixture.expectedPhraseSubstring)) ||
    fixture.sourceText.includes(fixture.expectedPhraseSubstring) && grounded.some((g) =>
      fixture.expectedPhraseSubstring.split(' ').some((w) => w.length > 3 && g.exactText.includes(w))
    );

  return {
    fixtureId: fixture.id,
    language: fixture.language,
    latencyMs: Number(latencyMs.toFixed(1)),
    rawExtractionCount: rawExtractions.length,
    groundedExtractionCount: grounded.length,
    rejectedCount: rejected.length,
    rejected,
    grounded,
    schemaValid,
    schemaError,
    roundtripValid,
    roundtripError,
    expectedClassHint: fixture.expectedClassHint,
    expectedPhraseSubstring: fixture.expectedPhraseSubstring,
    hasExtractionNearHandLabeledPhrase: hasHandLabeledMatch,
  };
}

async function main() {
  const results = [];
  for (const fixture of FIXTURES) {
    results.push(await runFixture(fixture));
  }

  const languagesWithNonZeroExtraction = results.filter((r) => r.groundedExtractionCount > 0).length;
  const allGroundedEntriesRoundtrip = results.every((r) => r.groundedExtractionCount === 0 || r.roundtripValid);
  const allIdentityPreserved = results.every((r) => r.schemaValid);

  const verdict = (languagesWithNonZeroExtraction >= 3 && allGroundedEntriesRoundtrip && allIdentityPreserved)
    ? 'PASS'
    : 'NOT_PROVEN';

  const report = {
    schema: 'atlas.code-langextract-01-probe.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    productionWritesPerformed: false,
    sidecarEndpointUsed: false,
    modelBackend: `${LLAMA}/v1/chat/completions (ornith-1.5-9b)`,
    gate: 'CODE-LANGEXTRACT-01',
    passCriteria: 'extractionCount > 0 on >= 3 of 4 language fixtures AND 100% byte-span round-trip AND 100% identity preservation',
    languagesWithNonZeroExtraction,
    totalFixtures: FIXTURES.length,
    allGroundedEntriesRoundtrip,
    allIdentityPreserved,
    verdict,
    results,
  };

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report, reportPath: REPORT_PATH }, null, 2));
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
