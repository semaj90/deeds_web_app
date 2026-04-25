Set-Location "c:\Users\james\Videos\deeds-web-app\sveltekit-frontend"

$total = 0
$dirs = @(
  # Component dirs
  "src/lib/components/three", "src/lib/components/canvas", "src/lib/components/evidence-board",
  "src/lib/components/legal", "src/lib/components/ai", "src/lib/components/charts",
  "src/lib/components/graph", "src/lib/components/timeline", "src/lib/components/search",
  "src/lib/components/visual-memory", "src/lib/components/templates", "src/lib/components/error-analysis",
  "src/lib/components/cache", "src/lib/components/lazy", "src/lib/components/error-brain",
  "src/lib/components/integration", "src/lib/components/visualizations", "src/lib/components/headless",
  "src/lib/components/editor", "src/lib/components/evidence-editor", "src/lib/components/evidence-graph",
  "src/lib/components/feedback", "src/lib/components/glyph", "src/lib/components/keyboard",
  "src/lib/components/navigation", "src/lib/components/notifications", "src/lib/components/observability",
  "src/lib/components/onboarding", "src/lib/components/prosecutor", "src/lib/components/rag",
  "src/lib/components/subcomponents", "src/lib/components/dashboard", "src/lib/components/detective",
  "src/lib/components/unified", "src/lib/components/visualization", "src/lib/components/modals",
  "src/lib/components/layout", "src/lib/components/laws", "src/lib/components/citations",
  "src/lib/components/vector", "src/lib/components/upload", "src/lib/components/chr-rom",
  "src/lib/components/evidence", "src/lib/components/forms", "src/lib/components/poi",
  "src/lib/components/notes", "src/lib/components/bits-ui", "src/lib/components/source-validation",
  # UI subdirs
  "src/lib/components/ui/gaming", "src/lib/components/ui/templates", "src/lib/components/ui/bits",
  "src/lib/components/ui/tooltip", "src/lib/components/ui/context-menu", "src/lib/components/ui/drawer",
  "src/lib/components/ui/EvidenceCard", "src/lib/components/ui/accordion", "src/lib/components/ui/card",
  "src/lib/components/ui/input", "src/lib/components/ui/modal", "src/lib/components/ui/toast",
  # Lib dirs
  "src/lib/agents", "src/lib/cache", "src/lib/caching", "src/lib/gpu", "src/lib/graph",
  "src/lib/integrations", "src/lib/machines", "src/lib/optimization", "src/lib/orchestration",
  "src/lib/state", "src/lib/wasm", "src/lib/webgpu", "src/lib/workers", "src/lib/error-brain",
  "src/lib/rag", "src/lib/search", "src/lib/memory", "src/lib/memory-palace", "src/lib/features",
  "src/lib/evidence", "src/lib/composables", "src/lib/websocket", "src/lib/yorha", "src/lib/modules",
  "src/lib/middleware", "src/lib/llm", "src/lib/mcp", "src/lib/registry", "src/lib/text",
  "src/lib/tracking", "src/lib/telemetry", "src/lib/database", "src/lib/binary", "src/lib/ast",
  "src/lib/embedding", "src/lib/hooks", "src/lib/logic", "src/lib/messaging", "src/lib/headless",
  "src/lib/observability", "src/lib/ocr", "src/lib/performance", "src/lib/vision",
  "src/lib/detective-mode", "src/lib/enhanced-bits", "src/lib/evidence-canvas", "src/lib/polyfills",
  "src/lib/routing", "src/lib/client", "src/lib/actors", "src/lib/adapters", "src/lib/simd",
  "src/lib/phase72", "src/lib/phase78", "src/lib/phase14", "src/lib/storage", "src/lib/ui",
  "src/lib/systems", "src/lib/themes", "src/lib/webasm", "src/lib/testing", "src/lib/shared",
  "src/lib/parsers", "src/lib/sdk", "src/lib/json", "src/lib/demos", "src/lib/rabbitmq",
  "src/lib/db", "src/lib/api", "src/lib/state-machines", "src/lib/shims",
  # Server dirs
  "src/lib/server/db", "src/lib/server/ai", "src/lib/server/services", "src/lib/server/cache",
  "src/lib/server/integrations", "src/lib/server/helpers", "src/lib/server/grpc",
  "src/lib/server/monitoring", "src/lib/server/tools", "src/lib/server/orchestrator",
  "src/lib/server/search", "src/lib/server/messaging", "src/lib/server/connections",
  "src/lib/server/embedding", "src/lib/server/api", "src/lib/server/auth",
  "src/lib/server/cases", "src/lib/server/queue", "src/lib/server/ingest",
  "src/lib/server/clients", "src/lib/server/context", "src/lib/server/contradictionEngine",
  "src/lib/server/error-brain", "src/lib/server/pdf", "src/lib/server/rabbitmq",
  "src/lib/server/ssr", "src/lib/server/workers", "src/lib/server/chat",
  "src/lib/server/concurrency", "src/lib/server/acp", "src/lib/server/adapters",
  "src/lib/server/agents", "src/lib/server/evidence", "src/lib/server/graph",
  "src/lib/server/init", "src/lib/server/prompt", "src/lib/server/rag",
  "src/lib/server/database", "src/lib/server/storage", "src/lib/server/utils",
  "src/lib/server/vector", "src/lib/server/langextract", "src/lib/server/ocr",
  "src/lib/server/phase72", "src/lib/server/pgai", "src/lib/server/minio",
  "src/lib/server/workflows",
  # Services
  "src/lib/services"
)

foreach ($d in $dirs) {
  if (Test-Path $d) {
    $c = (Get-ChildItem -Recurse -Path $d -Include "*.ts","*.svelte" | Measure-Object).Count
    $total += $c
    if ($c -gt 0) { Write-Host "$c`t$d" }
  }
}
Write-Host ""
Write-Host "TOTAL files in excluded directories: $total"
Write-Host ""

# Count individual excluded files
$individualFiles = @(
  "src/lib/services/pipeline-visualizer.ts",
  "src/lib/services/advanced-evidence-analyzer.ts",
  "src/lib/server/services/background-job-queue.ts",
  "src/lib/services/unified-gpu-cache-orchestrator.ts",
  "src/lib/services/context7-orchestration-integration.ts",
  "src/lib/services/gpu-cache-rpc-client.ts",
  "src/lib/services/gpu-llm-streaming-pipeline.ts",
  "src/lib/services/rabbitmq-service.ts",
  "src/lib/server/db/pgvector-utils.ts",
  "src/lib/server/ai/vector-search-service.ts",
  "src/lib/services/ocrService.ts",
  "src/lib/services/enhanced-ai-analysis.ts",
  "src/lib/services/kmeans-clustering.ts",
  "src/lib/services/complete-gpu-error-pipeline.ts",
  "src/lib/server/storage/minio.ts",
  "src/lib/services/legal-ai-acceleration-pipeline.ts",
  "src/lib/services/clientSideGemma270m.ts",
  "src/lib/services/gpu-ai-service.ts",
  "src/lib/services/gpu-typescript-error-processor.ts",
  "src/lib/graph/sora-graph-traversal.ts",
  "src/lib/api/vector-search-client.ts"
)
$indCount = 0
foreach ($f in $individualFiles) {
  if (Test-Path $f) { $indCount++ }
}
Write-Host "Individual excluded files that exist: $indCount / $($individualFiles.Count)"