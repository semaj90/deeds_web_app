<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fade, fly } from 'svelte/transition';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PoiImageUpload from './PoiImageUpload.svelte';
	import {
		POI_INTAKE_FIELD_MAX_CHARS,
		parsePoiIntakeText,
		validatePoiIntakeFile,
		type PoiIntakeFields,
	} from './poi-intake-text';

	interface Props {
		open?: boolean;
		/** Case this person is being added to. When set, the new record is linked to it. */
		caseId?: string | null;
		caseTitle?: string | null;
		oncreated?: (poi: { id: string; name: string }) => void;
	}

	let { open = $bindable(false), caseId = null, caseTitle = null, oncreated }: Props = $props();

	type FormKey = 'name' | 'alias' | 'who' | 'what' | 'why' | 'how' | 'description';

	const emptyForm = () => ({
		name: '',
		alias: '',
		dateOfBirth: '',
		address: '',
		classification: 'person_of_interest',
		threatLevel: 'low',
		description: '',
		who: '',
		what: '',
		why: '',
		how: '',
	});

	let formData = $state(emptyForm());
	let tempPoiId = $state('');
	let createdPoiName = $state('');
	let loading = $state(false);
	let message = $state('');
	let messageType = $state<'success' | 'error'>('success');
	let step = $state<'form' | 'photo'>('form');
	let nameError = $state('');
	let confirmDiscard = $state(false);

	// Intake note import state
	let intakeFileName = $state('');
	let intakeNote = $state('');
	let intakeNoteType = $state<'success' | 'error'>('success');
	let importedKeys = $state<FormKey[]>([]);
	/** Fields the file had text for but the analyst had already typed in; kept until they choose to replace. */
	let keptKeys = $state<FormKey[]>([]);
	let lastImport: Record<FormKey, string> | null = null;
	let dragActive = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let nameInput = $state<HTMLInputElement | null>(null);

	const statuses = [
		{ value: 'person_of_interest', label: 'Person of Interest', icon: 'eye' },
		{ value: 'witness', label: 'Witness', icon: 'message-circle' },
		{ value: 'suspect', label: 'Suspect', icon: 'shield-alert' },
		{ value: 'victim', label: 'Victim', icon: 'heart' },
		{ value: 'informant', label: 'Informant', icon: 'info' },
	];

	const threatLevels = [
		{ value: 'low', label: 'Low', color: '#047857' },
		{ value: 'medium', label: 'Medium', color: '#b45309' },
		{ value: 'high', label: 'High', color: '#dc2626' },
		{ value: 'critical', label: 'Critical', color: '#991b1b' },
	];

	const questions: Array<{ key: 'who' | 'what' | 'why' | 'how'; label: string; hint: string }> = [
		{ key: 'who', label: 'Who', hint: 'Who is this person in relation to the case?' },
		{ key: 'what', label: 'What', hint: 'What are they believed to have done or seen?' },
		{ key: 'why', label: 'Why', hint: 'Why are they of interest? Possible motive.' },
		{ key: 'how', label: 'How', hint: 'How did it happen? Method or means.' },
	];

	const FIELD_LABELS: Record<FormKey, string> = {
		name: 'Name',
		alias: 'Alias',
		who: 'Who',
		what: 'What',
		why: 'Why',
		how: 'How',
		description: 'Description',
	};
	const IMPORT_ORDER: FormKey[] = ['name', 'alias', 'who', 'what', 'why', 'how', 'description'];

	const isDirty = $derived.by(() => {
		const blank = emptyForm();
		return (Object.keys(blank) as Array<keyof typeof blank>).some((key) => formData[key] !== blank[key]);
	});

	function toFormValues(fields: PoiIntakeFields): Record<FormKey, string> {
		return {
			name: fields.name,
			alias: fields.aliases.join(', '),
			who: fields.who,
			what: fields.what,
			why: fields.why,
			how: fields.how,
			description: fields.description,
		};
	}

	const listLabels = (keys: FormKey[]) => keys.map((key) => FIELD_LABELS[key]).join(', ');

	/** Read a dropped or chosen .txt file in the browser and fill the form from it. Nothing is uploaded. */
	async function importIntakeFile(file: File | null | undefined) {
		if (!file) return;
		const problem = validatePoiIntakeFile(file);
		if (problem) {
			intakeNote = problem;
			intakeNoteType = 'error';
			return;
		}
		try {
			const { fields, filled, truncated } = parsePoiIntakeText(await file.text());
			if (filled.length === 0) {
				intakeNote = 'No text was found in that file.';
				intakeNoteType = 'error';
				return;
			}
			const values = toFormValues(fields);
			const applied: FormKey[] = [];
			const kept: FormKey[] = [];
			for (const key of IMPORT_ORDER) {
				if (!values[key]) continue;
				// Never overwrite what the analyst already typed; offer it as an explicit choice instead.
				if (formData[key].trim() && formData[key] !== values[key] && !importedKeys.includes(key)) {
					kept.push(key);
					continue;
				}
				formData[key] = values[key];
				applied.push(key);
			}
			lastImport = values;
			intakeFileName = file.name;
			importedKeys = applied;
			keptKeys = kept;
			if (applied.includes('name')) nameError = '';
			intakeNote =
				(applied.length ? `Filled ${listLabels(applied)}.` : 'Nothing was filled.') +
				(kept.length ? ` Kept your text in ${listLabels(kept)}.` : '') +
				(truncated ? ' Some text was cut to 5,000 characters.' : '') +
				' Review before saving.';
			intakeNoteType = 'success';
		} catch {
			intakeNote = 'That file could not be read as text.';
			intakeNoteType = 'error';
		}
	}

	function replaceKeptWithFile() {
		if (!lastImport) return;
		for (const key of keptKeys) formData[key] = lastImport[key];
		importedKeys = [...importedKeys, ...keptKeys];
		intakeNote = `Replaced ${listLabels(keptKeys)} with the file's text. Review before saving.`;
		keptKeys = [];
	}

	function clearImported() {
		for (const key of importedKeys) {
			if (lastImport && formData[key] === lastImport[key]) formData[key] = '';
		}
		importedKeys = [];
		keptKeys = [];
		lastImport = null;
		intakeFileName = '';
		intakeNote = 'Imported text removed.';
		intakeNoteType = 'success';
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
		void importIntakeFile(event.dataTransfer?.files?.[0]);
	}

	function handleDragOver(event: DragEvent) {
		if (!event.dataTransfer?.types?.includes('Files')) return;
		event.preventDefault();
		dragActive = true;
	}

	async function handleSubmit() {
		if (!formData.name.trim()) {
			nameError = 'Enter a name to register this person.';
			nameInput?.focus();
			return;
		}
		try {
			loading = true;
			message = '';
			nameError = '';

			const response = await fetch('/api/persons-of-interest', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: formData.name.trim(),
					description: formData.description,
					threatLevel: formData.threatLevel,
					// "Classification" is the person's role in the case; the record status keeps its server default.
					relationship: formData.classification,
					aliases: formData.alias.split(',').map((alias) => alias.trim()).filter(Boolean),
					who: formData.who,
					what: formData.what,
					why: formData.why,
					how: formData.how,
					intakeSource: intakeFileName ? 'txt_import' : 'manual',
					...(intakeFileName ? { intakeFileName } : {}),
					...(formData.dateOfBirth ? { dateOfBirth: formData.dateOfBirth } : {}),
					...(formData.address.trim() ? { address: formData.address.trim() } : {}),
					...(caseId ? { caseId } : {}),
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ error: 'Failed to create POI' }));
				throw new Error(errorData.error || errorData.message || 'An unknown error occurred.');
			}

			const createdPoi = await response.json();
			tempPoiId = createdPoi.id;
			createdPoiName = formData.name.trim();
			message = `${createdPoiName} registered successfully.`;
			messageType = 'success';
			step = 'photo';
			oncreated?.({ id: createdPoi.id, name: createdPoiName });
		} catch (err) {
			message = err instanceof Error ? err.message : 'Failed to create POI';
			messageType = 'error';
		} finally {
			loading = false;
		}
	}

	function resetAndClose() {
		formData = emptyForm();
		tempPoiId = '';
		createdPoiName = '';
		message = '';
		nameError = '';
		confirmDiscard = false;
		intakeFileName = '';
		intakeNote = '';
		importedKeys = [];
		keptKeys = [];
		lastImport = null;
		dragActive = false;
		step = 'form';
		open = false;
	}

	/** Close, unless the analyst has unsaved text: then ask first instead of silently discarding it. */
	function requestClose() {
		if (loading) return;
		if (step === 'form' && isDirty) {
			confirmDiscard = true;
			return;
		}
		resetAndClose();
	}

	function guardDismiss(event: Event) {
		if (loading || (step === 'form' && isDirty)) {
			event.preventDefault();
			if (!loading) confirmDiscard = true;
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) resetAndClose(); }}>
	<Dialog.Portal>
		<Dialog.Overlay forceMount>
			{#snippet child({ props, open: isOpen })}
				{#if isOpen}
					<div {...props} class="modal-backdrop" transition:fade={{ duration: 200 }}></div>
				{/if}
			{/snippet}
		</Dialog.Overlay>
		<Dialog.Content
			forceMount
			onEscapeKeydown={guardDismiss}
			onInteractOutside={guardDismiss}
			onOpenAutoFocus={(e) => { e.preventDefault(); nameInput?.focus(); }}
		>
			{#snippet child({ props, open: isOpen })}
				{#if isOpen}
					<div {...props} class="modal-panel" transition:fly={{ y: 24, duration: 300 }}>
						<!-- Header -->
						<div class="modal-header">
							<div class="modal-header-icon" aria-hidden="true">
								<Icon name="user-plus" size={18} />
							</div>
							<div class="modal-heading">
								<Dialog.Title class="modal-title">Register Person of Interest</Dialog.Title>
								<Dialog.Description class="modal-desc">
									{step === 'form' ? 'Enter the details, or drop a .txt intake note to fill them in.' : `Upload a photo for ${createdPoiName}.`}
								</Dialog.Description>
							</div>
							<button type="button" class="modal-close" aria-label="Close" onclick={requestClose}>
								<Icon name="x" size={18} />
							</button>
						</div>

						<!-- Feedback -->
						{#if message}
							<div class="modal-msg {messageType}" role={messageType === 'error' ? 'alert' : 'status'} transition:fly={{ y: -8, duration: 200 }}>
								<Icon name={messageType === 'success' ? 'circle-check' : 'circle-alert'} size={16} />
								{message}
							</div>
						{/if}

						{#if step === 'form'}
							<form
								novalidate
								class="modal-body"
								class:drag-active={dragActive}
								onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}
								ondragover={handleDragOver}
								ondragleave={(e) => { if (e.currentTarget === e.target) dragActive = false; }}
								ondrop={handleDrop}
							>
								{#if caseId}
									<p class="case-link-note">
										<Icon name="folder" size={14} />
										<span>This person will be linked to {caseTitle ? `case “${caseTitle}”` : 'the current case'}.</span>
									</p>
								{/if}

								<!-- Intake note -->
								<section class="form-section" aria-labelledby="poi-sec-intake">
									<h3 id="poi-sec-intake" class="section-title">Intake note <span class="optional">optional</span></h3>
									<button
										type="button"
										class="intake-drop"
										class:intake-drop-active={dragActive}
										aria-describedby="poi-intake-help"
										onclick={() => fileInput?.click()}
									>
										<Icon name={intakeFileName ? 'file-check' : 'file-text'} size={20} />
										<span class="intake-drop-text">
											{#if intakeFileName}
												<strong>{intakeFileName}</strong>
												<span>Drop another file to import again.</span>
											{:else}
												<strong>Drop a .txt file anywhere on this form</strong>
												<span>or click to choose one.</span>
											{/if}
										</span>
									</button>
									<input
										bind:this={fileInput}
										type="file"
										accept=".txt,text/plain"
										class="visually-hidden"
										tabindex="-1"
										aria-hidden="true"
										onchange={(e) => { const input = e.currentTarget; void importIntakeFile(input.files?.[0]); input.value = ''; }}
									/>
									<p id="poi-intake-help" class="help-text">
										Lines starting with Name, Alias, Who, What, Why or How fill the matching fields. The file is read on this device and is not uploaded.
									</p>
									{#if intakeNote}
										<div class="intake-note {intakeNoteType}" role="status" aria-live="polite">
											<span>{intakeNote}</span>
											{#if keptKeys.length}
												<button type="button" class="link-btn" onclick={replaceKeptWithFile}>Replace with file text</button>
											{/if}
											{#if importedKeys.length}
												<button type="button" class="link-btn" onclick={clearImported}>Remove imported text</button>
											{/if}
										</div>
									{/if}
								</section>

								<!-- Identity -->
								<section class="form-section" aria-labelledby="poi-sec-identity">
									<h3 id="poi-sec-identity" class="section-title">Identity</h3>
									<div class="form-row">
										<div class="form-field">
											<label for="poi-name" class="form-label">
												Full name <span class="required" aria-hidden="true">*</span>
												{#if importedKeys.includes('name')}<span class="from-file">from file</span>{/if}
											</label>
											<input
												id="poi-name"
												type="text"
												bind:this={nameInput}
												bind:value={formData.name}
												required
												maxlength={500}
												autocomplete="off"
												aria-required="true"
												aria-invalid={nameError ? 'true' : undefined}
												aria-describedby={nameError ? 'poi-name-error' : undefined}
												class="form-input"
												class:input-error={!!nameError}
												placeholder="e.g. John Doe"
												oninput={() => { if (nameError && formData.name.trim()) nameError = ''; }}
											/>
											{#if nameError}
												<p id="poi-name-error" class="field-error">{nameError}</p>
											{/if}
										</div>
										<div class="form-field">
											<label for="poi-alias" class="form-label">
												Alias / known as
												{#if importedKeys.includes('alias')}<span class="from-file">from file</span>{/if}
											</label>
											<input id="poi-alias" type="text" bind:value={formData.alias} autocomplete="off" class="form-input" placeholder="Separate with commas" />
										</div>
									</div>
									<div class="form-row">
										<div class="form-field">
											<label for="poi-dob" class="form-label">Date of birth</label>
											<input id="poi-dob" type="date" bind:value={formData.dateOfBirth} class="form-input" />
										</div>
										<div class="form-field">
											<label for="poi-address" class="form-label">Last known address</label>
											<input id="poi-address" type="text" bind:value={formData.address} maxlength={500} autocomplete="off" class="form-input" placeholder="123 Main St, City, State" />
										</div>
									</div>
								</section>

								<!-- Who / What / Why / How -->
								<section class="form-section" aria-labelledby="poi-sec-narrative">
									<h3 id="poi-sec-narrative" class="section-title">Who, what, why, how</h3>
									<div class="question-grid">
										{#each questions as q (q.key)}
											<div class="form-field">
												<label for={`poi-${q.key}`} class="form-label">
													{q.label}
													{#if importedKeys.includes(q.key)}<span class="from-file">from file</span>{/if}
												</label>
												<textarea
													id={`poi-${q.key}`}
													bind:value={formData[q.key]}
													rows={3}
													maxlength={POI_INTAKE_FIELD_MAX_CHARS}
													aria-describedby={`poi-${q.key}-count`}
													class="form-input form-textarea"
													placeholder={q.hint}
												></textarea>
												<span id={`poi-${q.key}-count`} class="char-count" class:char-count-near={formData[q.key].length > POI_INTAKE_FIELD_MAX_CHARS * 0.9}>
													{formData[q.key].length.toLocaleString()} / {POI_INTAKE_FIELD_MAX_CHARS.toLocaleString()}
												</span>
											</div>
										{/each}
									</div>
								</section>

								<!-- Assessment -->
								<section class="form-section" aria-labelledby="poi-sec-assessment">
									<h3 id="poi-sec-assessment" class="section-title">Assessment</h3>
									<div class="form-field">
										<span id="poi-class-label" class="form-label">Role in the case</span>
										<div class="chip-group" role="radiogroup" aria-labelledby="poi-class-label">
											{#each statuses as s (s.value)}
												<button
													type="button"
													role="radio"
													aria-checked={formData.classification === s.value}
													class="chip"
													class:chip-active={formData.classification === s.value}
													onclick={() => (formData.classification = s.value)}
												>
													<Icon name={s.icon} size={13} />
													{s.label}
												</button>
											{/each}
										</div>
									</div>
									<div class="form-field">
										<span id="poi-threat-label" class="form-label">Threat level</span>
										<div class="threat-selector" role="radiogroup" aria-labelledby="poi-threat-label">
											{#each threatLevels as t (t.value)}
												<button
													type="button"
													role="radio"
													aria-checked={formData.threatLevel === t.value}
													class="threat-chip"
													class:active={formData.threatLevel === t.value}
													style="--tc: {t.color}"
													onclick={() => (formData.threatLevel = t.value)}
												>
													{t.label}
												</button>
											{/each}
										</div>
									</div>
								</section>

								<!-- Notes -->
								<section class="form-section" aria-labelledby="poi-sec-notes">
									<h3 id="poi-sec-notes" class="section-title">Notes</h3>
									<div class="form-field">
										<label for="poi-desc" class="form-label">
											Description
											{#if importedKeys.includes('description')}<span class="from-file">from file</span>{/if}
										</label>
										<textarea id="poi-desc" bind:value={formData.description} rows={3} maxlength={5000} class="form-input form-textarea" placeholder="Physical description, known associates, anything else."></textarea>
									</div>
								</section>

								{#if dragActive}
									<div class="drop-overlay" aria-hidden="true">
										<Icon name="file-text" size={28} />
										<span>Drop the .txt file to fill the form</span>
									</div>
								{/if}

								<!-- Actions -->
								<div class="modal-footer">
									{#if confirmDiscard}
										<p class="discard-text" role="alert">Discard what you have entered?</p>
										<button type="button" class="btn-secondary" onclick={() => (confirmDiscard = false)}>Keep editing</button>
										<button type="button" class="btn-danger" onclick={resetAndClose}>Discard</button>
									{:else}
										<button type="button" class="btn-secondary" onclick={requestClose} disabled={loading}>Cancel</button>
										<button type="submit" class="btn-primary" disabled={loading} aria-busy={loading}>
											{#if loading}
												<span class="spinner" aria-hidden="true"></span> Registering…
											{:else}
												<Icon name="user-plus" size={15} /> Register person
											{/if}
										</button>
									{/if}
								</div>
							</form>
						{:else}
							<!-- Photo upload step -->
							<div class="modal-body">
								<div class="success-banner" role="status">
									<Icon name="circle-check" size={20} />
									<span><strong>{createdPoiName}</strong> has been registered. Add a photo to complete the profile.</span>
								</div>
								<PoiImageUpload poiId={tempPoiId} poiName={createdPoiName} />
								<div class="modal-footer">
									<button type="button" class="btn-secondary" onclick={resetAndClose}>
										<Icon name="skip-forward" size={14} /> Skip for now
									</button>
									<button type="button" class="btn-primary" onclick={resetAndClose}>
										<Icon name="check" size={14} /> Done
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			{/snippet}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 15, 20, 0.55);
		backdrop-filter: blur(4px);
		z-index: 1100;
	}

	.modal-panel {
		--poi-accent: #4f46e5;
		--poi-accent-soft: #eef2ff;
		--poi-text: #1f2937;
		--poi-text-muted: #4b5563;
		--poi-border: #d1d5db;
		--poi-danger: #b91c1c;
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 1200;
		display: flex;
		flex-direction: column;
		width: min(95vw, 720px);
		max-height: min(92vh, 900px);
		overflow: hidden;
		background: #fff;
		color: var(--poi-text);
		border-radius: 16px;
		box-shadow:
			0 24px 48px rgba(0, 0, 0, 0.12),
			0 8px 16px rgba(0, 0, 0, 0.08),
			0 0 0 1px rgba(0, 0, 0, 0.04);
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
		padding: 1.25rem 1.5rem 1rem;
		border-bottom: 1px solid #f3f4f6;
		flex-shrink: 0;
	}

	.modal-heading {
		min-width: 0;
	}

	.modal-header-icon {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	:global(.modal-title) {
		font-size: 1.1rem;
		font-weight: 700;
		color: #1f2937;
		margin: 0;
		letter-spacing: -0.01em;
	}

	:global(.modal-desc) {
		font-size: 0.8125rem;
		color: #4b5563;
		margin: 0.2rem 0 0;
	}

	.modal-close {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 36px;
		min-height: 36px;
		background: none;
		border: none;
		color: #6b7280;
		border-radius: 8px;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.modal-close:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.modal-msg {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1rem 1.5rem 0;
		padding: 0.75rem 1rem;
		border-radius: 10px;
		font-size: 0.8125rem;
		font-weight: 500;
		flex-shrink: 0;
	}

	.modal-msg.success {
		background: #f0fdf4;
		color: #166534;
		border: 1px solid #bbf7d0;
	}

	.modal-msg.error {
		background: #fef2f2;
		color: #991b1b;
		border: 1px solid #fecaca;
	}

	.modal-body {
		position: relative;
		padding: 1.25rem 1.5rem 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.form-section {
		margin-bottom: 1.25rem;
	}

	.section-title {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 0 0 0.625rem;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--poi-text-muted);
	}

	.optional {
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
		color: #6b7280;
	}

	.case-link-note {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 1rem;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		background: var(--poi-accent-soft);
		color: #3730a3;
		font-size: 0.8125rem;
	}

	.intake-drop {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.875rem 1rem;
		border: 2px dashed #9ca3af;
		border-radius: 12px;
		background: #f9fafb;
		color: var(--poi-text-muted);
		font-family: inherit;
		font-size: 0.8125rem;
		text-align: left;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
	}

	.intake-drop:hover,
	.intake-drop-active {
		border-color: var(--poi-accent);
		background: var(--poi-accent-soft);
	}

	.intake-drop-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}

	.intake-drop-text strong {
		color: var(--poi-text);
		overflow-wrap: anywhere;
	}

	.help-text {
		margin: 0.375rem 0 0;
		font-size: 0.75rem;
		color: var(--poi-text-muted);
	}

	.intake-note {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem 0.75rem;
		margin-top: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		font-size: 0.8125rem;
	}

	.intake-note.success {
		background: #f0fdf4;
		color: #166534;
	}

	.intake-note.error {
		background: #fef2f2;
		color: #991b1b;
	}

	.link-btn {
		padding: 0.25rem 0;
		border: none;
		background: none;
		color: var(--poi-accent);
		font: inherit;
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
	}

	.form-row,
	.question-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 1rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-bottom: 0.875rem;
		min-width: 0;
	}

	.form-label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: #374151;
	}

	.required {
		color: var(--poi-danger);
	}

	.from-file {
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		background: var(--poi-accent-soft);
		color: #3730a3;
		font-size: 0.6875rem;
		font-weight: 600;
	}

	.form-input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.625rem 0.875rem;
		border: 1px solid var(--poi-border);
		border-radius: 10px;
		font-size: 0.875rem;
		color: var(--poi-text);
		background: #fff;
		transition: border-color 0.15s, box-shadow 0.15s;
		font-family: inherit;
	}

	.form-input::placeholder {
		color: #6b7280;
	}

	.form-input:focus {
		outline: none;
		border-color: var(--poi-accent);
		box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.2);
	}

	.input-error {
		border-color: var(--poi-danger);
	}

	.field-error {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--poi-danger);
	}

	.form-textarea {
		resize: vertical;
		min-height: 84px;
		line-height: 1.45;
	}

	.char-count {
		align-self: flex-end;
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
		color: #6b7280;
	}

	.char-count-near {
		color: var(--poi-danger);
		font-weight: 600;
	}

	/* Chip selectors */
	.chip-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 36px;
		padding: 0.4rem 0.875rem;
		border: 1px solid var(--poi-border);
		border-radius: 20px;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--poi-text-muted);
		background: #fff;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s, color 0.15s;
		font-family: inherit;
	}

	.chip:hover {
		border-color: var(--poi-accent);
		color: var(--poi-accent);
	}

	.chip-active,
	.chip-active:hover {
		background: var(--poi-accent);
		border-color: var(--poi-accent);
		color: #fff;
	}

	.threat-selector {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
	}

	.threat-chip {
		min-height: 36px;
		padding: 0.5rem;
		border: 1.5px solid var(--poi-border);
		border-radius: 8px;
		font-size: 0.8125rem;
		font-weight: 700;
		color: var(--poi-text-muted);
		background: #fff;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s, color 0.15s;
		text-align: center;
		font-family: inherit;
	}

	.threat-chip:hover {
		border-color: var(--tc);
		color: var(--tc);
	}

	.threat-chip.active,
	.threat-chip.active:hover {
		border-color: var(--tc);
		background: var(--tc);
		color: #fff;
	}

	/* One visible focus ring for every control in the dialog */
	.modal-close:focus-visible,
	.intake-drop:focus-visible,
	.link-btn:focus-visible,
	.chip:focus-visible,
	.threat-chip:focus-visible,
	.btn-primary:focus-visible,
	.btn-secondary:focus-visible,
	.btn-danger:focus-visible {
		outline: 2px solid var(--poi-accent);
		outline-offset: 2px;
	}

	.drop-overlay {
		position: sticky;
		bottom: 5rem;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		margin: 0 0 0.75rem;
		padding: 1rem;
		border: 2px dashed var(--poi-accent);
		border-radius: 12px;
		background: var(--poi-accent-soft);
		color: #3730a3;
		font-size: 0.875rem;
		font-weight: 600;
		pointer-events: none;
	}

	/* Footer stays visible while the form scrolls */
	.modal-footer {
		position: sticky;
		bottom: 0;
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 0 -1.5rem;
		padding: 0.875rem 1.5rem;
		background: #fff;
		border-top: 1px solid #e5e7eb;
	}

	.discard-text {
		margin: 0 auto 0 0;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--poi-danger);
	}

	.btn-primary,
	.btn-secondary,
	.btn-danger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 40px;
		padding: 0.625rem 1.25rem;
		font-size: 0.8125rem;
		font-weight: 600;
		border-radius: 10px;
		cursor: pointer;
		transition: background 0.15s, box-shadow 0.15s;
		font-family: inherit;
		border: none;
	}

	.btn-primary {
		background: var(--poi-accent);
		color: #fff;
		box-shadow: 0 2px 8px rgba(79, 70, 229, 0.3);
	}

	.btn-primary:hover:not(:disabled) {
		background: #4338ca;
	}

	.btn-primary:disabled,
	.btn-secondary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: #f3f4f6;
		color: #374151;
		border: 1px solid var(--poi-border);
	}

	.btn-secondary:hover:not(:disabled) {
		background: #e5e7eb;
	}

	.btn-danger {
		background: var(--poi-danger);
		color: #fff;
	}

	.btn-danger:hover {
		background: #991b1b;
	}

	.success-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 10px;
		color: #166534;
		font-size: 0.875rem;
		margin-bottom: 1.25rem;
	}

	.spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@media (max-width: 640px) {
		.modal-panel {
			width: 100vw;
			max-height: 100dvh;
			height: 100dvh;
			border-radius: 0;
		}

		.modal-header {
			padding: 1rem;
		}

		.modal-body {
			padding: 1rem 1rem 0;
		}

		.modal-footer {
			margin: 0 -1rem;
			padding: 0.75rem 1rem;
		}

		.form-row,
		.question-grid {
			grid-template-columns: 1fr;
		}

		.threat-selector {
			grid-template-columns: repeat(2, 1fr);
		}

		.modal-footer .btn-primary,
		.modal-footer .btn-secondary,
		.modal-footer .btn-danger {
			flex: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 1.8s;
		}

		.modal-close,
		.intake-drop,
		.form-input,
		.chip,
		.threat-chip,
		.btn-primary,
		.btn-secondary,
		.btn-danger {
			transition: none;
		}
	}
</style>
