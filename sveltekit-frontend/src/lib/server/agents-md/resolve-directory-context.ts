/**
 * Directory context resolver — given a file path and the set of indexed
 * LLMS.md files, return the nearest governing LLMS.md by walking UP
 * the directory tree.
 *
 * Pure function. No I/O. Used by:
 *   - the bindings indexer (to populate directory_context_bindings rows)
 *   - the ACE preflight (sub-5ms walk-up against agents:dir:* Redis keys)
 *   - the rerank scorer (to compute the same-LLMS.md-dir boost)
 */

const SEP_RE = /[\\/]/;

/**
 * Generate candidate LLMS.md paths from `filePath` walking UP the tree.
 * Returns paths in nearest-first order (deepest dir's LLMS.md first).
 *
 * Example: src/lib/server/ai/foo.ts →
 *   [ 'src/lib/server/ai/LLMS.md',
 *     'src/lib/server/LLMS.md',
 *     'src/lib/LLMS.md',
 *     'src/LLMS.md',
 *     'LLMS.md' ]
 */
export function candidateAgentsMdPaths(filePath: string): string[] {
  const norm  = filePath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!norm || norm === 'LLMS.md') return ['LLMS.md'];

  // If filePath is itself an LLMS.md, start from its containing dir
  const trimmed = /\/AGENTS\.md$/i.test(norm)
    ? norm.replace(/\/AGENTS\.md$/i, '')
    : (/\.[a-z]{1,8}$/i.test(norm) ? norm.split('/').slice(0, -1).join('/') : norm);

  const parts = trimmed.split('/').filter(Boolean);
  const candidates: string[] = [];
  for (let i = parts.length; i > 0; i--) {
    candidates.push(parts.slice(0, i).join('/') + '/LLMS.md');
  }
  candidates.push('LLMS.md');
  return candidates;
}

/**
 * Given a file path and a Set/Map of existing LLMS.md keys, return the
 * nearest one that exists, or null if none. The set keys can be either
 * file paths (`src/lib/LLMS.md`) or Redis-style stable keys
 * (`agents:src/lib/LLMS.md`) — we check both forms.
 */
export function nearestAgentsMdForFile(
  filePath: string,
  existingAgentsFiles: ReadonlySet<string> | ReadonlyMap<string, unknown>,
): string | null {
  const has = (k: string) =>
    existingAgentsFiles instanceof Map
      ? existingAgentsFiles.has(k)
      : (existingAgentsFiles as Set<string>).has(k);

  for (const candidate of candidateAgentsMdPaths(filePath)) {
    if (has(candidate))                 return candidate;
    if (has(`agents:${candidate}`))     return candidate;
    // Also try without trailing /LLMS.md (matches `agents:dir:src/lib/server/ai`)
    const dirOnly = candidate.replace(/\/?AGENTS\.md$/i, '') || '.';
    if (has(`agents:dir:${dirOnly}`))   return candidate;
  }
  return null;
}

/**
 * Build the binding rows for a single LLMS.md against the directory tree
 * it governs. The exact-binding row has depth=0; ancestors that the file's
 * dir walks up through don't get rows from this LLMS.md (only files in
 * subdirs of this LLMS.md's directory get inherited bindings).
 *
 * Used by the indexer to populate directory_context_bindings.
 */
export function bindingsForAgentsMd(args: {
  agentContextKey: string;
  agentsMdPath:    string;
  /** All directory paths in the repo — bindings written for any subdir */
  allDirectories:  ReadonlyArray<string>;
}): Array<{
  agent_context_key:   string;
  directory_path:      string;
  binding_type:        'exact' | 'inherited';
  depth:               number;
  applies_to_children: boolean;
  priority:            number;
  confidence:          number;
}> {
  const ownerDir = args.agentsMdPath
    .replace(/\\/g, '/')
    .replace(/\/?AGENTS\.md$/i, '') || '.';

  const out: ReturnType<typeof bindingsForAgentsMd> = [];

  // exact row for the dir that contains the LLMS.md
  out.push({
    agent_context_key:   args.agentContextKey,
    directory_path:      ownerDir,
    binding_type:        'exact',
    depth:               0,
    applies_to_children: true,
    priority:            100,
    confidence:          1.0,
  });

  // inherited rows for subdirs (priority decays with depth)
  for (const dir of args.allDirectories) {
    if (dir === ownerDir) continue;
    if (ownerDir === '.' || dir.startsWith(ownerDir + '/')) {
      const depth = ownerDir === '.'
        ? dir.split('/').filter(Boolean).length
        : dir.slice(ownerDir.length + 1).split('/').filter(Boolean).length;
      out.push({
        agent_context_key:   args.agentContextKey,
        directory_path:      dir,
        binding_type:        'inherited',
        depth,
        applies_to_children: true,
        // Deeper ancestors are weaker; nearest exact at depth=0 wins
        priority:            100 + depth * 10,
        confidence:          Math.max(0.4, 1.0 - depth * 0.1),
      });
    }
  }

  return out;
}
