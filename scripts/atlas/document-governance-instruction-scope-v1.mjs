function parentClaudeDocumentId(path, recordsByFoldedPath) {
  const slash = path.lastIndexOf('/');
  const directory = slash < 0 ? '.' : path.slice(0, slash);
  if (directory === '.') return { documentId: null, status: 'ROOT' };
  const segments = directory.split('/');
  for (let depth = segments.length - 1; depth >= 0; depth -= 1) {
    const ancestor = depth === 0 ? '' : `${segments.slice(0, depth).join('/')}/`;
    const parent = recordsByFoldedPath.get(`${ancestor}claude.md`.toLocaleLowerCase('en-US'));
    if (Array.isArray(parent)) return { documentId: null, status: 'AMBIGUOUS' };
    if (parent) return { documentId: parent.documentId, status: 'RESOLVED' };
  }
  return { documentId: null, status: 'NO_PARENT_DISCOVERED' };
}

export function attachClaudeInstructionScopeV1(records) {
  const claudeRecords = records.filter((record) => record.documentKind === 'CLAUDE_INSTRUCTIONS');
  const byPath = new Map();
  for (const record of claudeRecords) {
    const key = record.path.toLocaleLowerCase('en-US');
    const existing = byPath.get(key);
    if (!existing) byPath.set(key, record);
    else if (Array.isArray(existing)) existing.push(record);
    else byPath.set(key, [existing, record]);
  }
  return records.map((record) => {
    if (record.documentKind !== 'CLAUDE_INSTRUCTIONS') return { ...record, instructionScope: null };
    const slash = record.path.lastIndexOf('/');
    const scopePath = slash < 0 ? '.' : record.path.slice(0, slash);
    const parent = parentClaudeDocumentId(record.path, byPath);
    return {
      ...record,
      instructionScope: {
        scopePath,
        parentInstructionDocumentId: parent.documentId,
        parentScopeStatus: parent.status,
      },
    };
  });
}
