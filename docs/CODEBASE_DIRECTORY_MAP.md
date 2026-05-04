# Codebase Directory Map
> Generated: 2026-05-04 04:01:34
> Source: `sveltekit-frontend/src/`
> Script: `scripts/tests/generate-codebase-directory-map.mjs`
> Wiki notes from Redis: 0 / 819 directories

## Overview

| Tier | Count | Description |
|------|-------|-------------|
| 🔴 Critical (score < 40) | 3 | Auth/Zod/hardcoded-URL gaps |
| 🟡 Warning (40–69) | 148 | Minor production gaps |
| 🟢 Good (≥ 70) | 668 | Production-ready |
| **Total** | **819** | Directories with ≥1 code file(s) |

**Score formula:** Zod(20) + Auth(20) + NoTODO(15) + NoHardURL(20) + NoSvelte4(15) + HasExports(10) = 100

---

## Full Directory Scoreboard

| Tier | Directory | Files | Lines | Score | Issues | Tags |
|------|-----------|-------|-------|-------|--------|------|
| 🟢 | `./` | 17 | 4,534 | 80 | 4×URL |  |
| 🟡 | `lib/` | 11 | 1,568 | 60 | 1×URL |  |
| 🟡 | `lib/ai/` | 13 | 4,102 | 40 | 5×URL no-zod |  |
| 🟢 | `lib/ai/e2b/` | 2 | 524 | 75 | 1×TODO |  |
| 🟢 | `lib/ai/onnx/` | 2 | 340 | 75 | 1×TODO |  |
| 🟡 | `lib/cache/` | 5 | 1,046 | 60 | no-zod |  |
| 🟢 | `lib/cache/__tests__/` | 1 | 389 | 70 | ✅ |  |
| 🟡 | `lib/client/` | 4 | 549 | 60 | no-zod |  |
| 🟢 | `lib/client/db/` | 1 | 91 | 80 | ✅ |  |
| 🟡 | `lib/client/ui/` | 1 | 126 | 50 | no-zod |  |
| 🔴 | `lib/components/` | 56 | 15,890 | 35 | 2×TODO 2×URL no-zod |  |
| 🟡 | `lib/components/admin/` | 5 | 2,560 | 50 | no-zod |  |
| 🟡 | `lib/components/agent/` | 1 | 391 | 50 | no-zod |  |
| 🟡 | `lib/components/agentic/` | 2 | 498 | 50 | no-zod |  |
| 🟢 | `lib/components/agentic/__tests__/` | 1 | 685 | 70 | ✅ |  |
| 🟡 | `lib/components/ai/` | 45 | 19,664 | 40 | 8×URL no-zod |  |
| 🟢 | `lib/components/ai/CaseScoringDashboard/` | 1 | 51 | 70 | ✅ |  |
| 🟡 | `lib/components/analysis/` | 3 | 2,809 | 50 | no-zod |  |
| 🟡 | `lib/components/analytics/` | 2 | 1,161 | 50 | no-zod |  |
| 🟡 | `lib/components/audio/` | 1 | 631 | 50 | no-zod |  |
| 🟡 | `lib/components/cache/` | 3 | 1,005 | 50 | no-zod |  |
| 🟢 | `lib/components/canvas/` | 5 | 2,288 | 75 | 2×TODO |  |
| 🟢 | `lib/components/canvas/hybrid/` | 1 | 50 | 80 | ✅ |  |
| 🟢 | `lib/components/case/` | 3 | 670 | 70 | ✅ |  |
| 🟡 | `lib/components/cases/` | 11 | 3,154 | 60 | no-zod |  |
| 🟡 | `lib/components/charges/` | 1 | 211 | 50 | no-zod |  |
| 🟡 | `lib/components/chat/` | 4 | 768 | 50 | no-zod |  |
| 🟡 | `lib/components/citations/` | 5 | 2,030 | 50 | no-zod |  |
| 🟡 | `lib/components/codebase/` | 12 | 5,497 | 50 | no-zod |  |
| 🟡 | `lib/components/courtroom/` | 2 | 1,505 | 50 | no-zod |  |
| 🟡 | `lib/components/dashboard/` | 15 | 3,181 | 60 | no-zod |  |
| 🟢 | `lib/components/demos/` | 1 | 359 | 70 | ✅ |  |
| 🟡 | `lib/components/detective/` | 6 | 1,884 | 60 | no-zod |  |
| 🟡 | `lib/components/document/` | 1 | 401 | 50 | no-zod |  |
| 🟡 | `lib/components/editor/` | 7 | 2,398 | 60 | no-zod |  |
| 🟢 | `lib/components/editors/` | 1 | 55 | 70 | ✅ |  |
| 🟡 | `lib/components/evidence/` | 41 | 14,655 | 55 | 1×TODO no-zod |  |
| 🟢 | `lib/components/forms/` | 7 | 4,163 | 70 | ✅ |  |
| 🟡 | `lib/components/glyph/` | 1 | 784 | 50 | no-zod |  |
| 🟢 | `lib/components/layout/` | 1 | 399 | 70 | ✅ |  |
| 🟡 | `lib/components/legal/` | 33 | 11,235 | 40 | 1×URL no-zod |  |
| 🟡 | `lib/components/legal-ai/` | 18 | 7,563 | 50 | no-zod |  |
| 🟡 | `lib/components/legal-corpus/` | 8 | 2,918 | 50 | no-zod |  |
| 🟢 | `lib/components/library/reader/` | 1 | 70 | 70 | ✅ |  |
| 🟡 | `lib/components/modals/` | 2 | 1,074 | 50 | no-zod |  |
| 🟡 | `lib/components/monitoring/` | 3 | 843 | 50 | no-zod |  |
| 🟢 | `lib/components/nes/` | 1 | 185 | 70 | ✅ |  |
| 🟡 | `lib/components/onboarding/` | 1 | 1,050 | 50 | no-zod |  |
| 🟡 | `lib/components/phase78/` | 3 | 628 | 50 | no-zod |  |
| 🟢 | `lib/components/poi/` | 10 | 2,460 | 80 | ✅ |  |
| 🟡 | `lib/components/rag/` | 4 | 1,259 | 45 | 1×TODO no-zod |  |
| 🟡 | `lib/components/recommendations/` | 2 | 661 | 50 | no-zod |  |
| 🟢 | `lib/components/reports/` | 1 | 244 | 70 | ✅ |  |
| 🟢 | `lib/components/research/` | 1 | 585 | 70 | ✅ |  |
| 🟢 | `lib/components/shells/` | 4 | 832 | 70 | ✅ |  |
| 🟢 | `lib/components/source-validation/` | 4 | 1,091 | 70 | ✅ |  |
| 🟢 | `lib/components/subcomponents/` | 1 | 67 | 70 | ✅ |  |
| 🟢 | `lib/components/terminal/` | 1 | 235 | 70 | ✅ |  |
| 🟡 | `lib/components/ui/` | 89 | 13,405 | 55 | 1×TODO no-zod |  |
| 🟢 | `lib/components/ui/alert-dialog/` | 14 | 641 | 80 | ✅ |  |
| 🟢 | `lib/components/ui/avatar/` | 5 | 236 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/badge/` | 3 | 126 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/bits/` | 5 | 434 | 80 | ✅ |  |
| 🟢 | `lib/components/ui/button/` | 2 | 44 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/card/` | 8 | 255 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/core/` | 2 | 69 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/dialog/` | 13 | 752 | 80 | ✅ |  |
| 🟢 | `lib/components/ui/dropdown/` | 1 | 207 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/enhanced/` | 1 | 37 | 80 | ✅ |  |
| 🟡 | `lib/components/ui/enhanced-bits/` | 2 | 48 | 65 | 2×TODO |  |
| 🟢 | `lib/components/ui/gaming/` | 1 | 60 | 80 | ✅ |  |
| 🟢 | `lib/components/ui/input/` | 4 | 265 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/label/` | 3 | 69 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/modal/` | 2 | 180 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/modular/` | 2 | 407 | 80 | ✅ |  |
| 🟢 | `lib/components/ui/progress/` | 5 | 252 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/QuickActionButton/` | 1 | 60 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/radio/` | 1 | 199 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/scrollarea/` | 2 | 61 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/search/` | 1 | 27 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/select/` | 5 | 166 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/StatsCard/` | 1 | 48 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/table/` | 8 | 220 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/tabs/` | 9 | 612 | 80 | ✅ |  |
| 🟢 | `lib/components/ui/textarea/` | 2 | 37 | 70 | ✅ |  |
| 🟢 | `lib/components/ui/user/` | 1 | 27 | 70 | ✅ |  |
| 🟡 | `lib/components/video/` | 1 | 891 | 50 | no-zod |  |
| 🟢 | `lib/components/visualization/` | 1 | 102 | 70 | ✅ |  |
| 🟡 | `lib/components/yorha/` | 21 | 7,754 | 40 | 2×URL no-zod |  |
| 🟢 | `lib/components/yorha/_simulations/` | 6 | 2,271 | 70 | ✅ |  |
| 🟢 | `lib/components/yorha/cases/` | 3 | 423 | 70 | ✅ |  |
| 🟡 | `lib/components/yorha/dashboard/` | 5 | 843 | 65 | 1×TODO |  |
| 🟢 | `lib/components/yorha/evidence/` | 4 | 670 | 70 | ✅ |  |
| 🟢 | `lib/config/` | 7 | 1,491 | 80 | 29×URL |  |
| 🟢 | `lib/courtroom/` | 4 | 1,560 | 80 | ✅ |  |
| 🟢 | `lib/data/` | 3 | 1,369 | 80 | ✅ |  |
| 🟢 | `lib/db/` | 4 | 1,121 | 100 | no-auth |  |
| 🟢 | `lib/db/queries/` | 2 | 881 | 80 | no-auth |  |
| 🟢 | `lib/db/schema/` | 6 | 890 | 80 | ✅ |  |
| 🟢 | `lib/env/` | 2 | 27 | 80 | ✅ |  |
| 🟢 | `lib/features/evidence-command-center/` | 5 | 419 | 70 | ✅ |  |
| 🟡 | `lib/features/poi/services/` | 1 | 124 | 60 | no-zod |  |
| 🟡 | `lib/gpu/` | 16 | 4,323 | 60 | 3×URL |  |
| 🟢 | `lib/icons/yorha/` | 15 | 572 | 80 | ✅ |  |
| 🟡 | `lib/machines/` | 12 | 4,613 | 40 | 1×URL no-zod |  |
| 🟡 | `lib/models/` | 1 | 1,357 | 55 | 1×TODO no-zod |  |
| 🟢 | `lib/schemas/` | 5 | 558 | 100 | ✅ |  |
| 🟢 | `lib/server/` | 57 | 12,230 | 80 | 60×URL |  |
| 🟢 | `lib/server/__tests__/` | 1 | 43 | 70 | ✅ |  |
| 🟡 | `lib/server/ace/` | 17 | 7,061 | 60 | 9×URL no-auth |  |
| 🟢 | `lib/server/acp/` | 1 | 476 | 80 | ✅ |  |
| 🟢 | `lib/server/acp/tools/` | 1 | 331 | 80 | ✅ |  |
| 🟡 | `lib/server/adapters/` | 1 | 638 | 60 | 3×URL no-auth |  |
| 🟢 | `lib/server/agent/` | 3 | 2,074 | 85 | 5×TODO |  |
| 🟡 | `lib/server/agent/tools/` | 8 | 2,104 | 55 | 1×TODO 2×URL |  |
| 🟡 | `lib/server/ai/` | 23 | 6,278 | 65 | 4×TODO 2×URL |  |
| 🟢 | `lib/server/ai/__tests__/` | 2 | 254 | 70 | ✅ |  |
| 🟡 | `lib/server/analysis/` | 12 | 2,988 | 65 | 3×TODO no-auth |  |
| 🟡 | `lib/server/analytics/` | 15 | 6,690 | 40 | 2×URL no-zod no-auth |  |
| 🟢 | `lib/server/api/` | 1 | 195 | 80 | ✅ |  |
| 🟢 | `lib/server/ast/` | 1 | 313 | 80 | ✅ |  |
| 🟢 | `lib/server/audit/` | 4 | 1,415 | 80 | no-auth |  |
| 🟢 | `lib/server/auth/` | 1 | 41 | 80 | ✅ |  |
| 🟡 | `lib/server/cache/` | 8 | 2,682 | 40 | 3×URL no-zod |  |
| 🟡 | `lib/server/cartridge/` | 5 | 1,614 | 60 | no-zod |  |
| 🟢 | `lib/server/cases/` | 1 | 189 | 80 | ✅ |  |
| 🟡 | `lib/server/chrrom/` | 3 | 412 | 60 | 3×URL |  |
| 🟡 | `lib/server/clients/` | 1 | 17 | 60 | 4×URL |  |
| 🟢 | `lib/server/codeintel/` | 1 | 498 | 80 | ✅ |  |
| 🟢 | `lib/server/concurrency/` | 3 | 741 | 100 | ✅ |  |
| 🟡 | `lib/server/config/` | 4 | 695 | 60 | no-zod |  |
| 🟡 | `lib/server/connections/` | 1 | 346 | 60 | 2×URL |  |
| 🟢 | `lib/server/data/` | 2 | 459 | 80 | ✅ |  |
| 🟢 | `lib/server/db/` | 70 | 12,653 | 80 | 12×URL no-auth |  |
| 🟢 | `lib/server/db/schema/` | 33 | 1,764 | 80 | ✅ |  |
| 🟢 | `lib/server/embedding/` | 8 | 1,052 | 80 | ✅ |  |
| 🟢 | `lib/server/embeddings/` | 1 | 70 | 80 | ✅ |  |
| 🟢 | `lib/server/engagement/` | 1 | 367 | 80 | ✅ |  |
| 🟡 | `lib/server/env/` | 1 | 14 | 60 | 2×URL |  |
| 🟡 | `lib/server/error-brain/` | 5 | 885 | 60 | 4×URL |  |
| 🟡 | `lib/server/error-brain/transport/` | 6 | 271 | 60 | 1×URL |  |
| 🟡 | `lib/server/evidence/` | 9 | 987 | 55 | 1×TODO 1×URL no-auth |  |
| 🟢 | `lib/server/evidence/services/` | 5 | 229 | 80 | no-auth |  |
| 🟢 | `lib/server/glyph/` | 2 | 170 | 80 | ✅ |  |
| 🟡 | `lib/server/gpu/` | 9 | 3,515 | 40 | 3×URL no-zod no-auth |  |
| 🟡 | `lib/server/graph/` | 17 | 6,953 | 45 | 3×TODO 4×URL no-zod |  |
| 🔴 | `lib/server/grpc/` | 10 | 4,100 | 35 | 1×TODO 17×URL no-zod |  |
| 🟡 | `lib/server/helpers/` | 2 | 299 | 60 | 7×URL |  |
| 🟢 | `lib/server/image/` | 1 | 88 | 80 | ✅ |  |
| 🟡 | `lib/server/indexer/` | 11 | 5,209 | 60 | 2×URL no-auth |  |
| 🟡 | `lib/server/inference/` | 4 | 2,054 | 60 | no-zod no-auth |  |
| 🟢 | `lib/server/init/` | 1 | 105 | 80 | ✅ |  |
| 🟡 | `lib/server/integrations/` | 1 | 241 | 40 | 2×URL no-zod |  |
| 🟢 | `lib/server/kb/` | 2 | 143 | 80 | ✅ |  |
| 🟡 | `lib/server/langextract/` | 1 | 132 | 40 | 1×URL no-zod |  |
| 🟡 | `lib/server/legal/` | 7 | 2,618 | 60 | 2×URL no-auth |  |
| 🟡 | `lib/server/llm/` | 6 | 1,643 | 60 | no-zod no-auth |  |
| 🟡 | `lib/server/mcp/` | 3 | 394 | 60 | no-zod |  |
| 🟢 | `lib/server/middleware/` | 4 | 693 | 100 | ✅ |  |
| 🟡 | `lib/server/minio/` | 2 | 321 | 60 | 3×URL |  |
| 🟡 | `lib/server/ml/` | 8 | 2,973 | 40 | 2×URL no-zod no-auth |  |
| 🟢 | `lib/server/nlp/` | 1 | 140 | 100 | ✅ |  |
| 🟡 | `lib/server/notifications/` | 1 | 210 | 60 | no-zod |  |
| 🟡 | `lib/server/observability/` | 3 | 970 | 60 | 2×URL |  |
| 🟢 | `lib/server/ocr/` | 3 | 392 | 80 | ✅ |  |
| 🟢 | `lib/server/optimize/` | 1 | 42 | 70 | ✅ |  |
| 🟢 | `lib/server/orchestrators/` | 1 | 39 | 80 | ✅ |  |
| 🟢 | `lib/server/pdf/` | 2 | 314 | 80 | ✅ |  |
| 🟡 | `lib/server/pgai/` | 3 | 69 | 60 | no-zod |  |
| 🟢 | `lib/server/phase72/` | 3 | 185 | 80 | ✅ |  |
| 🟢 | `lib/server/phase78/` | 1 | 402 | 80 | ✅ |  |
| 🟢 | `lib/server/pipeline/` | 1 | 211 | 80 | ✅ |  |
| 🟡 | `lib/server/queue/` | 8 | 3,812 | 60 | 2×URL no-auth |  |
| 🟢 | `lib/server/rag/` | 7 | 527 | 80 | ✅ |  |
| 🟢 | `lib/server/rate-limit/` | 2 | 318 | 80 | ✅ |  |
| 🟢 | `lib/server/reports/` | 1 | 112 | 80 | no-auth |  |
| 🟡 | `lib/server/research/` | 13 | 1,380 | 60 | no-zod |  |
| 🟡 | `lib/server/retrieval/` | 24 | 6,342 | 40 | 5×URL no-zod no-auth |  |
| 🟢 | `lib/server/search/` | 1 | 241 | 80 | ✅ |  |
| 🟡 | `lib/server/security/` | 1 | 131 | 60 | 2×URL |  |
| 🟡 | `lib/server/services/` | 2 | 703 | 40 | 2×URL no-zod |  |
| 🟢 | `lib/server/simulation/` | 2 | 477 | 100 | ✅ |  |
| 🟢 | `lib/server/startup/` | 1 | 114 | 80 | ✅ |  |
| 🟢 | `lib/server/storage/` | 1 | 7 | 80 | ✅ |  |
| 🟡 | `lib/server/streaming/` | 2 | 364 | 60 | 2×URL |  |
| 🟢 | `lib/server/tools/` | 1 | 356 | 100 | ✅ |  |
| 🟡 | `lib/server/tools/handlers/` | 8 | 1,152 | 60 | no-zod |  |
| 🟢 | `lib/server/training/` | 1 | 111 | 80 | ✅ |  |
| 🟢 | `lib/server/types/` | 10 | 1,099 | 80 | ✅ |  |
| 🟢 | `lib/server/unified/` | 1 | 284 | 80 | ✅ |  |
| 🟢 | `lib/server/utils/` | 13 | 941 | 80 | 12×URL |  |
| 🟢 | `lib/server/validation/` | 2 | 402 | 100 | ✅ |  |
| 🟡 | `lib/server/vector/` | 10 | 2,831 | 55 | 1×TODO 2×URL no-auth |  |
| 🟡 | `lib/server/workers/` | 5 | 1,769 | 40 | 6×URL no-zod no-auth |  |
| 🟡 | `lib/services/` | 7 | 872 | 40 | 3×URL no-zod |  |
| 🟡 | `lib/services/error-analysis/` | 17 | 4,788 | 40 | 8×URL no-zod |  |
| 🟡 | `lib/services/knowledge-search/` | 11 | 3,965 | 40 | 13×URL no-zod |  |
| 🟢 | `lib/shared/` | 3 | 238 | 80 | ✅ |  |
| 🟢 | `lib/shared/schemas/` | 1 | 32 | 80 | ✅ |  |
| 🟢 | `lib/shared/types/` | 1 | 14 | 80 | ✅ |  |
| 🟡 | `lib/shims/` | 11 | 1,235 | 60 | 4×URL |  |
| 🟡 | `lib/stores/` | 14 | 2,623 | 60 | no-zod |  |
| 🟢 | `lib/stores/dashboard/` | 3 | 654 | 80 | ✅ |  |
| 🟡 | `lib/stores/unified/` | 6 | 1,211 | 60 | no-zod |  |
| 🟢 | `lib/test-utils/` | 1 | 11 | 80 | ✅ |  |
| 🟢 | `lib/types/` | 51 | 7,019 | 80 | ✅ |  |
| 🟡 | `lib/utils/` | 42 | 7,081 | 45 | 16×TODO 27×URL no-zod |  |
| 🟡 | `lib/webgpu/` | 19 | 5,518 | 40 | 2×URL no-zod |  |
| 🟢 | `lib/workers/` | 4 | 1,086 | 75 | 2×TODO |  |
| 🟡 | `mcp/` | 2 | 4,233 | 40 | 15×URL no-zod |  |
| 🟡 | `mcp/tools/` | 1 | 195 | 60 | 1×URL |  |
| 🟢 | `routes/` | 6 | 2,700 | 80 | no-zod |  |
| 🟡 | `routes/(admin)/error-brain/components/` | 3 | 628 | 50 | no-zod |  |
| 🟢 | `routes/(analysis)/` | 2 | 79 | 80 | ✅ |  |
| 🟢 | `routes/(analysis)@/` | 2 | 79 | 80 | ✅ |  |
| 🟢 | `routes/(analysis)@/audio-analysis/[evidenceId]/` | 2 | 838 | 80 | no-zod |  |
| 🟢 | `routes/(analysis)@/document-analysis/[evidenceId]/` | 2 | 801 | 80 | no-zod |  |
| 🟢 | `routes/(analysis)@/video-analysis/[evidenceId]/` | 2 | 999 | 80 | no-zod |  |
| 🟢 | `routes/(analysis)/audio-analysis/[evidenceId]/` | 2 | 929 | 80 | no-zod |  |
| 🟢 | `routes/(analysis)/document-analysis/[evidenceId]/` | 2 | 935 | 80 | no-zod |  |
| 🟢 | `routes/(analysis)/video-analysis/[evidenceId]/` | 2 | 1,047 | 80 | no-zod |  |
| 🟢 | `routes/(app)/` | 2 | 348 | 80 | ✅ |  |
| 🟡 | `routes/(app)/acp/` | 1 | 613 | 50 | no-zod |  |
| 🟢 | `routes/(app)/active-cases/` | 2 | 1,154 | 80 | no-zod |  |
| 🟢 | `routes/(app)/admin/` | 1 | 732 | 70 | ✅ |  |
| 🟢 | `routes/(app)/admin/ai-dashboard/` | 3 | 168 | 80 | ✅ |  |
| 🟡 | `routes/(app)/admin/all-routes/` | 4 | 2,688 | 60 | no-zod |  |
| 🟡 | `routes/(app)/admin/ast-topology/` | 3 | 858 | 60 | no-zod |  |
| 🟢 | `routes/(app)/admin/cache/` | 3 | 1,082 | 80 | no-zod |  |
| 🟡 | `routes/(app)/admin/case-graph/` | 1 | 662 | 60 | no-zod |  |
| 🟢 | `routes/(app)/admin/chat-memory/` | 2 | 832 | 80 | no-zod |  |
| 🟡 | `routes/(app)/admin/codebase-graph/` | 1 | 859 | 50 | no-zod |  |
| 🟢 | `routes/(app)/admin/codebase-index/` | 3 | 405 | 80 | ✅ |  |
| 🟡 | `routes/(app)/admin/codebase-viewer/` | 3 | 672 | 60 | no-zod |  |
| 🟡 | `routes/(app)/admin/component-analysis/` | 2 | 879 | 55 | 2×TODO no-zod |  |
| 🟡 | `routes/(app)/admin/dev-tools/` | 3 | 1,381 | 40 | 1×URL no-zod |  |
| 🟡 | `routes/(app)/admin/error-analysis/` | 2 | 260 | 60 | no-zod |  |
| 🟢 | `routes/(app)/admin/error-brain/` | 4 | 746 | 80 | no-zod |  |
| 🟡 | `routes/(app)/admin/explorer/` | 1 | 736 | 50 | no-zod |  |
| 🟡 | `routes/(app)/admin/face-gallery/` | 1 | 975 | 60 | no-zod |  |
| 🟢 | `routes/(app)/admin/gpu-evidence-graph/` | 3 | 640 | 80 | ✅ |  |
| 🟡 | `routes/(app)/admin/kag-notebook/` | 2 | 335 | 60 | no-zod |  |
| 🟢 | `routes/(app)/admin/knowledge-search/` | 2 | 397 | 80 | ✅ |  |
| 🟡 | `routes/(app)/admin/library/` | 2 | 891 | 40 | 6×URL no-zod |  |
| 🟢 | `routes/(app)/admin/phase78/` | 1 | 6 | 80 | ✅ |  |
| 🟡 | `routes/(app)/admin/phase89/` | 2 | 1,727 | 55 | 2×TODO no-zod |  |
| 🟡 | `routes/(app)/admin/qlora-training/` | 2 | 375 | 60 | no-zod |  |
| 🟢 | `routes/(app)/admin/search-intelligence/` | 3 | 4,187 | 80 | no-zod |  |
| 🟡 | `routes/(app)/admin/topology/` | 1 | 663 | 50 | no-zod |  |
| 🟢 | `routes/(app)/ai-dashboard/` | 1 | 6 | 80 | ✅ |  |
| 🟢 | `routes/(app)/all-routes/` | 1 | 6 | 80 | ✅ |  |
| 🟢 | `routes/(app)/analysis-center/` | 5 | 1,576 | 100 | ✅ |  |
| 🟡 | `routes/(app)/analytics/` | 2 | 2,385 | 60 | no-zod |  |
| 🟢 | `routes/(app)/cache-monitor/` | 1 | 146 | 70 | ✅ |  |
| 🟢 | `routes/(app)/cases/` | 4 | 1,989 | 100 | ✅ |  |
| 🟢 | `routes/(app)/cases/[id]/` | 6 | 1,564 | 80 | no-zod |  |
| 🟢 | `routes/(app)/cases/new/` | 3 | 954 | 100 | ✅ |  |
| 🟢 | `routes/(app)/chat/` | 2 | 298 | 75 | 1×TODO |  |
| 🟢 | `routes/(app)/chat/[id]/` | 2 | 567 | 80 | ✅ |  |
| 🟡 | `routes/(app)/citations/` | 3 | 1,676 | 60 | no-zod |  |
| 🟡 | `routes/(app)/citations/[...label]/` | 2 | 91 | 60 | no-zod |  |
| 🟢 | `routes/(app)/citations/law/` | 2 | 421 | 80 | ✅ |  |
| 🟡 | `routes/(app)/codebase-graph/` | 3 | 583 | 50 | no-zod |  |
| 🟢 | `routes/(app)/codebase-wiki/` | 1 | 25 | 70 | ✅ |  |
| 🟢 | `routes/(app)/command-center/` | 3 | 1,316 | 80 | ✅ |  |
| 🟡 | `routes/(app)/command-center/codebase/` | 1 | 662 | 50 | no-zod |  |
| 🔴 | `routes/(app)/couchdb-analytics/` | 5 | 1,833 | 30 | 1×URL no-zod |  |
| 🟡 | `routes/(app)/dashboard/` | 1 | 1,995 | 50 | no-zod |  |
| 🟢 | `routes/(app)/demos/` | 2 | 1,163 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/ace-pipeline/` | 2 | 129 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/agent-chat/` | 2 | 13 | 80 | ✅ |  |
| 🟡 | `routes/(app)/demos/agentic-errors/` | 3 | 485 | 50 | no-zod |  |
| 🟢 | `routes/(app)/demos/ai-assistant/` | 2 | 16 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/ai-chat-test/` | 2 | 22 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/ai-file-upload/` | 2 | 13 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/ask-ai/` | 2 | 13 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/bento-dashboard/` | 1 | 306 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/bits-ui/` | 2 | 8 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/cache/` | 2 | 8 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/case-form/` | 2 | 34 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/case-prediction/` | 1 | 184 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/case-scoring/` | 1 | 12 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/celestial-icons/` | 2 | 528 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/chat-messages/` | 2 | 32 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/chunks-ui/` | 1 | 225 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/citation-tools/` | 2 | 39 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/client-ai-chat/` | 2 | 13 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/client-inference/` | 2 | 133 | 80 | ✅ |  |
| 🟡 | `routes/(app)/demos/codebase-graph/` | 1 | 227 | 50 | no-zod |  |
| 🟢 | `routes/(app)/demos/collab-canvas/` | 2 | 13 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/context-menu/` | 2 | 48 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/contextual-chat/` | 2 | 13 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/courtroom-sim/` | 3 | 1,020 | 80 | no-zod |  |
| 🟡 | `routes/(app)/demos/crime-reconstruction/` | 2 | 692 | 40 | 1×URL no-zod |  |
| 🟢 | `routes/(app)/demos/detective-command/` | 2 | 13 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/dialog-wrapper/` | 2 | 35 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/document-summarizer/` | 1 | 12 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/embedding-stream/` | 2 | 20 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/enhanced-upload/` | 2 | 13 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/evidence-canvas/` | 2 | 798 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/evidence-dashboard/` | 2 | 40 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/evidence-form/` | 2 | 16 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/gpu-cache/` | 2 | 10 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/hover-card/` | 2 | 46 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/icons/` | 1 | 6 | 70 | ✅ |  |
| 🟡 | `routes/(app)/demos/investigate/` | 1 | 487 | 45 | 1×TODO no-zod |  |
| 🟢 | `routes/(app)/demos/keyboard-shortcuts/` | 2 | 259 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/knowledge-graph/` | 1 | 48 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/legal-layout/` | 2 | 24 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/legal-spellbook/` | 2 | 13 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/memory-palace/` | 2 | 500 | 80 | no-zod |  |
| 🟢 | `routes/(app)/demos/modals/` | 2 | 63 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/modular-upload/` | 2 | 42 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/nes-bits-ui/` | 1 | 6 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/nes-elements/` | 1 | 6 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/nes-graph/` | 2 | 323 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/nes-routes/` | 2 | 471 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/nes-toast/` | 2 | 61 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/nier-showcase/` | 2 | 462 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/notifications/` | 2 | 60 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/page-layouts/` | 1 | 765 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/particles/` | 1 | 367 | 70 | ✅ |  |
| 🟡 | `routes/(app)/demos/phantom-code-lab/` | 2 | 168 | 60 | no-zod |  |
| 🟢 | `routes/(app)/demos/prosecutor-dashboard/` | 2 | 13 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/rag-documents/` | 1 | 12 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/retro-recommendations/` | 1 | 26 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/rich-text-editor/` | 2 | 34 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/search-tools/` | 2 | 38 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/smart-positioning/` | 1 | 352 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/source-drawer/` | 2 | 36 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/spotlight/` | 1 | 241 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/stats-panel/` | 2 | 24 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/streaming/` | 2 | 48 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/svelte5-components/` | 2 | 200 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/svelte5-primitives/` | 2 | 122 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/synthesis-chat/` | 2 | 7 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/theory-board/` | 2 | 13 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/toc-reader/` | 2 | 29 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/ui-components/` | 2 | 738 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/unified-dashboard/` | 1 | 1,303 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/vector-search/` | 1 | 14 | 70 | ✅ |  |
| 🟢 | `routes/(app)/demos/webgpu-memory-palace/` | 2 | 548 | 80 | ✅ |  |
| 🟡 | `routes/(app)/demos/webgpu-showcase/` | 2 | 881 | 55 | 1×TODO no-zod |  |
| 🟢 | `routes/(app)/demos/yorha/` | 2 | 71 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/yorha-assistant/` | 2 | 13 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/yorha-icons/` | 2 | 468 | 80 | ✅ |  |
| 🟢 | `routes/(app)/demos/yorha-terminal/` | 2 | 28 | 80 | ✅ |  |
| 🟢 | `routes/(app)/error-brain/` | 1 | 6 | 80 | ✅ |  |
| 🟢 | `routes/(app)/evidence/` | 6 | 843 | 100 | ✅ |  |
| 🟢 | `routes/(app)/evidence-library/` | 2 | 281 | 80 | no-zod |  |
| 🟢 | `routes/(app)/evidence/analyze/` | 2 | 682 | 80 | no-zod |  |
| 🟢 | `routes/(app)/evidence/hash/` | 2 | 642 | 80 | ✅ |  |
| 🟢 | `routes/(app)/evidence/manage/` | 2 | 191 | 80 | no-zod |  |
| 🟢 | `routes/(app)/evidence/realtime/` | 2 | 642 | 80 | ✅ |  |
| 🟢 | `routes/(app)/evidence/upload/` | 2 | 821 | 100 | ✅ |  |
| 🟢 | `routes/(app)/fictional-cases/` | 2 | 600 | 80 | no-zod |  |
| 🟢 | `routes/(app)/fictional-cases/[id]/` | 2 | 411 | 80 | no-zod |  |
| 🟡 | `routes/(app)/global-search/` | 2 | 2,394 | 60 | no-zod |  |
| 🟢 | `routes/(app)/gpu-evidence-graph/` | 1 | 6 | 80 | ✅ |  |
| 🟡 | `routes/(app)/indexing/` | 1 | 960 | 50 | no-zod |  |
| 🟢 | `routes/(app)/knowledge/` | 1 | 517 | 70 | ✅ |  |
| 🟡 | `routes/(app)/legal-corpus/` | 3 | 1,226 | 60 | no-zod |  |
| 🟢 | `routes/(app)/legal-corpus-premium/` | 1 | 1,155 | 70 | ✅ |  |
| 🟡 | `routes/(app)/legal-corpus/[id]/` | 3 | 2,146 | 60 | no-zod no-auth |  |
| 🟢 | `routes/(app)/library/` | 3 | 619 | 80 | no-zod |  |
| 🟢 | `routes/(app)/library/[documentId]/` | 2 | 436 | 80 | no-auth |  |
| 🟡 | `routes/(app)/library/corpus/` | 2 | 809 | 60 | no-zod no-auth |  |
| 🟡 | `routes/(app)/library/glossary/` | 2 | 767 | 60 | no-zod no-auth |  |
| 🟡 | `routes/(app)/persons-of-interest/` | 3 | 1,947 | 60 | no-zod no-auth |  |
| 🟡 | `routes/(app)/persons-of-interest/[id]/` | 3 | 1,014 | 60 | no-zod no-auth |  |
| 🟢 | `routes/(app)/persons-of-interest/create/` | 2 | 132 | 100 | ✅ |  |
| 🟢 | `routes/(app)/rag-search/` | 2 | 370 | 80 | ✅ |  |
| 🟢 | `routes/(app)/recommendations/` | 2 | 734 | 80 | no-zod |  |
| 🟡 | `routes/(app)/reports/` | 1 | 481 | 50 | no-zod |  |
| 🟢 | `routes/(app)/reports/[id]/` | 3 | 325 | 80 | no-zod |  |
| 🟡 | `routes/(app)/reports/new/` | 1 | 933 | 50 | no-zod |  |
| 🟢 | `routes/(app)/simulation/` | 2 | 1,305 | 80 | no-zod |  |
| 🟡 | `routes/(app)/system-configuration/` | 1 | 838 | 50 | 1×URL |  |
| 🟢 | `routes/(app)/terminal/` | 3 | 1,045 | 80 | ✅ |  |
| 🟢 | `routes/(app)/webgpu-similarity/` | 1 | 12 | 70 | ✅ |  |
| 🟢 | `routes/(dev)/cache-demo/` | 1 | 261 | 70 | ✅ |  |
| 🟢 | `routes/(dev)/demo/bits-ui/` | 2 | 258 | 80 | ✅ |  |
| 🟢 | `routes/(dev)/demo/streaming/` | 1 | 280 | 70 | ✅ |  |
| 🟢 | `routes/(dev)/odin/` | 2 | 323 | 80 | no-zod |  |
| 🟢 | `routes/(dev)/test-source-validation/` | 1 | 381 | 70 | ✅ |  |
| 🟢 | `routes/(dev)/tts-demo/` | 2 | 84 | 80 | ✅ |  |
| 🟢 | `routes/(dev)/voice-chat-demo/` | 2 | 329 | 80 | ✅ |  |
| 🟢 | `routes/api/ace/agent/` | 1 | 33 | 100 | ✅ |  |
| 🟢 | `routes/api/ace/context/` | 1 | 164 | 100 | ✅ |  |
| 🟢 | `routes/api/ace/error-kag/` | 1 | 39 | 100 | ✅ |  |
| 🟡 | `routes/api/ace/health/` | 1 | 156 | 60 | 3×URL no-zod |  |
| 🟢 | `routes/api/ace/ingest/` | 1 | 967 | 100 | ✅ |  |
| 🟢 | `routes/api/ace/rank/` | 1 | 132 | 100 | ✅ |  |
| 🟢 | `routes/api/ace/status/` | 1 | 81 | 100 | ✅ |  |
| 🟢 | `routes/api/ace/summarize/` | 1 | 134 | 100 | ✅ |  |
| 🟢 | `routes/api/acp/execute/` | 1 | 66 | 100 | ✅ |  |
| 🟢 | `routes/api/acp/tools/` | 1 | 48 | 100 | ✅ |  |
| 🟢 | `routes/api/admin/audit/` | 1 | 116 | 100 | ✅ |  |
| 🟢 | `routes/api/admin/cache-stats/` | 1 | 134 | 80 | ✅ |  |
| 🟢 | `routes/api/admin/inference-stats/` | 1 | 104 | 100 | ✅ |  |
| 🟢 | `routes/api/admin/knowledge/` | 1 | 127 | 100 | ✅ |  |
| 🟢 | `routes/api/admin/qlora/` | 1 | 165 | 100 | ✅ |  |
| 🟢 | `routes/api/admin/routes/` | 1 | 243 | 80 | no-zod |  |
| 🟢 | `routes/api/admin/seed-knowledge/` | 1 | 317 | 100 | ✅ |  |
| 🟢 | `routes/api/agent/investigate/` | 1 | 453 | 85 | 3×TODO |  |
| 🟢 | `routes/api/agents/chat/` | 1 | 295 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/agent/` | 1 | 352 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/analyze-evidence/` | 1 | 103 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/ask/` | 1 | 60 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/case-prediction/` | 1 | 71 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/case-scoring/` | 1 | 63 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/chat/` | 1 | 67 | 100 | ✅ |  |
| 🟡 | `routes/api/ai/chat-direct/` | 1 | 104 | 60 | 1×URL |  |
| 🟢 | `routes/api/ai/context/` | 1 | 112 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/contextual-chat/` | 1 | 68 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/cross-exam/` | 1 | 113 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/feedback/` | 1 | 62 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/generate-image/` | 1 | 76 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/judge/` | 1 | 203 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/legal-research/` | 1 | 62 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/memo-skeleton/` | 1 | 102 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/models/` | 1 | 58 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/personas/` | 1 | 23 | 80 | ✅ |  |
| 🟢 | `routes/api/ai/route-intent/` | 1 | 109 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/stats/` | 1 | 98 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/suggestions/` | 1 | 24 | 80 | ✅ |  |
| 🟢 | `routes/api/ai/summarize/` | 1 | 54 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/tensorrt/` | 1 | 105 | 100 | ✅ |  |
| 🟢 | `routes/api/ai/vector-search/` | 1 | 35 | 100 | ✅ |  |
| 🟢 | `routes/api/analysis/page-context/` | 1 | 240 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/codebase-research/` | 1 | 84 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/context-timeline/` | 1 | 157 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/deep-research/` | 1 | 134 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/events/` | 1 | 122 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/feedback/` | 1 | 279 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/focus/` | 1 | 53 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/generate-todos/` | 1 | 381 | 100 | ✅ |  |
| 🟡 | `routes/api/analytics/health/` | 1 | 98 | 60 | no-zod |  |
| 🟢 | `routes/api/analytics/mapreduce-matrix/` | 1 | 158 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/mirror-health/` | 1 | 90 | 80 | ✅ |  |
| 🟢 | `routes/api/analytics/patterns/` | 1 | 33 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/prompt-leaderboard/` | 1 | 88 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/qlora-dataset/` | 1 | 554 | 80 | 2×URL |  |
| 🟢 | `routes/api/analytics/research-graph/` | 1 | 152 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/research-index/` | 1 | 68 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/research-summaries/` | 1 | 239 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/research-topics/` | 1 | 295 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/rl-signal/` | 1 | 87 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/search/` | 1 | 61 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/search-patterns/` | 1 | 269 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/similar-queries/` | 1 | 73 | 80 | ✅ |  |
| 🟢 | `routes/api/analytics/summary/` | 1 | 30 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/token-usage/` | 1 | 46 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/unified-research/` | 1 | 103 | 100 | ✅ |  |
| 🟢 | `routes/api/analytics/web-research/` | 1 | 332 | 100 | ✅ |  |
| 🟢 | `routes/api/analyze-file/` | 1 | 295 | 95 | 2×TODO |  |
| 🟢 | `routes/api/analyze-tag/` | 1 | 185 | 100 | ✅ |  |
| 🟡 | `routes/api/audio/search/` | 1 | 213 | 60 | 4×URL no-zod |  |
| 🟢 | `routes/api/audio/upload/` | 1 | 122 | 100 | ✅ |  |
| 🟢 | `routes/api/audit/gpu/` | 1 | 110 | 100 | ✅ |  |
| 🟢 | `routes/api/audit/planner/` | 1 | 90 | 100 | ✅ |  |
| 🟢 | `routes/api/auth/debug/` | 1 | 23 | 80 | ✅ |  |
| 🟢 | `routes/api/auth/demo-login/` | 1 | 165 | 100 | no-auth |  |
| 🟢 | `routes/api/auth/health/` | 1 | 116 | 80 | no-auth |  |
| 🟢 | `routes/api/auth/login/` | 1 | 74 | 100 | ✅ |  |
| 🟢 | `routes/api/auth/logout/` | 1 | 65 | 80 | ✅ |  |
| 🟢 | `routes/api/auth/me/` | 1 | 19 | 80 | ✅ |  |
| 🟢 | `routes/api/auth/profile/` | 1 | 64 | 100 | ✅ |  |
| 🟢 | `routes/api/auth/register/` | 1 | 89 | 100 | ✅ |  |
| 🟢 | `routes/api/auth/reset-password/` | 1 | 69 | 100 | no-auth |  |
| 🟢 | `routes/api/auth/session/` | 1 | 74 | 80 | ✅ |  |
| 🟢 | `routes/api/cache/` | 1 | 198 | 100 | ✅ |  |
| 🟢 | `routes/api/cache/invalidate/` | 1 | 115 | 100 | ✅ |  |
| 🟢 | `routes/api/cache/metrics/` | 1 | 92 | 80 | ✅ |  |
| 🟢 | `routes/api/cache/nintendo/` | 1 | 50 | 80 | ✅ |  |
| 🟢 | `routes/api/cache/recent-queries/` | 1 | 72 | 100 | ✅ |  |
| 🟢 | `routes/api/cache/set/` | 1 | 36 | 100 | ✅ |  |
| 🟢 | `routes/api/cache/som/` | 1 | 148 | 100 | ✅ |  |
| 🟡 | `routes/api/cache/stats/` | 1 | 246 | 60 | 1×URL |  |
| 🟢 | `routes/api/cache/warm-up/` | 1 | 125 | 100 | ✅ |  |
| 🟢 | `routes/api/canon/` | 1 | 106 | 100 | ✅ |  |
| 🟢 | `routes/api/canon/ingest/` | 1 | 212 | 100 | ✅ |  |
| 🟢 | `routes/api/canon/search/` | 1 | 202 | 100 | ✅ |  |
| 🟢 | `routes/api/cartridge/export/` | 1 | 206 | 100 | ✅ |  |
| 🟢 | `routes/api/cartridge/invalidate/` | 1 | 42 | 100 | ✅ |  |
| 🟢 | `routes/api/cartridge/search/` | 1 | 116 | 100 | ✅ |  |
| 🟢 | `routes/api/cartridge/stats/` | 1 | 57 | 80 | ✅ |  |
| 🟢 | `routes/api/cartridge/tile-atlas/` | 1 | 199 | 100 | ✅ |  |
| 🟢 | `routes/api/cartridge/timeline/` | 1 | 49 | 100 | ✅ |  |
| 🟢 | `routes/api/case-theory/` | 1 | 170 | 100 | ✅ |  |
| 🟢 | `routes/api/cases/` | 1 | 250 | 100 | ✅ |  |
| 🟢 | `routes/api/cases/__tests__/` | 1 | 229 | 90 | ✅ |  |
| 🟢 | `routes/api/cases/[id]/` | 1 | 168 | 100 | ✅ |  |
| 🟢 | `routes/api/cases/analytics/` | 1 | 256 | 100 | ✅ |  |
| 🟢 | `routes/api/cases/cluster/` | 1 | 365 | 100 | ✅ |  |
| 🟢 | `routes/api/charges/add/` | 1 | 45 | 100 | ✅ |  |
| 🟢 | `routes/api/chat/` | 1 | 115 | 100 | ✅ |  |
| 🟢 | `routes/api/chat/migrate/` | 1 | 113 | 100 | ✅ |  |
| 🟢 | `routes/api/chat/replay/` | 1 | 55 | 100 | ✅ |  |
| 🟢 | `routes/api/chat/stream/` | 1 | 513 | 100 | ✅ |  |
| 🟢 | `routes/api/chrrom/events/` | 1 | 59 | 100 | ✅ |  |
| 🟢 | `routes/api/chrrom/precompute/` | 1 | 38 | 100 | ✅ |  |
| 🟢 | `routes/api/chrrom/push/` | 1 | 72 | 100 | ✅ |  |
| 🟢 | `routes/api/citations/` | 1 | 272 | 100 | ✅ |  |
| 🟢 | `routes/api/citations/collections/` | 1 | 96 | 100 | ✅ |  |
| 🟢 | `routes/api/citations/saved/` | 1 | 213 | 100 | ✅ |  |
| 🟢 | `routes/api/citations/search/` | 1 | 78 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/` | 1 | 209 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/analyze/` | 1 | 208 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/batch-gpu/` | 1 | 365 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/claude-assist/` | 1 | 423 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/cluster-assign/` | 1 | 160 | 80 | no-zod |  |
| 🟢 | `routes/api/codebase-index/cluster-detect/` | 1 | 124 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/cluster-summary/` | 1 | 125 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/clusters/` | 1 | 81 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/couchdb-pagerank/` | 1 | 203 | 80 | 1×URL |  |
| 🟢 | `routes/api/codebase-index/deep-research/` | 2 | 389 | 80 | 4×URL |  |
| 🟢 | `routes/api/codebase-index/directory-summaries/` | 1 | 64 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/enrich-qdrant/` | 1 | 518 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/error-filters/` | 1 | 64 | 80 | no-zod |  |
| 🟢 | `routes/api/codebase-index/errors/` | 1 | 117 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/evidence-analyze/` | 1 | 221 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/file-intel/` | 1 | 180 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/gpu-pipeline/` | 1 | 1,299 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/graph/` | 1 | 319 | 80 | ✅ |  |
| 🟢 | `routes/api/codebase-index/graph-sync/` | 1 | 165 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/index-stream/` | 1 | 419 | 80 | no-zod |  |
| 🟢 | `routes/api/codebase-index/ingest-errors/` | 1 | 425 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/ingest-log/` | 1 | 102 | 80 | ✅ |  |
| 🟢 | `routes/api/codebase-index/kag-notebook/` | 1 | 444 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/karpathy-tag/` | 1 | 401 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/orchestrate/` | 1 | 1,618 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/recommendations/` | 1 | 125 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/reindex/` | 1 | 95 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/related/` | 1 | 134 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/route-components/` | 1 | 328 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/search/` | 1 | 66 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/stats/` | 1 | 157 | 80 | no-zod |  |
| 🟡 | `routes/api/codebase-index/summarize-dirs/` | 1 | 194 | 60 | 1×URL no-zod |  |
| 🟢 | `routes/api/codebase-index/tags/` | 1 | 329 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase-index/topology-hits/` | 1 | 83 | 80 | ✅ |  |
| 🟢 | `routes/api/codebase-index/wiki/` | 1 | 154 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase/analyze/` | 1 | 348 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase/apply-patch/` | 1 | 142 | 95 | 2×TODO |  |
| 🟢 | `routes/api/codebase/auto-research/` | 1 | 333 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase/buffer/` | 1 | 34 | 80 | ✅ |  |
| 🟢 | `routes/api/codebase/index/` | 1 | 210 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase/narratives/` | 1 | 116 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase/recall/` | 1 | 142 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase/rerank/` | 1 | 106 | 100 | ✅ |  |
| 🟢 | `routes/api/codebase/wiki/` | 1 | 117 | 100 | ✅ |  |
| 🟢 | `routes/api/codeintel/ace/` | 1 | 94 | 100 | ✅ |  |
| 🟢 | `routes/api/codeintel/clusters/` | 1 | 76 | 80 | ✅ |  |
| 🟢 | `routes/api/codeintel/fix/` | 1 | 48 | 100 | ✅ |  |
| 🟢 | `routes/api/codeintel/health/` | 1 | 76 | 80 | no-zod |  |
| 🟢 | `routes/api/codeintel/semantic-health/` | 1 | 350 | 80 | no-zod |  |
| 🟢 | `routes/api/codeintel/wiki/` | 1 | 94 | 100 | ✅ |  |
| 🟢 | `routes/api/consolidation/status/` | 1 | 42 | 80 | ✅ |  |
| 🟢 | `routes/api/contextual/chat/` | 1 | 438 | 100 | ✅ |  |
| 🟢 | `routes/api/contextual/predictions/` | 1 | 91 | 100 | ✅ |  |
| 🟢 | `routes/api/contextual/state/` | 1 | 79 | 100 | ✅ |  |
| 🟢 | `routes/api/contextual/stats/` | 1 | 100 | 100 | ✅ |  |
| 🟢 | `routes/api/conversations/[id]/` | 1 | 141 | 100 | ✅ |  |
| 🟢 | `routes/api/courtroom/models/` | 1 | 153 | 100 | ✅ |  |
| 🟢 | `routes/api/dashboard/stats/` | 1 | 111 | 80 | ✅ |  |
| 🟢 | `routes/api/db/health/` | 1 | 29 | 80 | ✅ |  |
| 🟢 | `routes/api/detective/analyze/` | 1 | 241 | 100 | ✅ |  |
| 🟢 | `routes/api/detective/connections/` | 1 | 193 | 100 | ✅ |  |
| 🟢 | `routes/api/dev/login-demo/` | 1 | 63 | 80 | ✅ |  |
| 🟢 | `routes/api/docs/` | 1 | 56 | 100 | ✅ |  |
| 🟢 | `routes/api/document/[docId]/` | 1 | 33 | 80 | ✅ |  |
| 🟢 | `routes/api/documents/[id]/` | 1 | 119 | 100 | ✅ |  |
| 🟢 | `routes/api/documents/upload/` | 1 | 178 | 100 | ✅ |  |
| 🟢 | `routes/api/embed/` | 1 | 125 | 100 | ✅ |  |
| 🟢 | `routes/api/engagement/heartbeat/` | 1 | 38 | 80 | ✅ |  |
| 🟢 | `routes/api/engagement/scan/` | 1 | 23 | 80 | ✅ |  |
| 🟢 | `routes/api/error-brain/apply-fix/` | 1 | 170 | 100 | ✅ |  |
| 🟢 | `routes/api/error-brain/auto-patch/` | 1 | 196 | 100 | ✅ |  |
| 🟢 | `routes/api/error-brain/diagnose/` | 1 | 949 | 100 | ✅ |  |
| 🟢 | `routes/api/error-brain/diagnosis-history/` | 1 | 233 | 100 | ✅ |  |
| 🟢 | `routes/api/error-brain/generate-fix/` | 1 | 161 | 100 | ✅ |  |
| 🟢 | `routes/api/error-brain/search/` | 1 | 136 | 100 | ✅ |  |
| 🟢 | `routes/api/error-brain/suggestions/` | 1 | 73 | 100 | ✅ |  |
| 🟢 | `routes/api/error-brain/verify-fix/` | 1 | 100 | 100 | ✅ |  |
| 🟢 | `routes/api/errors/client-report/` | 1 | 78 | 100 | ✅ |  |
| 🟢 | `routes/api/errors/route-errors/` | 1 | 126 | 100 | ✅ |  |
| 🟢 | `routes/api/errors/summary/` | 1 | 49 | 80 | ✅ |  |
| 🟢 | `routes/api/evidence/` | 1 | 110 | 100 | ✅ |  |
| 🟢 | `routes/api/evidence/[id]/` | 1 | 202 | 100 | ✅ |  |
| 🟢 | `routes/api/evidence/analysis/` | 1 | 88 | 100 | ✅ |  |
| 🟢 | `routes/api/evidence/analyze/` | 1 | 21 | 80 | no-zod |  |
| 🟢 | `routes/api/evidence/connections/` | 1 | 57 | 100 | ✅ |  |
| 🟢 | `routes/api/evidence/entities/` | 1 | 141 | 100 | ✅ |  |
| 🟢 | `routes/api/evidence/extract-docling/` | 1 | 67 | 100 | ✅ |  |
| 🟢 | `routes/api/evidence/realtime/` | 1 | 147 | 100 | ✅ |  |
| 🟢 | `routes/api/evidence/relationships/` | 1 | 104 | 100 | ✅ |  |
| 🟢 | `routes/api/evidence/search/` | 1 | 791 | 100 | ✅ |  |
| 🟢 | `routes/api/evidence/upload/` | 1 | 2,275 | 100 | ✅ |  |
| 🟢 | `routes/api/evidence/upload-test/` | 1 | 55 | 100 | ✅ |  |
| 🟢 | `routes/api/feedback/` | 1 | 41 | 100 | ✅ |  |
| 🟢 | `routes/api/fictional-cases/` | 1 | 130 | 100 | ✅ |  |
| 🟢 | `routes/api/fictional-cases/[id]/` | 1 | 165 | 100 | ✅ |  |
| 🟢 | `routes/api/generate-cluster-summaries/` | 1 | 379 | 80 | ✅ |  |
| 🟢 | `routes/api/glossary/` | 1 | 131 | 100 | ✅ |  |
| 🟢 | `routes/api/glossary/search/` | 1 | 252 | 100 | ✅ |  |
| 🟢 | `routes/api/glossary/terms/` | 1 | 143 | 100 | ✅ |  |
| 🟢 | `routes/api/glyph/generate/` | 1 | 107 | 100 | ✅ |  |
| 🟢 | `routes/api/glyph/search/` | 1 | 208 | 100 | ✅ |  |
| 🟢 | `routes/api/glyph/tile-atlas/` | 1 | 172 | 100 | ✅ |  |
| 🟢 | `routes/api/gpu-wasm-integration/` | 1 | 288 | 100 | ✅ |  |
| 🟢 | `routes/api/gpu/compute/` | 1 | 93 | 100 | ✅ |  |
| 🟢 | `routes/api/gpu/lease/` | 1 | 95 | 100 | ✅ |  |
| 🟢 | `routes/api/gpu/queue/` | 1 | 89 | 100 | ✅ |  |
| 🟢 | `routes/api/graph/analyze/` | 1 | 76 | 100 | ✅ |  |
| 🟢 | `routes/api/graph/cases/` | 1 | 143 | 100 | ✅ |  |
| 🟡 | `routes/api/graph/colab-export/` | 1 | 659 | 60 | 3×URL |  |
| 🟢 | `routes/api/graph/connections/` | 1 | 55 | 100 | ✅ |  |
| 🟢 | `routes/api/graph/hypergraph/` | 1 | 93 | 80 | ✅ |  |
| 🟢 | `routes/api/graph/recommendations/` | 1 | 147 | 100 | ✅ |  |
| 🟢 | `routes/api/graph/relationships/` | 1 | 63 | 100 | ✅ |  |
| 🟢 | `routes/api/graph/som-topology/` | 1 | 109 | 100 | ✅ |  |
| 🟢 | `routes/api/graph/sync/` | 1 | 37 | 100 | ✅ |  |
| 🟢 | `routes/api/graph/timeline/` | 1 | 205 | 100 | ✅ |  |
| 🟢 | `routes/api/health/` | 1 | 416 | 80 | 4×URL no-auth |  |
| 🟡 | `routes/api/health/capabilities/` | 1 | 228 | 60 | no-zod no-auth |  |
| 🟢 | `routes/api/health/circuit-breakers/` | 1 | 22 | 80 | ✅ |  |
| 🟢 | `routes/api/health/database/` | 1 | 39 | 80 | ✅ |  |
| 🟢 | `routes/api/health/gpu/` | 1 | 92 | 80 | ✅ |  |
| 🟢 | `routes/api/health/neo4j/` | 1 | 45 | 80 | ✅ |  |
| 🟢 | `routes/api/health/ocr/` | 1 | 344 | 80 | ✅ |  |
| 🟡 | `routes/api/health/ollama/` | 1 | 59 | 60 | no-zod |  |
| 🟢 | `routes/api/health/qdrant/` | 1 | 145 | 100 | ✅ |  |
| 🟢 | `routes/api/health/ready/` | 1 | 44 | 80 | ✅ |  |
| 🟢 | `routes/api/health/redis/` | 1 | 82 | 80 | ✅ |  |
| 🟢 | `routes/api/health/redis-pool/` | 1 | 84 | 80 | ✅ |  |
| 🟢 | `routes/api/health/services/` | 1 | 118 | 80 | ✅ |  |
| 🟢 | `routes/api/health/status/` | 1 | 41 | 80 | ✅ |  |
| 🟢 | `routes/api/health/system/` | 1 | 33 | 80 | ✅ |  |
| 🟢 | `routes/api/hypergraph/lookup/` | 1 | 149 | 80 | 1×URL |  |
| 🟢 | `routes/api/indexing/` | 1 | 547 | 100 | ✅ |  |
| 🟡 | `routes/api/infrastructure/status/` | 1 | 335 | 60 | no-zod |  |
| 🟢 | `routes/api/ingest/` | 1 | 98 | 100 | ✅ |  |
| 🟢 | `routes/api/ingest-constitution/` | 1 | 47 | 80 | ✅ |  |
| 🟢 | `routes/api/ingest/legal/` | 1 | 251 | 100 | ✅ |  |
| 🟢 | `routes/api/investigate/suggest/` | 1 | 179 | 100 | ✅ |  |
| 🟢 | `routes/api/kb/search/` | 1 | 78 | 100 | ✅ |  |
| 🟢 | `routes/api/kb/validate/` | 1 | 173 | 100 | ✅ |  |
| 🟢 | `routes/api/knowledge/` | 1 | 524 | 100 | ✅ |  |
| 🟢 | `routes/api/knowledge/backfill/` | 1 | 56 | 100 | ✅ |  |
| 🟢 | `routes/api/knowledge/lint/` | 1 | 293 | 100 | ✅ |  |
| 🟢 | `routes/api/knowledge/search/` | 1 | 263 | 100 | ✅ |  |
| 🟢 | `routes/api/knowledge/stats/` | 1 | 69 | 80 | ✅ |  |
| 🟢 | `routes/api/knowledge/stream/` | 1 | 231 | 100 | ✅ |  |
| 🟢 | `routes/api/knowledge/youtube/` | 1 | 185 | 80 | ✅ |  |
| 🟢 | `routes/api/library/citations/` | 1 | 30 | 100 | ✅ |  |
| 🟢 | `routes/api/library/crawl/` | 1 | 237 | 100 | ✅ |  |
| 🟢 | `routes/api/library/documents/` | 1 | 96 | 100 | ✅ |  |
| 🟢 | `routes/api/library/health/` | 1 | 179 | 80 | no-zod |  |
| 🟢 | `routes/api/library/ingest-codebase-docs/` | 1 | 294 | 80 | ✅ |  |
| 🟢 | `routes/api/library/ingest-dev-docs/` | 1 | 396 | 100 | ✅ |  |
| 🟢 | `routes/api/library/resolve-citation/` | 1 | 63 | 100 | ✅ |  |
| 🟢 | `routes/api/library/search/` | 1 | 280 | 100 | ✅ |  |
| 🟢 | `routes/api/library/suggestions/` | 1 | 82 | 100 | ✅ |  |
| 🟢 | `routes/api/library/upload/` | 1 | 88 | 100 | ✅ |  |
| 🟢 | `routes/api/mcp/` | 1 | 99 | 80 | ✅ |  |
| 🟡 | `routes/api/metrics/` | 1 | 84 | 60 | 1×URL |  |
| 🟢 | `routes/api/ml/cluster-status/` | 1 | 132 | 100 | ✅ |  |
| 🟢 | `routes/api/nlp/classify/` | 1 | 30 | 100 | ✅ |  |
| 🟢 | `routes/api/nlp/sentiment/` | 1 | 30 | 100 | ✅ |  |
| 🟢 | `routes/api/observability/inference-stats/` | 1 | 35 | 80 | ✅ |  |
| 🟢 | `routes/api/obsidian/` | 1 | 147 | 100 | ✅ |  |
| 🟢 | `routes/api/ollama/generate/` | 1 | 88 | 100 | ✅ |  |
| 🟢 | `routes/api/ollama/pull/` | 1 | 87 | 100 | ✅ |  |
| 🟢 | `routes/api/onboarding/` | 1 | 120 | 100 | ✅ |  |
| 🟢 | `routes/api/orchestrator/analyze/` | 1 | 79 | 100 | ✅ |  |
| 🟢 | `routes/api/persons/` | 1 | 150 | 100 | ✅ |  |
| 🟢 | `routes/api/persons-of-interest/` | 1 | 175 | 100 | ✅ |  |
| 🟢 | `routes/api/persons-of-interest/__tests__/` | 1 | 173 | 90 | ✅ |  |
| 🟢 | `routes/api/persons-of-interest/[id]/` | 1 | 211 | 100 | ✅ |  |
| 🟢 | `routes/api/persons-of-interest/relationships/` | 1 | 56 | 100 | ✅ |  |
| 🟢 | `routes/api/persons-of-interest/search/` | 1 | 102 | 100 | ✅ |  |
| 🟢 | `routes/api/persons/face-synth/` | 1 | 287 | 100 | ✅ |  |
| 🟢 | `routes/api/pgai/analyze/` | 1 | 33 | 100 | ✅ |  |
| 🟢 | `routes/api/pgai/compare/` | 1 | 33 | 100 | ✅ |  |
| 🟢 | `routes/api/pgai/summarize/` | 1 | 38 | 100 | ✅ |  |
| 🟢 | `routes/api/phase109/kag/` | 1 | 87 | 100 | ✅ |  |
| 🟢 | `routes/api/phase109/tag-chunks/` | 1 | 172 | 80 | 1×URL |  |
| 🟢 | `routes/api/phase72/errors/` | 1 | 77 | 100 | ✅ |  |
| 🟢 | `routes/api/phase72/similar/` | 1 | 197 | 100 | ✅ |  |
| 🟢 | `routes/api/phase72/suggest-fix/` | 1 | 107 | 100 | ✅ |  |
| 🟢 | `routes/api/phase78/monitor/` | 1 | 48 | 80 | ✅ |  |
| 🟢 | `routes/api/phase78/playwright-check/` | 1 | 44 | 100 | ✅ |  |
| 🟢 | `routes/api/phase78/route-health/` | 1 | 62 | 100 | ✅ |  |
| 🟢 | `routes/api/phase78/suggestion-state/` | 1 | 44 | 100 | ✅ |  |
| 🟢 | `routes/api/phase82/status/` | 1 | 53 | 100 | ✅ |  |
| 🟢 | `routes/api/phase82/upgrade-route/` | 1 | 37 | 100 | ✅ |  |
| 🟢 | `routes/api/phase89/activity/` | 1 | 70 | 80 | ✅ |  |
| 🟢 | `routes/api/phase89/agentic-fix/` | 1 | 189 | 100 | ✅ |  |
| 🟢 | `routes/api/phase89/analysis/` | 1 | 337 | 80 | ✅ |  |
| 🟢 | `routes/api/phase89/analyze/` | 1 | 157 | 100 | ✅ |  |
| 🟢 | `routes/api/phase89/clusters/` | 1 | 111 | 80 | ✅ |  |
| 🟢 | `routes/api/phase89/components/` | 1 | 121 | 80 | no-zod |  |
| 🟢 | `routes/api/phase89/config/` | 1 | 79 | 80 | ✅ |  |
| 🟢 | `routes/api/phase89/execute-command/` | 1 | 56 | 100 | ✅ |  |
| 🟢 | `routes/api/phase89/fix/` | 1 | 83 | 100 | ✅ |  |
| 🟢 | `routes/api/phase89/graph/` | 1 | 55 | 80 | ✅ |  |
| 🟢 | `routes/api/phase89/pipeline/` | 1 | 79 | 100 | ✅ |  |
| 🟢 | `routes/api/phase89/reindex/` | 1 | 53 | 80 | no-zod |  |
| 🟢 | `routes/api/phase89/search/` | 1 | 66 | 100 | ✅ |  |
| 🟢 | `routes/api/phase89/similar-clusters/` | 1 | 65 | 100 | ✅ |  |
| 🟢 | `routes/api/phase89/stats/` | 1 | 43 | 80 | ✅ |  |
| 🟢 | `routes/api/phase89/status/` | 1 | 166 | 80 | no-zod |  |
| 🟢 | `routes/api/phase89/stream/` | 1 | 88 | 80 | ✅ |  |
| 🟢 | `routes/api/phase89/topology/` | 1 | 91 | 80 | ✅ |  |
| 🟢 | `routes/api/phase89/vector-search/` | 1 | 92 | 100 | ✅ |  |
| 🟢 | `routes/api/ping/` | 1 | 13 | 80 | ✅ |  |
| 🟢 | `routes/api/pipeline/run/` | 1 | 66 | 100 | ✅ |  |
| 🟢 | `routes/api/playwright/run-health-check/` | 1 | 44 | 100 | ✅ |  |
| 🟢 | `routes/api/precedents/` | 1 | 80 | 100 | ✅ |  |
| 🟢 | `routes/api/precedents/search/` | 1 | 262 | 100 | ✅ |  |
| 🟢 | `routes/api/push/` | 1 | 95 | 100 | ✅ |  |
| 🟢 | `routes/api/push/send/` | 1 | 90 | 100 | ✅ |  |
| 🟢 | `routes/api/qlora/generate/` | 1 | 167 | 100 | ✅ |  |
| 🟢 | `routes/api/queue/dispatch-stats/` | 1 | 26 | 80 | ✅ |  |
| 🟢 | `routes/api/rabbitmq/publish/` | 1 | 134 | 80 | 1×URL |  |
| 🟢 | `routes/api/rag/answer/` | 1 | 231 | 100 | ✅ |  |
| 🟢 | `routes/api/rag/documents/` | 1 | 45 | 100 | ✅ |  |
| 🟢 | `routes/api/rag/enhanced/` | 1 | 97 | 100 | ✅ |  |
| 🟢 | `routes/api/rag/process/` | 1 | 132 | 100 | ✅ |  |
| 🟢 | `routes/api/rag/search/` | 2 | 1,189 | 80 | 1×URL |  |
| 🟢 | `routes/api/rag/suggestions/` | 1 | 139 | 100 | ✅ |  |
| 🟢 | `routes/api/rag/todo-suggestions/` | 1 | 207 | 100 | ✅ |  |
| 🟢 | `routes/api/rag/unified/` | 1 | 63 | 80 | ✅ |  |
| 🟢 | `routes/api/rag/validate/` | 1 | 141 | 100 | ✅ |  |
| 🟢 | `routes/api/recommendations/` | 1 | 486 | 100 | ✅ |  |
| 🟢 | `routes/api/recommendations/[userId]/` | 1 | 362 | 100 | ✅ |  |
| 🟢 | `routes/api/recommendations/metrics/` | 1 | 42 | 100 | ✅ |  |
| 🟢 | `routes/api/recommendations/track/` | 1 | 190 | 100 | ✅ |  |
| 🟢 | `routes/api/reports/` | 1 | 321 | 100 | ✅ |  |
| 🟢 | `routes/api/reports/batch-export/` | 1 | 141 | 100 | ✅ |  |
| 🟢 | `routes/api/reports/generate/` | 1 | 387 | 100 | ✅ |  |
| 🟢 | `routes/api/reports/generate-from-template/` | 1 | 216 | 100 | ✅ |  |
| 🟢 | `routes/api/reports/police/` | 1 | 125 | 100 | ✅ |  |
| 🟢 | `routes/api/reports/save/` | 1 | 58 | 100 | ✅ |  |
| 🟢 | `routes/api/research/concurrent-deep/` | 1 | 213 | 100 | ✅ |  |
| 🟢 | `routes/api/research/ingest/` | 1 | 119 | 100 | ✅ |  |
| 🟢 | `routes/api/research/search/` | 1 | 66 | 100 | ✅ |  |
| 🟢 | `routes/api/route-operations/log/` | 1 | 49 | 80 | ✅ |  |
| 🟢 | `routes/api/routes/events/` | 1 | 173 | 80 | ✅ |  |
| 🟢 | `routes/api/routes/metadata/` | 1 | 73 | 100 | ✅ |  |
| 🟢 | `routes/api/search/` | 1 | 679 | 100 | ✅ |  |
| 🟢 | `routes/api/search/cases/` | 1 | 193 | 100 | ✅ |  |
| 🟢 | `routes/api/search/citations/` | 1 | 67 | 100 | ✅ |  |
| 🟢 | `routes/api/search/filters/` | 1 | 78 | 100 | ✅ |  |
| 🟢 | `routes/api/search/laws/` | 1 | 141 | 100 | ✅ |  |
| 🟢 | `routes/api/search/suggestions/` | 1 | 201 | 100 | ✅ |  |
| 🟢 | `routes/api/simulation/` | 1 | 322 | 100 | ✅ |  |
| 🟢 | `routes/api/simulation/[sessionId]/` | 1 | 507 | 100 | ✅ |  |
| 🟢 | `routes/api/sse/[id]/` | 1 | 179 | 80 | ✅ |  |
| 🟢 | `routes/api/sse/chat/` | 1 | 2,565 | 100 | ✅ |  |
| 🟢 | `routes/api/statutes/` | 1 | 135 | 100 | ✅ |  |
| 🟢 | `routes/api/statutes/[id]/` | 1 | 99 | 100 | ✅ |  |
| 🟢 | `routes/api/statutes/search/` | 1 | 183 | 100 | ✅ |  |
| 🟢 | `routes/api/stream/` | 1 | 49 | 100 | ✅ |  |
| 🟢 | `routes/api/stream/[chatId]/` | 1 | 53 | 80 | ✅ |  |
| 🟢 | `routes/api/summarize/` | 1 | 61 | 100 | ✅ |  |
| 🟢 | `routes/api/summarize/analyze/` | 1 | 69 | 100 | ✅ |  |
| 🟢 | `routes/api/summarize/synthesize/` | 1 | 87 | 100 | ✅ |  |
| 🟢 | `routes/api/sync/documents/` | 1 | 49 | 100 | ✅ |  |
| 🟢 | `routes/api/synthesis/generate/` | 1 | 1,150 | 95 | 1×TODO |  |
| 🟢 | `routes/api/synthesis/prompt-feedback/` | 1 | 88 | 100 | ✅ |  |
| 🟢 | `routes/api/synthesis/qlora-export/` | 1 | 117 | 80 | ✅ |  |
| 🟢 | `routes/api/synthesis/save/` | 1 | 76 | 100 | ✅ |  |
| 🟢 | `routes/api/synthesis/typing-context/` | 1 | 260 | 100 | ✅ |  |
| 🟢 | `routes/api/system/env/` | 1 | 31 | 80 | ✅ |  |
| 🟡 | `routes/api/system/health/` | 1 | 166 | 60 | no-zod |  |
| 🟡 | `routes/api/system/phase13/` | 1 | 80 | 60 | no-zod |  |
| 🟡 | `routes/api/system/services/` | 1 | 144 | 60 | 1×URL no-zod |  |
| 🟢 | `routes/api/tags/` | 1 | 73 | 80 | ✅ |  |
| 🟢 | `routes/api/tags/[tagId]/` | 1 | 27 | 80 | ✅ |  |
| 🟢 | `routes/api/tags/search/` | 1 | 51 | 100 | ✅ |  |
| 🟢 | `routes/api/tasks/` | 1 | 113 | 100 | ✅ |  |
| 🟢 | `routes/api/tasks/[id]/` | 1 | 91 | 100 | ✅ |  |
| 🟢 | `routes/api/test/cache-demo/` | 1 | 105 | 100 | ✅ |  |
| 🟢 | `routes/api/test/cache-simple/` | 1 | 148 | 100 | ✅ |  |
| 🟢 | `routes/api/test/cache-single-conn/` | 1 | 97 | 100 | ✅ |  |
| 🟢 | `routes/api/test/ollama-cached/` | 1 | 58 | 100 | ✅ |  |
| 🟢 | `routes/api/test/redis-direct/` | 1 | 59 | 80 | ✅ |  |
| 🟢 | `routes/api/test/redis-write/` | 1 | 43 | 80 | ✅ |  |
| 🟢 | `routes/api/test/tiered-cache/` | 1 | 133 | 100 | ✅ |  |
| 🟢 | `routes/api/test/webgpu-modules/` | 1 | 133 | 80 | ✅ |  |
| 🟢 | `routes/api/tools/batch/` | 1 | 71 | 100 | ✅ |  |
| 🟢 | `routes/api/tools/execute/` | 1 | 70 | 100 | ✅ |  |
| 🟢 | `routes/api/tools/list/` | 1 | 44 | 100 | ✅ |  |
| 🟢 | `routes/api/tools/stream/` | 1 | 111 | 100 | ✅ |  |
| 🟢 | `routes/api/topology/` | 1 | 122 | 80 | ✅ |  |
| 🟢 | `routes/api/topology/stream/` | 1 | 93 | 80 | ✅ |  |
| 🟢 | `routes/api/user/preferences/` | 1 | 91 | 100 | ✅ |  |
| 🟢 | `routes/api/v1/agentic/` | 1 | 122 | 100 | ✅ |  |
| 🟢 | `routes/api/vector-search/` | 1 | 110 | 100 | ✅ |  |
| 🟢 | `routes/api/vision/analyze/` | 1 | 233 | 100 | ✅ |  |
| 🟢 | `routes/api/web/crawl/` | 1 | 147 | 100 | ✅ |  |
| 🟢 | `routes/api/web/search/` | 1 | 34 | 100 | ✅ |  |
| 🟢 | `routes/api/websearch/` | 1 | 63 | 80 | 1×URL |  |
| 🟢 | `routes/api/whisper/transcribe/` | 1 | 417 | 100 | ✅ |  |
| 🟢 | `routes/api/workflow-events/[sessionId]/` | 1 | 133 | 80 | ✅ |  |
| 🟢 | `routes/api/yorha/analytics/` | 1 | 189 | 100 | ✅ |  |
| 🟢 | `routes/api/yorha/cases/` | 1 | 98 | 100 | ✅ |  |
| 🟢 | `routes/api/yorha/cluster-health/` | 1 | 74 | 80 | ✅ |  |
| 🟢 | `routes/api/yorha/search/` | 1 | 149 | 100 | ✅ |  |
| 🟢 | `routes/login/` | 3 | 462 | 100 | ✅ |  |
| 🟢 | `routes/minio/[...path]/` | 1 | 57 | 80 | ✅ |  |
| 🟢 | `routes/register/` | 1 | 542 | 70 | ✅ |  |
| 🟢 | `shims/` | 1 | 1 | 70 | ✅ |  |
| 🟡 | `stores/` | 1 | 47 | 60 | no-zod |  |
| 🟢 | `tests/` | 1 | 10 | 70 | ✅ |  |
| 🟢 | `types/` | 23 | 889 | 80 | ✅ |  |
| 🟢 | `wasm/` | 2 | 524 | 80 | ✅ |  |
| 🟢 | `workers/` | 2 | 54 | 80 | ✅ |  |

