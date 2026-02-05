<script lang="ts">
// Svelte 5 runes are auto-imported
import Button from "$lib/components/ui/enhanced-bits.svelte";
// TODO: Fix form store exports
// import { createFormStore, type FormOptions } from '$lib/stores/form.svelte';

interface Props {
	// TODO: Fix FormOptions type
	options?: any;
	class?: string;
	novalidate?: boolean;
	autocomplete?: "on" | "off";
	submitText?: string;
	submitVariant?: "primary" | "secondary" | "outline" | "danger" | "success" | "warning" | "info" | "nier";
	showSubmitButton?: boolean;
	submitFullWidth?: boolean;
	resetText?: string;
	showResetButton?: boolean;
	loading?: boolean;
	formApi?: any;
	onsubmit?: (_event: {
		values: { [key: string]: any },
		isValid: boolean
	}) => void;
	onreset?: () => void;
	onchange?: (_event: {
		values: { [key: string]: any }
	}) => void;
	children?: any;
}

let {
	children,
	options = {},
	submitText = "Submit",
	submitVariant = "primary",
	showSubmitButton = true,
	submitFullWidth = false,
	resetText = "Reset",
	showResetButton = false,
	loading = false,
	formApi = $bindable(),
	onsubmit,
	onreset,
	onchange,
	...restProps
}: Props = $props();

// Mock form store until createFormStore is fixed
// Reactive state values (must be declared at top level)
let values = $state<Record<string, any>>({});
let errors = $state<Record<string, string>>({});
let isValid = $state(true);
let isDirty = $state(false);
let isSubmitting = $state(false);
let submitCount = $state(0);

// Form object with methods and reactive getters
const form = {
	get values() { return values; },
	set values(v) { values = v; },
	get errors() { return errors; },
	set errors(e) { errors = e; },
	get isValid() { return isValid; },
	set isValid(v) { isValid = v; },
	get isDirty() { return isDirty; },
	set isDirty(d) { isDirty = d; },
	get isSubmitting() { return isSubmitting; },
	set isSubmitting(s) { isSubmitting = s; },
	get submitCount() { return submitCount; },
	set submitCount(c) { submitCount = c; },

	setField: (_field: string, _value: any) => {},
	touchField: (_field: string) => {},
	validate: async () => true,
	submit: async () => {
		isSubmitting = true;
		submitCount++;
		try {
			await onsubmit?.({ values, isValid });
			if ((options as any).onSubmit) await (options as any).onSubmit(values);
			return true;
		} finally {
			isSubmitting = false;
		}
	},
	reset: () => {
		values = {};
		errors = {};
		isDirty = false;
	},
	addField: (_field: string) => {},
	removeField: (_field: string) => {}
};
// Subscribe to form values for change events using $effect
$effect(() => {
	if (form.isDirty) {
		onchange?.({ values: form.values });
	}
});

async function handleSubmit(_event: SubmitEvent): Promise<any> {
	_event.preventDefault();
	const isValid = await form.submit();
	if (!isValid) {
		// TODO: Fix notifications.error method
		console.error(
			"Form validation failed",
        "Please correct the errors and try again."
      );
	}
}

function handleReset() { form.reset(); onreset?.(); }

// Update formApi when form changes using $effect
$effect(() => {
	if (formApi !== undefined) {
		formApi = {
			setField: form.setField,
			touchField: form.touchField,
			validate: form.validate,
			submit: form.submit,
			reset: form.reset,
			addField: form.addField,
			removeField: form.removeField,
			values: form.values,
			errors: form.errors
		};
	}
});
</script>

<form
	onsubmit={handleSubmit}
	onreset={handleReset}
	class={`space-y-6 ${restProps?.class ?? ''}`}
	novalidate={restProps.novalidate}
	autocomplete={restProps.autocomplete}
	{...restProps}
>
	<!-- Form content -->
	{@render children?.({
		form,
		formApi,
		values: form.values,
		errors: form.errors,
		isValid: form.isValid,
		isDirty: form.isDirty
	})}

	<!-- Form actions -->
	{#if showSubmitButton || showResetButton}
		<div class="flex gap-3">
			{#if showResetButton}
				<Button
					type="reset"
					variant="secondary"
					disabled={!form.isDirty || form.isSubmitting || loading}
					class={submitFullWidth ? "w-full" : ""}
				>
					{resetText}
				</Button>
			{/if}
			{#if showSubmitButton}
				<Button
					type="submit"
					variant={submitVariant as any}
					disabled={!form.isValid || form.isSubmitting || loading}
					class={submitFullWidth ? "w-full" : ""}
				>
					{submitText}
				</Button>
			{/if}
		</div>
	{/if}

	<!-- Form status -->
	{#if form.submitCount > 0 && Object.keys(form.errors).length > 0}
		<div class="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md">
			<div class="flex items-start">
				<div class="text-red-600 dark:text-red-400 mr-2">⚠️</div>
				<div class="flex-1">
					<h3 class="text-sm font-medium text-red-800 dark:text-red-200">
						Please correct the following errors:
					</h3>
					<ul class="text-sm text-red-700 dark:text-red-300 ml-4 list-disc">
						{#each Object.entries(form.errors) as [field, error]}
							<li>{error}</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	{/if}
</form>





