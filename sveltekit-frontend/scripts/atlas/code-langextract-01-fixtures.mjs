/**
 * CODE-LANGEXTRACT-01a — 4 real, hand-picked code fixtures (one per language), each with
 * pre-computed astFacts (hand-written, matching the actual real source — not invented) and a
 * hand-labeled expected extraction so a human reader can verify the probe's output against ground
 * truth. All 4 snippets are copied verbatim from real files in this repo, not fabricated examples.
 */

export const FIXTURES = [
  {
    id: 'ts-assert-structural-facts',
    language: 'typescript',
    sourceRef: 'src/lib/server/atlas/contracts/code-extraction-request-v1.ts',
    sourceText: `export function assertRequestHasStructuralFacts(request: CodeExtractionRequestV1): void {
  if (request.sourceText.length <= CODE_EXTRACTION_TRIVIAL_TEXT_LENGTH) return;
  if (request.astFacts.length === 0 && request.symbolFacts.length === 0) {
    throw new Error(
      \`CodeExtractionRequestV1 for candidate=\${request.candidateId} has non-trivial sourceText \` +
        \`(\${request.sourceText.length} chars) but no astFacts/symbolFacts. The extraction call must \` +
        \`never be asked to rediscover structural facts Tree-sitter/ast-grep already produce — run \` +
        \`structural extraction first and attach its output before dispatching this request.\`
    );
  }
}`,
    astFacts: [
      { symbol: 'assertRequestHasStructuralFacts', kind: 'function', signature: '(request: CodeExtractionRequestV1) => void', calls: [], imports: [], exports: ['assertRequestHasStructuralFacts'] },
    ],
    expectedClassHint: 'INVARIANT',
    expectedPhraseSubstring: 'never be asked to rediscover structural facts',
  },
  {
    id: 'svelte-status-default',
    language: 'svelte',
    sourceRef: 'src/lib/components/ui/avatar/Svelte5Avatar.svelte',
    sourceText: `let statusClasses = $derived({
	online: 'bg-accent',
	offline: 'bg-sand/20',
	busy: 'bg-danger',
	away: 'bg-warning'
}[status ?? 'offline']);`,
    astFacts: [
      { symbol: 'statusClasses', kind: 'const', signature: undefined, calls: [], imports: [], exports: [] },
    ],
    expectedClassHint: 'CONSTRAINT',
    expectedPhraseSubstring: "status ?? 'offline'",
  },
  {
    id: 'python-positive-int',
    language: 'python',
    sourceRef: 'python/atlas_cuvs_resident_registry.py',
    sourceText: `@staticmethod
def _positive_int(params: dict[str, Any], name: str, default: int, *, minimum: int = 1) -> int:
    value = int(params.get(name, default))
    if value < minimum:
        raise ValueError(f"{name} must be >= {minimum}")
    return value`,
    astFacts: [
      { symbol: '_positive_int', kind: 'staticmethod', signature: '(params, name, default, *, minimum=1) -> int', calls: [], imports: [], exports: [] },
    ],
    expectedClassHint: 'CONSTRAINT',
    expectedPhraseSubstring: 'value < minimum',
  },
  {
    id: 'go-clamp-lane-limit',
    language: 'go',
    sourceRef: 'services/go-retrieval-service/lanes.go',
    sourceText: `func clampLaneLimit(n int) int {
	if n <= 0 {
		return 40
	}
	if n > 200 {
		return 200
	}
	return n
}`,
    astFacts: [
      { symbol: 'clampLaneLimit', kind: 'func', signature: '(n int) int', calls: [], imports: [], exports: [] },
    ],
    expectedClassHint: 'INVARIANT',
    expectedPhraseSubstring: 'n > 200',
  },
];
