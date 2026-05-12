<script lang="ts">
  import type { PageData } from './$types';
  import { onMount } from 'svelte';
  import { fade, slide, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Tooltip, Tabs } from 'bits-ui';
  import TraceCopilotPanel from '$lib/components/admin/TraceCopilotPanel.svelte';

  let { data }: { data: PageData } = $props();
  let mounted = $state(false);

  onMount(() => {
    mounted = true;
  });

  const stats = $derived(data.stats);

  const transportLanes = $derived([
    { name: 'QUIC / HTTP3', status: 'Active', port: 5178, icon: 'i-carbon-flow-stream' },
    { name: 'TRACE MCP', status: stats.services.traceMcp.status, port: 8788, icon: 'i-carbon-chip' },
    { name: 'Reranker', status: stats.services.rerank.status, port: 8090, icon: 'i-carbon-scan-alt' },
    { name: 'TurboQuant', status: stats.services.turboquant.status, port: 8080, icon: 'i-carbon-machine-learning-model' },
    { name: 'RabbitMQ', status: 'Healthy', port: 5672, icon: 'i-carbon-queue' }
  ]);

  function statusTone(ok: boolean) {
    return ok ? 'text-emerald-400' : 'text-amber-300';
  }
</script>

<div class="studio-container p-6 lg:p-10">
  <header class="mb-12" in:fly={{ y: -20, duration: 800, easing: cubicOut }}>
    <div class="flex items-center gap-4 mb-2">
      <div class="w-12 h-1 text-accent bg-accent rounded-full animate-pulse"></div>
      <span class="text-xs font-mono tracking-widest uppercase opacity-60">System Core / Observability</span>
    </div>
    <h1 class="text-4xl font-bold tracking-tight text-white mb-4">
      Unified <span class="text-accent italic">Indexing</span> Studio
    </h1>
    <p class="text-lg text-white/50 max-w-2xl leading-relaxed">
      Command Center for the N8-N10 Knowledge-Augmented Generation pipeline. 
      Monitoring cross-cluster activation, hypergraph parity, and transport lane integrity.
    </p>
  </header>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
    <!-- Postgres Metric -->
    <div class="stat-card" in:fly={{ y: 20, delay: 100, duration: 600 }}>
      <div class="stat-icon i-carbon-data-base text-blue-400"></div>
      <div class="stat-label">Relational Summary</div>
      <div class="stat-value">{stats.postgres.summary_count.toLocaleString()}</div>
      <div class="stat-sub">Embedded Knowledge Cards</div>
      <div class="stat-glow bg-blue-500/10"></div>
    </div>

    <!-- Neo4j Metric -->
    <div class="stat-card" in:fly={{ y: 20, delay: 200, duration: 600 }}>
      <div class="stat-icon i-carbon-network-4 text-magenta-400"></div>
      <div class="stat-label">Graph Topology</div>
      <div class="stat-value">{stats.neo4j.nodes.toLocaleString()}</div>
      <div class="stat-sub">Nodes / {stats.neo4j.edges.toLocaleString()} Edges</div>
      <div class="stat-glow bg-magenta-500/10"></div>
    </div>

    <!-- Qdrant Metric -->
    <div class="stat-card" in:fly={{ y: 20, delay: 300, duration: 600 }}>
      <div class="stat-icon i-carbon-vector-data text-emerald-400"></div>
      <div class="stat-label">Vector Manifold</div>
      <div class="stat-value">{stats.qdrant.collectionCount}</div>
      <div class="stat-sub">Active Collections</div>
      <div class="stat-glow bg-emerald-500/10"></div>
    </div>

    <!-- Redis Metric -->
    <div class="stat-card" in:fly={{ y: 20, delay: 400, duration: 600 }}>
      <div class="stat-icon i-carbon-flash text-amber-400"></div>
      <div class="stat-label">Hot ACE Cache</div>
      <div class="stat-value">{stats.redis.keys.toLocaleString()}</div>
      <div class="stat-sub">{stats.redis.memory} used</div>
      <div class="stat-glow bg-amber-500/10"></div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-4 gap-0 -m-6 lg:-m-10 min-h-[calc(100vh-80px)]">
    <!-- Main Content (Stats & Infrastructure) -->
    <div class="lg:col-span-3 p-6 lg:p-10 space-y-12">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <!-- Postgres Metric -->
        <div class="stat-card" in:fly={{ y: 20, delay: 100, duration: 600 }}>
          <div class="stat-icon i-carbon-data-base text-blue-400"></div>
          <div class="stat-label">Relational Summary</div>
          <div class="stat-value">{stats.postgres.summary_count.toLocaleString()}</div>
          <div class="stat-sub">Embedded Knowledge Cards</div>
          <div class="stat-glow bg-blue-500/10"></div>
        </div>

        <!-- Neo4j Metric -->
        <div class="stat-card" in:fly={{ y: 20, delay: 200, duration: 600 }}>
          <div class="stat-icon i-carbon-network-4 text-magenta-400"></div>
          <div class="stat-label">Graph Topology</div>
          <div class="stat-value">{stats.neo4j.nodes.toLocaleString()}</div>
          <div class="stat-sub">Nodes / {stats.neo4j.edges.toLocaleString()} Edges</div>
          <div class="stat-glow bg-magenta-500/10"></div>
        </div>

        <!-- Qdrant Metric -->
        <div class="stat-card" in:fly={{ y: 20, delay: 300, duration: 600 }}>
          <div class="stat-icon i-carbon-vector-data text-emerald-400"></div>
          <div class="stat-label">Vector Manifold</div>
          <div class="stat-value">{stats.qdrant.collectionCount}</div>
          <div class="stat-sub">Active Collections</div>
          <div class="stat-glow bg-emerald-500/10"></div>
        </div>

        <!-- Redis Metric -->
        <div class="stat-card" in:fly={{ y: 20, delay: 400, duration: 600 }}>
          <div class="stat-icon i-carbon-flash text-amber-400"></div>
          <div class="stat-label">Hot ACE Cache</div>
          <div class="stat-value">{stats.redis.keys.toLocaleString()}</div>
          <div class="stat-sub">{stats.redis.memory} used</div>
          <div class="stat-glow bg-amber-500/10"></div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <!-- Transport Lanes -->
        <section class="space-y-6" data-trace-id="transport-network" data-trace-type="service-monitor">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-bold text-white flex items-center gap-2">
              <span class="i-carbon-flow-connection opacity-50"></span>
              Transport Network
            </h2>
          </div>

          <div class="space-y-3">
            {#each transportLanes as lane, i}
              <div class="lane-row group" in:fly={{ x: -20, delay: 500 + (i * 100), duration: 600 }}>
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-xl transition-colors group-hover:bg-accent/20 group-hover:text-accent">
                    <span class={lane.icon}></span>
                  </div>
                  <div>
                    <div class="text-sm font-bold text-white/90">{lane.name}</div>
                    <div class="text-[10px] font-mono opacity-40 uppercase">Port {lane.port}</div>
                  </div>
                </div>
                <div class="flex items-center gap-4">
                  <div class="flex flex-col items-end">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-emerald-400">{lane.status}</span>
                    <span class="text-[9px] font-mono opacity-30">Latency: 2ms</span>
                  </div>
                  <div class="w-1.5 h-6 rounded-full bg-emerald-500/40"></div>
                </div>
              </div>
            {/each}
          </div>
        </section>

        <!-- Runtime Status -->
        <section class="space-y-6">
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="i-carbon-iot-connect opacity-50"></span>
            Runtime Status
          </h2>

          <div class="glass-panel p-6 space-y-6 h-full">
            <div class="space-y-4">
              <div class="flex justify-between items-center text-xs">
                <span class="opacity-50">GPU Acceleration (CUDA)</span>
                <span class={stats.environment.gpuEnabled ? 'text-emerald-400' : 'text-red-400'}>
                  {stats.environment.gpuEnabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>
              <div class="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div class="h-full bg-accent animate-pulse" style="width: 78%"></div>
              </div>
            </div>

            <div class="space-y-4">
              <div class="text-[10px] font-mono opacity-40 uppercase">Environment Details</div>
              <div class="grid grid-cols-2 gap-4">
                <div class="text-xs text-white/80 flex items-center gap-2 bg-white/5 p-3 rounded-lg border border-white/5">
                  <span class="i-carbon-cics-region text-accent"></span>
                  {stats.environment.nodeEnv} Mode
                </div>
                <div class="text-xs text-white/80 flex items-center gap-2 bg-white/5 p-3 rounded-lg border border-white/5">
                  <span class="i-carbon-security text-accent"></span>
                  {data.stats.environment.quicEnabled ? 'QUIC SEC' : 'AUTH BYPASS'}
                </div>
              </div>
            </div>

            <div class="space-y-4 pt-4 border-t border-white/5">
              <div class="text-[10px] font-mono opacity-40 uppercase">Topology Coverage</div>
              <div class="grid grid-cols-2 gap-4">
                <div class="bg-white/5 p-3 rounded-lg border border-white/5">
                  <div class="text-[10px] uppercase opacity-40 mb-1">BMU Coverage</div>
                  <div class="text-lg font-bold text-white">{stats.topology.bmuCoveragePct}%</div>
                  <div class="text-[10px] opacity-40">{stats.topology.bmuCoveredCount} / {stats.topology.summaryCount}</div>
                </div>
                <div class="bg-white/5 p-3 rounded-lg border border-white/5">
                  <div class="text-[10px] uppercase opacity-40 mb-1">Manifold4</div>
                  <div class="text-lg font-bold text-white">{stats.topology.manifold4CoveragePct}%</div>
                  <div class="text-[10px] opacity-40">{stats.topology.manifold4CoveredCount} / {stats.topology.summaryCount}</div>
                </div>
              </div>
              <div class={stats.topology.hydrationMissing ? 'text-amber-300 text-xs' : 'text-emerald-400 text-xs'}>
                {stats.topology.note}
              </div>
              <div class="text-[10px] opacity-35 uppercase">
                source: {stats.topology.source}
              </div>
            </div>

            <div class="space-y-3 pt-4 border-t border-white/5">
              <div class="text-[10px] font-mono opacity-40 uppercase">Inference + Retrieval Services</div>
              <div class="space-y-2 text-xs">
                <div class="flex items-center justify-between">
                  <span>Generation Provider</span>
                  <span class={statusTone(stats.services.turboquant.ok)}>{stats.services.turboquant.ok ? 'llama-server :8090' : 'degraded'}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span>Rerank Service</span>
                  <span class={statusTone(stats.services.rerank.ok)}>{stats.services.rerank.ok ? 'online :8092' : 'offline / fallback'}</span>
                </div>
                <div class="flex items-center justify-between" data-trace-id="svc-bifrost">
                  <span>Bifrost Dispatcher</span>
                  <span class={statusTone(stats.services.bifrost.ok)}>{stats.services.bifrost.status}</span>
                </div>
                <div class="flex items-center justify-between" data-trace-id="svc-topology-search">
                  <span>Topology Search</span>
                  <span class={statusTone(stats.services.topologySearch.ok)}>{stats.services.topologySearch.status}</span>
                </div>
              </div>
            </div>

            <div class="space-y-4 pt-4 border-t border-white/5">
              <div class="text-[10px] font-mono opacity-40 uppercase">Hydration Plan</div>
              {#if stats.recomputePlan}
                <div class="space-y-3 text-xs text-white/75">
                  <div class="grid grid-cols-2 gap-4">
                    <div class="bg-white/5 p-3 rounded-lg border border-white/5">
                      <div class="text-[10px] uppercase opacity-40 mb-1">Missing BMU</div>
                      <div class="text-lg font-bold text-white">{stats.recomputePlan.current.missingBmu}</div>
                    </div>
                    <div class="bg-white/5 p-3 rounded-lg border border-white/5">
                      <div class="text-[10px] uppercase opacity-40 mb-1">Missing 4D</div>
                      <div class="text-lg font-bold text-white">{stats.recomputePlan.current.missingManifold4}</div>
                    </div>
                  </div>
                  <div>
                    <div class="text-[10px] uppercase opacity-40 mb-2">Recommended sequence</div>
                    <div class="space-y-1">
                      {#each stats.recomputePlan.recommendedSequence as command}
                        <div class="rounded-lg bg-black/20 border border-white/5 px-3 py-2 font-mono text-[11px] text-cyan-100">{command}</div>
                      {/each}
                    </div>
                  </div>
                  <div>
                    <div class="text-[10px] uppercase opacity-40 mb-2">Expected effects</div>
                    <div class="space-y-1">
                      {#each stats.recomputePlan.expectedEffects as effect}
                        <div class="text-[11px] text-white/65">{effect}</div>
                      {/each}
                    </div>
                  </div>
                  <div class="text-[11px] text-amber-200">{stats.recomputePlan.note}</div>
                </div>
              {:else}
                <div class="text-xs text-white/45">Recompute plan unavailable; TRACE MCP may be offline.</div>
              {/if}
            </div>

            <div class="pt-4 border-t border-white/5 space-y-3">
              <button 
                onclick={async () => {
                  const res = await fetch('/api/admin/topology/recompute', { method: 'POST' });
                  const data = await res.json();
                  alert(data.message || data.error);
                  if (res.ok) location.reload();
                }}
                class="w-full py-3 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent text-[10px] font-bold tracking-widest uppercase transition-all active:scale-95 border border-accent/20"
              >
                Recompute Topology Manifold (Guided)
              </button>
              <button class="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-bold tracking-widest uppercase transition-all active:scale-95 border border-white/5">
                Flush ACE Cache
              </button>
            </div>
          </div>
        </section>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <!-- AI Skills Registry -->
        <section class="space-y-6" data-trace-id="skills-registry" data-trace-type="ai-config">
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="i-carbon-flash opacity-50"></span>
            Subagent Skills
          </h2>
          <div class="grid grid-cols-1 gap-3">
            {#each stats.skills as skill}
              <div class="lane-row group">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-xl text-accent">
                    <span class={skill.is_system ? 'i-carbon-settings' : 'i-carbon-user-avatar'}></span>
                  </div>
                  <div>
                    <div class="text-sm font-bold text-white/90">{skill.name}</div>
                    <div class="text-[10px] opacity-40">{skill.description || 'No description'}</div>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  {#if skill.is_system}
                    <span class="text-[9px] font-mono bg-white/5 px-2 py-1 rounded uppercase opacity-50">System</span>
                  {/if}
                  <button 
                    onclick={async () => {
                      const objective = prompt(`Launch mission for ${skill.name}:`, `Fix missing topology data`);
                      if (!objective) return;
                      const res = await fetch('/api/admin/ai-chat/subagent/launch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ skillName: skill.name, mission: objective })
                      });
                      const data = await res.json();
                      if (res.ok) {
                        alert(`Mission launched! ID: ${data.runId}`);
                        location.reload();
                      } else {
                        alert(data.error || 'Launch failed');
                      }
                    }}
                    class="p-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent transition-all active:scale-90"
                    title="Launch Mission"
                  >
                    <span class="i-carbon-launch"></span>
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </section>

        <!-- Recent Autonomous Runs -->
        <section class="space-y-6">
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="i-carbon-activity opacity-50"></span>
            Recent Missions
          </h2>
          <div class="glass-panel overflow-hidden">
            <table class="w-full text-left text-[11px]">
              <thead class="bg-white/5 text-white/40 uppercase tracking-widest text-[9px]">
                <tr>
                  <th class="p-4">Skill</th>
                  <th class="p-4">Status</th>
                  <th class="p-4">Tokens</th>
                  <th class="p-4">Time</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                {#each stats.recentRuns as run}
                  <tr class="hover:bg-white/5 transition-colors">
                    <td class="p-4 font-bold text-white/90">{run.skill_name}</td>
                    <td class="p-4">
                      <span class={run.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'}>
                        {run.status}
                      </span>
                    </td>
                    <td class="p-4 opacity-60">{run.tokens_used?.toLocaleString() ?? 0}</td>
                    <td class="p-4 opacity-40">{new Date(run.created_at).toLocaleTimeString()}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>

    <!-- Right Sidebar (TRACE Copilot) -->
    <aside class="lg:col-span-1 min-h-[40rem] lg:sticky lg:top-0 lg:h-screen overflow-hidden">
      <TraceCopilotPanel />
    </aside>
  </div>
</div>

<style>
  :global(body) {
    background-color: #05070a;
    background-image: 
      radial-gradient(circle at 0% 0%, rgba(31, 58, 138, 0.15) 0%, transparent 50%),
      radial-gradient(circle at 100% 100%, rgba(139, 92, 246, 0.1) 0%, transparent 50%);
  }

  .studio-container {
    font-family: 'Outfit', sans-serif;
  }

  .text-accent {
    color: #8adfff;
  }

  .bg-accent {
    background-color: #8adfff;
  }

  .stat-card {
    position: relative;
    padding: 2rem;
    background: rgba(14, 21, 35, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 2rem;
    overflow: hidden;
    backdrop-filter: blur(20px);
    transition: transform 0.3s cubic-bezier(0.2, 1, 0.3, 1), border-color 0.3s ease;
  }

  .stat-card:hover {
    transform: translateY(-4px) scale(1.02);
    border-color: rgba(138, 223, 255, 0.3);
  }

  .stat-icon {
    font-size: 2.5rem;
    margin-bottom: 1.5rem;
    opacity: 0.8;
  }

  .stat-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 0.5rem;
  }

  .stat-value {
    font-size: 2.5rem;
    font-weight: 800;
    color: white;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: -0.05em;
  }

  .stat-sub {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.3);
    margin-top: 0.25rem;
  }

  .stat-glow {
    position: absolute;
    top: -50%;
    right: -50%;
    width: 200%;
    height: 200%;
    pointer-events: none;
    z-index: -1;
  }

  .lane-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 1.25rem;
    transition: all 0.2s ease;
  }

  .lane-row:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .glass-panel {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 1.5rem;
    backdrop-filter: blur(10px);
  }
</style>
