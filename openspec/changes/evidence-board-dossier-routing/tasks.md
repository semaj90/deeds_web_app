# OpenSpec: Evidence Board Routing & Dossier Lex AI Polish Tasks (`tasks.md`)

## Phase 1: Interactive Element Inventory & Route Mapping
- [x] 1.1 Extract and catalog all 94 interactive buttons, links, and modal triggers from `/cases/[id]/board` into structured JSON (`evidence_board_buttons.json`).
- [x] 1.2 Partition elements into 8 functional zones (Veritas Rail, Top Navbar, Dossier Subnav, Board Command Bar, Multi-View Matrix, Evidentiary Action Bar, Left Filter Strip, Inspector/Toolbar).
- [x] 1.3 Audit route validity for all 44 `<a>` links and ensure no broken links or orphaned hashes.

## Phase 2: Authorization & Synthetic Demo Handling
- [x] 2.1 Seed test case `3ac1c56f-8812-4f3b-9a10-20261106a1b2` in PostgreSQL 18 with `user_id = 11, assigned_attorney = 11` to satisfy `getAuthorizedCase()` layout gate.
- [x] 2.2 Add graceful synthetic demo fallback to `EvidenceViewModal.svelte` for non-UUID exhibit IDs (`e-001`, `e-002`, `e-003`) to prevent 404 error toast states on demo review clicks.
- [x] 2.3 Verify `Escape` key handling on popovers (`.case-switcher-backdrop`) to prevent background click interception during automated testing.

## Phase 3: Dossier Lex AI & NeoUI Brutal Polish
- [x] 3.1 Unify `/cases/[id]/board/relief` subpage styles with Dossier Lex AI palette (`#faf6f0` background, `#fcfbf9` parchment cards, `#67140f` crimson accents, `#c59e2b` gold notches).
- [x] 3.2 Implement NeoUI brutal thin inner borders (`1px solid #d5c6ac`, `#2d3139`) with crisp geometric shadows (`2px 2px 0px rgba(45, 49, 57, 0.06)`).
- [x] 3.3 Ensure all Playwright accessibility test IDs (`data-testid="relief-demo-link"`, `data-testid="relief-item"`, `data-testid="relief-no-depth"`) are 100% preserved.

## Phase 4: Automated Testing & Screenshot Verification
- [x] 4.1 Create permanent Playwright test `sveltekit-frontend/tests/e2e/evidence-board-routing-audit.spec.ts`.
- [x] 4.2 Verify modal lifecycle for `CourtroomEvidentiaryBriefModal`, `EvidenceUploadModal`, `EvidenceViewModal`, and `CaseSwitcher`.
- [x] 4.3 Capture visual verification screenshots:
  - `evidence_board_live_full.png` (Full Evidence Board)
  - `evidence_board_brief_modal.png` (Courtroom Evidentiary Brief Modal)
  - `evidence_board_upload_modal.png` (Evidence Upload Modal)
  - `evidence_board_view_modal.png` (Evidence View / Chain of Custody Modal)
  - `evidence_board_relief_demo.png` (3D Depth Relief Subpage)
