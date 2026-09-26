import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import { normalizeStructuralSymbolKind } from './structural-observation-v1.js';

// SYMBOL-KIND-SCHEMA-VALIDATION-01 (openspec/changes/parent-atlas-nlp-sidecar-feature-compiler,
// SESSION-206b, Finding 2 + task list). Two independently-defined `symbol_kind` vocabularies
// exist in this repo: `StructuralSymbolKindV1` (structural-observation-v1.ts, this file's
// canonical import) and `.okf/languages/*.yaml`'s per-language `symbol_kinds` map (domain-
// evidence weighting, scripts/atlas/lib/okf-schema.mts::SymbolKindSchema). This test asserts
// every `ast_labels` entry declared in the .okf vocabulary resolves to a non-UNKNOWN
// StructuralSymbolKindV1 value through the canonical normalizer -- catching drift between the
// two vocabularies before it becomes a silent classification gap. Entries with no `ast_labels`
// (route_handler/schema/store/hook -- pattern/import/filename-based by design, not AST-node-based)
// are deliberately out of scope for this check.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// this file: sveltekit-frontend/src/lib/server/atlas/indexing/ -> workspace root is 6 up
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');

interface OkfSymbolKindDef {
  ast_labels?: string[];
  weight?: number;
  description?: string;
}

interface OkfLanguageSpec {
  language: string;
  symbol_kinds: Record<string, OkfSymbolKindDef>;
}

function loadOkfLanguageSpec(relPath: string): OkfLanguageSpec {
  const absPath = path.join(WORKSPACE_ROOT, relPath);
  const raw = readFileSync(absPath, 'utf8');
  return YAML.parse(raw) as OkfLanguageSpec;
}

describe('symbol-kind schema validation (.okf ast_labels vs StructuralSymbolKindV1)', () => {
  it('resolves every ast_labels entry in .okf/languages/typescript.yaml to a non-UNKNOWN kind', () => {
    const spec = loadOkfLanguageSpec(path.join('.okf', 'languages', 'typescript.yaml'));
    expect(spec.language).toBe('typescript');

    const astLabelEntries = Object.entries(spec.symbol_kinds).filter(
      ([, def]) => Array.isArray(def.ast_labels) && def.ast_labels.length > 0,
    );
    // sanity: this vocabulary must actually declare at least one AST-label-based kind,
    // otherwise this test would trivially pass on an empty/broken file
    expect(astLabelEntries.length).toBeGreaterThan(0);

    const unresolved: Array<{ okfKindName: string; astLabel: string }> = [];
    for (const [okfKindName, def] of astLabelEntries) {
      for (const astLabel of def.ast_labels!) {
        const resolved = normalizeStructuralSymbolKind(astLabel, astLabel);
        if (resolved === 'UNKNOWN') {
          unresolved.push({ okfKindName, astLabel });
        }
      }
    }

    expect(unresolved, JSON.stringify(unresolved, null, 2)).toEqual([]);
  });

  it('known real-world raw node types map to their expected StructuralSymbolKindV1 value', () => {
    // Locks the "symbol = function?" answer down as a regression test, not a one-off audit.
    expect(normalizeStructuralSymbolKind('function_declaration', 'function_declaration')).toBe('FUNCTION');
    expect(normalizeStructuralSymbolKind('arrow_function', 'arrow_function')).toBe('FUNCTION');
    expect(normalizeStructuralSymbolKind('method_definition', 'method_definition')).toBe('METHOD');
    expect(normalizeStructuralSymbolKind('class_declaration', 'class_declaration')).toBe('CLASS');
    expect(normalizeStructuralSymbolKind('interface_declaration', 'interface_declaration')).toBe('INTERFACE');
    expect(normalizeStructuralSymbolKind('type_alias_declaration', 'type_alias_declaration')).toBe('TYPE');
    expect(normalizeStructuralSymbolKind('enum_declaration', 'enum_declaration')).toBe('ENUM');
    expect(normalizeStructuralSymbolKind('variable_declarator', 'variable_declarator')).toBe('VARIABLE');
  });

  it('deliberately does not coerce chunk-boundary raw kinds into a symbol kind', () => {
    // This is the documented, intentional UNKNOWN fallback -- not a gap to "fix".
    expect(normalizeStructuralSymbolKind('FRAGMENT', 'FRAGMENT')).toBe('UNKNOWN');
    expect(normalizeStructuralSymbolKind('DECLARATION', 'DECLARATION')).toBe('UNKNOWN');
    expect(normalizeStructuralSymbolKind('CHUNK', 'CHUNK')).toBe('UNKNOWN');
    expect(normalizeStructuralSymbolKind(null, null)).toBe('UNKNOWN');
  });
});
