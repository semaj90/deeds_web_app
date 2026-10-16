# Ornith runtime controls through TRACE MCP

TRACE registers `llama_server.status`, `llama_server.start`, and `llama_server.unload` only when its configured host is loopback (`127.0.0.1`, `::1`, or `localhost`). These tools are not duplicated in Atlas. A running TRACE process/client must refresh before newly registered tools appear; source registration alone does not establish deployed discovery.

## Calls

Live deployment verification on 2026-10-15: after an operator-authorized TRACE-only restart, the HTTP MCP endpoint listed all three controls (196 total tools) and successfully served `llama_server.status` against real Windows/NVIDIA state. See `docs/reports/llama-runtime-trace-live-discovery-20261016T033339Z.json`. Existing clients may still require a connection/tool-list refresh. No live start/unload cycle was performed.

- `llama_server.status {}`: reads :8090 listener/process ownership, health, slots, model ID, and NVIDIA GPU UUID/total/used/free MiB.
- `llama_server.start {"confirm":true,"profile":"ornith-1.5"}`: starts the text/tool profile; explicitly choose `ornith-1.5-vlm` for vision. Use a client tool timeout of at least 240 seconds for cold starts.
- `llama_server.unload {"confirm":true}`: stops only the ownership-checked llama-server on :8090 after confirming every reported slot is idle. Obtain explicit operator approval before either mutation; `confirm` is an acknowledgement, not an authentication credential.

The shared controller is `scripts/atlas/llama-server-control.ps1`. The existing VS Code task **⚡ TurboQuant: Stop (unload Ornith on :8090)** invokes that same controller. Start delegates to `scripts/launch-turboquant.ps1 -Detached -NoEvict`; it does not create a second model launcher or unload Ollama. The existing VS Code start task remains available.

## Safety and evidence

- Fixed port and profile allowlist; callers cannot submit commands, executable paths, PIDs, URLs, or arbitrary model names.
- Mutations take a non-waiting Windows mutex. Busy/unknown slots, ambiguous processes, unexpected listener owners, changed PIDs, and unhealthy existing runtimes fail closed.
- Windows `Stop-Process -Id` is process termination, not an application-level graceful drain. The idle check reduces disruption but cannot prevent a new request arriving between the final check and termination. Quiesce callers before unloading.
- Stop waits for both process and listener disappearance; start independently reads ownership, health, and the `ornith-1.5-9b` model ID.
- Receipts include before/after GPU readings and per-UUID unload deltas. `memoryReleaseObserved` is null when no process was stopped or measurements are unavailable. A measured decrease is shared-device telemetry, not proof that every byte was released by Ornith. Other GPU consumers remain untouched.
- Errors remain errors. A subprocess timeout leaves mutation outcome unknown; inspect status before retrying. Failed startup does not kill a partially started server automatically.
- No database/cache writes, model downloads, automatic TRACE restart, or persistence of tensors/KV state.

## Narrow validation

From the repository root:

```powershell
pwsh -NoProfile -File scripts/atlas/test-llama-server-control.ps1
pwsh -NoProfile -File scripts/atlas/llama-server-control.ps1 -Action status
```

From `sveltekit-frontend`:

```powershell
npx vitest run src/mcp/llama-runtime-tools.spec.ts --environment node --maxWorkers=1 --minWorkers=1
node --import tsx scripts/mcp/smoke-llama-runtime-tools.mjs
```

The smoke command performs an actual MCP list/call exchange in memory and reads the real local runtime/VRAM. It does not start or stop anything, connect to the deployed TRACE listener, or prove a live start/unload cycle. Keep those proofs separate.
