/**
 * Turn canonicalized Atlas retrieval cards into a bounded recommendation.
 * Retrieval cards are advisory evidence only; this module never authorizes writes.
 */

function sourcePath(sourceRef) {
  const raw = String(sourceRef ?? '').trim().replace(/\\/g, '/');
  const withoutLine = raw.replace(/#L\d+(?:-L?\d+)?$/i, '');
  if (!withoutLine || withoutLine.startsWith('/') || /^[a-z]:/i.test(withoutLine)) return null;
  if (withoutLine.split('/').some((part) => part === '..' || part === '.')) return null;
  return withoutLine;
}

/** Pure formatter, deliberately requiring identity and source revision bindings. */
export function buildGroundedRecommendationV1({ intent = 'planning', domain = 'general', cards = [] } = {}) {
  const groundedCards = (Array.isArray(cards) ? cards : []).filter((card) =>
    card && card.retrievalUsable === true && card.identityBound === true && !card.identityConflict &&
    typeof card.sourceRef === 'string' && card.sourceRef.length > 0 &&
    Array.isArray(card.packetBindings) && card.packetBindings.length === 1 &&
    typeof (card.packetBindings[0].sourceRevision ?? card.packetBindings[0].workspaceRevision) === 'string' &&
    (card.packetBindings[0].sourceRevision ?? card.packetBindings[0].workspaceRevision).length > 0
  ).slice(0, 8);

  const evidence = groundedCards.map((card) => {
    const binding = card.packetBindings[0];
    return {
      title: String(card.title ?? 'Retrieved source').slice(0, 240),
      summary: String(card.summary ?? '').slice(0, 500),
      source_ref: card.sourceRef,
      source_revision: binding.sourceRevision ?? binding.workspaceRevision,
      source_sha256: typeof binding.sha256 === 'string' ? binding.sha256 : null,
      packet_key: typeof binding.packetKey === 'string' ? binding.packetKey : null,
      retrieval_sources: Array.isArray(card.retrievalSources) ? card.retrievalSources.slice(0, 4) : [],
    };
  });
  const patchTargets = [...new Set(groundedCards.map((card) => sourcePath(card.sourceRef)).filter(Boolean))].slice(0, 6);

  return {
    likely_cause: evidence.length
      ? 'Retrieved sources provide relevant context, but do not independently establish a root cause; review the cited revisions.'
      : 'No identity- and revision-bound live retrieval evidence was available, so no cause or patch target is asserted.',
    evidence,
    patch_targets: patchTargets,
    proposed_fix: null,
    safe_next_command: evidence.length ? 'git diff --check' : null,
    do_not_do: [
      'Do not treat retrieval rank or a recommendation as proof of a fix.',
      'Do not mutate Kanban task status or case data from this recommendation.',
    ],
    intent,
    domain,
    canonicalAuthority: false,
    retrievalEvidenceCount: evidence.length,
  };
}