---

## Tier Breakdown

### 🔴 Critical — needs immediate attention (3)

- `lib/components/` — 56 files, 15,890 lines, score **35/100**
- `lib/server/grpc/` — 10 files, 4,100 lines, score **35/100**
- `routes/(app)/couchdb-analytics/` — 5 files, 1,833 lines, score **30/100**


### 🟡 Warning — production gaps (148)

- `lib/` — 11 files, 1,568 lines, score **60/100**
- `lib/ai/` — 13 files, 4,102 lines, score **40/100**
- `lib/cache/` — 5 files, 1,046 lines, score **60/100**
- `lib/client/` — 4 files, 549 lines, score **60/100**
- `lib/client/ui/` — 1 files, 126 lines, score **50/100**
- `lib/components/admin/` — 5 files, 2,560 lines, score **50/100**
- `lib/components/agent/` — 1 files, 391 lines, score **50/100**
- `lib/components/agentic/` — 2 files, 498 lines, score **50/100**
- `lib/components/ai/` — 45 files, 19,664 lines, score **40/100**
- `lib/components/analysis/` — 3 files, 2,809 lines, score **50/100**
- `lib/components/analytics/` — 2 files, 1,161 lines, score **50/100**
- `lib/components/audio/` — 1 files, 631 lines, score **50/100**
- `lib/components/cache/` — 3 files, 1,005 lines, score **50/100**
- `lib/components/cases/` — 11 files, 3,154 lines, score **60/100**
- `lib/components/charges/` — 1 files, 211 lines, score **50/100**
- `lib/components/chat/` — 4 files, 768 lines, score **50/100**
- `lib/components/citations/` — 5 files, 2,030 lines, score **50/100**
- `lib/components/codebase/` — 12 files, 5,497 lines, score **50/100**
- `lib/components/courtroom/` — 2 files, 1,505 lines, score **50/100**
- `lib/components/dashboard/` — 15 files, 3,181 lines, score **60/100**
- `lib/components/detective/` — 6 files, 1,884 lines, score **60/100**
- `lib/components/document/` — 1 files, 401 lines, score **50/100**
- `lib/components/editor/` — 7 files, 2,398 lines, score **60/100**
- `lib/components/evidence/` — 41 files, 14,655 lines, score **55/100**
- `lib/components/glyph/` — 1 files, 784 lines, score **50/100**
- `lib/components/legal/` — 33 files, 11,235 lines, score **40/100**
- `lib/components/legal-ai/` — 18 files, 7,563 lines, score **50/100**
- `lib/components/legal-corpus/` — 8 files, 2,918 lines, score **50/100**
- `lib/components/modals/` — 2 files, 1,074 lines, score **50/100**
- `lib/components/monitoring/` — 3 files, 843 lines, score **50/100**
- `lib/components/onboarding/` — 1 files, 1,050 lines, score **50/100**
- `lib/components/phase78/` — 3 files, 628 lines, score **50/100**
- `lib/components/rag/` — 4 files, 1,259 lines, score **45/100**
- `lib/components/recommendations/` — 2 files, 661 lines, score **50/100**
- `lib/components/ui/` — 89 files, 13,405 lines, score **55/100**
- `lib/components/ui/enhanced-bits/` — 2 files, 48 lines, score **65/100**
- `lib/components/video/` — 1 files, 891 lines, score **50/100**
- `lib/components/yorha/` — 21 files, 7,754 lines, score **40/100**
- `lib/components/yorha/dashboard/` — 5 files, 843 lines, score **65/100**
- `lib/features/poi/services/` — 1 files, 124 lines, score **60/100**
- `lib/gpu/` — 16 files, 4,323 lines, score **60/100**
- `lib/machines/` — 12 files, 4,613 lines, score **40/100**
- `lib/models/` — 1 files, 1,357 lines, score **55/100**
- `lib/server/ace/` — 17 files, 7,061 lines, score **60/100**
- `lib/server/adapters/` — 1 files, 638 lines, score **60/100**
- `lib/server/agent/tools/` — 8 files, 2,104 lines, score **55/100**
- `lib/server/ai/` — 23 files, 6,278 lines, score **65/100**
- `lib/server/analysis/` — 12 files, 2,988 lines, score **65/100**
- `lib/server/analytics/` — 15 files, 6,690 lines, score **40/100**
- `lib/server/cache/` — 8 files, 2,682 lines, score **40/100**
- `lib/server/cartridge/` — 5 files, 1,614 lines, score **60/100**
- `lib/server/chrrom/` — 3 files, 412 lines, score **60/100**
- `lib/server/clients/` — 1 files, 17 lines, score **60/100**
- `lib/server/config/` — 4 files, 695 lines, score **60/100**
- `lib/server/connections/` — 1 files, 346 lines, score **60/100**
- `lib/server/env/` — 1 files, 14 lines, score **60/100**
- `lib/server/error-brain/` — 5 files, 885 lines, score **60/100**
- `lib/server/error-brain/transport/` — 6 files, 271 lines, score **60/100**
- `lib/server/evidence/` — 9 files, 987 lines, score **55/100**
- `lib/server/gpu/` — 9 files, 3,515 lines, score **40/100**
- `lib/server/graph/` — 17 files, 6,953 lines, score **45/100**
- `lib/server/helpers/` — 2 files, 299 lines, score **60/100**
- `lib/server/indexer/` — 11 files, 5,209 lines, score **60/100**
- `lib/server/inference/` — 4 files, 2,054 lines, score **60/100**
- `lib/server/integrations/` — 1 files, 241 lines, score **40/100**
- `lib/server/langextract/` — 1 files, 132 lines, score **40/100**
- `lib/server/legal/` — 7 files, 2,618 lines, score **60/100**
- `lib/server/llm/` — 6 files, 1,643 lines, score **60/100**
- `lib/server/mcp/` — 3 files, 394 lines, score **60/100**
- `lib/server/minio/` — 2 files, 321 lines, score **60/100**
- `lib/server/ml/` — 8 files, 2,973 lines, score **40/100**
- `lib/server/notifications/` — 1 files, 210 lines, score **60/100**
- `lib/server/observability/` — 3 files, 970 lines, score **60/100**
- `lib/server/pgai/` — 3 files, 69 lines, score **60/100**
- `lib/server/queue/` — 8 files, 3,812 lines, score **60/100**
- `lib/server/research/` — 13 files, 1,380 lines, score **60/100**
- `lib/server/retrieval/` — 24 files, 6,342 lines, score **40/100**
- `lib/server/security/` — 1 files, 131 lines, score **60/100**
- `lib/server/services/` — 2 files, 703 lines, score **40/100**
- `lib/server/streaming/` — 2 files, 364 lines, score **60/100**
- `lib/server/tools/handlers/` — 8 files, 1,152 lines, score **60/100**
- `lib/server/vector/` — 10 files, 2,831 lines, score **55/100**
- `lib/server/workers/` — 5 files, 1,769 lines, score **40/100**
- `lib/services/` — 7 files, 872 lines, score **40/100**
- `lib/services/error-analysis/` — 17 files, 4,788 lines, score **40/100**
- `lib/services/knowledge-search/` — 11 files, 3,965 lines, score **40/100**
- `lib/shims/` — 11 files, 1,235 lines, score **60/100**
- `lib/stores/` — 14 files, 2,623 lines, score **60/100**
- `lib/stores/unified/` — 6 files, 1,211 lines, score **60/100**
- `lib/utils/` — 42 files, 7,081 lines, score **45/100**
- `lib/webgpu/` — 19 files, 5,518 lines, score **40/100**
- `mcp/` — 2 files, 4,233 lines, score **40/100**
- `mcp/tools/` — 1 files, 195 lines, score **60/100**
- `routes/(admin)/error-brain/components/` — 3 files, 628 lines, score **50/100**
- `routes/(app)/acp/` — 1 files, 613 lines, score **50/100**
- `routes/(app)/admin/all-routes/` — 4 files, 2,688 lines, score **60/100**
- `routes/(app)/admin/ast-topology/` — 3 files, 858 lines, score **60/100**
- `routes/(app)/admin/case-graph/` — 1 files, 662 lines, score **60/100**
- `routes/(app)/admin/codebase-graph/` — 1 files, 859 lines, score **50/100**
- `routes/(app)/admin/codebase-viewer/` — 3 files, 672 lines, score **60/100**
- `routes/(app)/admin/component-analysis/` — 2 files, 879 lines, score **55/100**
- `routes/(app)/admin/dev-tools/` — 3 files, 1,381 lines, score **40/100**
- `routes/(app)/admin/error-analysis/` — 2 files, 260 lines, score **60/100**
- `routes/(app)/admin/explorer/` — 1 files, 736 lines, score **50/100**
- `routes/(app)/admin/face-gallery/` — 1 files, 975 lines, score **60/100**
- `routes/(app)/admin/kag-notebook/` — 2 files, 335 lines, score **60/100**
- `routes/(app)/admin/library/` — 2 files, 891 lines, score **40/100**
- `routes/(app)/admin/phase89/` — 2 files, 1,727 lines, score **55/100**
- `routes/(app)/admin/qlora-training/` — 2 files, 375 lines, score **60/100**
- `routes/(app)/admin/topology/` — 1 files, 663 lines, score **50/100**
- `routes/(app)/analytics/` — 2 files, 2,385 lines, score **60/100**
- `routes/(app)/citations/` — 3 files, 1,676 lines, score **60/100**
- `routes/(app)/citations/[...label]/` — 2 files, 91 lines, score **60/100**
- `routes/(app)/codebase-graph/` — 3 files, 583 lines, score **50/100**
- `routes/(app)/command-center/codebase/` — 1 files, 662 lines, score **50/100**
- `routes/(app)/dashboard/` — 1 files, 1,995 lines, score **50/100**
- `routes/(app)/demos/agentic-errors/` — 3 files, 485 lines, score **50/100**
- `routes/(app)/demos/codebase-graph/` — 1 files, 227 lines, score **50/100**
- `routes/(app)/demos/crime-reconstruction/` — 2 files, 692 lines, score **40/100**
- `routes/(app)/demos/investigate/` — 1 files, 487 lines, score **45/100**
- `routes/(app)/demos/phantom-code-lab/` — 2 files, 168 lines, score **60/100**
- `routes/(app)/demos/webgpu-showcase/` — 2 files, 881 lines, score **55/100**
- `routes/(app)/global-search/` — 2 files, 2,394 lines, score **60/100**
- `routes/(app)/indexing/` — 1 files, 960 lines, score **50/100**
- `routes/(app)/legal-corpus/` — 3 files, 1,226 lines, score **60/100**
- `routes/(app)/legal-corpus/[id]/` — 3 files, 2,146 lines, score **60/100**
- `routes/(app)/library/corpus/` — 2 files, 809 lines, score **60/100**
- `routes/(app)/library/glossary/` — 2 files, 767 lines, score **60/100**
- `routes/(app)/persons-of-interest/` — 3 files, 1,947 lines, score **60/100**
- `routes/(app)/persons-of-interest/[id]/` — 3 files, 1,014 lines, score **60/100**
- `routes/(app)/reports/` — 1 files, 481 lines, score **50/100**
- `routes/(app)/reports/new/` — 1 files, 933 lines, score **50/100**
- `routes/(app)/system-configuration/` — 1 files, 838 lines, score **50/100**
- `routes/api/ace/health/` — 1 files, 156 lines, score **60/100**
- `routes/api/ai/chat-direct/` — 1 files, 104 lines, score **60/100**
- `routes/api/analytics/health/` — 1 files, 98 lines, score **60/100**
- `routes/api/audio/search/` — 1 files, 213 lines, score **60/100**
- `routes/api/cache/stats/` — 1 files, 246 lines, score **60/100**
- `routes/api/codebase-index/summarize-dirs/` — 1 files, 194 lines, score **60/100**
- `routes/api/graph/colab-export/` — 1 files, 659 lines, score **60/100**
- `routes/api/health/capabilities/` — 1 files, 228 lines, score **60/100**
- `routes/api/health/ollama/` — 1 files, 59 lines, score **60/100**
- `routes/api/infrastructure/status/` — 1 files, 335 lines, score **60/100**
- `routes/api/metrics/` — 1 files, 84 lines, score **60/100**
- `routes/api/system/health/` — 1 files, 166 lines, score **60/100**
- `routes/api/system/phase13/` — 1 files, 80 lines, score **60/100**
- `routes/api/system/services/` — 1 files, 144 lines, score **60/100**
- `stores/` — 1 files, 47 lines, score **60/100**


