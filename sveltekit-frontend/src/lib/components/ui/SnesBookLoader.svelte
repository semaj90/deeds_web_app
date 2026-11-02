<script lang="ts">
  import { onMount } from 'svelte';
  import { Dialog, Slider, Tabs } from 'bits-ui';
  import {
    drawBookFrame,
    frameAt,
    type BookMode,
    type FrameType
  } from '$lib/snes/book-sprite';
  import { htmlMini, svelteUsage } from '$lib/snes/code-snippets';

  type Engine = 'canvas' | 'css';

  /** Audit data is a caller-supplied snapshot, never a live DB query. */
  type AuditSnapshot = {
    receipt: string;
    pgVersion: string;
    sidecarsResolved: number;
    sidecarsTotal: number;
    fallbackPaths: number;
    liveLedgerRows: number;
    ledgerNote: string;
    featureRows: number;
    registryShapes: number;
  };

  type Props = {
    label?: string;
    sublabel?: string;
    telemetry?: AuditSnapshot;
    showControls?: boolean;
    initialEngine?: Engine;
    /** 0-100 for a determinate progress bar; leave null/undefined for the original indeterminate animation. */
    progress?: number | null;
  };

  let {
    label = 'NOW LOADING',
    sublabel = 'RECONCILING DRIZZLE & FEATURE GRIMOIRE...',
    telemetry = undefined,
    showControls = true,
    initialEngine = 'canvas',
    progress = null
  }: Props = $props();

  const determinate = $derived(typeof progress === 'number' && Number.isFinite(progress));
  const pct = $derived(determinate ? Math.min(100, Math.max(0, progress as number)) : 100);

  let canvas: HTMLCanvasElement;
  let engine = $state<Engine>(initialEngine);
  let bookMode = $state<BookMode>('auto');
  let currentFrame = $state<FrameType>('closed');
  let frameLabel = $state('STATE: BOOK CLOSED');
  let flavorText = $state(sublabel);
  let hudVisible = $state(true);
  let crtEnabled = $state(true);
  let barSpeed = $state(0.75);
  let barAngle = $state(-45);
  let stepped = $state(false);
  let activeSnippet = $state('svelte');
  let copyMessage = $state('');
  let reducedMotion = $state(false);

  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let tick = 0;

  const bookDisplayState = $derived(
    currentFrame === 'closed' ? 'closed' : currentFrame === 'half' ? 'half' : 'open'
  );
  const snippetText = $derived(activeSnippet === 'html' ? htmlMini : svelteUsage);

  onMount(() => {
    const ctx = canvas.getContext('2d');
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let interval: ReturnType<typeof setInterval> | undefined;

    function paint() {
      const frame = frameAt(bookMode, tick);
      currentFrame = frame.type;
      frameLabel = frame.label;
      if (ctx) drawBookFrame(ctx, frame.type, tick);

      if (tick % 16 === 0) {
        const messages = telemetry
          ? [
              sublabel,
              `${telemetry.sidecarsResolved}/${telemetry.sidecarsTotal} SIDECAR SOURCES RESOLVED...`,
              `SCANNING ${telemetry.featureRows.toLocaleString('en-US')} FEATURE ENTRIES...`,
              `PG ${telemetry.pgVersion} CATALOG SNAPSHOT...`
            ]
          : [sublabel, 'TURNING ANCIENT PAGES...', 'READING THE GRIMOIRE...', 'SUMMONING PIXEL RUNES...'];
        flavorText = messages[Math.floor(tick / 16) % messages.length];
      }
      tick += 1;
    }

    const configureMotion = () => {
      if (interval) clearInterval(interval);
      reducedMotion = media.matches;
      paint();
      if (!reducedMotion) interval = setInterval(paint, 135);
    };
    configureMotion();
    media.addEventListener('change', configureMotion);

    return () => {
      if (interval) clearInterval(interval);
      if (copyTimer) clearTimeout(copyTimer);
      media.removeEventListener('change', configureMotion);
    };
  });

  async function copySnippet(): Promise<void> {
    try {
      await navigator.clipboard.writeText(snippetText);
      copyMessage = '★ COPIED TO CLIPBOARD!';
    } catch {
      copyMessage = 'COPY BLOCKED: SELECT THE CODE ABOVE';
    }
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copyMessage = ''), 2500);
  }
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap" rel="stylesheet" />
</svelte:head>

