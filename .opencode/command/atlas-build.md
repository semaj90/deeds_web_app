Run the Parent Master Atlas workflow.

1. Run `npx tsx scripts/atlas/build-parent-master-atlas.ts`.
2. Run `npx vitest run tests/opencode-skill.spec.ts`.
3. Run `npm run audit:contracts`.
4. Run `npm run check`.

Report:
- installed
- wired
- sourceRefs valid
- Gemma4 reachable
- further research ready
- safe to continue: yes/no

Do not edit app code unless tests pass.
