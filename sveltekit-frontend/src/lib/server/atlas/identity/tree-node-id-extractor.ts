/**
 * Tree Node ID Extractor — Structural AST Identity
 *
 * Extracts tree_node_id from Abstract Syntax Tree (via tree-sitter or TypeScript AST).
 * tree_node_id is a STRUCTURAL identity (not semantic meaning, not content hash).
 *
 * **Role**: Track code structure and refactoring.
 * **Use for**: Joining on source location, detecting code moves.
 * **DO NOT use for**: Retrieval lane selection, semantic matching.
 */

/**
 * Represents a structural code location (file + position).
 */
export interface TreeNodeLocation {
  file_path: string;
  start_line: number;
  start_col: number;
  end_line: number;
  end_col: number;
  node_type: 'function' | 'class' | 'interface' | 'import' | 'export' | 'variable' | 'unknown';
}

/**
 * Compute tree_node_id from structural location.
 *
 * Derivation:
 *   file_path + start_line + start_col + node_type → deterministic hash
 *
 * **Deterministic**: Same code location = same tree_node_id.
 * **Structural**: Refactoring (rename, move, reformat) may change tree_node_id.
 */
export function computeTreeNodeId(location: TreeNodeLocation): string {
  // Use file path + line + col + node type as the structural identity
  // Format: "file_path:line:col:node_type"
  const key = `${location.file_path}:${location.start_line}:${location.start_col}:${location.node_type}`;

  // For now, use key as-is (can be hashed if needed for uniqueness)
  // Keep deterministic: same location = same tree_node_id
  return key;
}

/**
 * Parse tree_node_id back to its components.
 */
export function parseTreeNodeId(
  tree_node_id: string
): TreeNodeLocation | null {
  const parts = tree_node_id.split(':');
  if (parts.length < 4) return null;

  const node_type = parts.pop() as TreeNodeLocation['node_type'];
  const start_col = parseInt(parts.pop() || '0');
  const start_line = parseInt(parts.pop() || '0');
  const file_path = parts.join(':'); // Handle file paths with colons (Windows drive letters)

  if (!file_path || isNaN(start_line) || isNaN(start_col)) {
    return null;
  }

  return {
    file_path,
    start_line,
    start_col,
    end_line: start_line, // Approximate (exact end would need full AST)
    end_col: start_col,
    node_type,
  };
}

/**
 * Determine if two tree_node_ids refer to the same structural location (after potential refactoring).
 *
 * **Approximate**: Compares file path + node type, allows ±5 line variance.
 */
export function isSameStructuralLocation(
  tree_node_id_1: string,
  tree_node_id_2: string,
  line_variance: number = 5
): boolean {
  const loc1 = parseTreeNodeId(tree_node_id_1);
  const loc2 = parseTreeNodeId(tree_node_id_2);

  if (!loc1 || !loc2) return false;

  // Same file + same node type + within line variance
  return (
    loc1.file_path === loc2.file_path &&
    loc1.node_type === loc2.node_type &&
    Math.abs(loc1.start_line - loc2.start_line) <= line_variance
  );
}

/**
 * Track tree_node_id changes (code moved, renamed, deleted).
 *
 * Used for audit trail: when a file is refactored, tree_node_id changes but packet_key stays the same.
 */
export interface TreeNodeIDChange {
  packet_key: string; // Immutable canonical identity
  previous_tree_node_id: string;
  new_tree_node_id: string;
  change_type: 'moved' | 'renamed' | 'refactored' | 'deleted';
  detected_at: string; // ISO timestamp
}

/**
 * Compare tree_node_ids to detect code structure changes.
 */
export function detectTreeNodeChange(
  old_tree_node_id: string,
  new_tree_node_id: string
): TreeNodeIDChange['change_type'] {
  if (!old_tree_node_id && new_tree_node_id) return 'refactored';
  if (old_tree_node_id && !new_tree_node_id) return 'deleted';

  const oldLoc = parseTreeNodeId(old_tree_node_id);
  const newLoc = parseTreeNodeId(new_tree_node_id);

  if (!oldLoc || !newLoc) return 'refactored';

  if (oldLoc.file_path !== newLoc.file_path) return 'moved';
  if (oldLoc.node_type !== newLoc.node_type) return 'refactored';

  return 'refactored';
}

/**
 * Minimal structural fallback until the canonical tree-sitter/TS-AST path
 * is wired end-to-end.
 *
 * This is intentionally shallow: it emits stable structural locations for
 * obvious top-level declarations, rather than pretending to be a full AST.
 * It is better than an empty stub because downstream lineage code can at
 * least join on real spans while the canonical parser is being wired.
 */
export async function extractTreeNodeIdFromAST(
  file_content: string,
  file_path: string
): Promise<TreeNodeLocation[]> {
  const locations: TreeNodeLocation[] = [];
  const lines = file_content.split(/\r?\n/);

  const pushMatch = (lineIndex: number, node_type: TreeNodeLocation['node_type'], startCol: number) => {
    locations.push({
      file_path,
      start_line: lineIndex + 1,
      start_col: startCol + 1,
      end_line: lineIndex + 1,
      end_col: Math.max(startCol + 1, lines[lineIndex]?.length ?? startCol + 1),
      node_type,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const functionMatch = /^\s*(export\s+)?(default\s+)?(async\s+)?function\s+[A-Za-z0-9_$]+/.exec(line);
    if (functionMatch) {
      pushMatch(i, 'function', functionMatch.index ?? 0);
      continue;
    }

    const classMatch = /^\s*(export\s+)?(default\s+)?class\s+[A-Za-z0-9_$]+/.exec(line);
    if (classMatch) {
      pushMatch(i, 'class', classMatch.index ?? 0);
      continue;
    }

    const interfaceMatch = /^\s*(export\s+)?interface\s+[A-Za-z0-9_$]+/.exec(line);
    if (interfaceMatch) {
      pushMatch(i, 'interface', interfaceMatch.index ?? 0);
      continue;
    }

    const importMatch = /^\s*import\s+/.exec(line);
    if (importMatch) {
      pushMatch(i, 'import', importMatch.index ?? 0);
      continue;
    }

    const exportMatch = /^\s*export\s+/.exec(line);
    if (exportMatch) {
      const kindMatch =
        /^\s*export\s+(const|let|var)\s+[A-Za-z0-9_$]+/.exec(line) ||
        /^\s*export\s+default\s+/.exec(line);
      if (kindMatch) {
        pushMatch(i, 'export', exportMatch.index ?? 0);
        continue;
      }
    }

    const variableMatch = /^\s*(const|let|var)\s+[A-Za-z0-9_$]+/.exec(line);
    if (variableMatch) {
      pushMatch(i, 'variable', variableMatch.index ?? 0);
    }
  }

  return locations;
}
