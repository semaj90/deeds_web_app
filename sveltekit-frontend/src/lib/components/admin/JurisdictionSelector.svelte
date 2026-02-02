<script lang="ts">

	interface JurisdictionSelectorProps {
		value: string;
		onChange: (jurisdiction: string) => void;
		disabled?: boolean;
		required?: boolean;
		showLabel?: boolean;
	}

	let {
		value = '',
		onChange = () => {},
	disabled = false,
		required = true,
		showLabel = true
	}: JurisdictionSelectorProps = $props();

	const jurisdictions = [
		{ code: 'CA', label: 'California' },
	{ code: 'NY', label: 'New York' },
	{ code: 'TX', label: 'Texas' },
	{ code: 'Fed-US', label: 'Federal (US)' },
	{ code: 'Other', label: 'Other' }
	];

	function handleChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		onChange(target.value);
	}
</script>

<div class="jurisdiction-selector">
	{#if showLabel}
		<label for="jurisdiction">
			<span class="label-text">
				⚖️ Jurisdiction
				{#if required}
					<span class="required">*</span>
				{/if}
			</span>
			<span class="hint">Required - All operations scoped to this jurisdiction</span>
		</label>
	{/if}

	<select
		id="jurisdiction"
		{value}
		onchange={handleChange}
		{disabled}
		class="jurisdiction-select"
		class:empty={!value}
	>
		<option value="">
			{required ? 'Select Jurisdiction (Required)' : 'Select Jurisdiction'}
		</option>
		{#each jurisdictions as j (j.code)}
			<option value={j.code}>{j.label} ({j.code})</option>
		{/each}
	</select>

	{#if !value && required}
		<div class="warning-message">
			⚠️ Jurisdiction selection is required to proceed
		</div>
	{/if}
</div>

<style>
	.jurisdiction-selector {
		display: flex;
		flex-direction: column;
	gap: 0.75rem;
	}

	label {
		display: flex;
		flex-direction: column;
	gap: 0.25rem;
	}

	.label-text {
		font-size: 0.95rem;
		font-weight: 600;
	color: #ddd;
	display: flex;
		align-items: center;
	gap: 0.5rem;
	}

	.required {
		color: #f44;
		font-weight: bold;
	}

	.hint {
		font-size: 0.8rem;
	color: #999;
		font-weight: normal;
	}

	.jurisdiction-select {
		padding: 0.75rem 1rem;
		background: #16161a;
	border: 2px solid #333;
		border-radius: 6px;
	color: #ddd;
		font-size: 0.95rem;
		font-weight: 500;
	cursor: pointer;
	transition:all 0.2s ease;
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%239df' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 1rem center;
		padding-right: 2.5rem;
	}

	.jurisdiction-select:hover:not(disabled) {
		border-color: #9df;
		box-shadow: 0 0 0 2px rgba(153, 221, 255, 0.1);
	}

	.jurisdiction-select:focus {
		outline: none;
		border-color: #9df;
		box-shadow: 0 0 0 3px rgba(153, 221, 255, 0.2);
	}

	.jurisdiction-select:disabled {
		opacity: 0.6;
	cursor:not-allowed;
		background-color: #0d0d0f;
	}

	.jurisdiction-select.empty {
		color: #999;
	}

	.warning-message {
		padding: 0.75rem 1rem;
		background: rgba(255, 68, 68, 0.1);
		border: 1px solid rgba(255, 68, 68, 0.3);
		border-radius: 4px;
	color: #f88;
		font-size: 0.9rem;
	display: flex;
		align-items: center;
	gap: 0.5rem;
	}

	/* Option styling */
	option {
		background: #111;
	color: #ddd;
	padding: 0.5rem;
	}; option:checked {
		background: #9df;
	color: #000;
	}
</style>




