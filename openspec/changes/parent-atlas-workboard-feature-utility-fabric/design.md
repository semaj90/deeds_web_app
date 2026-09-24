## Context

`LanguageRegistryV1` already reconciles explicitly supplied, namespaced vocabularies and alias bindings. It does not own parser enums or infer aliases. The actual vocabularies are currently distributed across the PostgreSQL `atlas_ast_nodes.parser_language` column, the SvelteKit Node Tree-sitter provider (`typescript`, `tsx`, `javascript`, `jsx`), and the Python NLP sidecar's `_AST_LANGUAGE_EXTENSIONS` map. These are different namespaces, not interchangeable spellings. The Python sidecar already has a `/capabilities` route, but its source file has concurrent uncommitted edits and must be reviewed before any modification.

The change is advisory and read-only. It must not turn a parser label into source identity, revision authority, ontology authority, or permission to materialize AST rows.

## Goals / Non-Goals

**Goals:**

- Capture parser-owned vocabularies with owner and revision provenance.
- Reconcile observed database labels and parser labels without silently collapsing namespaces.
- Permit only explicit, evidence-backed alias bindings; surface unmapped, unsupported, and conflicting labels distinctly.
- Keep the registry deterministic, replayable, noncanonical, and write-free.

**Non-Goals:**

- Replacing Tree-sitter, the sidecar chunker, database language columns, or their existing normalization behavior.
- Inferring aliases from suffixes, case folding across distinct namespaces, or model output.
- Promoting source revisions, AST nodes, symbols, ontology concepts, or feature rows.
- Adding a language enum/table, migration, index, endpoint consumer, or automatic runtime activation as part of the contract alone.

## Decisions

1. **Parser owners remain vocabulary authorities.** Each parser owner should expose its supported labels through a small read-only snapshot interface derived from the same constants/type it uses at runtime. Do not maintain a second handwritten list in `LanguageRegistryV1`.

2. **Use the existing reconciliation contract.** Feed owner snapshots into `buildLanguageRegistryV1`; retain `sourceOwner`, `sourceRevision`, and namespace on every vocabulary. The database vocabulary snapshot is an observation from `parser_language`, not an authority over parser capabilities. Its query receipt must bind the schema/query revision and observation time, and must not invent a workspace/source revision.

3. **Aliases require explicit evidence.** A binding is admitted only when both endpoint labels occur in captured vocabularies and a named owner/revision plus evidence reference supports the mapping. Similar strings, extensions, React aliases, and parser grammar IDs are not sufficient by themselves. Multiple targets remain `AMBIGUOUS`.

4. **Stage integration by owner boundary.** First add/test read-only vocabulary export surfaces at the Node provider and the existing sidecar capability owner; separately capture the database's observed parser labels. Then add a small adapter that assembles snapshots and invokes the existing registry. Do not have the adapter parse source code to rediscover constants or become a fourth alias owner.

5. **Keep results advisory.** Output resolutions may guide diagnostics only. Existing parser APIs continue to decide accepted inputs. No resolution status grants canonical authority or permits writes.

## Risks / Trade-offs

- [Owner revisions unavailable or ambiguous] → refuse to build a promotable snapshot; use explicit package/source revision fields or return a typed missing-revision result rather than a placeholder.
- [Parser owners disagree on labels] → preserve each namespace and report `UNMAPPED`/`AMBIGUOUS`; do not choose a winner by order.
- [Capability endpoint changes compatibility] → extend the existing `/capabilities` response additively, preserve its current keys, and add a focused response-shape test before consumers use it.
- [Concurrent sidecar edits] → inspect and preserve the existing diff before touching `python/miniforge_nlp_sidecar.py`; do not stage or revert unrelated changes.
- [Registry mistaken for canonical identity] → keep `canonicalAuthority=false`, `writesPerformed=false`, and no persistence API on the registry contract.

## Migration Plan

1. Verify current diffs and contracts for each vocabulary owner.
2. Add owner-native, read-only snapshot exports and tests; preserve parser behavior.
3. Capture the AST table's observed language values with a read-only receipt.
4. Assemble a deterministic registry snapshot using only explicit, tested bindings.
5. Test replay stability, missing owner revision, unmapped labels, and conflicting aliases.
6. Keep production detection/promotion disabled until a separate source-authority gate admits the relevant rows.

Rollback consists of removing the diagnostic snapshot caller; parser behavior and durable data remain unchanged throughout.

## Open Questions

- What stable source revision should the Python sidecar report for its vocabulary snapshot: package version, source build revision, or both?
- Should the database observation snapshot be generated by a script or an existing diagnostics endpoint? Either must remain read-only and record the exact SQL/schema provenance.
- Which specific cross-namespace mappings are required by a real caller? Do not prepopulate aliases without concrete call-site evidence.