### 🟢 Good — production-ready (668)

- `./` — 17 files, 4,534 lines, score **80/100**
- `lib/ai/e2b/` — 2 files, 524 lines, score **75/100**
- `lib/ai/onnx/` — 2 files, 340 lines, score **75/100**
- `lib/cache/__tests__/` — 1 files, 389 lines, score **70/100**
- `lib/client/db/` — 1 files, 91 lines, score **80/100**
- `lib/components/agentic/__tests__/` — 1 files, 685 lines, score **70/100**
- `lib/components/ai/CaseScoringDashboard/` — 1 files, 51 lines, score **70/100**
- `lib/components/canvas/` — 5 files, 2,288 lines, score **75/100**
- `lib/components/canvas/hybrid/` — 1 files, 50 lines, score **80/100**
- `lib/components/case/` — 3 files, 670 lines, score **70/100**
- `lib/components/demos/` — 1 files, 359 lines, score **70/100**
- `lib/components/editors/` — 1 files, 55 lines, score **70/100**
- `lib/components/forms/` — 7 files, 4,163 lines, score **70/100**
- `lib/components/layout/` — 1 files, 399 lines, score **70/100**
- `lib/components/library/reader/` — 1 files, 70 lines, score **70/100**
- `lib/components/nes/` — 1 files, 185 lines, score **70/100**
- `lib/components/poi/` — 10 files, 2,460 lines, score **80/100**
- `lib/components/reports/` — 1 files, 244 lines, score **70/100**
- `lib/components/research/` — 1 files, 585 lines, score **70/100**
- `lib/components/shells/` — 4 files, 832 lines, score **70/100**
- `lib/components/source-validation/` — 4 files, 1,091 lines, score **70/100**
- `lib/components/subcomponents/` — 1 files, 67 lines, score **70/100**
- `lib/components/terminal/` — 1 files, 235 lines, score **70/100**
- `lib/components/ui/alert-dialog/` — 14 files, 641 lines, score **80/100**
- `lib/components/ui/avatar/` — 5 files, 236 lines, score **70/100**
- `lib/components/ui/badge/` — 3 files, 126 lines, score **70/100**
- `lib/components/ui/bits/` — 5 files, 434 lines, score **80/100**
- `lib/components/ui/button/` — 2 files, 44 lines, score **70/100**
- `lib/components/ui/card/` — 8 files, 255 lines, score **70/100**
- `lib/components/ui/core/` — 2 files, 69 lines, score **70/100**
- `lib/components/ui/dialog/` — 13 files, 752 lines, score **80/100**
- `lib/components/ui/dropdown/` — 1 files, 207 lines, score **70/100**
- `lib/components/ui/enhanced/` — 1 files, 37 lines, score **80/100**
- `lib/components/ui/gaming/` — 1 files, 60 lines, score **80/100**
- `lib/components/ui/input/` — 4 files, 265 lines, score **70/100**
- `lib/components/ui/label/` — 3 files, 69 lines, score **70/100**
- `lib/components/ui/modal/` — 2 files, 180 lines, score **70/100**
- `lib/components/ui/modular/` — 2 files, 407 lines, score **80/100**
- `lib/components/ui/progress/` — 5 files, 252 lines, score **70/100**
- `lib/components/ui/QuickActionButton/` — 1 files, 60 lines, score **70/100**
- `lib/components/ui/radio/` — 1 files, 199 lines, score **70/100**
- `lib/components/ui/scrollarea/` — 2 files, 61 lines, score **70/100**
- `lib/components/ui/search/` — 1 files, 27 lines, score **70/100**
- `lib/components/ui/select/` — 5 files, 166 lines, score **70/100**
- `lib/components/ui/StatsCard/` — 1 files, 48 lines, score **70/100**
- `lib/components/ui/table/` — 8 files, 220 lines, score **70/100**
- `lib/components/ui/tabs/` — 9 files, 612 lines, score **80/100**
- `lib/components/ui/textarea/` — 2 files, 37 lines, score **70/100**
- `lib/components/ui/user/` — 1 files, 27 lines, score **70/100**
- `lib/components/visualization/` — 1 files, 102 lines, score **70/100**
- `lib/components/yorha/_simulations/` — 6 files, 2,271 lines, score **70/100**
- `lib/components/yorha/cases/` — 3 files, 423 lines, score **70/100**
- `lib/components/yorha/evidence/` — 4 files, 670 lines, score **70/100**
- `lib/config/` — 7 files, 1,491 lines, score **80/100**
- `lib/courtroom/` — 4 files, 1,560 lines, score **80/100**
- `lib/data/` — 3 files, 1,369 lines, score **80/100**
- `lib/db/` — 4 files, 1,121 lines, score **100/100**
- `lib/db/queries/` — 2 files, 881 lines, score **80/100**
- `lib/db/schema/` — 6 files, 890 lines, score **80/100**
- `lib/env/` — 2 files, 27 lines, score **80/100**
- `lib/features/evidence-command-center/` — 5 files, 419 lines, score **70/100**
- `lib/icons/yorha/` — 15 files, 572 lines, score **80/100**
- `lib/schemas/` — 5 files, 558 lines, score **100/100**
- `lib/server/` — 57 files, 12,230 lines, score **80/100**
- `lib/server/__tests__/` — 1 files, 43 lines, score **70/100**
- `lib/server/acp/` — 1 files, 476 lines, score **80/100**
- `lib/server/acp/tools/` — 1 files, 331 lines, score **80/100**
- `lib/server/agent/` — 3 files, 2,074 lines, score **85/100**
- `lib/server/ai/__tests__/` — 2 files, 254 lines, score **70/100**
- `lib/server/api/` — 1 files, 195 lines, score **80/100**
- `lib/server/ast/` — 1 files, 313 lines, score **80/100**
- `lib/server/audit/` — 4 files, 1,415 lines, score **80/100**
- `lib/server/auth/` — 1 files, 41 lines, score **80/100**
- `lib/server/cases/` — 1 files, 189 lines, score **80/100**
- `lib/server/codeintel/` — 1 files, 498 lines, score **80/100**
- `lib/server/concurrency/` — 3 files, 741 lines, score **100/100**
- `lib/server/data/` — 2 files, 459 lines, score **80/100**
- `lib/server/db/` — 70 files, 12,653 lines, score **80/100**
- `lib/server/db/schema/` — 33 files, 1,764 lines, score **80/100**
- `lib/server/embedding/` — 8 files, 1,052 lines, score **80/100**
- `lib/server/embeddings/` — 1 files, 70 lines, score **80/100**
- `lib/server/engagement/` — 1 files, 367 lines, score **80/100**
- `lib/server/evidence/services/` — 5 files, 229 lines, score **80/100**
- `lib/server/glyph/` — 2 files, 170 lines, score **80/100**
- `lib/server/image/` — 1 files, 88 lines, score **80/100**
- `lib/server/init/` — 1 files, 105 lines, score **80/100**
- `lib/server/kb/` — 2 files, 143 lines, score **80/100**
- `lib/server/middleware/` — 4 files, 693 lines, score **100/100**
- `lib/server/nlp/` — 1 files, 140 lines, score **100/100**
- `lib/server/ocr/` — 3 files, 392 lines, score **80/100**
- `lib/server/optimize/` — 1 files, 42 lines, score **70/100**
- `lib/server/orchestrators/` — 1 files, 39 lines, score **80/100**
- `lib/server/pdf/` — 2 files, 314 lines, score **80/100**
- `lib/server/phase72/` — 3 files, 185 lines, score **80/100**
- `lib/server/phase78/` — 1 files, 402 lines, score **80/100**
- `lib/server/pipeline/` — 1 files, 211 lines, score **80/100**
- `lib/server/rag/` — 7 files, 527 lines, score **80/100**
- `lib/server/rate-limit/` — 2 files, 318 lines, score **80/100**
- `lib/server/reports/` — 1 files, 112 lines, score **80/100**
- `lib/server/search/` — 1 files, 241 lines, score **80/100**
- `lib/server/simulation/` — 2 files, 477 lines, score **100/100**
- `lib/server/startup/` — 1 files, 114 lines, score **80/100**
- `lib/server/storage/` — 1 files, 7 lines, score **80/100**
- `lib/server/tools/` — 1 files, 356 lines, score **100/100**
- `lib/server/training/` — 1 files, 111 lines, score **80/100**
- `lib/server/types/` — 10 files, 1,099 lines, score **80/100**
- `lib/server/unified/` — 1 files, 284 lines, score **80/100**
- `lib/server/utils/` — 13 files, 941 lines, score **80/100**
- `lib/server/validation/` — 2 files, 402 lines, score **100/100**
- `lib/shared/` — 3 files, 238 lines, score **80/100**
- `lib/shared/schemas/` — 1 files, 32 lines, score **80/100**
- `lib/shared/types/` — 1 files, 14 lines, score **80/100**
- `lib/stores/dashboard/` — 3 files, 654 lines, score **80/100**
- `lib/test-utils/` — 1 files, 11 lines, score **80/100**
- `lib/types/` — 51 files, 7,019 lines, score **80/100**
- `lib/workers/` — 4 files, 1,086 lines, score **75/100**
- `routes/` — 6 files, 2,700 lines, score **80/100**
- `routes/(analysis)/` — 2 files, 79 lines, score **80/100**
- `routes/(analysis)@/` — 2 files, 79 lines, score **80/100**
- `routes/(analysis)@/audio-analysis/[evidenceId]/` — 2 files, 838 lines, score **80/100**
- `routes/(analysis)@/document-analysis/[evidenceId]/` — 2 files, 801 lines, score **80/100**
- `routes/(analysis)@/video-analysis/[evidenceId]/` — 2 files, 999 lines, score **80/100**
- `routes/(analysis)/audio-analysis/[evidenceId]/` — 2 files, 929 lines, score **80/100**
- `routes/(analysis)/document-analysis/[evidenceId]/` — 2 files, 935 lines, score **80/100**
- `routes/(analysis)/video-analysis/[evidenceId]/` — 2 files, 1,047 lines, score **80/100**
- `routes/(app)/` — 2 files, 348 lines, score **80/100**
- `routes/(app)/active-cases/` — 2 files, 1,154 lines, score **80/100**
- `routes/(app)/admin/` — 1 files, 732 lines, score **70/100**
- `routes/(app)/admin/ai-dashboard/` — 3 files, 168 lines, score **80/100**
- `routes/(app)/admin/cache/` — 3 files, 1,082 lines, score **80/100**
- `routes/(app)/admin/chat-memory/` — 2 files, 832 lines, score **80/100**
- `routes/(app)/admin/codebase-index/` — 3 files, 405 lines, score **80/100**
- `routes/(app)/admin/error-brain/` — 4 files, 746 lines, score **80/100**
- `routes/(app)/admin/gpu-evidence-graph/` — 3 files, 640 lines, score **80/100**
- `routes/(app)/admin/knowledge-search/` — 2 files, 397 lines, score **80/100**
- `routes/(app)/admin/phase78/` — 1 files, 6 lines, score **80/100**
- `routes/(app)/admin/search-intelligence/` — 3 files, 4,187 lines, score **80/100**
- `routes/(app)/ai-dashboard/` — 1 files, 6 lines, score **80/100**
- `routes/(app)/all-routes/` — 1 files, 6 lines, score **80/100**
- `routes/(app)/analysis-center/` — 5 files, 1,576 lines, score **100/100**
- `routes/(app)/cache-monitor/` — 1 files, 146 lines, score **70/100**
- `routes/(app)/cases/` — 4 files, 1,989 lines, score **100/100**
- `routes/(app)/cases/[id]/` — 6 files, 1,564 lines, score **80/100**
- `routes/(app)/cases/new/` — 3 files, 954 lines, score **100/100**
- `routes/(app)/chat/` — 2 files, 298 lines, score **75/100**
- `routes/(app)/chat/[id]/` — 2 files, 567 lines, score **80/100**
- `routes/(app)/citations/law/` — 2 files, 421 lines, score **80/100**
- `routes/(app)/codebase-wiki/` — 1 files, 25 lines, score **70/100**
- `routes/(app)/command-center/` — 3 files, 1,316 lines, score **80/100**
- `routes/(app)/demos/` — 2 files, 1,163 lines, score **80/100**
- `routes/(app)/demos/ace-pipeline/` — 2 files, 129 lines, score **80/100**
- `routes/(app)/demos/agent-chat/` — 2 files, 13 lines, score **80/100**
- `routes/(app)/demos/ai-assistant/` — 2 files, 16 lines, score **80/100**
- `routes/(app)/demos/ai-chat-test/` — 2 files, 22 lines, score **80/100**
- `routes/(app)/demos/ai-file-upload/` — 2 files, 13 lines, score **80/100**
- `routes/(app)/demos/ask-ai/` — 2 files, 13 lines, score **80/100**
- `routes/(app)/demos/bento-dashboard/` — 1 files, 306 lines, score **70/100**
- `routes/(app)/demos/bits-ui/` — 2 files, 8 lines, score **80/100**
- `routes/(app)/demos/cache/` — 2 files, 8 lines, score **80/100**
- `routes/(app)/demos/case-form/` — 2 files, 34 lines, score **80/100**
- `routes/(app)/demos/case-prediction/` — 1 files, 184 lines, score **70/100**
- `routes/(app)/demos/case-scoring/` — 1 files, 12 lines, score **70/100**
- `routes/(app)/demos/celestial-icons/` — 2 files, 528 lines, score **80/100**
- `routes/(app)/demos/chat-messages/` — 2 files, 32 lines, score **80/100**
- `routes/(app)/demos/chunks-ui/` — 1 files, 225 lines, score **70/100**
- `routes/(app)/demos/citation-tools/` — 2 files, 39 lines, score **80/100**
- `routes/(app)/demos/client-ai-chat/` — 2 files, 13 lines, score **80/100**
- `routes/(app)/demos/client-inference/` — 2 files, 133 lines, score **80/100**
- `routes/(app)/demos/collab-canvas/` — 2 files, 13 lines, score **80/100**
- `routes/(app)/demos/context-menu/` — 2 files, 48 lines, score **80/100**
- `routes/(app)/demos/contextual-chat/` — 2 files, 13 lines, score **80/100**
- `routes/(app)/demos/courtroom-sim/` — 3 files, 1,020 lines, score **80/100**
- `routes/(app)/demos/detective-command/` — 2 files, 13 lines, score **80/100**
- `routes/(app)/demos/dialog-wrapper/` — 2 files, 35 lines, score **80/100**
- `routes/(app)/demos/document-summarizer/` — 1 files, 12 lines, score **70/100**
- `routes/(app)/demos/embedding-stream/` — 2 files, 20 lines, score **80/100**
- `routes/(app)/demos/enhanced-upload/` — 2 files, 13 lines, score **80/100**
- `routes/(app)/demos/evidence-canvas/` — 2 files, 798 lines, score **80/100**
- `routes/(app)/demos/evidence-dashboard/` — 2 files, 40 lines, score **80/100**
- `routes/(app)/demos/evidence-form/` — 2 files, 16 lines, score **80/100**
- `routes/(app)/demos/gpu-cache/` — 2 files, 10 lines, score **80/100**
- `routes/(app)/demos/hover-card/` — 2 files, 46 lines, score **80/100**
- `routes/(app)/demos/icons/` — 1 files, 6 lines, score **70/100**
- `routes/(app)/demos/keyboard-shortcuts/` — 2 files, 259 lines, score **80/100**
- `routes/(app)/demos/knowledge-graph/` — 1 files, 48 lines, score **70/100**
- `routes/(app)/demos/legal-layout/` — 2 files, 24 lines, score **80/100**
- `routes/(app)/demos/legal-spellbook/` — 2 files, 13 lines, score **80/100**
- `routes/(app)/demos/memory-palace/` — 2 files, 500 lines, score **80/100**
- `routes/(app)/demos/modals/` — 2 files, 63 lines, score **80/100**
- `routes/(app)/demos/modular-upload/` — 2 files, 42 lines, score **80/100**
- `routes/(app)/demos/nes-bits-ui/` — 1 files, 6 lines, score **80/100**
- `routes/(app)/demos/nes-elements/` — 1 files, 6 lines, score **70/100**
- `routes/(app)/demos/nes-graph/` — 2 files, 323 lines, score **70/100**
- `routes/(app)/demos/nes-routes/` — 2 files, 471 lines, score **70/100**
- `routes/(app)/demos/nes-toast/` — 2 files, 61 lines, score **80/100**
- `routes/(app)/demos/nier-showcase/` — 2 files, 462 lines, score **80/100**
- `routes/(app)/demos/notifications/` — 2 files, 60 lines, score **80/100**
- `routes/(app)/demos/page-layouts/` — 1 files, 765 lines, score **70/100**
- `routes/(app)/demos/particles/` — 1 files, 367 lines, score **70/100**
- `routes/(app)/demos/prosecutor-dashboard/` — 2 files, 13 lines, score **80/100**
- `routes/(app)/demos/rag-documents/` — 1 files, 12 lines, score **70/100**
- `routes/(app)/demos/retro-recommendations/` — 1 files, 26 lines, score **70/100**
- `routes/(app)/demos/rich-text-editor/` — 2 files, 34 lines, score **80/100**
- `routes/(app)/demos/search-tools/` — 2 files, 38 lines, score **80/100**
- `routes/(app)/demos/smart-positioning/` — 1 files, 352 lines, score **70/100**
- `routes/(app)/demos/source-drawer/` — 2 files, 36 lines, score **80/100**
- `routes/(app)/demos/spotlight/` — 1 files, 241 lines, score **70/100**
- `routes/(app)/demos/stats-panel/` — 2 files, 24 lines, score **80/100**
- `routes/(app)/demos/streaming/` — 2 files, 48 lines, score **80/100**
- `routes/(app)/demos/svelte5-components/` — 2 files, 200 lines, score **80/100**
- `routes/(app)/demos/svelte5-primitives/` — 2 files, 122 lines, score **80/100**
- `routes/(app)/demos/synthesis-chat/` — 2 files, 7 lines, score **80/100**
- `routes/(app)/demos/theory-board/` — 2 files, 13 lines, score **80/100**
- `routes/(app)/demos/toc-reader/` — 2 files, 29 lines, score **80/100**
- `routes/(app)/demos/ui-components/` — 2 files, 738 lines, score **80/100**
- `routes/(app)/demos/unified-dashboard/` — 1 files, 1,303 lines, score **70/100**
- `routes/(app)/demos/vector-search/` — 1 files, 14 lines, score **70/100**
- `routes/(app)/demos/webgpu-memory-palace/` — 2 files, 548 lines, score **80/100**
- `routes/(app)/demos/yorha/` — 2 files, 71 lines, score **80/100**
- `routes/(app)/demos/yorha-assistant/` — 2 files, 13 lines, score **80/100**
- `routes/(app)/demos/yorha-icons/` — 2 files, 468 lines, score **80/100**
- `routes/(app)/demos/yorha-terminal/` — 2 files, 28 lines, score **80/100**
- `routes/(app)/error-brain/` — 1 files, 6 lines, score **80/100**
- `routes/(app)/evidence/` — 6 files, 843 lines, score **100/100**
- `routes/(app)/evidence-library/` — 2 files, 281 lines, score **80/100**
- `routes/(app)/evidence/analyze/` — 2 files, 682 lines, score **80/100**
- `routes/(app)/evidence/hash/` — 2 files, 642 lines, score **80/100**
- `routes/(app)/evidence/manage/` — 2 files, 191 lines, score **80/100**
- `routes/(app)/evidence/realtime/` — 2 files, 642 lines, score **80/100**
- `routes/(app)/evidence/upload/` — 2 files, 821 lines, score **100/100**
- `routes/(app)/fictional-cases/` — 2 files, 600 lines, score **80/100**
- `routes/(app)/fictional-cases/[id]/` — 2 files, 411 lines, score **80/100**
- `routes/(app)/gpu-evidence-graph/` — 1 files, 6 lines, score **80/100**
- `routes/(app)/knowledge/` — 1 files, 517 lines, score **70/100**
- `routes/(app)/legal-corpus-premium/` — 1 files, 1,155 lines, score **70/100**
- `routes/(app)/library/` — 3 files, 619 lines, score **80/100**
- `routes/(app)/library/[documentId]/` — 2 files, 436 lines, score **80/100**
- `routes/(app)/persons-of-interest/create/` — 2 files, 132 lines, score **100/100**
- `routes/(app)/rag-search/` — 2 files, 370 lines, score **80/100**
- `routes/(app)/recommendations/` — 2 files, 734 lines, score **80/100**
- `routes/(app)/reports/[id]/` — 3 files, 325 lines, score **80/100**
- `routes/(app)/simulation/` — 2 files, 1,305 lines, score **80/100**
- `routes/(app)/terminal/` — 3 files, 1,045 lines, score **80/100**
- `routes/(app)/webgpu-similarity/` — 1 files, 12 lines, score **70/100**
- `routes/(dev)/cache-demo/` — 1 files, 261 lines, score **70/100**
- `routes/(dev)/demo/bits-ui/` — 2 files, 258 lines, score **80/100**
- `routes/(dev)/demo/streaming/` — 1 files, 280 lines, score **70/100**
- `routes/(dev)/odin/` — 2 files, 323 lines, score **80/100**
- `routes/(dev)/test-source-validation/` — 1 files, 381 lines, score **70/100**
- `routes/(dev)/tts-demo/` — 2 files, 84 lines, score **80/100**
- `routes/(dev)/voice-chat-demo/` — 2 files, 329 lines, score **80/100**
- `routes/api/ace/agent/` — 1 files, 33 lines, score **100/100**
- `routes/api/ace/context/` — 1 files, 164 lines, score **100/100**
- `routes/api/ace/error-kag/` — 1 files, 39 lines, score **100/100**
- `routes/api/ace/ingest/` — 1 files, 967 lines, score **100/100**
- `routes/api/ace/rank/` — 1 files, 132 lines, score **100/100**
- `routes/api/ace/status/` — 1 files, 81 lines, score **100/100**
- `routes/api/ace/summarize/` — 1 files, 134 lines, score **100/100**
- `routes/api/acp/execute/` — 1 files, 66 lines, score **100/100**
- `routes/api/acp/tools/` — 1 files, 48 lines, score **100/100**
- `routes/api/admin/audit/` — 1 files, 116 lines, score **100/100**
- `routes/api/admin/cache-stats/` — 1 files, 134 lines, score **80/100**
- `routes/api/admin/inference-stats/` — 1 files, 104 lines, score **100/100**
- `routes/api/admin/knowledge/` — 1 files, 127 lines, score **100/100**
- `routes/api/admin/qlora/` — 1 files, 165 lines, score **100/100**
- `routes/api/admin/routes/` — 1 files, 243 lines, score **80/100**
- `routes/api/admin/seed-knowledge/` — 1 files, 317 lines, score **100/100**
- `routes/api/agent/investigate/` — 1 files, 453 lines, score **85/100**
- `routes/api/agents/chat/` — 1 files, 295 lines, score **100/100**
- `routes/api/ai/agent/` — 1 files, 352 lines, score **100/100**
- `routes/api/ai/analyze-evidence/` — 1 files, 103 lines, score **100/100**
- `routes/api/ai/ask/` — 1 files, 60 lines, score **100/100**
- `routes/api/ai/case-prediction/` — 1 files, 71 lines, score **100/100**
- `routes/api/ai/case-scoring/` — 1 files, 63 lines, score **100/100**
- `routes/api/ai/chat/` — 1 files, 67 lines, score **100/100**
- `routes/api/ai/context/` — 1 files, 112 lines, score **100/100**
- `routes/api/ai/contextual-chat/` — 1 files, 68 lines, score **100/100**
- `routes/api/ai/cross-exam/` — 1 files, 113 lines, score **100/100**
- `routes/api/ai/feedback/` — 1 files, 62 lines, score **100/100**
- `routes/api/ai/generate-image/` — 1 files, 76 lines, score **100/100**
- `routes/api/ai/judge/` — 1 files, 203 lines, score **100/100**
- `routes/api/ai/legal-research/` — 1 files, 62 lines, score **100/100**
- `routes/api/ai/memo-skeleton/` — 1 files, 102 lines, score **100/100**
- `routes/api/ai/models/` — 1 files, 58 lines, score **100/100**
- `routes/api/ai/personas/` — 1 files, 23 lines, score **80/100**
- `routes/api/ai/route-intent/` — 1 files, 109 lines, score **100/100**
- `routes/api/ai/stats/` — 1 files, 98 lines, score **100/100**
- `routes/api/ai/suggestions/` — 1 files, 24 lines, score **80/100**
- `routes/api/ai/summarize/` — 1 files, 54 lines, score **100/100**
- `routes/api/ai/tensorrt/` — 1 files, 105 lines, score **100/100**
- `routes/api/ai/vector-search/` — 1 files, 35 lines, score **100/100**
- `routes/api/analysis/page-context/` — 1 files, 240 lines, score **100/100**
- `routes/api/analytics/codebase-research/` — 1 files, 84 lines, score **100/100**
- `routes/api/analytics/context-timeline/` — 1 files, 157 lines, score **100/100**
- `routes/api/analytics/deep-research/` — 1 files, 134 lines, score **100/100**
- `routes/api/analytics/events/` — 1 files, 122 lines, score **100/100**
- `routes/api/analytics/feedback/` — 1 files, 279 lines, score **100/100**
- `routes/api/analytics/focus/` — 1 files, 53 lines, score **100/100**
- `routes/api/analytics/generate-todos/` — 1 files, 381 lines, score **100/100**
- `routes/api/analytics/mapreduce-matrix/` — 1 files, 158 lines, score **100/100**
- `routes/api/analytics/mirror-health/` — 1 files, 90 lines, score **80/100**
- `routes/api/analytics/patterns/` — 1 files, 33 lines, score **100/100**
- `routes/api/analytics/prompt-leaderboard/` — 1 files, 88 lines, score **100/100**
- `routes/api/analytics/qlora-dataset/` — 1 files, 554 lines, score **80/100**
- `routes/api/analytics/research-graph/` — 1 files, 152 lines, score **100/100**
- `routes/api/analytics/research-index/` — 1 files, 68 lines, score **100/100**
- `routes/api/analytics/research-summaries/` — 1 files, 239 lines, score **100/100**
- `routes/api/analytics/research-topics/` — 1 files, 295 lines, score **100/100**
- `routes/api/analytics/rl-signal/` — 1 files, 87 lines, score **100/100**
- `routes/api/analytics/search/` — 1 files, 61 lines, score **100/100**
- `routes/api/analytics/search-patterns/` — 1 files, 269 lines, score **100/100**
- `routes/api/analytics/similar-queries/` — 1 files, 73 lines, score **80/100**
- `routes/api/analytics/summary/` — 1 files, 30 lines, score **100/100**
- `routes/api/analytics/token-usage/` — 1 files, 46 lines, score **100/100**
- `routes/api/analytics/unified-research/` — 1 files, 103 lines, score **100/100**
- `routes/api/analytics/web-research/` — 1 files, 332 lines, score **100/100**
- `routes/api/analyze-file/` — 1 files, 295 lines, score **95/100**
- `routes/api/analyze-tag/` — 1 files, 185 lines, score **100/100**
- `routes/api/audio/upload/` — 1 files, 122 lines, score **100/100**
- `routes/api/audit/gpu/` — 1 files, 110 lines, score **100/100**
- `routes/api/audit/planner/` — 1 files, 90 lines, score **100/100**
- `routes/api/auth/debug/` — 1 files, 23 lines, score **80/100**
- `routes/api/auth/demo-login/` — 1 files, 165 lines, score **100/100**
- `routes/api/auth/health/` — 1 files, 116 lines, score **80/100**
- `routes/api/auth/login/` — 1 files, 74 lines, score **100/100**
- `routes/api/auth/logout/` — 1 files, 65 lines, score **80/100**
- `routes/api/auth/me/` — 1 files, 19 lines, score **80/100**
- `routes/api/auth/profile/` — 1 files, 64 lines, score **100/100**
- `routes/api/auth/register/` — 1 files, 89 lines, score **100/100**
- `routes/api/auth/reset-password/` — 1 files, 69 lines, score **100/100**
- `routes/api/auth/session/` — 1 files, 74 lines, score **80/100**
- `routes/api/cache/` — 1 files, 198 lines, score **100/100**
- `routes/api/cache/invalidate/` — 1 files, 115 lines, score **100/100**
- `routes/api/cache/metrics/` — 1 files, 92 lines, score **80/100**
- `routes/api/cache/nintendo/` — 1 files, 50 lines, score **80/100**
- `routes/api/cache/recent-queries/` — 1 files, 72 lines, score **100/100**
- `routes/api/cache/set/` — 1 files, 36 lines, score **100/100**
- `routes/api/cache/som/` — 1 files, 148 lines, score **100/100**
- `routes/api/cache/warm-up/` — 1 files, 125 lines, score **100/100**
- `routes/api/canon/` — 1 files, 106 lines, score **100/100**
- `routes/api/canon/ingest/` — 1 files, 212 lines, score **100/100**
- `routes/api/canon/search/` — 1 files, 202 lines, score **100/100**
- `routes/api/cartridge/export/` — 1 files, 206 lines, score **100/100**
- `routes/api/cartridge/invalidate/` — 1 files, 42 lines, score **100/100**
- `routes/api/cartridge/search/` — 1 files, 116 lines, score **100/100**
- `routes/api/cartridge/stats/` — 1 files, 57 lines, score **80/100**
- `routes/api/cartridge/tile-atlas/` — 1 files, 199 lines, score **100/100**
- `routes/api/cartridge/timeline/` — 1 files, 49 lines, score **100/100**
- `routes/api/case-theory/` — 1 files, 170 lines, score **100/100**
- `routes/api/cases/` — 1 files, 250 lines, score **100/100**
- `routes/api/cases/__tests__/` — 1 files, 229 lines, score **90/100**
- `routes/api/cases/[id]/` — 1 files, 168 lines, score **100/100**
- `routes/api/cases/analytics/` — 1 files, 256 lines, score **100/100**
- `routes/api/cases/cluster/` — 1 files, 365 lines, score **100/100**
- `routes/api/charges/add/` — 1 files, 45 lines, score **100/100**
- `routes/api/chat/` — 1 files, 115 lines, score **100/100**
- `routes/api/chat/migrate/` — 1 files, 113 lines, score **100/100**
- `routes/api/chat/replay/` — 1 files, 55 lines, score **100/100**
- `routes/api/chat/stream/` — 1 files, 513 lines, score **100/100**
- `routes/api/chrrom/events/` — 1 files, 59 lines, score **100/100**
- `routes/api/chrrom/precompute/` — 1 files, 38 lines, score **100/100**
- `routes/api/chrrom/push/` — 1 files, 72 lines, score **100/100**
- `routes/api/citations/` — 1 files, 272 lines, score **100/100**
- `routes/api/citations/collections/` — 1 files, 96 lines, score **100/100**
- `routes/api/citations/saved/` — 1 files, 213 lines, score **100/100**
- `routes/api/citations/search/` — 1 files, 78 lines, score **100/100**
- `routes/api/codebase-index/` — 1 files, 209 lines, score **100/100**
- `routes/api/codebase-index/analyze/` — 1 files, 208 lines, score **100/100**
- `routes/api/codebase-index/batch-gpu/` — 1 files, 365 lines, score **100/100**
- `routes/api/codebase-index/claude-assist/` — 1 files, 423 lines, score **100/100**
- `routes/api/codebase-index/cluster-assign/` — 1 files, 160 lines, score **80/100**
- `routes/api/codebase-index/cluster-detect/` — 1 files, 124 lines, score **100/100**
- `routes/api/codebase-index/cluster-summary/` — 1 files, 125 lines, score **100/100**
- `routes/api/codebase-index/clusters/` — 1 files, 81 lines, score **100/100**
- `routes/api/codebase-index/couchdb-pagerank/` — 1 files, 203 lines, score **80/100**
- `routes/api/codebase-index/deep-research/` — 2 files, 389 lines, score **80/100**
- `routes/api/codebase-index/directory-summaries/` — 1 files, 64 lines, score **100/100**
- `routes/api/codebase-index/enrich-qdrant/` — 1 files, 518 lines, score **100/100**
- `routes/api/codebase-index/error-filters/` — 1 files, 64 lines, score **80/100**
- `routes/api/codebase-index/errors/` — 1 files, 117 lines, score **100/100**
- `routes/api/codebase-index/evidence-analyze/` — 1 files, 221 lines, score **100/100**
- `routes/api/codebase-index/file-intel/` — 1 files, 180 lines, score **100/100**
- `routes/api/codebase-index/gpu-pipeline/` — 1 files, 1,299 lines, score **100/100**
- `routes/api/codebase-index/graph/` — 1 files, 319 lines, score **80/100**
- `routes/api/codebase-index/graph-sync/` — 1 files, 165 lines, score **100/100**
- `routes/api/codebase-index/index-stream/` — 1 files, 419 lines, score **80/100**
- `routes/api/codebase-index/ingest-errors/` — 1 files, 425 lines, score **100/100**
- `routes/api/codebase-index/ingest-log/` — 1 files, 102 lines, score **80/100**
- `routes/api/codebase-index/kag-notebook/` — 1 files, 444 lines, score **100/100**
- `routes/api/codebase-index/karpathy-tag/` — 1 files, 401 lines, score **100/100**
- `routes/api/codebase-index/orchestrate/` — 1 files, 1,618 lines, score **100/100**
- `routes/api/codebase-index/recommendations/` — 1 files, 125 lines, score **100/100**
- `routes/api/codebase-index/reindex/` — 1 files, 95 lines, score **100/100**
- `routes/api/codebase-index/related/` — 1 files, 134 lines, score **100/100**
- `routes/api/codebase-index/route-components/` — 1 files, 328 lines, score **100/100**
- `routes/api/codebase-index/search/` — 1 files, 66 lines, score **100/100**
- `routes/api/codebase-index/stats/` — 1 files, 157 lines, score **80/100**
- `routes/api/codebase-index/tags/` — 1 files, 329 lines, score **100/100**
- `routes/api/codebase-index/topology-hits/` — 1 files, 83 lines, score **80/100**
- `routes/api/codebase-index/wiki/` — 1 files, 154 lines, score **100/100**
- `routes/api/codebase/analyze/` — 1 files, 348 lines, score **100/100**
- `routes/api/codebase/apply-patch/` — 1 files, 142 lines, score **95/100**
- `routes/api/codebase/auto-research/` — 1 files, 333 lines, score **100/100**
- `routes/api/codebase/buffer/` — 1 files, 34 lines, score **80/100**
- `routes/api/codebase/index/` — 1 files, 210 lines, score **100/100**
- `routes/api/codebase/narratives/` — 1 files, 116 lines, score **100/100**
- `routes/api/codebase/recall/` — 1 files, 142 lines, score **100/100**
- `routes/api/codebase/rerank/` — 1 files, 106 lines, score **100/100**
- `routes/api/codebase/wiki/` — 1 files, 117 lines, score **100/100**
- `routes/api/codeintel/ace/` — 1 files, 94 lines, score **100/100**
- `routes/api/codeintel/clusters/` — 1 files, 76 lines, score **80/100**
- `routes/api/codeintel/fix/` — 1 files, 48 lines, score **100/100**
- `routes/api/codeintel/health/` — 1 files, 76 lines, score **80/100**
- `routes/api/codeintel/semantic-health/` — 1 files, 350 lines, score **80/100**
- `routes/api/codeintel/wiki/` — 1 files, 94 lines, score **100/100**
- `routes/api/consolidation/status/` — 1 files, 42 lines, score **80/100**
- `routes/api/contextual/chat/` — 1 files, 438 lines, score **100/100**
- `routes/api/contextual/predictions/` — 1 files, 91 lines, score **100/100**
- `routes/api/contextual/state/` — 1 files, 79 lines, score **100/100**
- `routes/api/contextual/stats/` — 1 files, 100 lines, score **100/100**
- `routes/api/conversations/[id]/` — 1 files, 141 lines, score **100/100**
- `routes/api/courtroom/models/` — 1 files, 153 lines, score **100/100**
- `routes/api/dashboard/stats/` — 1 files, 111 lines, score **80/100**
- `routes/api/db/health/` — 1 files, 29 lines, score **80/100**
- `routes/api/detective/analyze/` — 1 files, 241 lines, score **100/100**
- `routes/api/detective/connections/` — 1 files, 193 lines, score **100/100**
- `routes/api/dev/login-demo/` — 1 files, 63 lines, score **80/100**
- `routes/api/docs/` — 1 files, 56 lines, score **100/100**
- `routes/api/document/[docId]/` — 1 files, 33 lines, score **80/100**
- `routes/api/documents/[id]/` — 1 files, 119 lines, score **100/100**
- `routes/api/documents/upload/` — 1 files, 178 lines, score **100/100**
- `routes/api/embed/` — 1 files, 125 lines, score **100/100**
- `routes/api/engagement/heartbeat/` — 1 files, 38 lines, score **80/100**
- `routes/api/engagement/scan/` — 1 files, 23 lines, score **80/100**
- `routes/api/error-brain/apply-fix/` — 1 files, 170 lines, score **100/100**
- `routes/api/error-brain/auto-patch/` — 1 files, 196 lines, score **100/100**
- `routes/api/error-brain/diagnose/` — 1 files, 949 lines, score **100/100**
- `routes/api/error-brain/diagnosis-history/` — 1 files, 233 lines, score **100/100**
- `routes/api/error-brain/generate-fix/` — 1 files, 161 lines, score **100/100**
- `routes/api/error-brain/search/` — 1 files, 136 lines, score **100/100**
- `routes/api/error-brain/suggestions/` — 1 files, 73 lines, score **100/100**
- `routes/api/error-brain/verify-fix/` — 1 files, 100 lines, score **100/100**
- `routes/api/errors/client-report/` — 1 files, 78 lines, score **100/100**
- `routes/api/errors/route-errors/` — 1 files, 126 lines, score **100/100**
- `routes/api/errors/summary/` — 1 files, 49 lines, score **80/100**
- `routes/api/evidence/` — 1 files, 110 lines, score **100/100**
- `routes/api/evidence/[id]/` — 1 files, 202 lines, score **100/100**
- `routes/api/evidence/analysis/` — 1 files, 88 lines, score **100/100**
- `routes/api/evidence/analyze/` — 1 files, 21 lines, score **80/100**
- `routes/api/evidence/connections/` — 1 files, 57 lines, score **100/100**
- `routes/api/evidence/entities/` — 1 files, 141 lines, score **100/100**
- `routes/api/evidence/extract-docling/` — 1 files, 67 lines, score **100/100**
- `routes/api/evidence/realtime/` — 1 files, 147 lines, score **100/100**
- `routes/api/evidence/relationships/` — 1 files, 104 lines, score **100/100**
- `routes/api/evidence/search/` — 1 files, 791 lines, score **100/100**
- `routes/api/evidence/upload/` — 1 files, 2,275 lines, score **100/100**
- `routes/api/evidence/upload-test/` — 1 files, 55 lines, score **100/100**
- `routes/api/feedback/` — 1 files, 41 lines, score **100/100**
- `routes/api/fictional-cases/` — 1 files, 130 lines, score **100/100**
- `routes/api/fictional-cases/[id]/` — 1 files, 165 lines, score **100/100**
- `routes/api/generate-cluster-summaries/` — 1 files, 379 lines, score **80/100**
- `routes/api/glossary/` — 1 files, 131 lines, score **100/100**
- `routes/api/glossary/search/` — 1 files, 252 lines, score **100/100**
- `routes/api/glossary/terms/` — 1 files, 143 lines, score **100/100**
- `routes/api/glyph/generate/` — 1 files, 107 lines, score **100/100**
- `routes/api/glyph/search/` — 1 files, 208 lines, score **100/100**
- `routes/api/glyph/tile-atlas/` — 1 files, 172 lines, score **100/100**
- `routes/api/gpu-wasm-integration/` — 1 files, 288 lines, score **100/100**
- `routes/api/gpu/compute/` — 1 files, 93 lines, score **100/100**
- `routes/api/gpu/lease/` — 1 files, 95 lines, score **100/100**
- `routes/api/gpu/queue/` — 1 files, 89 lines, score **100/100**
- `routes/api/graph/analyze/` — 1 files, 76 lines, score **100/100**
- `routes/api/graph/cases/` — 1 files, 143 lines, score **100/100**
- `routes/api/graph/connections/` — 1 files, 55 lines, score **100/100**
- `routes/api/graph/hypergraph/` — 1 files, 93 lines, score **80/100**
- `routes/api/graph/recommendations/` — 1 files, 147 lines, score **100/100**
- `routes/api/graph/relationships/` — 1 files, 63 lines, score **100/100**
- `routes/api/graph/som-topology/` — 1 files, 109 lines, score **100/100**
- `routes/api/graph/sync/` — 1 files, 37 lines, score **100/100**
- `routes/api/graph/timeline/` — 1 files, 205 lines, score **100/100**
- `routes/api/health/` — 1 files, 416 lines, score **80/100**
- `routes/api/health/circuit-breakers/` — 1 files, 22 lines, score **80/100**
- `routes/api/health/database/` — 1 files, 39 lines, score **80/100**
- `routes/api/health/gpu/` — 1 files, 92 lines, score **80/100**
- `routes/api/health/neo4j/` — 1 files, 45 lines, score **80/100**
- `routes/api/health/ocr/` — 1 files, 344 lines, score **80/100**
- `routes/api/health/qdrant/` — 1 files, 145 lines, score **100/100**
- `routes/api/health/ready/` — 1 files, 44 lines, score **80/100**
- `routes/api/health/redis/` — 1 files, 82 lines, score **80/100**
- `routes/api/health/redis-pool/` — 1 files, 84 lines, score **80/100**
- `routes/api/health/services/` — 1 files, 118 lines, score **80/100**
- `routes/api/health/status/` — 1 files, 41 lines, score **80/100**
- `routes/api/health/system/` — 1 files, 33 lines, score **80/100**
- `routes/api/hypergraph/lookup/` — 1 files, 149 lines, score **80/100**
- `routes/api/indexing/` — 1 files, 547 lines, score **100/100**
- `routes/api/ingest/` — 1 files, 98 lines, score **100/100**
- `routes/api/ingest-constitution/` — 1 files, 47 lines, score **80/100**
- `routes/api/ingest/legal/` — 1 files, 251 lines, score **100/100**
- `routes/api/investigate/suggest/` — 1 files, 179 lines, score **100/100**
- `routes/api/kb/search/` — 1 files, 78 lines, score **100/100**
- `routes/api/kb/validate/` — 1 files, 173 lines, score **100/100**
- `routes/api/knowledge/` — 1 files, 524 lines, score **100/100**
- `routes/api/knowledge/backfill/` — 1 files, 56 lines, score **100/100**
- `routes/api/knowledge/lint/` — 1 files, 293 lines, score **100/100**
- `routes/api/knowledge/search/` — 1 files, 263 lines, score **100/100**
- `routes/api/knowledge/stats/` — 1 files, 69 lines, score **80/100**
- `routes/api/knowledge/stream/` — 1 files, 231 lines, score **100/100**
- `routes/api/knowledge/youtube/` — 1 files, 185 lines, score **80/100**
- `routes/api/library/citations/` — 1 files, 30 lines, score **100/100**
- `routes/api/library/crawl/` — 1 files, 237 lines, score **100/100**
- `routes/api/library/documents/` — 1 files, 96 lines, score **100/100**
- `routes/api/library/health/` — 1 files, 179 lines, score **80/100**
- `routes/api/library/ingest-codebase-docs/` — 1 files, 294 lines, score **80/100**
- `routes/api/library/ingest-dev-docs/` — 1 files, 396 lines, score **100/100**
- `routes/api/library/resolve-citation/` — 1 files, 63 lines, score **100/100**
- `routes/api/library/search/` — 1 files, 280 lines, score **100/100**
- `routes/api/library/suggestions/` — 1 files, 82 lines, score **100/100**
- `routes/api/library/upload/` — 1 files, 88 lines, score **100/100**
- `routes/api/mcp/` — 1 files, 99 lines, score **80/100**
- `routes/api/ml/cluster-status/` — 1 files, 132 lines, score **100/100**
- `routes/api/nlp/classify/` — 1 files, 30 lines, score **100/100**
- `routes/api/nlp/sentiment/` — 1 files, 30 lines, score **100/100**
- `routes/api/observability/inference-stats/` — 1 files, 35 lines, score **80/100**
- `routes/api/obsidian/` — 1 files, 147 lines, score **100/100**
- `routes/api/ollama/generate/` — 1 files, 88 lines, score **100/100**
- `routes/api/ollama/pull/` — 1 files, 87 lines, score **100/100**
- `routes/api/onboarding/` — 1 files, 120 lines, score **100/100**
- `routes/api/orchestrator/analyze/` — 1 files, 79 lines, score **100/100**
- `routes/api/persons/` — 1 files, 150 lines, score **100/100**
- `routes/api/persons-of-interest/` — 1 files, 175 lines, score **100/100**
- `routes/api/persons-of-interest/__tests__/` — 1 files, 173 lines, score **90/100**
- `routes/api/persons-of-interest/[id]/` — 1 files, 211 lines, score **100/100**
- `routes/api/persons-of-interest/relationships/` — 1 files, 56 lines, score **100/100**
- `routes/api/persons-of-interest/search/` — 1 files, 102 lines, score **100/100**
- `routes/api/persons/face-synth/` — 1 files, 287 lines, score **100/100**
- `routes/api/pgai/analyze/` — 1 files, 33 lines, score **100/100**
- `routes/api/pgai/compare/` — 1 files, 33 lines, score **100/100**
- `routes/api/pgai/summarize/` — 1 files, 38 lines, score **100/100**
- `routes/api/phase109/kag/` — 1 files, 87 lines, score **100/100**
- `routes/api/phase109/tag-chunks/` — 1 files, 172 lines, score **80/100**
- `routes/api/phase72/errors/` — 1 files, 77 lines, score **100/100**
- `routes/api/phase72/similar/` — 1 files, 197 lines, score **100/100**
- `routes/api/phase72/suggest-fix/` — 1 files, 107 lines, score **100/100**
- `routes/api/phase78/monitor/` — 1 files, 48 lines, score **80/100**
- `routes/api/phase78/playwright-check/` — 1 files, 44 lines, score **100/100**
- `routes/api/phase78/route-health/` — 1 files, 62 lines, score **100/100**
- `routes/api/phase78/suggestion-state/` — 1 files, 44 lines, score **100/100**
- `routes/api/phase82/status/` — 1 files, 53 lines, score **100/100**
- `routes/api/phase82/upgrade-route/` — 1 files, 37 lines, score **100/100**
- `routes/api/phase89/activity/` — 1 files, 70 lines, score **80/100**
- `routes/api/phase89/agentic-fix/` — 1 files, 189 lines, score **100/100**
- `routes/api/phase89/analysis/` — 1 files, 337 lines, score **80/100**
- `routes/api/phase89/analyze/` — 1 files, 157 lines, score **100/100**
- `routes/api/phase89/clusters/` — 1 files, 111 lines, score **80/100**
- `routes/api/phase89/components/` — 1 files, 121 lines, score **80/100**
- `routes/api/phase89/config/` — 1 files, 79 lines, score **80/100**
- `routes/api/phase89/execute-command/` — 1 files, 56 lines, score **100/100**
- `routes/api/phase89/fix/` — 1 files, 83 lines, score **100/100**
- `routes/api/phase89/graph/` — 1 files, 55 lines, score **80/100**
- `routes/api/phase89/pipeline/` — 1 files, 79 lines, score **100/100**
- `routes/api/phase89/reindex/` — 1 files, 53 lines, score **80/100**
- `routes/api/phase89/search/` — 1 files, 66 lines, score **100/100**
- `routes/api/phase89/similar-clusters/` — 1 files, 65 lines, score **100/100**
- `routes/api/phase89/stats/` — 1 files, 43 lines, score **80/100**
- `routes/api/phase89/status/` — 1 files, 166 lines, score **80/100**
- `routes/api/phase89/stream/` — 1 files, 88 lines, score **80/100**
- `routes/api/phase89/topology/` — 1 files, 91 lines, score **80/100**
- `routes/api/phase89/vector-search/` — 1 files, 92 lines, score **100/100**
- `routes/api/ping/` — 1 files, 13 lines, score **80/100**
- `routes/api/pipeline/run/` — 1 files, 66 lines, score **100/100**
- `routes/api/playwright/run-health-check/` — 1 files, 44 lines, score **100/100**
- `routes/api/precedents/` — 1 files, 80 lines, score **100/100**
- `routes/api/precedents/search/` — 1 files, 262 lines, score **100/100**
- `routes/api/push/` — 1 files, 95 lines, score **100/100**
- `routes/api/push/send/` — 1 files, 90 lines, score **100/100**
- `routes/api/qlora/generate/` — 1 files, 167 lines, score **100/100**
- `routes/api/queue/dispatch-stats/` — 1 files, 26 lines, score **80/100**
- `routes/api/rabbitmq/publish/` — 1 files, 134 lines, score **80/100**
- `routes/api/rag/answer/` — 1 files, 231 lines, score **100/100**
- `routes/api/rag/documents/` — 1 files, 45 lines, score **100/100**
- `routes/api/rag/enhanced/` — 1 files, 97 lines, score **100/100**
- `routes/api/rag/process/` — 1 files, 132 lines, score **100/100**
- `routes/api/rag/search/` — 2 files, 1,189 lines, score **80/100**
- `routes/api/rag/suggestions/` — 1 files, 139 lines, score **100/100**
- `routes/api/rag/todo-suggestions/` — 1 files, 207 lines, score **100/100**
- `routes/api/rag/unified/` — 1 files, 63 lines, score **80/100**
- `routes/api/rag/validate/` — 1 files, 141 lines, score **100/100**
- `routes/api/recommendations/` — 1 files, 486 lines, score **100/100**
- `routes/api/recommendations/[userId]/` — 1 files, 362 lines, score **100/100**
- `routes/api/recommendations/metrics/` — 1 files, 42 lines, score **100/100**
- `routes/api/recommendations/track/` — 1 files, 190 lines, score **100/100**
- `routes/api/reports/` — 1 files, 321 lines, score **100/100**
- `routes/api/reports/batch-export/` — 1 files, 141 lines, score **100/100**
- `routes/api/reports/generate/` — 1 files, 387 lines, score **100/100**
- `routes/api/reports/generate-from-template/` — 1 files, 216 lines, score **100/100**
- `routes/api/reports/police/` — 1 files, 125 lines, score **100/100**
- `routes/api/reports/save/` — 1 files, 58 lines, score **100/100**
- `routes/api/research/concurrent-deep/` — 1 files, 213 lines, score **100/100**
- `routes/api/research/ingest/` — 1 files, 119 lines, score **100/100**
- `routes/api/research/search/` — 1 files, 66 lines, score **100/100**
- `routes/api/route-operations/log/` — 1 files, 49 lines, score **80/100**
- `routes/api/routes/events/` — 1 files, 173 lines, score **80/100**
- `routes/api/routes/metadata/` — 1 files, 73 lines, score **100/100**
- `routes/api/search/` — 1 files, 679 lines, score **100/100**
- `routes/api/search/cases/` — 1 files, 193 lines, score **100/100**
- `routes/api/search/citations/` — 1 files, 67 lines, score **100/100**
- `routes/api/search/filters/` — 1 files, 78 lines, score **100/100**
- `routes/api/search/laws/` — 1 files, 141 lines, score **100/100**
- `routes/api/search/suggestions/` — 1 files, 201 lines, score **100/100**
- `routes/api/simulation/` — 1 files, 322 lines, score **100/100**
- `routes/api/simulation/[sessionId]/` — 1 files, 507 lines, score **100/100**
- `routes/api/sse/[id]/` — 1 files, 179 lines, score **80/100**
- `routes/api/sse/chat/` — 1 files, 2,565 lines, score **100/100**
- `routes/api/statutes/` — 1 files, 135 lines, score **100/100**
- `routes/api/statutes/[id]/` — 1 files, 99 lines, score **100/100**
- `routes/api/statutes/search/` — 1 files, 183 lines, score **100/100**
- `routes/api/stream/` — 1 files, 49 lines, score **100/100**
- `routes/api/stream/[chatId]/` — 1 files, 53 lines, score **80/100**
- `routes/api/summarize/` — 1 files, 61 lines, score **100/100**
- `routes/api/summarize/analyze/` — 1 files, 69 lines, score **100/100**
- `routes/api/summarize/synthesize/` — 1 files, 87 lines, score **100/100**
- `routes/api/sync/documents/` — 1 files, 49 lines, score **100/100**
- `routes/api/synthesis/generate/` — 1 files, 1,150 lines, score **95/100**
- `routes/api/synthesis/prompt-feedback/` — 1 files, 88 lines, score **100/100**
- `routes/api/synthesis/qlora-export/` — 1 files, 117 lines, score **80/100**
- `routes/api/synthesis/save/` — 1 files, 76 lines, score **100/100**
- `routes/api/synthesis/typing-context/` — 1 files, 260 lines, score **100/100**
- `routes/api/system/env/` — 1 files, 31 lines, score **80/100**
- `routes/api/tags/` — 1 files, 73 lines, score **80/100**
- `routes/api/tags/[tagId]/` — 1 files, 27 lines, score **80/100**
- `routes/api/tags/search/` — 1 files, 51 lines, score **100/100**
- `routes/api/tasks/` — 1 files, 113 lines, score **100/100**
- `routes/api/tasks/[id]/` — 1 files, 91 lines, score **100/100**
- `routes/api/test/cache-demo/` — 1 files, 105 lines, score **100/100**
- `routes/api/test/cache-simple/` — 1 files, 148 lines, score **100/100**
- `routes/api/test/cache-single-conn/` — 1 files, 97 lines, score **100/100**
- `routes/api/test/ollama-cached/` — 1 files, 58 lines, score **100/100**
- `routes/api/test/redis-direct/` — 1 files, 59 lines, score **80/100**
- `routes/api/test/redis-write/` — 1 files, 43 lines, score **80/100**
- `routes/api/test/tiered-cache/` — 1 files, 133 lines, score **100/100**
- `routes/api/test/webgpu-modules/` — 1 files, 133 lines, score **80/100**
- `routes/api/tools/batch/` — 1 files, 71 lines, score **100/100**
- `routes/api/tools/execute/` — 1 files, 70 lines, score **100/100**
- `routes/api/tools/list/` — 1 files, 44 lines, score **100/100**
- `routes/api/tools/stream/` — 1 files, 111 lines, score **100/100**
- `routes/api/topology/` — 1 files, 122 lines, score **80/100**
- `routes/api/topology/stream/` — 1 files, 93 lines, score **80/100**
- `routes/api/user/preferences/` — 1 files, 91 lines, score **100/100**
- `routes/api/v1/agentic/` — 1 files, 122 lines, score **100/100**
- `routes/api/vector-search/` — 1 files, 110 lines, score **100/100**
- `routes/api/vision/analyze/` — 1 files, 233 lines, score **100/100**
- `routes/api/web/crawl/` — 1 files, 147 lines, score **100/100**
- `routes/api/web/search/` — 1 files, 34 lines, score **100/100**
- `routes/api/websearch/` — 1 files, 63 lines, score **80/100**
- `routes/api/whisper/transcribe/` — 1 files, 417 lines, score **100/100**
- `routes/api/workflow-events/[sessionId]/` — 1 files, 133 lines, score **80/100**
- `routes/api/yorha/analytics/` — 1 files, 189 lines, score **100/100**
- `routes/api/yorha/cases/` — 1 files, 98 lines, score **100/100**
- `routes/api/yorha/cluster-health/` — 1 files, 74 lines, score **80/100**
- `routes/api/yorha/search/` — 1 files, 149 lines, score **100/100**
- `routes/login/` — 3 files, 462 lines, score **100/100**
- `routes/minio/[...path]/` — 1 files, 57 lines, score **80/100**
- `routes/register/` — 1 files, 542 lines, score **70/100**
- `shims/` — 1 files, 1 lines, score **70/100**
- `tests/` — 1 files, 10 lines, score **70/100**
- `types/` — 23 files, 889 lines, score **80/100**
- `wasm/` — 2 files, 524 lines, score **80/100**
- `workers/` — 2 files, 54 lines, score **80/100**


---

## LLM Directory Summaries (KAG Wiki Notes)

_No wiki notes found. Run `deep-directory-audit.mjs` (any target) to populate._


---

## How to Update This Map

```bash
# Re-generate (structural metrics only):
node scripts/tests/generate-codebase-directory-map.mjs

# Populate Redis wiki notes first (uses TurboQuant/Ollama for AI summaries):
node scripts/tests/deep-directory-audit.mjs lib/server --direct --no-graph
node scripts/tests/deep-directory-audit.mjs routes/api --direct --no-graph
node scripts/tests/deep-directory-audit.mjs lib --direct --no-graph --depth 3

# Then re-generate with wiki notes:
node scripts/tests/generate-codebase-directory-map.mjs
```

## Integration with ACE Context

Directory summaries cached in Redis under `wiki:note:dir:*` are automatically
injected into ACE context as KAG notes when queries match the directory path.

Key in Redis: `wiki:note:dir:dir_{sanitized_path}` (24h TTL)
Populated by: `/api/codebase-index/summarize-dirs` (POST) or `deep-directory-audit.mjs`
Consumed by: `getDirectoryKAGContext()` in `community-graph.ts`
Injected by: `assembleACEContext()` → `webSearchContext` → `## KAG Directory Audit Notes`
