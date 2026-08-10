/**
 * Linear-ish G13 helper. Requires imported binding names, not module path text.
 *
 * files: [{ importedNames?: string[], exportedNames?: string[] }]
 */
export function buildImportedNameSet(files) {
  const imported = new Set();
  for (const f of files) {
    for (const name of f.importedNames ?? []) {
      if (typeof name === 'string' && name) imported.add(name);
    }
  }
  return imported;
}

export function classifyPossiblyDeadExports(files) {
  const imported = buildImportedNameSet(files);
  const out=[];
  for (const f of files) {
    for (const name of f.exportedNames ?? []) {
      if (typeof name !== 'string' || !name) continue;
      if (!imported.has(name)) out.push({ file:f.path ?? null, name, reason:'not_imported_by_exact_binding_name' });
    }
  }
  return out;
}
