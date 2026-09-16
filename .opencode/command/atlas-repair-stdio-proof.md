Run the main-repository Parent Atlas workstation repair stdio proof.

Use the existing workstation and repair owners. Send one bounded JSON envelope to:
`node scripts/agentic/workstation-repair-stdio-v1.mjs`

The envelope must include `errorId`, `errorMessage`, `sourceRef`, `workspaceRevision`,
`sourceRevision`, and `executionId`; include `evidenceRefs` only when evidence is real.

Interpretation:

- `REPAIR_CANDIDATE` means a dry-run candidate was formed from supplied evidence.
- `AUTHORITY_BLOCKED` means the envelope is structurally valid but lacks evidence refs.
- `REJECTED` means the envelope is malformed or missing lineage.

Never use `--auto`. Never edit files or invoke `--apply`. Return the JSON result unchanged,
then summarize it through the existing OpenCode/Atlas context path. Require
`writesPerformed=false`, `canonicalAuthority=false`, and the replay checksum.
