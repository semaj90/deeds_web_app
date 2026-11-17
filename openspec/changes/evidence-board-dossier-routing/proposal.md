# OpenSpec Proposal: Evidence Board Interactive Routing & Dossier Lex AI Visual Polish

## 1. Problem Statement
The interactive Evidence Board at `/cases/[id]/board` features 94 discrete buttons, navigation links, and modal triggers spanning canvas manipulation, case switching, AI Counsel brief generation, exhibit inspection, chain-of-custody tracking, and 3D relief reconstruction. Prior to this change:
1. Synthetic case routes (e.g. `3ac1c56f-8812-4f3b-9a10-20261106a1b2`) failed with 404 unauthorized errors when unseeded.
2. Synthetic demo exhibits (`e-001`, `e-002`, `e-003`) caused `fetch('/api/evidence/${id}')` 404 failures in `EvidenceViewModal.svelte`.
3. The `/cases/[id]/board/relief` subpage used legacy dark blue styles conflicting with the warm Dossier Lex AI cream `#FAF6F0` and NeoUI brutal thin border styling of the primary evidence board.
4. No automated end-to-end regression test systematically verified all 94 interactive actions and modal lifecycles across the 8 functional zones.

## 2. Proposed Solution
1. **Full 94-Element Inventory & Zone Classification**: Audit and map all interactive controls across 8 distinct functional zones.
2. **Defensive Demo Exhibit Handling**: Provide fallback exhibit structures in `EvidenceViewModal.svelte` for non-UUID / demo exhibit references while maintaining strict UUID validation for production API calls.
3. **Lex AI Dossier & NeoUI Brutal Polish**: Restyle `/cases/[id]/board/relief` to warm ivory/cream parchment (`#faf6f0`, `#fcfbf9`), thin brutal borders (`#d5c6ac`, `#2d3139`), oxblood headers (`#67140f`), and gold accents (`#c59e2b`).
4. **Playwright E2E Test Suite**: Add `evidence-board-routing-audit.spec.ts` to enforce zero regressions across case switching, AI Counsel modals, upload modals, exhibit view modals, and 3D relief navigation.
