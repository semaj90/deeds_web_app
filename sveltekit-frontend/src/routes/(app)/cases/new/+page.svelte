<script lang="ts">
	import { superForm } from 'sveltekit-superforms/client';
	import { goto } from '$app/navigation';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { intakeCaseSchema } from './schema.js';
	import type { PageData } from './$types';
	import LegalCaseForm from '$lib/components/forms/LegalCaseForm.svelte';
	import EnhancedCaseForm from '$lib/components/forms/EnhancedCaseForm.svelte';
	import AutoPopulatedCaseForm from '$lib/components/ui/AutoPopulatedCaseForm.svelte';
	import { toast } from 'svelte-sonner';

	let { data }: { data: PageData } = $props();

	// Superforms v2 — case creation form with Zod validation
	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting, delayed } = superForm(data.form, {
		validators: zodClient(intakeCaseSchema as any),
		resetForm: false,
		invalidateAll: false,
		onResult({ result }) {
			if (result.type === 'redirect') {
				toast.success('Case created successfully');
			}
		}
	});

	// AI extraction state
	let analyzing = $state(false);
	let analysisError = $state<string | null>(null);
	let extraction = $state<{
		suggestedTitle: string | null;
		primaryStatute?: string | null;
		severityLevel?: number | null;
		persons: Array<{
			fullName: string;
			role: 'suspect' | 'victim' | 'witness' | 'other';
			riskLevel?: 'low' | 'medium' | 'high';
			notes?: string;
		}>;
	} | null>(null);

	// Evidence file upload
	let uploadedFiles = $state<File[]>([]);
	let formMode = $state<'ai' | 'multistep' | 'enhanced' | 'autofill'>('ai');

	// Map severity level to priority
	function severityToPriority(level: number | null | undefined): string {
		if (!level) return 'medium';
		if (level >= 5) return 'critical';
		if (level >= 4) return 'high';
		if (level >= 3) return 'medium';
		return 'low';
	}

	// AI-powered analysis: sends WHO/WHAT/WHY/HOW to Gemma4-Legal
	async function analyzeWithAI() {
		if (!$form.narrative?.trim() && !$form.what?.trim()) {
			analysisError = 'Describe what happened first (narrative or "What" field).';
			return;
		}

		analyzing = true;
		analysisError = null;

		try {
			const formData = new FormData();
			formData.append('narrative', $form.narrative ?? '');
			formData.append('who', $form.who ?? '');
			formData.append('what', $form.what ?? '');
			formData.append('when', $form.when ?? '');
			formData.append('where', $form.where ?? '');
			formData.append('why', $form.why ?? '');
			formData.append('how', $form.how ?? '');

			const res = await fetch('?/analyze', {
				method: 'POST',
				body: formData
			});

			const result = await res.json();

			if (result.type === 'failure') {
				analysisError =
					result.data?.analysisError ?? 'AI analysis failed. Create the case manually.';
				return;
			}

			// Handle SvelteKit action response format
			const actionResult = result.data;
			if (actionResult?.extraction) {
				extraction = actionResult.extraction;

				// Auto-populate title from AI suggestion
				if (extraction?.suggestedTitle && !$form.title) {
					$form.title = extraction.suggestedTitle;
				}

				// Auto-populate priority from severity level
				if (extraction?.severityLevel) {
					$form.priority = severityToPriority(extraction.severityLevel) as any;
				}
			}
		} catch {
			analysisError = 'Network error. Is the server running?';
		} finally {
			analyzing = false;
		}
	}

	function acceptTitle() {
		if (extraction?.suggestedTitle) {
			$form.title = extraction.suggestedTitle;
		}
	}

	// File handling
	function handleFileDrop(e: DragEvent) {
		e.preventDefault();
		const files = e.dataTransfer?.files;
		if (files) {
			uploadedFiles = [...uploadedFiles, ...Array.from(files)];
		}
	}

	function removeFile(index: number) {
		uploadedFiles = uploadedFiles.filter((_, i) => i !== index);
	}

	const roleColors: Record<string, string> = {
		suspect: '#dc2626',
		victim: '#c8a84b',
		witness: '#60a5fa',
		other: '#9ca3af'
	};
