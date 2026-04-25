/**
 * Form Store - Svelte 5 Runes (Session 30)
 *
 * Generic form state management using $state/$derived.
 * Replaces writable/derived/get pattern with class-based reactive form.
 */

export interface FormField<TValue = unknown> {
	name: string;
	value: TValue;
	error?: string | null;
	touched: boolean;
	required?: boolean;
	validator?: (value: TValue) => string | null;
}

export interface FormOptions<T extends Record<string, unknown>> {
	initialValues?: T;
	validators?: { [K in keyof T]?: (value: T[K]) => string | null };
	requiredFields?: (keyof T)[];
	onSubmit?: (values: T) => Promise<void> | void;
}

class FormStore<T extends Record<string, unknown>> {
	fields = $state<Partial<{ [K in keyof T]: FormField<T[K]> }>>({});
	isSubmitting = $state(false);
	isDirty = $state(false);
	submitCount = $state(0);

	private validators: FormOptions<T>['validators'];
	private requiredFields: (keyof T)[];
	private onSubmit?: (values: T) => Promise<void> | void;
	private initialFields: Partial<{ [K in keyof T]: FormField<T[K]> }>;

	// Derived: current form values
	values = $derived.by(() => {
		const vals = {} as Partial<T>;
		for (const field of Object.values(this.fields) as FormField<unknown>[]) {
			if (field) {
				(vals as any)[field.name] = field.value;
			}
		}
		return vals;
	});

	// Derived: current form errors
	errors = $derived.by(() => {
		const errs: Record<string, string> = {};
		for (const field of Object.values(this.fields) as FormField<unknown>[]) {
			if (field?.error) {
				errs[field.name] = field.error;
			}
		}
		return errs;
	});

	// Derived: is form valid
	isValid = $derived.by(() => {
		for (const field of Object.values(this.fields) as FormField<unknown>[]) {
			if (field?.error) return false;
		}
		return true;
	});

	constructor(options: FormOptions<T> = {}) {
		const {
			initialValues = {} as T,
			validators = {} as FormOptions<T>['validators'],
			requiredFields = [],
			onSubmit,
		} = options;

		this.validators = validators;
		this.requiredFields = requiredFields;
		this.onSubmit = onSubmit;

		// Initialize fields
		const fields: Partial<{ [K in keyof T]: FormField<T[K]> }> = {};
		for (const name of Object.keys(initialValues) as Array<keyof T>) {
			fields[name] = {
				name: name as string,
				value: initialValues[name],
				touched: false,
				required: requiredFields.includes(name),
				validator: validators?.[name],
				error: null,
			};
		}

		// Validate initial fields
		for (const name of Object.keys(fields) as Array<keyof T>) {
			const field = fields[name];
			if (field) {
				field.error = this.validateField(field);
			}
		}

		this.fields = fields;
		this.initialFields = structuredClone(fields);
	}

	private validateField<K extends keyof T>(field: FormField<T[K]>): string | null {
		if (
			field?.required &&
			(field.value === undefined || field.value === null || field.value === '')
		) {
			return `${field.name} is required`;
		}
		if (field.validator) {
			return field.validator(field.value);
		}
		return null;
	}

	setField<K extends keyof T>(name: K, value: T[K]) {
		const existing = this.fields[name] || {
			name: name as string,
			value: '' as T[K],
			touched: false,
			required: this.requiredFields.includes(name),
			validator: this.validators?.[name] as FormField<T[K]>['validator'],
		};

		const updatedField: FormField<T[K]> = { ...existing, value };
		updatedField.error = this.validateField(updatedField);

		this.fields = { ...this.fields, [name]: updatedField };
		this.isDirty = true;
	}

	touchField<K extends keyof T>(name: K) {
		const field = this.fields[name];
		if (field) {
			this.fields = { ...this.fields, [name]: { ...field, touched: true } };
		}
	}

	validate(): boolean {
		const updatedFields = { ...this.fields };
		let valid = true;

		for (const name of Object.keys(updatedFields) as Array<keyof T>) {
			const field = updatedFields[name];
			if (field) {
				const error = this.validateField(field);
				updatedFields[name] = { ...field, error };
				if (error) valid = false;
			}
		}

		this.fields = updatedFields;
		return valid;
	}

	async submit(): Promise<boolean> {
		this.submitCount++;

		// Touch all fields
		const touchedFields = { ...this.fields };
		for (const name of Object.keys(touchedFields) as Array<keyof T>) {
			const field = touchedFields[name];
			if (field) {
				touchedFields[name] = { ...field, touched: true };
			}
		}
		this.fields = touchedFields;

		// Validate
		const canSubmit = this.validate();

		if (canSubmit && this.onSubmit) {
			this.isSubmitting = true;
			try {
				await this.onSubmit(this.values as T);
			} catch (error: any) {
				console.error('Form submission error:', error);
			} finally {
				this.isSubmitting = false;
			}
		}

		return canSubmit;
	}

	reset() {
		this.fields = structuredClone(this.initialFields);
		this.isDirty = false;
		this.isSubmitting = false;
		this.submitCount = 0;
	}

	addField<K extends keyof T>(name: K, initialValue: T[K], isRequired = false) {
		const field: FormField<T[K]> = {
			name: name as string,
			value: initialValue,
			touched: false,
			required: isRequired,
			validator: this.validators?.[name] as FormField<T[K]>['validator'],
			error: null,
		};
		field.error = this.validateField(field);
		this.fields = { ...this.fields, [name]: field };
		this.isDirty = true;
	}
}

export default function createFormStore<T extends Record<string, unknown>>(
	options: FormOptions<T> = {},
) {
	return new FormStore<T>(options);
}

export { FormStore };
