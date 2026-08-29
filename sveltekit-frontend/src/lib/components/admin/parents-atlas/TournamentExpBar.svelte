<script lang="ts">
	type GateState = 'UNPROVEN' | 'CREATED' | 'WIRED' | 'PARTIAL' | 'PROVEN' | 'DONE' | 'BLOCKED';
	type Gate = {
		id: string;
		phase: string;
		label: string;
		state: GateState;
		weight: number;
		completion?: number;
		receiptRef?: string;
		filesEdited?: string[];
	};
	type PhaseProgress = { phase: string; progressPct: number; provenWeight: number; totalWeight: number };
	type Progress = {
		proofProgressPct: number;
		currentPhase: string | null;
		currentGate: string | null;
		blockedGates: string[];
		remainingGates: string[];
		phases: PhaseProgress[];
		efficiency: {
			tokenSavingsPct: number | null;
			wallTimeSavingsPct: number | null;
			kvReusePct: number | null;
			cacheHitPct: number | null;
			filesReusePct: number | null;
		};
	};

	const { progress, gates = [] } = $props<{ progress: Progress; gates?: Gate[] }>();

	const current = $derived(gates.find((gate) => gate.id === progress.currentGate) ?? null);
	const recentFiles = $derived(
		[...gates]
			.reverse()
			.flatMap((gate) => gate.filesEdited ?? [])
			.filter((value, index, values) => values.indexOf(value) === index)
			.slice(0, 4)
	);

	function fmt(value: number | null): string {
		return value === null ? '—' : `${value.toFixed(1)}%`;
	}
</script>

<section class="tournament-exp" aria-label="Parent Atlas tournament proof progress">
	<div class="battle-header">
		<div>
			<div class="eyebrow">PARENT ATLAS TOURNAMENT</div>
			<h2>{progress.currentPhase ?? 'Promotion complete'}</h2>
			<p>{current?.label ?? 'All weighted promotion gates are proven.'}</p>
		</div>
		<div class="level">{progress.proofProgressPct.toFixed(1)}%</div>
	</div>

	<div class="exp-track" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress.proofProgressPct} role="progressbar">
		<div class="exp-fill" style={`width: ${Math.max(0, Math.min(100, progress.proofProgressPct))}%`}></div>
		{#each progress.phases as phase, index}
			{#if index > 0}
				<span class="phase-tick" style={`left: ${(index / progress.phases.length) * 100}%`}></span>
			{/if}
		{/each}
	</div>

	<div class="phase-strip">
		{#each progress.phases as phase}
			<div class="phase-chip" class:complete={phase.progressPct >= 100} class:active={phase.phase === progress.currentPhase}>
				<span>{phase.phase}</span>
				<strong>{phase.progressPct.toFixed(0)}%</strong>
			</div>
		{/each}
	</div>

	<div class="telemetry">
		<div><span>Token saved</span><strong>{fmt(progress.efficiency.tokenSavingsPct)}</strong></div>
		<div><span>KV reuse</span><strong>{fmt(progress.efficiency.kvReusePct)}</strong></div>
		<div><span>ACE/BitFrost hit</span><strong>{fmt(progress.efficiency.cacheHitPct)}</strong></div>
		<div><span>Wall-time saved</span><strong>{fmt(progress.efficiency.wallTimeSavingsPct)}</strong></div>
		<div><span>Files reused</span><strong>{fmt(progress.efficiency.filesReusePct)}</strong></div>
		<div><span>Blocked gates</span><strong>{progress.blockedGates.length}</strong></div>
	</div>

	{#if recentFiles.length > 0}
		<div class="files">
			<span>Files edited</span>
			{#each recentFiles as file}
				<code>{file}</code>
			{/each}
		</div>
	{/if}

	<div class="legend">
		<span><i class="dot proven"></i>PROVEN / DONE</span>
		<span><i class="dot wired"></i>CREATED / WIRED / PARTIAL</span>
		<span><i class="dot blocked"></i>BLOCKED / UNPROVEN</span>
		<small>Efficiency telemetry never raises proof progress.</small>
	</div>
</section>

<style>
	.tournament-exp {
		padding: 1rem 1.1rem;
		border: 1px solid color-mix(in srgb, #6ee7ff 28%, transparent);
		border-radius: 18px;
		background: linear-gradient(180deg, color-mix(in srgb, #0b1628 88%, transparent), color-mix(in srgb, #102746 82%, transparent));
		box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.08), 0 18px 42px rgb(0 0 0 / 0.28);
	}
	.battle-header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; }
	.eyebrow { color: #72ddff; font-size: .69rem; font-weight: 800; letter-spacing: .17em; }
	h2 { margin: .2rem 0 0; font-size: 1.12rem; color: #f8fbff; }
	p { margin: .22rem 0 .75rem; color: #9fb3ca; font-size: .78rem; }
	.level { font-variant-numeric: tabular-nums; font-size: 1.8rem; font-weight: 900; color: #fff; text-shadow: 0 0 20px rgb(91 207 255 / .4); }
	.exp-track { position: relative; height: 18px; overflow: hidden; border-radius: 999px; background: #07111f; border: 1px solid rgb(255 255 255 / .11); box-shadow: inset 0 2px 8px rgb(0 0 0 / .55); }
	.exp-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #18a6cf, #45ddff 58%, #b8f7ff); box-shadow: 0 0 18px rgb(69 221 255 / .55); transition: width .35s ease; }
	.phase-tick { position: absolute; inset-block: 0; width: 1px; background: rgb(255 255 255 / .32); }
	.phase-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: .35rem; margin-top: .6rem; }
	.phase-chip { display: flex; justify-content: space-between; gap: .4rem; padding: .38rem .5rem; border-radius: 8px; background: rgb(255 255 255 / .035); color: #7890aa; font-size: .63rem; }
	.phase-chip strong { font-variant-numeric: tabular-nums; }
	.phase-chip.complete { color: #85e9c1; }
	.phase-chip.active { color: #dff8ff; background: rgb(44 182 222 / .13); outline: 1px solid rgb(69 221 255 / .25); }
	.telemetry { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: .45rem; margin-top: .75rem; }
	.telemetry div { padding: .48rem .55rem; border-radius: 9px; background: rgb(0 0 0 / .18); }
	.telemetry span { display: block; color: #7790ab; font-size: .62rem; text-transform: uppercase; letter-spacing: .06em; }
	.telemetry strong { display: block; margin-top: .15rem; color: #eaf9ff; font-size: .82rem; font-variant-numeric: tabular-nums; }
	.files { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; margin-top: .7rem; color: #7890aa; font-size: .62rem; }
	.files code { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: .24rem .4rem; border-radius: 6px; background: rgb(255 255 255 / .05); color: #b9cadb; }
	.legend { display: flex; flex-wrap: wrap; gap: .7rem; align-items: center; margin-top: .65rem; color: #7890aa; font-size: .58rem; }
	.legend small { margin-left: auto; color: #637991; }
	.dot { display: inline-block; width: 6px; height: 6px; margin-right: .25rem; border-radius: 50%; }
	.proven { background: #63e5b5; }
	.wired { background: #ffc85a; }
	.blocked { background: #ff6a87; }
</style>