</script>

<div class="intake-container">
	<header class="intake-header">
		<h1>New Case Intake</h1>
		<p>Describe what happened. AI will extract persons, charges, and structure a prosecutable case.</p>
	</header>

	<div class="form-mode-toggle">
		<button class="toggle-btn" class:active={formMode === 'ai'} onclick={() => (formMode = 'ai')}>AI Intake</button>
		<button class="toggle-btn" class:active={formMode === 'multistep'} onclick={() => (formMode = 'multistep')}>Multi-Step Form</button>
		<button class="toggle-btn" class:active={formMode === 'enhanced'} onclick={() => (formMode = 'enhanced')}>Enhanced Form</button>
		<button class="toggle-btn" class:active={formMode === 'autofill'} onclick={() => (formMode = 'autofill')}>AI Auto-Fill</button>
	</div>

	{#if formMode === 'autofill'}
		<div class="multi-step-container">
			<AutoPopulatedCaseForm
				onSubmit={async (formData) => {
					try {
						const res = await fetch('/api/cases', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								title: [formData.plaintiff, formData.defendant].filter(Boolean).join(' v. ') || 'Untitled Case',
								description: formData.summary ?? '',
								status: 'open',
								priority: 'medium',
							})
						});
						const data = await res.json();
						if (res.ok && data.case?.id) goto('/cases/' + data.case.id);
						else toast.error(data.error ?? 'Failed to create case');
					} catch {
						toast.error('Failed to create case');
					}
				}}
				onFieldChange={() => {}}
				editable={true}
			/>
		</div>
	{:else if formMode === 'multistep'}
		<div class="multi-step-container">
			<LegalCaseForm />
		</div>
	{:else if formMode === 'enhanced'}
		<div class="multi-step-container">
			<EnhancedCaseForm user={{ id: data.user?.id ?? '', name: data.user?.username ?? data.user?.email ?? '' }} />
		</div>
	{:else}
	<div class="intake-layout">
		<!-- Left: Intake Form -->
		<form method="POST" action="?/create" use:enhance class="intake-form">
			<!-- Case Title -->
			<div class="form-section">
				<label for="title">
					<h2>Case Title <span class="required">*</span></h2>
					<p>Short, descriptive title for this case.</p>
				</label>
				<input
					id="title"
					name="title"
					type="text"
					bind:value={$form.title}
					placeholder="State v. Doe — Armed Robbery at 7-Eleven"
					class="title-input"
					aria-invalid={$errors.title ? 'true' : undefined}
				/>
				{#if $errors.title}
					<p class="field-error">{$errors.title}</p>
				{/if}
			</div>

			<!-- Main narrative -->
			<div class="form-section">
				<label for="narrative">
					<h2>What Happened?</h2>
					<p>Describe the incident in your own words. Include people, dates, locations, key events.</p>
				</label>
				<textarea
					id="narrative"
					name="narrative"
					bind:value={$form.narrative}
					placeholder="On March 15, 2024, Officer Smith responded to a robbery at 7-Eleven on Main St..."
					rows="8"
					class="narrative-box"
				></textarea>

				<!-- File upload -->
				<div
					class="file-drop-zone"
					onclick={() => document.getElementById('file-upload-input')?.click()}
					ondrop={handleFileDrop}
					ondragover={(e) => e.preventDefault()}
					role="button"
					tabindex="0"
					onkeydown={(e) =>
						e.key === 'Enter' || e.key === ' '
							? document.getElementById('file-upload-input')?.click()
							: null}
				>
					<p>Drop evidence files here (PDFs, photos, audio, video)</p>
					<input
						id="file-upload-input"
						type="file"
						multiple
						onchange={(e) => {
							const files = (e.target as HTMLInputElement).files;
							if (files) uploadedFiles = [...uploadedFiles, ...Array.from(files)];
						}}
						class="file-input"
					/>
				</div>

				{#if uploadedFiles.length > 0}
					<div class="uploaded-files">
						<h3>Attached Files ({uploadedFiles.length})</h3>
						<ul>
							{#each uploadedFiles as file, i}
								<li>
									{file.name}
									<button type="button" onclick={() => removeFile(i)}>x</button>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>

			<!-- Guided W-prompts -->
			<div class="form-section guided-prompts">
				<h2>Guided Questions</h2>
				<p>Answer these to help AI structure the case:</p>

				<div class="prompt-group">
					<label for="who"><strong>WHO</strong> — Who is involved?</label>
					<input id="who" name="who" type="text" bind:value={$form.who}
						placeholder="Suspect: John Doe. Victim: Jane Smith. Witness: Officer Johnson." />
				</div>

				<div class="prompt-group">
					<label for="what"><strong>WHAT</strong> — What happened?</label>
					<input id="what" name="what" type="text" bind:value={$form.what}
						placeholder="Armed robbery of convenience store" />
				</div>

				<div class="prompt-group">
					<label for="when"><strong>WHEN</strong> — When did it happen?</label>
					<input id="when" name="when" type="text" bind:value={$form.when}
						placeholder="March 15, 2024, approximately 11:30 PM" />
				</div>

				<div class="prompt-group">
					<label for="where"><strong>WHERE</strong> — Where did it happen?</label>
					<input id="where" name="where" type="text" bind:value={$form.where}
						placeholder="7-Eleven, 456 Main St, Springfield" />
				</div>

				<div class="prompt-group">
					<label for="why"><strong>WHY</strong> — Why is this conduct criminal?</label>
					<input id="why" name="why" type="text" bind:value={$form.why}
						placeholder="Suspect needed money for drug habit" />
				</div>

				<div class="prompt-group">
					<label for="how"><strong>HOW</strong> — How did the suspect act?</label>
					<input id="how" name="how" type="text" bind:value={$form.how}
						placeholder="Displayed firearm, demanded cash, fled in vehicle" />
				</div>
			</div>

			<!-- Priority -->
			<div class="form-section">
				<label for="priority"><strong>Priority</strong></label>
				<select id="priority" name="priority" bind:value={$form.priority} class="priority-select">
					<option value="low">Low</option>
					<option value="medium">Medium</option>
					<option value="high">High</option>
					<option value="critical">Critical</option>
					<option value="urgent">Urgent</option>
				</select>
			</div>

			<!-- AI Analyze Button -->
			<div class="ai-section">
				<button type="button" onclick={analyzeWithAI} disabled={analyzing} class="btn-analyze">
					{analyzing ? 'Analyzing with Gemma4-Legal...' : 'Analyze with AI'}
				</button>
				<p class="ai-hint">Extracts persons of interest, suggests title, identifies statutes and severity.</p>
				{#if analysisError}
					<p class="field-error">{analysisError}</p>
				{/if}
			</div>

			<!-- Submit -->
			<div class="form-actions">
				<button type="submit" disabled={$submitting} class="btn-submit">
					{$submitting ? 'Creating case...' : 'Create Case'}
				</button>
				{#if $delayed}
					<p class="loading-hint">Processing your request...</p>
				{/if}
			</div>
		</form>

		<!-- Right: AI Extraction Results -->
		<aside class="extraction-panel">
			<h2>AI Extraction</h2>

			{#if extraction}
				{#if extraction.suggestedTitle}
					<div class="extraction-card">
						<h3>Suggested Title</h3>
						<p class="suggested-title">{extraction.suggestedTitle}</p>
						<button type="button" onclick={acceptTitle} class="btn-accept">Use this title</button>
					</div>
				{/if}

				{#if extraction.primaryStatute || extraction.severityLevel}
					<div class="extraction-card">
						<h3>Legal Classification</h3>
						{#if extraction.primaryStatute}
							<p><strong>Statute:</strong> {extraction.primaryStatute}</p>
						{/if}
						{#if extraction.severityLevel}
							<p>
								<strong>Severity:</strong>
								<span class="severity-badge severity-{extraction.severityLevel}">
									{extraction.severityLevel}/5
								</span>
							</p>
						{/if}
					</div>
				{/if}

				{#if extraction.persons.length > 0}
					<div class="extraction-card">
						<h3>Persons of Interest ({extraction.persons.length})</h3>
						<div class="persons-list">
							{#each extraction.persons as person}
								<div class="person-card">
									<div class="person-header">
										<span class="person-name">{person.fullName}</span>
										<span class="person-role"
											style="background: {roleColors[person.role] ?? '#9ca3af'}20; color: {roleColors[person.role] ?? '#9ca3af'}">
											{person.role}
										</span>
									</div>
									{#if person.riskLevel}
										<span class="risk-badge risk-{person.riskLevel}">{person.riskLevel} risk</span>
									{/if}
									{#if person.notes}
										<p class="person-notes">{person.notes}</p>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{:else if analyzing}
				<div class="extraction-placeholder">
					<div class="spinner"></div>
					<p>Gemma4-Legal is analyzing your intake...</p>
				</div>
			{:else}
				<div class="extraction-placeholder">
					<p class="placeholder-icon">&#9878;</p>
					<p>Fill in the narrative and guided questions, then click "Analyze with AI" to extract
						persons, charges, and legal structure.</p>
				</div>
			{/if}

			{#if data.recentCases?.length > 0}
				<div class="recent-cases">
					<h3>Recent Cases</h3>
					{#each data.recentCases as c}
						<a href="/cases/{c.id}/overview" class="recent-case-link">
							<span class="case-number">{c.caseNumber ?? '—'}</span>
							<span class="case-title">{c.title}</span>
						</a>
					{/each}
				</div>
			{/if}
		</aside>
	</div>
	{/if}
</div>

<style>
	.form-mode-toggle {
		max-width: 1200px;
		margin: 0 auto 1.5rem;
		display: flex;
		gap: 4px;
		border-bottom: 2px solid var(--yorha-border, #4a4a4a);
	}
	.toggle-btn {
		padding: 0.5rem 1.5rem;
		border-radius: 4px 4px 0 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--yorha-text-muted, #888);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: all 0.15s;
	}
	.toggle-btn:hover {
		color: var(--yorha-ink, #d4c7a3);
	}
	.toggle-btn.active {
		border-bottom: 2px solid var(--yorha-crimson, #dc2626);
		color: var(--yorha-crimson, #dc2626);
	}
	.multi-step-container {
		max-width: 1200px;
		margin: 0 auto;
	}

	.intake-container {
		min-height: 100vh;
		padding: 2rem 2.5rem;
		margin: -2.5rem;
		background: var(--yorha-bg, #1a1a1a);
		color: var(--yorha-ink, #d4c7a3);
	}
	.intake-container :global(h1), .intake-container :global(h2), .intake-container :global(h3), .intake-container :global(h4), .intake-container :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
	.intake-container :global(a) { color: inherit; border-bottom: none; }
	.intake-container :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
	.intake-container :global(input), .intake-container :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
	.intake-container :global(.panel), .intake-container :global(.card), .intake-container :global([class*="panel"]) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

	.intake-header {
		max-width: 1200px;
		margin: 0 auto 2rem;
		border-bottom: 3px solid var(--yorha-crimson, #dc2626);
		padding-bottom: 1rem;
	}

	.intake-header h1 {
		margin: 0;
		font-size: 2rem;
		color: var(--yorha-crimson, #dc2626);
	}

	.intake-header p {
		margin: 0.5rem 0 0;
		color: var(--yorha-text-muted, #888);
		font-size: 0.875rem;
	}

	.intake-layout {
		max-width: 1200px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: 1fr 360px;
		gap: 2rem;
	}

	.intake-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-section {
		background: var(--yorha-paper, #2a2a2a);
		border: 2px solid var(--yorha-border, #4a4a4a);
		border-radius: 4px;
		padding: 1.5rem;
	}

	.form-section h2 {
		margin: 0 0 0.25rem;
		font-size: 1.15rem;
	}

	.form-section p {
		margin: 0 0 1rem;
		color: var(--yorha-text-muted, #888);
		font-size: 0.825rem;
	}

	.required { color: var(--yorha-crimson, #dc2626); }

	.title-input, .narrative-box, .priority-select {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--yorha-border, #4a4a4a);
		border-radius: 3px;
		font-family: inherit;
		font-size: 0.95rem;
		background: var(--yorha-bg, #1a1a1a);
		color: var(--yorha-ink, #d4c7a3);
	}

	.title-input:focus, .narrative-box:focus, .priority-select:focus {
		outline: none;
		border-color: var(--yorha-accent, #c8a84b);
	}

	.narrative-box { resize: vertical; line-height: 1.6; }

	.file-drop-zone {
		margin-top: 1rem;
		padding: 2rem;
		border: 2px dashed var(--yorha-border, #4a4a4a);
		border-radius: 4px;
		text-align: center;
		background: var(--yorha-bg, #1a1a1a);
		cursor: pointer;
		transition: all 0.2s;
	}

	.file-drop-zone:hover { border-color: var(--yorha-accent, #c8a84b); }
	.file-drop-zone p { margin: 0; color: var(--yorha-text-muted, #888); }
	.file-input { display: none; }

	.uploaded-files {
		margin-top: 1rem;
		padding: 1rem;
		background: var(--yorha-bg, #1a1a1a);
		border-radius: 3px;
	}

	.uploaded-files h3 { margin: 0 0 0.5rem; font-size: 0.9rem; }
	.uploaded-files ul { list-style: none; padding: 0; margin: 0; }

	.uploaded-files li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem;
		background: var(--yorha-paper, #2a2a2a);
		border-radius: 3px;
		margin-bottom: 0.5rem;
		font-size: 0.85rem;
	}

	.uploaded-files button {
		background: none;
		border: none;
		color: var(--yorha-crimson, #dc2626);
		cursor: pointer;
		font-weight: bold;
	}

	.guided-prompts { background: var(--yorha-paper, #2a2a2a); }

	.prompt-group { margin-bottom: 1rem; }

	.prompt-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
	}

	.prompt-group strong { color: var(--yorha-crimson, #dc2626); }

	.prompt-group input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--yorha-border, #4a4a4a);
		border-radius: 3px;
		font-family: inherit;
		font-size: 0.9rem;
		background: var(--yorha-bg, #1a1a1a);
		color: var(--yorha-ink, #d4c7a3);
	}

	.prompt-group input:focus {
		outline: none;
		border-color: var(--yorha-accent, #c8a84b);
	}

	.ai-section { text-align: center; padding: 1rem; }

	.btn-analyze {
		padding: 0.75rem 2rem;
		background: var(--yorha-accent, #c8a84b);
		color: var(--yorha-bg, #1a1a1a);
		border: none;
		border-radius: 3px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-analyze:hover:not(:disabled) { filter: brightness(1.15); }
	.btn-analyze:disabled { opacity: 0.6; cursor: not-allowed; }

	.ai-hint {
		margin-top: 0.5rem;
		font-size: 0.75rem;
		color: var(--yorha-text-muted, #888);
	}

	.field-error {
		color: var(--yorha-crimson, #dc2626);
		font-size: 0.8rem;
		margin: 0.25rem 0 0;
	}

	.form-actions { text-align: center; }

	.btn-submit {
		padding: 1rem 2.5rem;
		background: var(--yorha-crimson, #dc2626);
		color: white;
		border: none;
		border-radius: 3px;
		font-size: 1.1rem;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-submit:hover:not(:disabled) { filter: brightness(1.1); }
	.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }

	.loading-hint {
		margin-top: 0.5rem;
		font-size: 0.8rem;
		color: var(--yorha-text-muted, #888);
	}

	.extraction-panel {
		position: sticky;
		top: 2rem;
		align-self: start;
	}

	.extraction-panel h2 {
		margin: 0 0 1rem;
		font-size: 1.15rem;
		color: var(--yorha-accent, #c8a84b);
		border-bottom: 2px solid var(--yorha-accent, #c8a84b);
		padding-bottom: 0.5rem;
	}

	.extraction-card {
		background: var(--yorha-paper, #2a2a2a);
		border: 1px solid var(--yorha-border, #4a4a4a);
		border-radius: 4px;
		padding: 1rem;
		margin-bottom: 1rem;
	}

	.extraction-card h3 {
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
	}

	.suggested-title {
		font-style: italic;
		color: var(--yorha-accent, #c8a84b);
		margin: 0 0 0.75rem;
	}

	.btn-accept {
		padding: 0.375rem 0.75rem;
		background: var(--yorha-accent, #c8a84b);
		color: var(--yorha-bg, #1a1a1a);
		border: none;
		border-radius: 2px;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}

	.severity-badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 2px;
		font-weight: 600;
		font-size: 0.8rem;
	}

	.severity-1, .severity-2 { background: rgba(74,222,128,0.15); color: #4ade80; }
	.severity-3 { background: rgba(250,204,21,0.15); color: #facc15; }
	.severity-4 { background: rgba(251,146,60,0.15); color: #fb923c; }
	.severity-5 { background: rgba(248,113,113,0.15); color: #f87171; }

	.persons-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.person-card {
		padding: 0.75rem;
		background: var(--yorha-bg, #1a1a1a);
		border: 1px solid var(--yorha-border, #4a4a4a);
		border-radius: 3px;
	}

	.person-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.35rem;
	}

	.person-name { font-weight: 600; font-size: 0.9rem; }

	.person-role {
		padding: 0.15rem 0.5rem;
		border-radius: 2px;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.risk-badge {
		display: inline-block;
		padding: 0.1rem 0.4rem;
		border-radius: 2px;
		font-size: 0.7rem;
		font-weight: 600;
	}

	.risk-low { background: rgba(74,222,128,0.15); color: #4ade80; }
	.risk-medium { background: rgba(250,204,21,0.15); color: #facc15; }
	.risk-high { background: rgba(248,113,113,0.15); color: #f87171; }

	.person-notes {
		margin: 0.35rem 0 0;
		font-size: 0.8rem;
		color: var(--yorha-text-muted, #888);
	}

	.extraction-placeholder {
		text-align: center;
		padding: 2rem 1rem;
		color: var(--yorha-text-muted, #888);
	}

	.placeholder-icon { font-size: 2.5rem; margin: 0 0 0.5rem; }

	.spinner {
		width: 24px;
		height: 24px;
		border: 3px solid var(--yorha-border, #4a4a4a);
		border-top-color: var(--yorha-accent, #c8a84b);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto 0.75rem;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.recent-cases {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--yorha-border, #4a4a4a);
	}

	.recent-cases h3 {
		margin: 0 0 0.75rem;
		font-size: 0.85rem;
		color: var(--yorha-text-muted, #888);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.recent-case-link {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		text-decoration: none;
		color: var(--yorha-ink, #d4c7a3);
		border-radius: 3px;
		transition: background 0.15s;
	}

	.recent-case-link:hover { background: var(--yorha-paper, #2a2a2a); }
	.case-number { font-family: monospace; font-size: 0.75rem; color: var(--yorha-text-muted, #888); min-width: 80px; }
	.case-title { font-size: 0.85rem; }

	@media (max-width: 900px) {
		.intake-layout { grid-template-columns: 1fr; }
		.extraction-panel { position: static; }
	}
</style>
