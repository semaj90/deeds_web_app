# Test Suite Documentation

## Overview

Playwright-based visual regression and integration testing for the Deeds Legal AI platform.

---

## Test Scripts

### 1. **test-screenshots.mjs** — Visual Regression Testing
**Location**: `scripts/tests/test-screenshots.mjs`
**Purpose**: Screenshot-based 500-error detection and visual regression testing

**Usage**:
```bash
# Quick test (8 core routes)
node scripts/tests/test-screenshots.mjs

# Full test (23 routes)
node scripts/tests/test-screenshots.mjs --all

# Single route
node scripts/tests/test-screenshots.mjs --route /cases/test-id/board

# Custom port
node scripts/tests/test-screenshots.mjs --port 3000
```

**Routes Tested**:
- **Quick Routes (8)**: evidence, persons-of-interest, cases-overview, **cases-board**, agentic-errors-analysis, cases-list, dashboard, citations
- **All Routes (23)**: Above + evidence-upload, active-cases, ai-dashboard, all-routes, analysis-center, command-center, error-brain, evidence-library, global-search, admin routes, terminal, phase78

**Special Handling**:
- **SSE Pages**: `domcontentloaded` instead of `networkidle` (all-routes, cases-overview, dashboard, command-center, error-brain, phase78)
- **CSR-Only Pages**: 3s extra wait for client JS (evidence-library, evidence, ai-dashboard, terminal)
- **Canvas Pages**: 2s extra wait for WebGL/canvas initialization (cases-board)

**Error Detection**:
- SvelteKit `.error-page` class
- Vite `vite-error-overlay` custom element
- HTTP status codes
- Screenshot capture even on error

**Output**:
- Timestamped directory: `scripts/tests/screenshots/YYYY-MM-DDTHH-MM-SS/`
- Latest symlink: `scripts/tests/screenshots/latest/`
- JSON report: `report.json`
- Full-page PNG screenshots per route

**Exit Codes**:
- `0` = All routes passed
- `1` = One or more routes failed

---

### 2. **test-ai-summary-modal.mjs** — AI Summary Modal Integration Test
**Location**: `scripts/tests/test-ai-summary-modal.mjs`
**Purpose**: End-to-end testing of Evidence Board AI Summary Modal with ACE context

**Usage**:
```bash
# Default (localhost:5173)
node scripts/tests/test-ai-summary-modal.mjs

# Custom port
node scripts/tests/test-ai-summary-modal.mjs --port 3000
```

**Test Flow** (10 steps):
1. Navigate to Evidence Board (`/cases/test-id/board`)
2. Check for evidence items in sidebar
3. Open AI Chat Panel (click "Chat" button)
4. Verify "Summarize Evidence" button exists
5. Select evidence item from sidebar
6. Click "Summarize Evidence" (if enabled)
7. Wait for AI summary generation (30s timeout)
8. Verify modal content:
   - ✅ Summary section
   - ✅ Key insights (3-5 bullets)
   - ✅ Confidence score
   - ✅ ACE context metadata
9. Check Regenerate button
10. Close modal

**Screenshots Captured**:
- `evidence-board-loaded.png` — Initial load
- `ai-chat-opened.png` — Chat panel open
- `evidence-selected.png` — Evidence item selected
- `modal-opened.png` — AI Summary Modal appears
- `summary-complete.png` — Generated summary
- `modal-closed.png` — Modal dismissed
- `summary-timeout.png` — If API timeout (diagnostic)
- `error-state.png` — On test failure (diagnostic)

**Verification Checks**:
- Evidence items rendered
- Chat button functional
- Summarize button disabled/enabled state
- Modal Dialog rendering
- API integration (POST /api/ace/summarize)
- ACE context assembly (7 data sources)
- Ollama gemma3-legal response
- UI state management (loading/ready/error)

**Exit Codes**:
- `0` = All checks passed
- `1` = Test failed or timeout

---

### 3. **test-quickactions-scroll.mjs** — Command Center Scroll Test
**Location**: `scripts/tests/test-quickactions-scroll.mjs`
**Purpose**: Verify QuickActions component renders below fold

**Usage**:
```bash
node scripts/tests/test-quickactions-scroll.mjs
```

**Test Flow**:
1. Navigate to `/command-center`
2. Scroll to bottom (`window.scrollTo(0, document.body.scrollHeight)`)
3. Wait 500ms
4. Screenshot: `command-center-step4-scrolled.png`

---

## Route Coverage

### Quick Routes (Default `test-screenshots.mjs`)
| Route | Path | Special | Status |
|-------|------|---------|--------|
| evidence | `/evidence` | CSR | ✅ |
| persons-of-interest | `/persons-of-interest/fake-id` | - | ✅ |
| cases-overview | `/cases/test-id/overview` | SSE | ✅ |
| **cases-board** | `/cases/test-id/board` | **Canvas** | ✅ **NEW** |
| agentic-errors-analysis | `/agentic-errors/analysis` | - | ✅ |
| cases-list | `/cases` | - | ✅ |
| dashboard | `/dashboard` | SSE | ✅ |
| citations | `/citations` | - | ✅ |

