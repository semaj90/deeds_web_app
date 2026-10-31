<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		phase: string;
		evidenceAdded: boolean;
		onAddEvidence: () => void;
		onAdvanceStory: () => void;
		onClose: () => void;
	}

	let { phase, evidenceAdded, onAddEvidence, onAdvanceStory, onClose }: Props = $props();
	let step = $state(0);
	let selectedFileName = $state('');
	const steps = ['Case file', 'Add an exhibit', 'Review evidence', 'Continue the story'];

	function selectLocalFile(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		selectedFileName = file?.name ?? '';
	}
</script>

<section class="demo-tutorial" aria-labelledby="tutorial-title" data-testid="courtroom-demo-tutorial">
	<header class="tutorial-header">
		<div class="title-group">
			<span class="celestial-mark" aria-hidden="true"><Icon name="scale" size={18} /></span>
			<div>
				<p class="eyebrow">LOCAL TRAINING · NO CASE CREATED</p>
				<h2 id="tutorial-title">Case strategy guide</h2>
			</div>
		</div>
		<button type="button" class="close-button" onclick={onClose} aria-label="Close tutorial"><Icon name="x" size={17} /></button>
	</header>

	<nav class="step-list" aria-label="Tutorial progress">
		{#each steps as label, index (label)}
			<div class="step" class:current={step === index} class:complete={step > index}>
				<span class="step-number">{step > index ? '✓' : index + 1}</span><span>{label}</span>
			</div>
		{/each}
	</nav>

	<div class="tutorial-body">
		{#if step === 0}
			<p class="step-kicker">01 · FICTIONAL CASE</p>
			<h3>Start with the sample case</h3>
			<p>This guided courtroom uses a fictional ledger dispute. It runs in your browser and does not create a server session or legal matter.</p>
		{:else if step === 1}
			<p class="step-kicker">02 · EXHIBIT</p>
			<h3>Add a sample exhibit</h3>
			<p>The demo exhibit is already prepared. You can also choose a file to see how an upload step is presented; this preview reads only its filename and does not upload or analyze its contents.</p>
			<label class="file-picker">{selectedFileName || 'Choose a local file'}<input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" onchange={selectLocalFile} /></label>
			<button type="button" class="secondary-action" onclick={onAddEvidence} disabled={evidenceAdded}>
				{evidenceAdded ? 'Sample exhibit added' : 'Add fictional ledger photo'}
			</button>
		{:else if step === 2}
			<p class="step-kicker">03 · EVIDENCE BASIS</p>
			<h3>{evidenceAdded ? 'Exhibit is in the story' : 'Evidence is still pending'}</h3>
			<p>{evidenceAdded ? 'The ledger photo is a scripted story cue—not extracted evidence. Recommendations should identify their sources and uncertainty; the demo does not reveal private model reasoning.' : 'Add the fictional ledger photo in the previous step before advancing the story.'}</p>
			<div class="basis-card"><Icon name="yorha-evidence" size={18} /><span>Story fixture · ledger-photo · local-only</span></div>
		{:else}
			<p class="step-kicker">04 · STORY PROGRESS</p>
			<h3>Follow the hearing</h3>
			<p>Current scene: <strong>{phase.replace(/_/g, ' ')}</strong>. Advance the scripted timeline to reveal testimony and see how the exhibit changes the scene.</p>
			<button type="button" class="primary-action" onclick={onAdvanceStory}>Advance local story <Icon name="arrow-right" size={16} /></button>
		{/if}
	</div>

	<footer class="tutorial-footer">
		<span>{step + 1} / {steps.length}</span>
		<div class="footer-actions">
			{#if step > 0}<button type="button" class="text-action" onclick={() => step -= 1}>Back</button>{/if}
			{#if step < steps.length - 1}
				<button type="button" class="primary-action" onclick={() => step += 1} disabled={step === 2 && !evidenceAdded}>Continue <Icon name="arrow-right" size={15} /></button>
			{:else}
				<button type="button" class="text-action" onclick={onClose}>Finish</button>
			{/if}
		</div>
	</footer>
</section>

<style>
	.demo-tutorial{position:absolute;z-index:24;top:clamp(4.5rem,10vh,7rem);left:clamp(.75rem,2vw,2rem);width:min(25rem,calc(100% - 1.5rem));max-height:calc(100% - 15rem);display:flex;flex-direction:column;overflow:auto;color:#f5f2e9;background:linear-gradient(145deg,rgba(27,35,54,.91),rgba(13,20,37,.9));border:1px solid rgba(226,197,132,.48);border-radius:1rem;box-shadow:0 1rem 3rem #02061780,inset 0 1px #ffffff19;backdrop-filter:blur(18px);font-family:inherit}
	.tutorial-header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.1rem;border-bottom:1px solid #ffffff18}.title-group{display:flex;align-items:center;gap:.75rem}.celestial-mark{display:grid;place-items:center;width:2.5rem;height:2.5rem;color:#f1d594;border:1px solid #e2c58480;border-radius:50%;background:radial-gradient(circle,#f1d59425,transparent 72%);box-shadow:0 0 1.1rem #e2c58420}.eyebrow,.step-kicker{margin:0;color:#e2c584;font-size:.62rem;letter-spacing:.12em;text-transform:uppercase}.tutorial-header h2{margin:.22rem 0 0;font:600 1rem/1.25 Georgia,serif}.close-button{display:grid;place-items:center;width:2rem;height:2rem;color:#eee;background:#ffffff0a;border:1px solid #ffffff26;border-radius:.55rem;cursor:pointer}.step-list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.25rem;padding:.75rem 1rem;border-bottom:1px solid #ffffff14}.step{display:flex;align-items:center;gap:.35rem;min-width:0;color:#aeb8ca;font-size:.58rem;line-height:1.2}.step span:last-child{overflow:hidden;text-overflow:ellipsis}.step-number{display:grid;place-items:center;flex:none;width:1.35rem;height:1.35rem;border:1px solid #ffffff35;border-radius:50%;font-size:.62rem}.step.current{color:#fff}.step.current .step-number,.step.complete .step-number{color:#1b2030;background:#e2c584;border-color:#e2c584}.tutorial-body{padding:1rem 1.1rem;min-height:12rem}.tutorial-body h3{margin:.45rem 0;color:#fff;font:600 1.2rem/1.3 Georgia,serif}.tutorial-body p:not(.step-kicker){color:#d0d6e2;font-size:.83rem;line-height:1.55}.basis-card{display:flex;align-items:center;gap:.6rem;padding:.7rem;color:#f1d594;background:#ffffff0a;border:1px solid #e2c58445;border-radius:.65rem;font-size:.75rem}.file-picker{display:block;margin:.75rem 0;padding:.7rem;color:#e8eaf0;border:1px dashed #e2c58488;border-radius:.6rem;cursor:pointer;font-size:.78rem}.file-picker input{display:block;width:100%;margin-top:.5rem;font-size:.7rem}.tutorial-footer{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.75rem 1rem;border-top:1px solid #ffffff18;color:#aeb8ca;font-size:.7rem}.footer-actions{display:flex;align-items:center;gap:.5rem}.primary-action,.secondary-action,.text-action{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;min-height:2.35rem;padding:.5rem .8rem;border-radius:.55rem;font-family:inherit;font-size:.75rem;font-weight:600;line-height:1.2;cursor:pointer}.primary-action{color:#1b2030;background:linear-gradient(135deg,#f0d797,#c9a85f);border:1px solid #f5e5bb}.secondary-action{color:#f1d594;background:#e2c58412;border:1px solid #e2c58470}.text-action{color:#e7dcc1;background:transparent;border:1px solid #ffffff2c}.primary-action:disabled,.secondary-action:disabled{opacity:.55;cursor:default}
	@media(max-width:600px){.demo-tutorial{top:auto;bottom:5.25rem;left:.5rem;width:calc(100% - 1rem);max-height:min(70vh,36rem)}.step-list{gap:.1rem;padding:.65rem .7rem}.step{flex-direction:column;align-items:flex-start;font-size:.52rem}.tutorial-body{min-height:10rem;padding:.8rem}.tutorial-footer{padding:.65rem .8rem}}
	@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
</style>