<div
  class="snes-root relative isolate flex min-h-[100svh] w-full flex-col items-center justify-between gap-6 overflow-hidden px-3 py-4 text-purple-100"
  style={`--bar-speed:${barSpeed}s;--bar-angle:${barAngle}deg;`}
>
  <div class="pixel-dither absolute inset-0 pointer-events-none" aria-hidden="true"></div>
  {#if crtEnabled}
    <div class="crt-overlay absolute inset-0 z-30 pointer-events-none" aria-hidden="true"></div>
  {/if}

  <header class="relative z-20 flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-3 border-2 border-purple-500/60 bg-[#190d33]/90 px-3 py-2 shadow-[4px_4px_0_#090314]">
      <span class="h-3 w-3 bg-purple-400 shadow-[0_0_8px_#c084fc]" aria-hidden="true"></span>
      <span class="text-[9px] tracking-wider text-purple-200 sm:text-[11px]">SVELTEKIT // 16-BIT SNES LOADER</span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if telemetry}
        <button type="button" class="snes-btn text-[9px] text-amber-200" onclick={() => (hudVisible = !hudVisible)} aria-pressed={hudVisible}>
          AUDIT HUD: {hudVisible ? 'ON' : 'OFF'}
        </button>
      {/if}
      <button type="button" class="snes-btn text-[9px]" onclick={() => (crtEnabled = !crtEnabled)} aria-pressed={crtEnabled}>
        CRT: {crtEnabled ? 'ON' : 'OFF'}
      </button>
      <Dialog.Root>
        <Dialog.Trigger class="border-2 border-purple-200 bg-purple-600 px-3 py-2 text-[9px] text-white shadow-[4px_4px_0_#2e1065] hover:bg-purple-500 focus-visible:outline-2 focus-visible:outline-yellow-300">
          &lt;/&gt; VIEW / COPY CODE
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" />
          <Dialog.Content class="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-[760px] -translate-x-1/2 -translate-y-1/2 flex-col border-4 border-purple-400 bg-[#180b30] p-4 text-purple-100 shadow-[0_0_40px_#a855f766] outline-none sm:p-6">
            <div class="mb-3 flex items-start justify-between gap-3 border-b-2 border-purple-800 pb-3">
              <div>
                <Dialog.Title class="text-[11px] leading-loose text-yellow-300 sm:text-[13px]">SNES LOADER EXPORT</Dialog.Title>
                <Dialog.Description class="mt-1 text-[9px] leading-relaxed text-purple-300">
                  Functional integration example and standalone loading-bar mini
                </Dialog.Description>
              </div>
              <Dialog.Close class="shrink-0 border-2 border-red-300 bg-red-700 px-3 py-2 text-[11px] hover:bg-red-600" aria-label="Close code dialog">X</Dialog.Close>
            </div>
            <Tabs.Root bind:value={activeSnippet} class="flex min-h-0 flex-col">
              <Tabs.List class="mb-3 flex flex-wrap gap-2">
                <Tabs.Trigger value="svelte" class="snes-btn-idle text-[9px] data-[state=active]:border-yellow-300 data-[state=active]:bg-purple-700 data-[state=active]:text-white">
                  SVELTEKIT USAGE
                </Tabs.Trigger>
                <Tabs.Trigger value="html" class="snes-btn-idle text-[9px] data-[state=active]:border-yellow-300 data-[state=active]:bg-purple-700 data-[state=active]:text-white">
                  STANDALONE HTML MINI
                </Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="svelte" class="min-h-0 overflow-auto border-2 border-purple-900 bg-[#0b0418] p-3">
                <pre class="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-purple-200">{svelteUsage}</pre>
              </Tabs.Content>
              <Tabs.Content value="html" class="min-h-0 overflow-auto border-2 border-purple-900 bg-[#0b0418] p-3">
                <pre class="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-purple-200">{htmlMini}</pre>
              </Tabs.Content>
            </Tabs.Root>
            <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span role="status" class="text-[9px] text-emerald-300">{copyMessage}</span>
              <button type="button" onclick={copySnippet} class="border-2 border-emerald-200 bg-emerald-700 px-4 py-2 text-[10px] text-white hover:bg-emerald-600">
                COPY SELECTED SNIPPET
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  </header>

  <main class="relative z-20 flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-0 py-4">
    <div class="book-stage relative flex h-[125px] w-[152px] items-center justify-center" aria-hidden="true">
      <span class="magic-sparkle sparkle-one"></span>
      <span class="magic-sparkle sparkle-two"></span>
      <span class="magic-sparkle sparkle-three"></span>

      <canvas
        bind:this={canvas}
        width="48"
        height="40"
        class:hidden={engine !== 'canvas'}
        class="pixel-canvas h-[120px] w-[144px]"
      ></canvas>

      <div
        class:hidden={engine !== 'css'}
        class="css-pixel-book relative h-[76px] w-[108px]"
        data-state={bookDisplayState}
      >
        <div class="css-book-side left"><div class="css-page-block"><div class="pixel-lines"></div></div></div>
        <div class="css-book-side right"><div class="css-page-block"><div class="pixel-lines"></div></div></div>
        <div class="css-flipping-leaf"></div>
        <div class="css-book-spine"></div>
        <div class="css-bookmark"></div>
        <div class="css-closed-tome"><div class="css-closed-emblem"></div></div>
      </div>
    </div>
    <div class="book-shadow mt-1 mb-5 h-[14px] w-[96px]" aria-hidden="true"></div>
    <div class="mb-4 border border-purple-400/50 bg-[#180b30]/95 px-3 py-2 text-[9px] tracking-wider text-purple-300 shadow-[2px_2px_0_#090314]">
      {frameLabel}
    </div>

    <div class="w-full max-w-[380px] px-2">
      <div class="snes-frame relative h-[40px] w-full p-[5px]">
        <span class="snes-corner tl"></span><span class="snes-corner tr"></span>
        <span class="snes-corner bl"></span><span class="snes-corner br"></span>
        <div
          class:stepped-anim={stepped}
          class="snes-bar-fill h-full"
          style:width="{pct}%"
          style:transition={determinate ? 'width 240ms steps(8, end)' : 'none'}
          role="progressbar"
          aria-label={determinate ? 'Loading progress' : 'Loading animation'}
          aria-valuemin={determinate ? 0 : undefined}
          aria-valuemax={determinate ? 100 : undefined}
          aria-valuenow={determinate ? Math.round(pct) : undefined}
          aria-valuetext={determinate ? `${Math.round(pct)} percent` : 'Loading (indeterminate)'}
        ></div>
      </div>
    </div>
    <div class="snes-text-shadow mt-6 text-center text-[11px] tracking-widest text-purple-100 sm:text-[14px]">
      {label}<span class="dot-bounce">.</span><span class="dot-bounce">.</span><span class="dot-bounce">.</span>
    </div>
    <p class="mt-3 max-w-full text-center text-[8px] leading-loose tracking-wide text-purple-300 sm:text-[9px]">{flavorText}</p>

    {#if telemetry && hudVisible}
      <section class="mt-6 w-full border-2 border-purple-500/60 bg-[#140829]/90 p-3 shadow-[4px_4px_0_#070210]" aria-label="Read-only audit snapshot">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-purple-800/80 pb-2 text-[8px] leading-relaxed text-purple-300">
          <span class="flex items-center gap-2"><span class="h-2 w-2 bg-emerald-400"></span>
            PG {telemetry.pgVersion} SNAPSHOT: {telemetry.receipt.slice(0, 8)}...{telemetry.receipt.slice(-4)}
          </span>
          <span class="text-yellow-300">READ-ONLY • SNAPSHOT</span>
        </div>
        <div class="grid grid-cols-1 gap-2 text-center min-[420px]:grid-cols-3">
          <div class="border border-emerald-500/50 bg-[#1e0d3d] p-2">
            <div class="text-[8px] leading-relaxed text-purple-300">APPLIED SIDECARS</div>
            <div class="mt-2 text-[10px] leading-relaxed text-emerald-300">{telemetry.sidecarsResolved}/{telemetry.sidecarsTotal} RESOLVED</div>
            <div class="mt-1 text-[8px] leading-relaxed text-purple-400">{telemetry.fallbackPaths} FALLBACK PATHS</div>
          </div>
          <div class="border border-amber-500/50 bg-[#1e0d3d] p-2">
            <div class="text-[8px] leading-relaxed text-purple-300">DRIZZLE LEDGER</div>
            <div class="mt-2 text-[10px] leading-relaxed text-amber-300">{telemetry.liveLedgerRows} LIVE ROWS</div>
            <div class="mt-1 text-[8px] leading-relaxed text-purple-400">{telemetry.ledgerNote}</div>
          </div>
          <div class="border border-purple-400/50 bg-[#1e0d3d] p-2">
            <div class="text-[8px] leading-relaxed text-purple-300">FEATURE MAP</div>
            <div class="mt-2 text-[10px] leading-relaxed text-purple-200">{telemetry.featureRows.toLocaleString('en-US')} ROWS</div>
            <div class="mt-1 text-[8px] leading-relaxed text-rose-300">{telemetry.registryShapes} REGISTRY DDL SHAPES</div>
          </div>
        </div>
      </section>
    {/if}
  </main>

  {#if showControls}
    <footer class="relative z-20 w-full max-w-4xl px-1 pb-2">
      <div class="snes-card p-3 sm:p-4">
        <div class="grid grid-cols-1 gap-4 text-[9px] sm:grid-cols-2 lg:grid-cols-4">
          <div class="flex flex-col gap-2">
            <span class="tracking-wider text-purple-300">1. BOOK ENGINE</span>
            <div class="grid grid-cols-2 gap-1">
              <button type="button" aria-pressed={engine === 'canvas'} class={engine === 'canvas' ? 'snes-btn-active' : 'snes-btn-idle'} onclick={() => (engine = 'canvas')}>SNES CANVAS</button>
              <button type="button" aria-pressed={engine === 'css'} class={engine === 'css' ? 'snes-btn-active' : 'snes-btn-idle'} onclick={() => (engine = 'css')}>PURE CSS</button>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <span class="tracking-wider text-purple-300">2. BOOK ACTION</span>
            <div class="grid grid-cols-3 gap-1">
              {#each ['auto', 'open', 'closed'] as option}
                <button type="button" aria-pressed={bookMode === option} class={bookMode === option ? 'snes-btn-active' : 'snes-btn-idle'} onclick={() => (bookMode = option as BookMode)}>{option === 'auto' ? 'CYCLE' : option.toUpperCase()}</button>
              {/each}
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between tracking-wider text-purple-300"><span>3. STRIPE SPEED</span><span class="text-yellow-300">{barSpeed.toFixed(2)}s</span></div>
            <div class="flex items-center gap-2">
              <Slider.Root type="single" min={0.2} max={2} step={0.05} bind:value={barSpeed} class="snes-slider relative flex h-6 min-w-0 flex-1 items-center" aria-label="Stripe animation duration">
                <Slider.Range class="snes-slider-range absolute left-0 h-[6px] bg-purple-400" />
                <Slider.Thumb class="snes-slider-thumb block h-[16px] w-[12px] border-2 border-yellow-200 bg-purple-600 focus-visible:outline-2 focus-visible:outline-yellow-300" />
              </Slider.Root>
              <button type="button" aria-pressed={stepped} class="shrink-0 border border-purple-400 bg-[#241247] px-2 py-2 text-[8px] text-purple-200 hover:bg-purple-700" onclick={() => (stepped = !stepped)}>
                {stepped ? '8-STEP' : 'SMOOTH'}
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between tracking-wider text-purple-300"><span>4. DIAGONAL TILT</span><span class="text-yellow-300">{barAngle}°</span></div>
            <div class="grid grid-cols-3 gap-1">
              {#each [-45, 45, -60] as angle}
                <button type="button" aria-pressed={barAngle === angle} class={barAngle === angle ? 'snes-btn-active' : 'snes-btn-idle'} onclick={() => (barAngle = angle)}>{angle}°</button>
              {/each}
            </div>
          </div>
        </div>
      </div>
      {#if reducedMotion}
        <p class="mt-3 text-center text-[9px] text-purple-300">REDUCED MOTION: ANIMATIONS PAUSED BY SYSTEM PREFERENCE</p>
      {/if}
    </footer>
  {/if}
</div>

<style>
  .snes-root {
    background-color: #110926;
    background-image: radial-gradient(circle at 50% 42%, #2b145e 0%, #14082e 55%, #090314 100%);
    font-family: 'Press Start 2P', ui-monospace, monospace;
  }
  .pixel-dither { background-image: radial-gradient(#4c1d95 1px, transparent 1px); background-size: 16px 16px; opacity: .25; }
  .crt-overlay { background: linear-gradient(rgba(18,16,16,0) 50%,rgba(0,0,0,.38) 50%), linear-gradient(90deg,rgba(255,0,0,.03),rgba(0,255,0,.01),rgba(0,0,255,.03)); background-size: 100% 4px,6px 100%; }
  .pixel-canvas { image-rendering: pixelated; }
  .hidden { display: none !important; }
  .book-stage { perspective: 550px; animation: book-float 2.4s steps(6,end) infinite; }
  .book-shadow { background: rgba(7,2,18,.75); box-shadow: -6px 0 rgba(7,2,18,.45),6px 0 rgba(7,2,18,.45); animation: shadow-pulse 2.4s steps(6,end) infinite; }
  .magic-sparkle { position: absolute; z-index: 1; width: 6px; height: 6px; background: #e9d5ff; box-shadow: 0 0 0 2px #9333ea; animation: sparkle-rise 1.8s steps(4,end) infinite; }
  .sparkle-one { left: 14px; top: 18px; }
  .sparkle-two { right: 16px; top: 10px; animation-delay: .6s; background: #fef08a; }
  .sparkle-three { left: 50%; top: 0; animation-delay: 1.1s; }
  .snes-frame { background: #0d061c; box-shadow: 0 -4px #f8fafc,0 4px #94a3b8,-4px 0 #f8fafc,4px 0 #94a3b8,-4px -4px #cbd5e1,4px -4px #cbd5e1,-4px 4px #64748b,4px 4px #64748b,0 -8px #2e1065,0 8px #05020a,-8px 0 #2e1065,8px 0 #05020a,0 14px 28px #000b; }
  .snes-corner { position: absolute; width: 6px; height: 6px; background: #facc15; box-shadow: 2px 2px #a16207; z-index: 2; }
  .tl { top: -2px; left: -2px; } .tr { top: -2px; right: -2px; } .bl { bottom: -2px; left: -2px; } .br { bottom: -2px; right: -2px; }
  .snes-bar-fill { position: relative; overflow: hidden; background: linear-gradient(var(--bar-angle), #6b2cf5 25%, #d8b4fe 25% 50%, #6b2cf5 50% 75%, #d8b4fe 75%); background-size: 32px 32px; animation: diagonal-scroll var(--bar-speed) linear infinite; }
  .snes-bar-fill.stepped-anim { animation-timing-function: steps(8,end); }
  .snes-bar-fill::before { position: absolute; content: ''; inset: 0; box-shadow: inset 0 4px #ffffff6b,inset 0 -4px #2e1065bf; }
  .snes-text-shadow { text-shadow: 2px 2px #2e1065,-2px -2px #2e1065,2px -2px #2e1065,-2px 2px #2e1065,0 4px #090314; }
  .dot-bounce { display: inline-block; animation: dot-jump 1.2s steps(2,end) infinite; }
  .dot-bounce:nth-child(2) { animation-delay: .2s; } .dot-bounce:nth-child(3) { animation-delay: .4s; }
  .snes-slider { background: linear-gradient(#3b0764,#3b0764) center / 100% 6px no-repeat; touch-action: none; }
  .css-pixel-book { transform-style: preserve-3d; }
  .css-book-spine { position: absolute; z-index: 5; top: 2px; left: 50%; width: 12px; height: 74px; transform: translateX(-50%); background: #581c87; border-top: 4px solid #facc15; border-bottom: 4px solid #eab308; box-shadow: inset 2px 0 #a855f7,inset -2px 0 #3b0764,0 4px #1e1b4b; }
  .css-book-side { position: absolute; top: 0; width: 50px; height: 74px; background: #7e22ce; border: 4px solid #3b0764; box-shadow: 0 6px #4c1d95,0 10px #1e1b4b; transition: transform .15s steps(3,end); }
  .css-book-side.left { left: 4px; transform-origin: right center; border-right: none; }
  .css-book-side.right { right: 4px; transform-origin: left center; border-left: none; }
  .css-page-block { position: absolute; top: 4px; bottom: 6px; background: #fef3c7; box-shadow: inset 0 -4px #d97706,inset 0 -8px #f59e0b; }
  .css-book-side.left .css-page-block { left: 4px; right: 0; border-left: 3px solid #facc15; }
  .css-book-side.right .css-page-block { right: 4px; left: 0; border-right: 3px solid #facc15; }
  .pixel-lines { position: absolute; top: 10px; left: 6px; right: 6px; height: 36px; background: repeating-linear-gradient(to bottom,#7e22ce 0 4px,transparent 4px 10px); opacity: .75; }
  .css-flipping-leaf { position: absolute; z-index: 6; top: 4px; left: 54px; width: 44px; height: 62px; background: #fffbeb; border: 3px solid #d97706; transform-origin: left center; animation: page-flip .55s steps(5,end) infinite; }
  .css-flipping-leaf::after { position: absolute; content: ''; top: 10px; left: 6px; right: 6px; height: 30px; background: repeating-linear-gradient(to bottom,#a855f7 0 4px,transparent 4px 10px); }
  .css-bookmark { position: absolute; z-index: 2; bottom: -14px; left: 50%; transform: translateX(-50%); width: 10px; height: 14px; background: #ef4444; box-shadow: 0 4px #991b1b; }
  .css-closed-tome { position: absolute; z-index: 7; top: 2px; left: 50%; width: 64px; height: 76px; transform: translateX(-50%); background: #6b21a8; border: 4px solid #2e1065; box-shadow: -6px 0 #4c1d95,-10px 0 #1e1b4b,0 6px #fef3c7,0 10px #d97706,0 14px #1e1b4b; display: none; }
  .css-closed-emblem { position: absolute; top: 16px; left: 50%; width: 24px; height: 28px; transform: translateX(-50%); background: #facc15; border: 4px solid #ca8a04; box-shadow: inset 4px 4px #fef08a; }
  .css-pixel-book[data-state='closed'] .css-closed-tome { display: block; }
  .css-pixel-book[data-state='closed'] .css-flipping-leaf { animation: none; visibility: hidden; }
  .css-pixel-book[data-state='half'] .css-book-side.left { transform: rotateY(60deg); }
  .css-pixel-book[data-state='half'] .css-book-side.right { transform: rotateY(-60deg); }
  .css-pixel-book[data-state='half'] .css-flipping-leaf { visibility: hidden; }
  @keyframes diagonal-scroll { to { background-position: 32px 0; } }
  @keyframes page-flip { 0% { transform: rotateY(0deg); } 50% { transform: rotateY(-90deg) skewY(-8deg); } 100% { transform: rotateY(-180deg); } }
  @keyframes book-float { 50% { transform: translateY(-6px); } }
  @keyframes shadow-pulse { 50% { transform: scaleX(.84); opacity: .5; } }
  @keyframes sparkle-rise { 0% { transform: translateY(8px) scale(0); opacity: 0; } 40% { transform: translateY(0) scale(1); opacity: 1; } 80% { transform: translateY(-10px) scale(1); opacity: 1; } 100% { transform: translateY(-16px) scale(0); opacity: 0; } }
  @keyframes dot-jump { 50% { transform: translateY(-4px); color: #facc15; } }
  @media (prefers-reduced-motion: reduce) {
    .book-stage,.book-shadow,.magic-sparkle,.snes-bar-fill,.dot-bounce,.css-flipping-leaf { animation: none !important; }
  }
</style>