### Additional Routes (`--all`)
- evidence-upload, active-cases, ai-dashboard (CSR), all-routes (SSE)
- analysis-center, command-center (SSE), error-brain (SSE)
- evidence-library (CSR), global-search, admin/* routes
- system-configuration, terminal (CSR), phase78 (SSE)

---

## Special Page Categories

### SSE/Long-Poll Pages
Routes that use Server-Sent Events or long polling (never reach `networkidle`):
- `all-routes`, `cases-overview`, `dashboard`, `command-center`, `error-brain`, `phase78`
- **Wait Strategy**: `domcontentloaded` + 2s delay

### CSR-Only Pages (ssr = false)
Routes with `export const ssr = false` that need client JS rendering:
- `evidence-library`, `evidence`, `ai-dashboard`, `terminal`
- **Wait Strategy**: Standard load + 3s delay for client bundle

### Canvas/WebGL Pages
Routes with complex canvas or WebGL rendering:
- `cases-board` (HybridBoard with evidence nodes)
- **Wait Strategy**: Standard load + 2s delay for canvas initialization

---

## Recent Updates (Session 93r28b+)

### Added: Evidence Board to Screenshot Tests
- **Route**: `/cases/test-id/board`
- **Category**: CANVAS_PAGES (2s initialization delay)
- **Features Tested**:
  - Evidence Board canvas rendering
  - HybridBoard component initialization
  - Timeline view
  - Evidence sidebar
  - AI Chat panel presence
  - AI Summary Modal trigger button

### Created: AI Summary Modal Integration Test
- **New Script**: `test-ai-summary-modal.mjs` (180 lines)
- **Coverage**: Full modal workflow including ACE context
- **API**: Tests `/api/ace/summarize` endpoint
- **Screenshots**: 6-8 steps captured with diagnostic screenshots on error

---

## Running Tests

### Prerequisites
```bash
# Install dependencies (if not already)
npm install playwright

# Start dev server
npm run dev  # Port 5173 by default
```

### Quick Validation (30 seconds)
```bash
node scripts/tests/test-screenshots.mjs
```

### Full Regression Test (2-3 minutes)
```bash
node scripts/tests/test-screenshots.mjs --all
```

### AI Modal Integration Test (1 minute)
```bash
node scripts/tests/test-ai-summary-modal.mjs
```

### All Tests
```bash
npm run dev &  # Start server in background
sleep 5        # Wait for server startup
node scripts/tests/test-screenshots.mjs --all
node scripts/tests/test-ai-summary-modal.mjs
```

---

## Output Locations

### Screenshots
- **Timestamped**: `scripts/tests/screenshots/YYYY-MM-DDTHH-MM-SS/*.png`
- **Latest**: `scripts/tests/screenshots/latest/*.png` (symlink/copy)
- **Quick access**: Always check `latest/` directory for most recent run

### Reports
- **JSON**: `scripts/tests/screenshots/latest/report.json`
- **Format**:
  ```json
  {
    "timestamp": "2026-03-01T12:34:56",
    "base": "http://localhost:5173",
    "results": [
      {
        "name": "cases-board",
        "url": "http://localhost:5173/cases/test-id/board",
        "status": 200,
        "ok": true,
        "error": null,
        "file": "/path/to/cases-board.png"
      }
    ],
    "summary": { "passed": 8, "failed": 0, "total": 8 }
  }
  ```

---

## Error Diagnosis

### Common Issues

**1. SvelteKit Error Page Detected**
- **Symptom**: Test fails with "SvelteKit error page rendered"
- **Diagnosis**: Page threw unhandled error during SSR or client hydration
- **Check**: `<route-name>.png` screenshot for error details

**2. Vite Error Overlay**
- **Symptom**: Test fails with "Vite error overlay detected"
- **Diagnosis**: Module load failure (import error, syntax error)
- **Check**: Screenshot shows Vite's red error overlay

**3. Timeout**
- **Symptom**: Test times out at `waitUntil: 'networkidle'`
- **Diagnosis**: SSE page not in SSE_PAGES set, or infinite loading
- **Fix**: Add route to `SSE_PAGES` or `CSR_PAGES` if applicable

**4. HTTP 500**
- **Symptom**: `result.status = 500`, `result.ok = false`
- **Diagnosis**: Server-side error during load
- **Check**: Terminal logs + screenshot for error UI

---

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Visual Regression Tests

on: [push, pull_request]

jobs:
  screenshot-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run dev &
      - run: sleep 10  # Wait for server
      - run: node scripts/tests/test-screenshots.mjs --all
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: screenshots
          path: scripts/tests/screenshots/latest/
```

---

## Future Enhancements

1. **Percy/Chromatic Integration** — Visual diff comparison across commits
2. **Accessibility Tests** — axe-core integration for WCAG compliance
3. **Performance Metrics** — Lighthouse scores per route
4. **Mobile Viewports** — Responsive testing (375px, 768px, 1280px)
5. **Authentication Flows** — Login + session persistence tests
6. **API Mocking** — Offline testing with MSW

---

## Maintenance

### Adding New Routes
1. Add to `QUICK_ROUTES` or `ALL_ROUTES` in `test-screenshots.mjs`
2. If SSE: Add to `SSE_PAGES` set
3. If CSR-only: Add to `CSR_PAGES` set
4. If Canvas/WebGL: Add to `CANVAS_PAGES` set
5. Run test: `node scripts/tests/test-screenshots.mjs --route /new-route`

### Updating Timeouts
- **SSE delay**: Line ~93 (`waitForTimeout(2000)`)
- **CSR delay**: Line ~98 (`waitForTimeout(3000)`)
- **Canvas delay**: Line ~103 (`waitForTimeout(2000)`)
- **Network idle**: Line ~89 (`timeout: 15000`)

---

**Last Updated**: March 1, 2026 (Session 93r28b+)
