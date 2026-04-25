# Phase 107 - Error Fixing Priority Ranking

Generated: 2026-01-31

## Current Error Count: ~1,800 errors

---

## 🔴 TIER 1: HIGH PRIORITY (>10 errors, core functionality)

### Infrastructure Files (Fix or Delete)
| File | Errors | Action | Notes |
|------|--------|--------|-------|
| `services/ai-evidence-analyzer.ts` | 481 | **REGENERATE** | Core AI service, heavily corrupted |
| `services/webgpu-evidence-graph.ts` | 30 | **REGENERATE** | WebGPU integration |
| `webgpu/legal-document-graph.ts` | 22 | **REGENERATE** | Document graph rendering |
| `webgpu/dimensional-tensor-store.ts` | 10 | **REGENERATE** | Tensor storage for WebGPU |
| `webgpu/webgpu-similarity-engine.ts` | 8 | **REGENERATE** | Similarity search engine |

### User-Facing Components (Fix First!)
| File | Errors | Action | Notes |
|------|--------|--------|-------|
| `components/layout/ProductionLayout.svelte` | 8 | **FIX** | Main app layout |
| `components/forms/LegalCaseForm.svelte` | 8 | **FIX** | Case creation form |
| `components/board/CanvasBoard.svelte` | 8 | **FIX** | Evidence board |
| `components/evidence/UploadProgressCard.svelte` | 8 | **FIX** | File upload UI |
| `components/upload/+FileUploadSection.svelte` | 8 | **FIX** | File upload section |
| `components/legal-ai/CitationCollections.svelte` | 8 | **FIX** | Citation management |
| `components/ast/ErrorPanel.svelte` | 8 | **FIX** | Error display |

---

## 🟡 TIER 2: MEDIUM PRIORITY (5-7 errors)

### Auth & User Management
| File | Errors | Action |
|------|--------|--------|
| `components/auth/AuthGuard.svelte` | 7 | FIX |
| `components/auth/RoleGuard.svelte` | 6 | FIX |
| `components/auth/AuthForm.svelte` | 6 | FIX |

### UI Components
| File | Errors | Action |
|------|--------|--------|
| `components/ui/index.ts` | 7 | FIX barrel exports |
| `components/ui/StatsCard.svelte` | 7 | FIX |
| `components/ui/alert/Svelte5Alert.svelte` | 7 | FIX |
| `components/ui/Textarea.svelte` | 7 | FIX |
| `components/ui/select.svelte` | 6 | FIX |
| `components/ui/CSSActivator.svelte` | 6 | FIX |
| `components/ui/AILoadingIndicator.svelte` | 6 | FIX |
| `components/ui/bitsbutton.svelte` | 6 | FIX |
| `components/ui/radio/Svelte5RadioGroup.svelte` | 5 | FIX |

### Forms & Data Entry
| File | Errors | Action |
|------|--------|--------|
| `components/PersonForm.svelte` | 7 | FIX |
| `components/PersonStatsPanel.svelte` | 7 | FIX |
| `components/ReportEditor.svelte` | 6 | FIX |

### Cases & Evidence
| File | Errors | Action |
|------|--------|--------|
| `components/cases/CaseStats.svelte` | 6 | FIX |
| `components/evidence/EvidenceUploadModal.svelte` | 6 | FIX |
| `components/evidence/Enhanced3DEvidenceBoard.svelte` | 5 | FIX |

### POI (Persons of Interest)
| File | Errors | Action |
|------|--------|--------|
| `components/poi/POIProfile.svelte` | 7 | FIX |
| `components/poi/POIThreatBadge.svelte` | 6 | FIX |
| `services/poi.ts` | 6 | FIX |

### Legal AI
| File | Errors | Action |
|------|--------|--------|
| `components/legal-ai/AttachToCaseModal.svelte` | 6 | FIX |
| `components/legal-ai/CitationSaveModal.svelte` | 6 | FIX |

---

## 🟢 TIER 3: LOW PRIORITY (Experimental/Demo)

### Routes (Demo Pages)
| File | Errors | Action |
|------|--------|--------|
| `routes/(app)/cache-demo/+page.svelte` | 7 | DEFER |
| `routes/(app)/cases/create-cached/+page.svelte` | 7 | DEFER |
| `routes/(app)/evidence/analyze/+page.svelte` | 6 | DEFER |

### Experimental Features
| File | Errors | Action |
|------|--------|--------|
| `stores/_archive/old-stores/global-user-store.svelte.ts` | 7 | DELETE |
| `cache/cache-invalidation.ts` | 7 | DEFER |
| `services/drizzle-chr-rom-bridge.ts` | 6 | DEFER |
| `machines/auth-machine.ts` | 5 | DEFER |

---

## 📊 Summary by Category

| Category | Total Errors | Files | Priority |
|----------|-------------|-------|----------|
| **Services (corrupted)** | ~550+ | ~486 | Regenerate or Quarantine |
| **WebGPU** | ~78 | ~10 | Regenerate |
| **UI Components** | ~100 | ~25 | Fix (core UX) |
| **Forms/Auth** | ~60 | ~15 | Fix (user flow) |
| **Evidence/Cases** | ~50 | ~12 | Fix (core features) |
| **Routes/Demo** | ~30 | ~10 | Defer |
| **Experimental** | ~50 | ~20 | Defer/Delete |

---

## 🚀 Recommended Fix Strategy

### Phase 1: Quick Wins (30 min)
1. ✅ Fix `components/ui/index.ts` barrel exports
2. ✅ Fix `Input.svelte`, `StreamingResponse.svelte` (done)
3. Fix remaining UI component syntax errors

### Phase 2: Core Forms (1 hour)
1. Fix `LegalCaseForm.svelte`
2. Fix `PersonForm.svelte`
3. Fix Auth components (AuthGuard, AuthForm, RoleGuard)

### Phase 3: Evidence Features (1 hour)
1. Fix `CanvasBoard.svelte`
2. Fix `UploadProgressCard.svelte`
3. Fix `EvidenceUploadModal.svelte`

### Phase 4: Quarantine Corrupted Services (30 min)
1. Move top 10 error services to `.quarantine/`
2. Create stub replacements with proper types
3. Gradually reintegrate as cleaned

### Phase 5: WebGPU Regeneration (2 hours)
1. Regenerate `ai-evidence-analyzer.ts`
2. Regenerate `webgpu-evidence-graph.ts`
3. Regenerate `legal-document-graph.ts`

---

## Files Already Fixed This Session

- ✅ `slider/index.ts` - Barrel export
- ✅ `Input.svelte` - $bindable syntax
- ✅ `StreamingResponse.svelte` - CSS keyframes
- ✅ Added `lang="ts"` to 6 script tags
- ✅ `enhanced-rag-self-organizing.ts` - Full regeneration
