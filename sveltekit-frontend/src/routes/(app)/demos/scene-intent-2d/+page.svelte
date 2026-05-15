<script lang="ts">
  import type { PageData } from './$types';
  import type { SceneIntent } from '$lib/server/reconstruction/crime-scene-schema.js';

  let { data }: { data: PageData } = $props();

  // Derive view state from the loaded SceneIntent.
  const sceneIntent = $derived<SceneIntent>(data.sceneIntent);
  const events     = $derived(sceneIntent.events);
  const totalSecs  = $derived(sceneIntent.duration_s);

  // Selected event for the right-hand evidence panel.
  let selectedEventId = $state<string | null>(null);
  const selectedEvent = $derived(
    selectedEventId ? events.find((e) => e.id === selectedEventId) : null,
  );

  // ── Compile loop — POST current SceneIntent to /api/reconstruction/compile ──
  type CompileResult = {
    ok: boolean;
    plan_hash?: string;
    sceneMetadata?: {
      scene_id: string;
      duration_s: number;
      events: Array<{ id: string; action: string; mixamo_id: string }>;
      generator: { version: string; compiled_at: string; plan_hash: string };
    };
    projectionWarnings?: string[];
    blenderScriptBytes?: number;
    error?: string;
  };

  let compiling      = $state(false);
  let compileResult  = $state<CompileResult | null>(null);

  async function compileScene() {
    compiling = true;
    compileResult = null;
    try {
      const res = await fetch('/api/reconstruction/compile', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:        JSON.stringify(sceneIntent),
      });
      if (!res.ok) {
        compileResult = { ok: false, error: `HTTP ${res.status} — ${await res.text().then(t => t.slice(0, 200))}` };
        return;
      }
      compileResult = await res.json();
    } catch (err) {
      compileResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      compiling = false;
    }
  }

  // Color a confidence badge.
  function confidenceColor(level: 'high' | 'medium' | 'low'): string {
    return level === 'high' ? '#3cbcfc' : level === 'medium' ? '#f7d51d' : '#f83800';
  }

  function actionGlyph(action: string): string {
    const map: Record<string, string> = {
      idle: '·', walk: '→', run: '⇒', fall: '↓', strike: '✷', turn: '↻',
      kneel: '⌄', point: '☞', present_evidence: '◆', search: '🔎',
      flee: '⇒⇒', conceal: '◑', speaking: '💬', objection: '!', sit: '⌂',
      stand: '|', gesture: '✋',
    };
    return map[action] ?? '·';
  }

  // Timeline bar geometry.
  const barWidthPct = (durationS: number) => `${(durationS / totalSecs) * 100}%`;
  const barLeftPct  = (timeS: number)     => `${(timeS / totalSecs) * 100}%`;
</script>

<svelte:head>
  <title>Scene Intent — 2D Timeline (Phase 1 demo)</title>
</svelte:head>

