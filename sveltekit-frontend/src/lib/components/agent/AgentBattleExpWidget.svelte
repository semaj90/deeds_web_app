<!--
  AgentBattleExpWidget.svelte
  Retro Pokémon / N64-style EXP and rank progression tracker for Mastra and Autonomous Agent workflows.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { flip } from 'svelte/animate';
  import { slide } from 'svelte/transition';
  import {
    getInitialAgentExpState,
    recordAgentBattleAction,
    type AgentExpState,
    type AgentBattleAction,
  } from '$lib/server/agent/agent-exp-tracker.js';
  import { retroAudio } from '$lib/components/ui/gaming/effects/audio-effects.js';

  interface Props {
    title?: string;
    class?: string;
  }

  let {
    title = 'Agentic Battle Diagnostics',
    class: className = '',
  }: Props = $props();

  let agentState = $state<AgentExpState>(getInitialAgentExpState());
  let soundEnabled = $state(true);
  let actionLogRef = $state<HTMLDivElement | null>(null);

  // Derived rank and EXP metrics
  let rankInfo = $derived(agentState.rankInfo);
  let xpInLevel = $derived(Math.max(0, rankInfo.totalExp - rankInfo.currentLevelBaseExp));
  let xpRequiredForLevel = $derived(Math.max(1, rankInfo.nextLevelRequiredExp - rankInfo.currentLevelBaseExp));

  // Svelte motion tweened 0-100% progress for silky smooth Pokémon-style bar filling
  const progressTween = tweened(0, {
    duration: 450,
    easing: cubicOut,
  });

  // Keep progressTween synchronized whenever rankInfo updates
  $effect(() => {
    progressTween.set(rankInfo.progressPercent);
  });

  function handleAction(
    type: AgentBattleAction['actionType'],
    toolName: string,
    description: string,
    superEffective = false
  ) {
    agentState = recordAgentBattleAction(agentState, {
      agentName: 'Mastra Triage Agent',
      actionType: type,
      toolName,
      description,
      superEffective,
    });

    if (soundEnabled) {
      if (superEffective || type === 'verify') {
        retroAudio.playSuccessSound().catch(() => {});
      } else {
        retroAudio.playSNESButtonClick({ volume: 0.25 }).catch(() => {});
      }
    }
  }

  function simulateGrounding() {
    handleAction(
      'grounding',
      'oak_resolve_concept',
      'Resolved CURIE legal ontology against :8095 kernel (Read-only)',
      true
    );
  }

  function simulateScout() {
    handleAction(
      'scout',
      'ripgrep_search',
      'Scouted codebase for ast-chunk-routing patterns and tsvector columns'
    );
  }

  function simulateProposal() {
    handleAction(
      'proposal',
      'cases_create',
      'Shielded mutation: emitted PROPOSED_MUTATION receipt under LangGraph Boundary'
    );
  }

  function simulateVerify() {
    handleAction(
      'verify',
      'vitest_engine',
      'Passed full 46/46 agent suite tests without regressions',
      true
    );
  }
</script>

