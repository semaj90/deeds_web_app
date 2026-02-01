<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { CaseTheoryPlan } from '$lib/types/case-theory';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

	type FormState = {
		caseName: string;
	caseId: string;
		summary: string;
	objectives: string;
		charges: string;
	keyFacts: string;
		contestedFacts: string;
	defenseAngles: string;
		narrativeBeats: string;
	keyEvidence: string;
		witnessNotes: string;
	legalIssues: string;
		tone: string;
	audience: string;
		deliverables: Record<string, boolean>;
	};

	const form = $state<FormState>({
		caseName: '',
		caseId: '',
		summary: '',
		objectives: '',
		charges: '',
		keyFacts: '',
		contestedFacts: '',
		defenseAngles: '',
		narrativeBeats: '',
		keyEvidence: '',
		witnessNotes: '',
		legalIssues: '',
		tone: 'trial-ready, confident, ethical',
		audience: 'jury + judge',
		deliverables: {
	closingOutline: true,
			storyAngles: true,
			juryFocus: true,
			investigativeGaps: false,
			pressTalkingPoints: false
		}
	});

	const dispatch = createEventDispatcher<{ generated: {
	plan: CaseTheoryPlan } }>();

	let isSubmitting = $state(false);
	let plan = $state<CaseTheoryPlan | null>(null);
	let rawOutput = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);

	const deliverableOptions = [
		{ key: 'closingOutline', label: 'Closing Outline' },
	{ key: 'storyAngles', label: 'Narrative Hooks' },
	{ key: 'juryFocus', label: 'Jury Focus' },
	{ key: 'investigativeGaps', label: 'Investigative Gaps' },
	{ key: 'pressTalkingPoints', label: 'Press Brief' }
	];

	function listFromInput(value: string): string[] {
		return value
			.split(/\r?\n/)
			.map((entry) => entry.trim())
			.filter(Boolean);
	}

	function evidenceFromInput(value: string) {
		return listFromInput(value).map((entry, idx) => {
			const [label, purpose] = entry.split(' - ');
			return {
				label: label?.trim() ?? `Evidence ${idx + 1}`,
				purpose: purpose?.trim() ?? ''
			};
		});
	}

	function witnessFromInput(value: string) {
		return listFromInput(value).map((entry) => {
			const [name, angle] = entry.split(' - ');
			return {
				name: name?.trim() ?? entry,
				angle: angle?.trim() ?? ''
			};
		});
	}

	function selectedDeliverables(): string[] {
		return Object.entries(form.deliverables)
			.filter(([, enabled]) => enabled)
			.map(([key]) => key);
	}

	async function buildTheory() {
		if (!form.summary.trim()) {
			errorMessage = 'Provide a concise case summary before generating.';
			return;
		}

		errorMessage = null;
		isSubmitting = true;
		plan = null;
		rawOutput = null;

		try {
			const response = await fetch('/api/case-theory', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	caseId: form.caseId || undefined,
					caseName: form.caseName || undefined,
					summary: form.summary,
					prosecutionGoals: form.objectives,
					charges: listFromInput(form.charges),
					keyFacts: listFromInput(form.keyFacts),
					contestedFacts: listFromInput(form.contestedFacts),
					defenseAngles: listFromInput(form.defenseAngles),
					narrativeBeats: listFromInput(form.narrativeBeats),
					keyEvidence: evidenceFromInput(form.keyEvidence),
					witnessProfiles: witnessFromInput(form.witnessNotes),
					legalIssues: listFromInput(form.legalIssues),
					deliverables: selectedDeliverables(),
					tone: form.tone,
					preferredAudience: form.audience
				})
			});

			const data = await response.json();
			if (!response.ok || !data?.success) {
				throw new Error(data?.error ?? 'Failed to construct case theory');
			}

			plan = data.plan as CaseTheoryPlan;
			rawOutput = data.raw ?? null;
			dispatch('generated', { plan });
		} catch (error) {
			console.error(error);
			errorMessage = 'Unable to generate theory right now.';
		} finally {
			isSubmitting = false;
		}
	}

	function toggleDeliverable(key: string) {
		form.deliverables[key] = !form.deliverables[key];
	}

	function exportPlan() {
		if (!plan) return;
		const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${form.caseName || 'case'}-theory.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
</script>

<section class="case-theory-wrapper">
 <header class="panel nes-container is-dark">
 <div>
 <p class="title">Case Theory Constructor</p>
 <p class="muted">Phoenix-Pro strategy builder powered by Gemma3-Legal</p>
 </div>
 <button class="nes-btn is-primary" onclick={buildTheory} disabled={isSubmitting}>
 {isSubmitting ? 'Synthesizing…' : 'Generate Theory'}
 </button>
 </header>

 <div class="grid">
 <div class="stack">
 <article class="nes-container is-dark card">
 <h3>Case Frame</h3>
 <div class="grid-2">
 <label>
 <span>Case Name</span>
 <input class="nes-input" bind:value={form.caseName} placeholder="State v. Doe" />
 </label>
 <label>
 <span>Case ID</span>
 <input class="nes-input" bind:value={form.caseId} placeholder="2025-CR-4221" />
 </label>
 </div>
 <label>
 <span>Summary</span>
 <textarea
 class="nes-textarea"
 rows={4} bind:value={form.summary}
 placeholder="Concise narrative of what happened. Include timeline anchor, harm, defendant role."
 ></textarea>
 </label>
 <label>
 <span>Objectives</span>
 <textarea
 class="nes-textarea"
 rows={3} bind:value={form.objectives}
 placeholder="What must the prosecution prove or protect?"
 ></textarea>
 </label>
 <div class="grid-2">
 <label>
 <span>Tone</span>
 <input class="nes-input" bind:value={form.tone} />
 </label>
 <label>
 <span>Audience</span>
 <input class="nes-input" bind:value={form.audience} />
 </label>
 </div>
 </article>

 <article class="nes-container is-dark card">
 <h3>Fact Matrix</h3>
 <div class="grid-2">
 <label>
 <span>Charges</span>
 <textarea
 class="nes-textarea"
 rows={3} bind:value={form.charges}
 placeholder="One per line"
 ></textarea>
 </label>
 <label>
 <span>Key Facts (favorable)</span>
 <textarea class="nes-textarea" rows={3} bind:value={form.keyFacts}></textarea>
 </label>
 </div>

 <div class="grid-2">
 <label>
 <span>Contested / Unknown Facts</span>
 <textarea class="nes-textarea" rows={3} bind:value={form.contestedFacts}></textarea>
 </label>
 <label>
 <span>Expected Defense Angles</span>
 <textarea class="nes-textarea" rows={3} bind:value={form.defenseAngles}></textarea>
 </label>
 </div>

 <label>
 <span>Narrative Beats Jury Must Feel</span>
 <textarea class="nes-textarea" rows={3} bind:value={form.narrativeBeats}></textarea>
 </label>
 </article>

 <article class="nes-container is-dark card">
 <h3>Evidence & Witness Anchors</h3>
 <div class="grid-2">
 <label>
 <span>Key Evidence (Label - Usage)</span>
 <textarea class="nes-textarea" rows={4} bind:value={form.keyEvidence}></textarea>
 </label>
 <label>
 <span>Witness Profiles (Name - Angle)</span>
 <textarea class="nes-textarea" rows={4} bind:value={form.witnessNotes}></textarea>
 </label>
 </div>
 <label>
 <span>Legal Constraints / Issues</span>
 <textarea class="nes-textarea" rows={3} bind:value={form.legalIssues}></textarea>
 </label>
 </article>

 <article class="nes-container is-dark card">
 <h3>Deliverables</h3>
 <div class="deliverables">
 {#each deliverableOptions as option}
 <label class="deliverable-chip">
 <input
 type="checkbox"
 checked={form.deliverables[option.key]}
 onchange={() => toggleDeliverable(option.key)}
 />
 <span>{option.label}</span>
 </label>
 {/each}
 </div>
 {#if errorMessage}
 <p class="error-text">{errorMessage}</p>
 {/if}
 </article>
 </div>

 <aside class="nes-container is-dark results">
 {#if plan}
 <div class="results-stack">
 <section>
 <h3>Master Theory</h3>
 <p>{plan.masterTheory}</p>
 <div class="frame">{plan.prosecutionFrame}</div>
 </section>

 {#if plan.supportingPillars.length}
 <section>
 <h4>Supporting Pillars</h4>
 <div class="pillars">
 {#each plan.supportingPillars as pillar (pillar.title)}
 <div class="pillar">
 <p class="label">{pillar.title}</p>
 <p>{pillar.summary}</p>
 {#if pillar.proofPoints?.length}
 <ul>
 {#each pillar.proofPoints as proof (proof)}
 <li>{proof}</li>
 {/each}
 </ul>
 {/if}
 </div>
 {/each}
 </div>
 </section>
 {/if}

 {#if plan.themes.length}
 <section>
 <h4>Themes</h4>
 <div class="chips">
 {#each plan.themes as theme (theme)}
 <span>{theme}</span>
 {/each}
 </div>
 </section>
 {/if}

 {#if plan.storyBeats.length}
 <section>
 <h4>Story Beats</h4>
 <div class="beats">
 {#each plan.storyBeats as beat (beat.phase + beat.objective)}
 <div class="beat">
 <p class="label">{beat.phase}</p>
 <p class="objective">{beat.objective}</p>
 <p class="leverage">{beat.leverage}</p>
 {#if beat.proof?.length}
 <small>{beat.proof.join(', ')}</small>
 {/if}
 </div>
 {/each}
 </div>
 </section>
 {/if}

 {#if plan.evidencePlan.length}
 <section>
 <h4>Exhibit Plan</h4>
 <div class="table">
 {#each plan.evidencePlan as evidence (evidence.id)}
 <div class="row">
 <span>{evidence.id}</span>
 <div>
 <p class="label">{evidence.title}</p>
 <p>{evidence.usage}</p>
 {#if evidence.admissibility}
 <small>{evidence.admissibility}</small>
 {/if}
 </div>
 </div>
 {/each}
 </div>
 </section>
 {/if}

 {#if plan.witnessPlan.length}
 <section>
 <h4>Witness Plan</h4>
 <div class="table">
 {#each plan.witnessPlan as witness (witness.name)}
 <div class="row">
 <span>{witness.role ?? 'Witness'}</span>
 <div>
 <p class="label">{witness.name}</p>
 <p>{witness.purpose}</p>
 {#if witness.hooks?.length}
 <small>{witness.hooks.join(' / ')}</small>
 {/if}
 </div>
 </div>
 {/each}
 </div>
 </section>
 {/if}

 {#if plan.riskMatrix.length}
 <section>
 <h4>Risk Matrix</h4>
 <div class="table">
 {#each plan.riskMatrix as risk (risk.risk + risk.mitigation)}
 <div class="row">
 <span class={`severity ${risk.severity}`}>{risk.severity}</span>
 <div>
 <p class="label">{risk.risk}</p>
 <p>{risk.mitigation}</p>
 </div>
 </div>
 {/each}
 </div>
 </section>
 {/if}

 {#if plan.defenseCounters.length}
 <section>
 <h4>Defense Counters</h4>
 <ul class="list">
 {#each plan.defenseCounters as counter (counter)}
 <li>{counter}</li>
 {/each}
 </ul>
 </section>
 {/if}

 {#if plan.actionItems.length}
 <section>
 <h4>Action Items</h4>
 <ul class="list">
 {#each plan.actionItems as item (item)}
 <li>{item}</li>
 {/each}
 </ul>
 </section>
 {/if}

 {#if Object.keys(plan.deliverables).length}
 <section>
 <h4>Deliverables</h4>
 <div class="deliverable-output">
 {#each Object.entries(plan.deliverables) as [key, content]}
 <article>
 <p class="label">{key}</p>
 <p>{content}</p>
 </article>
 {/each}
 </div>
 </section>
 {/if}

 <div class="results-actions">
 <button class="nes-btn is-success" onclick={exportPlan}>Export JSON</button>
 {#if rawOutput}
 <details>
 <summary>Raw Output</summary>
 <pre>{rawOutput}</pre>
 </details>
 {/if}
 </div>
 </div>
 {:else}
 <div class="placeholder">
 <p class="emoji">⚖️</p>
 <p class="muted">
 Fill in the left-hand panels and hit "Generate Theory" to spin up Phoenix-Pro guidance.
 </p>
 </div>
 {/if}
 </aside>
 </div>
</section>

<style>
 .case-theory-wrapper {
 min-height: 100vh;
	padding: 1.5rem;
 display: flex;
 flex-direction: column;
	gap: 1.5rem;
 background: radial-gradient(circle at top, #0f172a, #020617);
 color: #e2e8f0;
 }

 .panel {
 display: flex;
 justify-content: space-between;
 align-items: center;
 border-radius: 1rem;
 }

 .title {
 margin: 0;
 font-size: 1.35rem;
 }

 .muted {
 margin: 0.3rem 0 0;
 color: #94a3b8;
 }

 .grid {
 display: grid;
 grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
 gap: 1.25rem;
 }

 .stack {
 display: flex;
 flex-direction: column;
	gap: 1.25rem;
 }

 .card {
 border-radius: 1rem;
	padding: 1.25rem;
 border: 1px solid rgba(148, 163, 184, 0.25);
 display: flex;
 flex-direction: column;
	gap: 1rem;
 }

 .card h3 {
 margin: 0;
	color: #e0f2fe;
 }

 label {
 display: flex;
 flex-direction: column;
	gap: 0.35rem;
 font-size: 0.85rem;
	color: #cbd5f5;
 }

 textarea,
 input {
 background: rgba(15, 23, 42, 0.8);
 border-color: rgba(148, 163, 184, 0.35);
 color: #f8fafc;
 }

 .grid-2 {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
 gap: 1rem;
 }

 .deliverables {
 display: flex;
 flex-wrap: wrap;
	gap: 0.75rem;
 }

 .deliverable-chip {
 display: inline-flex;
 align-items: center;
	gap: 0.5rem;
 padding: 0.4rem 0.8rem;
 background: rgba(255, 255, 255, 0.05);
 border-radius: 999px;
	border: 1px dashed rgba(148, 163, 184, 0.4);
 cursor: pointer;
 font-size: 0.85rem;
 }

 .results {
 border-radius: 1rem;
	padding: 1.25rem;
 border: 1px solid rgba(59, 130, 246, 0.35);
 background: rgba(2, 6, 23, 0.85);
 }

 .results-stack {
 display: flex;
 flex-direction: column;
	gap: 1.25rem;
 }

 .results h3,
 .results h4 {
 margin: 0 0 0.35rem;
 color: #f8fafc;
 }

 .frame {
 margin-top: 0.5rem;
	padding: 0.75rem;
 border-radius: 0.75rem;
	background: rgba(15, 23, 42, 0.7);
 border: 1px solid rgba(148, 163, 184, 0.25);
 }

 .pillars {
 display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }

 .pillar {
 padding: 0.75rem;
 border-radius: 0.75rem;
	background: rgba(15, 23, 42, 0.8);
 border: 1px solid rgba(148, 163, 184, 0.25);
 }

 .pillar .label {
 font-weight: 600;
	color: #bae6fd;
 margin-bottom: 0.25rem;
 }

 .pillar ul {
 margin: 0.35rem 0 0;
 padding-left: 1.1rem;
	color: #cbd5f5;
 }

 .chips {
 display: flex;
 flex-wrap: wrap;
	gap: 0.5rem;
 }

 .chips span {
 padding: 0.25rem 0.75rem;
 border-radius: 999px;
	background: rgba(14, 165, 233, 0.12);
 border: 1px solid rgba(14, 165, 233, 0.35);
 font-size: 0.8rem;
 }

 .beats {
 display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }

 .beat {
 padding: 0.75rem;
 border-radius: 0.75rem;
	background: rgba(15, 23, 42, 0.8);
 border: 1px solid rgba(148, 163, 184, 0.25);
 }

 .beat .label {
 text-transform: uppercase;
 font-size: 0.7rem;
 letter-spacing: 0.08em;
	color: #facc15;
 }

 .beat .objective {
 margin: 0.25rem 0;
 font-weight: 600;
 }

 .beat .leverage {
 color: #cbd5f5;
 }

 .table {
 display: flex;
 flex-direction: column;
	gap: 0.65rem;
 }

 .row {
 display: flex;
	gap: 0.75rem;
 padding: 0.65rem;
 border-radius: 0.75rem;
	background: rgba(15, 23, 42, 0.85);
 border: 1px solid rgba(148, 163, 184, 0.2);
 }

 .row span {
 font-size: 0.85rem;
	color: #f8fafc;
 min-width: 70px;
 }

 .row .label {
 font-weight: 600;
	color: #bae6fd;
 }

 .severity {
 text-transform: uppercase;
 font-size: 0.7rem;
 letter-spacing: 0.1em;
 }

 .severity.low {
 color: #4ade80;
 }
 .severity.medium {
 color: #facc15;
 }
 .severity.high {
 color: #f87171;
 }

 .list {
 margin: 0;
 padding-left: 1.25rem;
	color: #cbd5f5;
 display: flex;
 flex-direction: column;
	gap: 0.35rem;
 }

 .deliverable-output {
 display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }

 .deliverable-output article {
 padding: 0.75rem;
 border-radius: 0.75rem;
	background: rgba(15, 23, 42, 0.8);
 border: 1px solid rgba(148, 163, 184, 0.2);
 }

 .deliverable-output .label {
 text-transform: uppercase;
 font-size: 0.7rem;
 letter-spacing: 0.08em;
	color: #a5b4fc;
 margin-bottom: 0.35rem;
 }

 .results-actions {
 display: flex;
	gap: 1rem;
 align-items: center;
 }

 .results pre {
 max-height: 220px;
 overflow-y: auto;
	background: rgba(15, 23, 42, 0.8);
 padding: 0.75rem;
 border-radius: 0.75rem;
	border: 1px solid rgba(148, 163, 184, 0.25);
 }

 .placeholder {
 min-height: 400px;
	display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
	gap: 0.5rem;
 text-align: center;
 }

 .emoji {
 font-size: 2.75rem;
	margin: 0;
 }

 .error-text {
 color: #f87171;
 }

 @media (max-width: 1100px) {
 .grid {
 grid-template-columns: 1fr;
 }
 }
</style>




