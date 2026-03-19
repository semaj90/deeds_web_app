<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fade, fly } from 'svelte/transition';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PoiImageUpload from './PoiImageUpload.svelte';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	let formData = $state({
		name: '',
		alias: '',
		dateOfBirth: '',
		address: '',
		status: 'person_of_interest',
		threatLevel: 'low',
		description: '',
	});
	let tempPoiId = $state('');
	let createdPoiName = $state('');
	let loading = $state(false);
	let message = $state('');
	let messageType = $state<'success' | 'error'>('success');
	let step = $state<'form' | 'photo'>('form');

	const statuses = [
		{ value: 'person_of_interest', label: 'Person of Interest', icon: 'eye' },
		{ value: 'witness', label: 'Witness', icon: 'message-circle' },
		{ value: 'suspect', label: 'Suspect', icon: 'shield-alert' },
		{ value: 'victim', label: 'Victim', icon: 'heart' },
		{ value: 'informant', label: 'Informant', icon: 'info' },
	];

	const threatLevels = [
		{ value: 'low', label: 'Low', color: '#10b981' },
		{ value: 'medium', label: 'Medium', color: '#f59e0b' },
		{ value: 'high', label: 'High', color: '#ef4444' },
		{ value: 'critical', label: 'Critical', color: '#dc2626' },
	];

	async function handleSubmit() {
		try {
			loading = true;
			message = '';

			const response = await fetch('/api/poi', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData)
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ message: 'Failed to create POI' }));
				throw new Error(errorData.message || 'An unknown error occurred.');
			}

			const createdPoi = await response.json();
			tempPoiId = createdPoi.id;
			createdPoiName = formData.name;
			message = `${formData.name} registered successfully.`;
			messageType = 'success';
			step = 'photo';
		} catch (err) {
			message = err instanceof Error ? err.message : 'Failed to create POI';
			messageType = 'error';
		} finally {
			loading = false;
		}
	}

	function resetAndClose() {
		formData = { name: '', alias: '', dateOfBirth: '', address: '', status: 'person_of_interest', threatLevel: 'low', description: '' };
		tempPoiId = '';
		createdPoiName = '';
		message = '';
		step = 'form';
		open = false;
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
		<Dialog.Content forceMount>
			{#snippet child({ props, open: isOpen })}
				{#if isOpen}
					<div {...props} class="modal-panel" transition:fly={{ y: 24, duration: 300 }}>
						<!-- Header -->
						<div class="modal-header">
							<div class="modal-header-icon">
								<Icon name="user-plus" size={18} />
							</div>
							<div>
								<Dialog.Title class="modal-title">Register Person of Interest</Dialog.Title>
								<Dialog.Description class="modal-desc">
									{step === 'form' ? 'Enter profile details to register a new individual.' : `Upload a photo for ${createdPoiName}.`}
								</Dialog.Description>
							</div>
							<Dialog.Close class="modal-close">
								<Icon name="x" size={18} />
							</Dialog.Close>
						</div>

						<!-- Feedback -->
						{#if message}
							<div class="modal-msg {messageType}" transition:fly={{ y: -8, duration: 200 }}>
								<Icon name={messageType === 'success' ? 'circle-check' : 'circle-alert'} size={16} />
								{message}
							</div>
						{/if}

						{#if step === 'form'}
							<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="modal-body">
								<!-- Name + Alias row -->
								<div class="form-row">
									<div class="form-field">
										<label class="form-label">Full Name <span class="required">*</span></label>
										<input type="text" bind:value={formData.name} required class="form-input" placeholder="e.g. John Doe" />
									</div>
									<div class="form-field">
										<label class="form-label">Alias / Known As</label>
										<input type="text" bind:value={formData.alias} class="form-input" placeholder="e.g. JD, Johnny" />
									</div>
								</div>

								<!-- Status + Threat Level -->
								<div class="form-row">
									<div class="form-field">
										<label class="form-label">Classification</label>
										<div class="chip-group">
											{#each statuses as s}
												<button type="button" class="chip" class:chip-active={formData.status === s.value} onclick={() => formData.status = s.value}>
													<Icon name={s.icon} size={13} />
													{s.label}
												</button>
											{/each}
										</div>
									</div>
								</div>

								<div class="form-row">
									<div class="form-field">
										<label class="form-label">Threat Assessment</label>
										<div class="threat-selector">
											{#each threatLevels as t}
												<button type="button" class="threat-chip" class:active={formData.threatLevel === t.value} style="--tc: {t.color}" onclick={() => formData.threatLevel = t.value}>
													{t.label}
												</button>
											{/each}
										</div>
									</div>
									<div class="form-field">
										<label class="form-label">Date of Birth</label>
										<input type="date" bind:value={formData.dateOfBirth} class="form-input" />
									</div>
								</div>

								<!-- Description -->
								<div class="form-field">
									<label class="form-label">Description / Notes</label>
									<textarea bind:value={formData.description} rows={3} class="form-input form-textarea" placeholder="Physical description, known associates, notes..."></textarea>
								</div>

								<!-- Address -->
								<div class="form-field">
									<label class="form-label">Last Known Address</label>
									<input type="text" bind:value={formData.address} class="form-input" placeholder="123 Main St, City, State" />
								</div>

								<!-- Actions -->
								<div class="modal-footer">
									<button type="button" class="btn-secondary" onclick={resetAndClose}>Cancel</button>
									<button type="submit" class="btn-primary" disabled={loading || !formData.name.trim()}>
										{#if loading}
											<span class="spinner"></span> Registering...
										{:else}
											<Icon name="user-plus" size={15} /> Register Person
										{/if}
									</button>
								</div>
							</form>
						{:else}
							<!-- Photo upload step -->
							<div class="modal-body">
								<div class="success-banner">
									<Icon name="circle-check" size={20} />
									<span><strong>{createdPoiName}</strong> has been registered. Add a photo to complete the profile.</span>
								</div>
								<PoiImageUpload poiId={tempPoiId} poiName={createdPoiName} />
								<div class="modal-footer">
									<button type="button" class="btn-secondary" onclick={resetAndClose}>
										<Icon name="skip-forward" size={14} /> Skip & Close
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
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 1200;
		width: 95%;
		max-width: 640px;
		max-height: 90vh;
		overflow-y: auto;
		background: #fff;
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
		padding: 1.5rem 1.5rem 0;
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
		font-size: 0.8rem;
		color: #6b7280;
		margin: 0.2rem 0 0;
	}

	.modal-close {
		margin-left: auto;
		background: none;
		border: none;
		color: #9ca3af;
		padding: 6px;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s;
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
		font-size: 0.8rem;
		font-weight: 500;
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
		padding: 1.25rem 1.5rem 1.5rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-bottom: 0.75rem;
	}

	.form-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: #374151;
		letter-spacing: 0.02em;
	}

	.required {
		color: #ef4444;
	}

	.form-input {
		padding: 0.625rem 0.875rem;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		font-size: 0.85rem;
		color: #1f2937;
		background: #fafafa;
		transition: all 0.2s;
		font-family: inherit;
	}

	.form-input:focus {
		outline: none;
		border-color: #667eea;
		background: #fff;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.12);
	}

	.form-textarea {
		resize: vertical;
		min-height: 72px;
	}

	/* Chip selectors */
	.chip-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.75rem;
		border: 1px solid #e5e7eb;
		border-radius: 20px;
		font-size: 0.7rem;
		font-weight: 600;
		color: #6b7280;
		background: #fff;
		cursor: pointer;
		transition: all 0.15s;
		font-family: inherit;
	}

	.chip:hover {
		border-color: #667eea;
		color: #667eea;
	}

	.chip-active {
		background: #667eea;
		border-color: #667eea;
		color: #fff;
	}

	.threat-selector {
		display: flex;
		gap: 0.375rem;
	}

	.threat-chip {
		flex: 1;
		padding: 0.5rem;
		border: 1.5px solid #e5e7eb;
		border-radius: 8px;
		font-size: 0.7rem;
		font-weight: 700;
		color: #6b7280;
		background: #fff;
		cursor: pointer;
		transition: all 0.15s;
		text-align: center;
		font-family: inherit;
		letter-spacing: 0.03em;
	}

	.threat-chip:hover {
		border-color: var(--tc);
		color: var(--tc);
	}

	.threat-chip.active {
		border-color: var(--tc);
		background: var(--tc);
		color: #fff;
		box-shadow: 0 2px 8px color-mix(in srgb, var(--tc) 30%, transparent);
	}

	/* Footer */
	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding-top: 1.25rem;
		border-top: 1px solid #f3f4f6;
		margin-top: 0.5rem;
	}

	.btn-primary,
	.btn-secondary {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.65rem 1.25rem;
		font-size: 0.8rem;
		font-weight: 600;
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.2s;
		font-family: inherit;
		border: none;
	}

	.btn-primary {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: #fff;
		box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
	}

	.btn-primary:hover:not(:disabled) {
		box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);
		transform: translateY(-1px);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.btn-secondary {
		background: #f3f4f6;
		color: #374151;
		border: 1px solid #e5e7eb;
	}

	.btn-secondary:hover {
		background: #e5e7eb;
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
		font-size: 0.85rem;
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

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	@media (max-width: 640px) {
		.form-row {
			grid-template-columns: 1fr;
		}
	}
</style>