<div class="agent-battle-widget border-2 border-black/30 rounded-xl bg-sand/15 backdrop-blur-md p-5 shadow-xl {className}">
  <!-- Header: Rank, Level & Sound Toggle -->
  <div class="flex items-center justify-between mb-4 pb-3 border-b border-black/15">
    <div class="flex items-center gap-3">
      <div
        class="w-10 h-10 rounded-lg flex items-center justify-center font-black text-white text-lg shadow-inner"
        style="background: {rankInfo.badgeColor}"
      >
        Lv{rankInfo.level}
      </div>
      <div>
        <div class="text-xs font-bold uppercase tracking-widest text-black/50">Agentic RPG Level</div>
        <div class="text-lg font-black text-black tracking-tight">{rankInfo.rankTitle}</div>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <span class="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
        🛡️ LangGraph Shield: ACTIVE
      </span>
      <button
        type="button"
        onclick={() => (soundEnabled = !soundEnabled)}
        class="px-2.5 py-1 text-xs rounded bg-black/10 hover:bg-black/20 text-black/80 font-mono transition-colors"
        title="Toggle Retro 8-bit Audio"
      >
        {soundEnabled ? '🔊 SFX' : '🔇 MUTE'}
      </button>
    </div>
  </div>

  <!-- EXP Bar Section (Pokémon-style retro progress with Svelte tweened animation) -->
  <div class="mb-5 bg-black/5 p-3 rounded-lg border border-black/10">
    <div class="flex justify-between items-baseline text-xs font-mono font-bold text-black/70 mb-1.5">
      <span>EXP PROGRESSION</span>
      <span>{xpInLevel} / {xpRequiredForLevel} XP ({Math.round($progressTween)}%)</span>
    </div>

    <!-- HTML5 Accessible Retro Segmented Health / EXP Bar -->
    <div
      role="progressbar"
      aria-label="Agent Level EXP"
      aria-valuenow={Math.round($progressTween)}
      aria-valuemin={0}
      aria-valuemax={100}
      class="w-full h-4 bg-black/20 rounded-sm overflow-hidden p-0.5 border border-black/40 shadow-inner"
    >
      <div
        class="h-full rounded-xs relative transition-[background] duration-200"
        style="width: {$progressTween}%; background: linear-gradient(90deg, #10b981 0%, #34d399 50%, #fbbf24 100%);"
      >
        <div class="absolute inset-0 bg-white/20 opacity-40 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.4)_50%,transparent_75%)] bg-[length:12px_12px]"></div>
      </div>
    </div>

    <div class="flex justify-between items-center text-[10px] font-mono text-black/50 mt-1.5">
      <span>Total EXP: {rankInfo.totalExp.toLocaleString()}</span>
      <span>Bugs Slain: {agentState.totalBugsSlain} | Action Streak: {agentState.streak}</span>
    </div>
  </div>

  <!-- Action Simulator Battle Buttons -->
  <div class="mb-5">
    <div class="text-[11px] font-bold uppercase tracking-wider text-black/50 mb-2">Simulate Agentic Action Battle</div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
      <button
        type="button"
        onclick={simulateScout}
        class="px-3 py-2 text-xs font-bold font-mono rounded bg-blue-500/15 hover:bg-blue-500/25 text-blue-900 border border-blue-400/30 transition-all flex items-center justify-center gap-1.5"
      >
        🔍 Scout (+25 XP)
      </button>
      <button
        type="button"
        onclick={simulateGrounding}
        class="px-3 py-2 text-xs font-bold font-mono rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-900 border border-emerald-400/30 transition-all flex items-center justify-center gap-1.5"
      >
        🧬 OAK (+60 XP)
      </button>
      <button
        type="button"
        onclick={simulateProposal}
        class="px-3 py-2 text-xs font-bold font-mono rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 border border-amber-400/30 transition-all flex items-center justify-center gap-1.5"
      >
        🛡️ Proposal (+100 XP)
      </button>
      <button
        type="button"
        onclick={simulateVerify}
        class="px-3 py-2 text-xs font-bold font-mono rounded bg-purple-500/15 hover:bg-purple-500/25 text-purple-900 border border-purple-400/30 transition-all flex items-center justify-center gap-1.5"
      >
        ⚡ Verify (+250 XP)
      </button>
    </div>
  </div>

  <!-- Live Action Battle Feed with svelte/animate flip & slide -->
  <div>
    <div class="text-[11px] font-bold uppercase tracking-wider text-black/50 mb-2">Recent Battle Events</div>
    <div
      bind:this={actionLogRef}
      class="space-y-1.5 max-h-48 overflow-y-auto pr-1 font-mono text-xs"
    >
      {#each agentState.recentActions as action (action.id)}
        <div
          animate:flip={{ duration: 250 }}
          transition:slide={{ duration: 200 }}
          class="flex items-start justify-between p-2 rounded bg-black/5 border border-black/10 hover:bg-black/10 transition-colors"
        >
          <div class="flex items-start gap-2">
            <span class="text-sm">
              {#if action.actionType === 'verify'}🧪
              {:else if action.actionType === 'proposal'}🛡️
              {:else if action.actionType === 'grounding'}🧬
              {:else}🔍{/if}
            </span>
            <div>
              <span class="font-bold text-black">{action.agentName}</span>
              <span class="text-black/60"> used </span>
              <span class="font-semibold text-accent underline">{action.toolName}</span>:
              <span class="text-black/80">{action.description}</span>
              {#if action.superEffective}
                <span class="text-[10px] font-bold text-amber-600 uppercase ml-1">It's Super Effective!</span>
              {/if}
            </div>
          </div>
          <span class="font-bold text-emerald-700 whitespace-nowrap ml-2">
            +{action.expGained} XP
          </span>
        </div>
      {/each}
    </div>
  </div>
</div>