<main class="page">
  <header class="hero">
    <div>
      <h1>{sceneIntent.title}</h1>
      <p class="meta">
        scene_id <code>{sceneIntent.scene_id}</code>
        {#if sceneIntent.case_id}· case <code>{sceneIntent.case_id}</code>{/if}
        · aesthetic <code>{sceneIntent.aesthetic}</code>
        · duration {sceneIntent.duration_s}s
        · source <code>{data.source}</code>
      </p>
    </div>
    <div class="disclaimer" role="note">{sceneIntent.disclaimer}</div>
  </header>

  {#if data.loadError}
    <div class="warn">
      Fixture failed to load — showing degraded fallback. Reason: {data.loadError}
    </div>
  {/if}

  <section class="environment">
    <h2>Environment</h2>
    <dl>
      <dt>City</dt><dd>{sceneIntent.environment.city}</dd>
      {#if sceneIntent.environment.location}
        <dt>Location</dt><dd>{sceneIntent.environment.location}</dd>
      {/if}
      {#if sceneIntent.environment.time_of_day}
        <dt>Time of day</dt><dd>{sceneIntent.environment.time_of_day}</dd>
      {/if}
      {#if sceneIntent.environment.weather}
        <dt>Weather</dt><dd>{sceneIntent.environment.weather}</dd>
      {/if}
      {#if sceneIntent.environment.notes}
        <dt>Notes</dt><dd>{sceneIntent.environment.notes}</dd>
      {/if}
    </dl>
  </section>

  <section class="actors">
    <h2>Actors ({sceneIntent.actors.length})</h2>
    <ul class="actor-list">
      {#each sceneIntent.actors as actor (actor.actor_id)}
        <li>
          <code>{actor.actor_id}</code>
          <span class="role role-{actor.role}">{actor.role}</span>
          <span class="label">{actor.label}</span>
        </li>
      {/each}
    </ul>
  </section>

  <section class="timeline">
    <h2>Timeline ({events.length} events · {totalSecs}s)</h2>
    <div class="track">
      {#each events as ev (ev.id)}
        <button
          type="button"
          class="bar"
          class:disputed={ev.disputed}
          class:selected={selectedEventId === ev.id}
          style="left: {barLeftPct(ev.time_s)}; width: {barWidthPct(ev.duration_s)}; --conf: {confidenceColor(ev.confidence)};"
          aria-label="event {ev.id} {ev.action} {ev.what}"
          onclick={() => (selectedEventId = ev.id)}
        >
          <span class="glyph">{actionGlyph(ev.action)}</span>
          <span class="bar-label">{ev.action}</span>
        </button>
      {/each}
    </div>
    <div class="ticks">
      {#each Array.from({ length: Math.floor(totalSecs) + 1 }) as _tick, i}
        <span class="tick" style="left: {(i / totalSecs) * 100}%">{i}s</span>
      {/each}
    </div>
  </section>

  <section class="event-grid">
    {#each events as ev (ev.id)}
      <article
        class="event"
        class:disputed={ev.disputed}
        class:selected={selectedEventId === ev.id}
      >
        <header>
          <span class="t">t={ev.time_s.toFixed(1)}s · {ev.duration_s.toFixed(1)}s</span>
          <span class="action-tag">{actionGlyph(ev.action)} {ev.action}</span>
          <span class="conf" style="background: {confidenceColor(ev.confidence)}">
            {ev.confidence}
          </span>
          {#if ev.disputed}<span class="disputed-tag">disputed</span>{/if}
        </header>
        <p class="what">{ev.what}</p>
        {#if ev.why_hypothesis}
          <p class="why"><strong>why?</strong> {ev.why_hypothesis}</p>
        {/if}
        <p class="how"><strong>how:</strong> {ev.how}</p>
        <ul class="who">
          {#each ev.who as actor (actor.actor_id)}
            <li><code>{actor.actor_id}</code> · {actor.role} · {actor.label}</li>
          {/each}
        </ul>
        {#if ev.evidence_ids.length > 0}
          <p class="ev-ids">
            <strong>evidence:</strong>
            {#each ev.evidence_ids as eid (eid)}
              <code>{eid}</code>
            {/each}
          </p>
        {/if}
        {#if ev.annotations.length > 0}
          <ul class="annotations">
            {#each ev.annotations as ann, i (i)}
              <li class="ann ann-{ann.kind}">
                <span class="ann-t">t={ann.t.toFixed(1)}s</span>
                <span class="ann-kind">{ann.kind}</span>
                <span class="ann-text">{ann.text}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </article>
    {/each}
  </section>

  {#if selectedEvent}
    <aside class="details" aria-live="polite">
      <h3>Event details — {selectedEvent.id}</h3>
      <pre>{JSON.stringify(selectedEvent, null, 2)}</pre>
      <button type="button" onclick={() => (selectedEventId = null)}>close</button>
    </aside>
  {/if}

  <section class="evidence-links">
    <h2>Evidence links ({sceneIntent.evidence_links.length})</h2>
    <ul>
      {#each sceneIntent.evidence_links as link (link.evidence_id)}
        <li>
          <code>{link.evidence_id}</code>
          <span class="status status-{link.status}">{link.status}</span>
          {#if link.label}<span>{link.label}</span>{/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="compile">
    <h2>Compile to deterministic plan</h2>
    <p class="explain">
      Posts the current <code>SceneIntent</code> to
      <code>POST /api/reconstruction/compile</code>, projects it to
      <code>CrimeScenePlan</code> via <code>sceneIntentToPlan()</code>,
      runs the deterministic compiler, and returns
      <code>plan_hash</code> + projection warnings + scene metadata.
      No Blender shell-out. No DB writes.
    </p>
    <button
      type="button"
      class="compile-btn"
      onclick={compileScene}
      disabled={compiling}
    >
      {compiling ? 'compiling…' : 'Compile SceneIntent → CrimeScenePlan'}
    </button>

    {#if compileResult}
      {#if compileResult.ok && compileResult.sceneMetadata}
        <div class="compile-result ok">
          <h3>✅ compiled</h3>
          <dl>
            <dt>plan_hash</dt>
            <dd><code>{compileResult.plan_hash}</code></dd>
            <dt>scene_id</dt>
            <dd><code>{compileResult.sceneMetadata.scene_id}</code></dd>
            <dt>duration</dt>
            <dd>{compileResult.sceneMetadata.duration_s}s</dd>
            <dt>events compiled</dt>
            <dd>{compileResult.sceneMetadata.events.length}</dd>
            <dt>blender script</dt>
            <dd>{compileResult.blenderScriptBytes} bytes</dd>
            <dt>compiler</dt>
            <dd><code>{compileResult.sceneMetadata.generator.version}</code></dd>
          </dl>

          {#if compileResult.projectionWarnings && compileResult.projectionWarnings.length > 0}
            <h4>Projection warnings ({compileResult.projectionWarnings.length})</h4>
            <ul class="warnings">
              {#each compileResult.projectionWarnings as w (w)}
                <li>{w}</li>
              {/each}
            </ul>
            <p class="hint">
              These verbs from the 17-action SceneIntent vocabulary were
              collapsed to the 7-action Mixamo-mapped subset. The
              compiler emits the closest Mixamo cousin; the original
              intent is preserved in scene metadata for the Langfuse
              trace.
            </p>
          {:else}
            <p class="hint">No projection warnings — every action has a 1:1 Mixamo asset.</p>
          {/if}

          <details>
            <summary>events with resolved Mixamo IDs</summary>
            <ul class="event-mapping">
              {#each compileResult.sceneMetadata.events as ev (ev.id)}
                <li>
                  <code>{ev.id}</code> · {ev.action} → <code>{ev.mixamo_id}</code>
                </li>
              {/each}
            </ul>
          </details>
        </div>
      {:else}
        <div class="compile-result fail">
          <h3>❌ compile failed</h3>
          <p>{compileResult.error}</p>
        </div>
      {/if}
    {/if}
  </section>

  <footer class="footer">
    <p>
      Phase 1 demo · 2D timeline reads <code>SceneIntent</code> via
      <code>SceneIntentSchema</code>. Companion APIs:
      <code>POST /api/reconstruction/scene-intent</code> (extractor) +
      <code>POST /api/reconstruction/compile</code> (deterministic
      compiler). 3D rendering layers (Blender, ComfyUI, TRELLIS, WebGPU)
      deliberately out of scope for Phase 1 — same intent JSON drives
      every later phase.
    </p>
  </footer>
</main>

<style>
  .page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
    font-family: ui-sans-serif, system-ui, sans-serif;
    color: #e8e8e8;
    background: #0a0a14;
    min-height: 100vh;
  }
  .hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }
  h1 { margin: 0 0 4px; font-size: 1.6em; color: #f7d51d; }
  h2 { margin: 32px 0 12px; font-size: 1.1em; color: #92cc41; }
  .meta { font-size: 0.85em; color: #aaa; margin: 0; }
  code {
    background: #1a1a2a;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.9em;
    color: #3cbcfc;
  }
  .disclaimer {
    background: #f83800;
    color: #fff;
    padding: 8px 14px;
    border-radius: 4px;
    font-size: 0.85em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }
  .warn {
    background: #4a2010;
    border: 1px solid #f83800;
    padding: 12px;
    margin-bottom: 16px;
    border-radius: 4px;
  }
  .environment dl {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 4px 12px;
    margin: 0;
  }
  .environment dt { color: #aaa; }
  .environment dd { margin: 0; }
  .actor-list, .evidence-links ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .actor-list li, .evidence-links li {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 6px 10px;
    background: #1a1a2a;
    border-radius: 3px;
  }
  .role {
    padding: 2px 8px;
    border-radius: 2px;
    font-size: 0.8em;
    text-transform: uppercase;
  }
  .role-suspect  { background: #f83800; color: #fff; }
  .role-victim   { background: #f7d51d; color: #000; }
  .role-witness  { background: #3cbcfc; color: #000; }
  .role-officer  { background: #92cc41; color: #000; }
  .role-unknown  { background: #7c7c7c; color: #fff; }
  .status {
    padding: 1px 6px;
    border-radius: 2px;
    font-size: 0.75em;
    text-transform: uppercase;
  }
  .status-cited    { background: #3cbcfc; color: #000; }
  .status-placed   { background: #92cc41; color: #000; }
  .status-disputed { background: #f83800; color: #fff; }
  .timeline { margin: 32px 0; }
  .track {
    position: relative;
    height: 56px;
    background: #1a1a2a;
    border-radius: 4px;
    overflow: visible;
  }
  .bar {
    position: absolute;
    top: 4px;
    bottom: 4px;
    background: #1a3a4a;
    border: 2px solid var(--conf, #3cbcfc);
    border-radius: 3px;
    color: #e8e8e8;
    font-family: inherit;
    font-size: 0.85em;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 8px;
    overflow: hidden;
    transition: transform 0.1s ease;
  }
  .bar:hover { transform: translateY(-2px); }
  .bar.selected { background: #3a4a5a; }
  .bar.disputed { border-style: dashed; }
  .glyph { font-size: 1.2em; }
  .bar-label { white-space: nowrap; }
  .ticks {
    position: relative;
    height: 18px;
    margin-top: 4px;
    font-size: 0.7em;
    color: #888;
  }
  .tick {
    position: absolute;
    transform: translateX(-50%);
  }
  .event-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 12px;
    margin-top: 32px;
  }
  .event {
    background: #1a1a2a;
    border-left: 4px solid #3cbcfc;
    border-radius: 4px;
    padding: 12px 14px;
    transition: border-color 0.1s ease;
  }
  .event.disputed   { border-left-color: #f83800; border-left-style: dashed; }
  .event.selected   { background: #2a2a3a; outline: 2px solid #f7d51d; }
  .event header {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin-bottom: 8px;
    font-size: 0.8em;
  }
  .t            { color: #888; }
  .action-tag   { background: #1a3a4a; padding: 2px 8px; border-radius: 2px; }
  .conf         { padding: 2px 8px; border-radius: 2px; color: #000; font-weight: 600; text-transform: uppercase; }
  .disputed-tag { background: #f83800; color: #fff; padding: 2px 8px; border-radius: 2px; }
  .what  { margin: 6px 0; }
  .why   { margin: 6px 0; color: #f7d51d; font-size: 0.9em; }
  .how   { margin: 6px 0; color: #aaa; font-size: 0.9em; }
  .who   { list-style: none; padding: 0; margin: 6px 0; font-size: 0.85em; color: #aaa; }
  .ev-ids { margin: 6px 0; font-size: 0.85em; }
  .ev-ids code { margin-right: 4px; }
  .annotations {
    list-style: none;
    padding: 0;
    margin: 8px 0 0;
    border-top: 1px solid #2a2a3a;
    padding-top: 8px;
  }
  .ann {
    display: flex;
    gap: 8px;
    font-size: 0.8em;
    padding: 2px 0;
  }
  .ann-t            { color: #888; min-width: 50px; }
  .ann-kind         { color: #3cbcfc; min-width: 90px; }
  .ann-uncertainty .ann-kind { color: #f7d51d; }
  .ann-evidence_pin .ann-kind { color: #92cc41; }
  .details {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: 480px;
    max-height: 60vh;
    overflow: auto;
    background: #1a1a2a;
    border: 2px solid #f7d51d;
    border-radius: 4px;
    padding: 16px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .details h3 { margin: 0 0 8px; color: #f7d51d; }
  .details pre {
    font-size: 0.75em;
    background: #0a0a14;
    padding: 8px;
    border-radius: 3px;
    overflow: auto;
    margin: 0 0 8px;
  }
  .details button {
    background: #f7d51d;
    color: #000;
    border: 0;
    padding: 6px 12px;
    cursor: pointer;
    border-radius: 3px;
    font-weight: 600;
  }
  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid #2a2a3a;
    color: #888;
    font-size: 0.85em;
  }

  .compile {
    margin-top: 32px;
    padding: 20px;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    background: #15151c;
  }
  .compile h2 { margin: 0 0 8px; color: #3cbcfc; }
  .compile .explain {
    color: #aaa;
    font-size: 0.9em;
    margin: 0 0 16px;
  }
  .compile-btn {
    background: #3cbcfc;
    color: #000;
    border: 0;
    padding: 10px 18px;
    border-radius: 3px;
    font-weight: 700;
    cursor: pointer;
    font-size: 0.95em;
  }
  .compile-btn:disabled { opacity: 0.5; cursor: progress; }

  .compile-result {
    margin-top: 16px;
    padding: 14px;
    border-radius: 4px;
    font-size: 0.9em;
  }
  .compile-result.ok   { background: #0f2a1a; border: 1px solid #2d6b48; }
  .compile-result.fail { background: #2a0f0f; border: 1px solid #6b2d2d; color: #f88; }
  .compile-result h3 { margin: 0 0 12px; }
  .compile-result h4 { margin: 16px 0 6px; color: #f7d51d; }
  .compile-result dl {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 4px 16px;
    margin: 0;
  }
  .compile-result dt { color: #888; }
  .compile-result code { background: #0a0a10; padding: 1px 5px; border-radius: 2px; }
  .warnings {
    margin: 6px 0 0 16px;
    padding: 0;
    color: #f7d51d;
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
  }
  .hint { color: #888; font-size: 0.85em; margin-top: 8px; }
  details summary { cursor: pointer; margin-top: 12px; color: #aaa; }
  .event-mapping {
    margin: 8px 0 0 16px;
    padding: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
  }
  .event-mapping li { list-style: none; margin: 2px 0; }
</style>
