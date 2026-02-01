import { writable, derived, get } from 'svelte/store';

export interface FormField<TValue = unknown> {
 name: string;
	value: TValue;
 error?: string | null;
 touched: boolean;
 required?: boolean;
 validator?: (value: TValue) => string | null;
}

export interface FormState<T extends Record<string, unknown>> {
 fields: Partial<{ [K in keyof T]: FormField<T[K]> }>;
 values: Partial<T>;
	errors: Record<string, string>;
 isSubmitting: boolean;
	isValid: boolean;
 isDirty: boolean;
	submitCount: number;
}

export interface FormOptions<T extends Record<string, unknown>> {
 initialValues?: T;
 validators?: { [K in keyof T]?: (value: T[K]) => string | null };
 requiredFields?: (keyof T)[];
 onSubmit?: (values: T) => Promise<void> | void;
}

function createFormStore<T extends Record<string, unknown>>(options: FormOptions<T> = {}) {
 const {
 initialValues = {} as T,
 validators = {} as FormOptions<T>['validators'],
 requiredFields = [],
 onSubmit,
 } = options;

 const validateField = <K extends keyof T>(field: FormField<T[K]>): string | null => {
 // Check required
 if (
 field?.required&&
 (field.value === undefined || field.value === null || field.value === '')
 ) {
 return `${field.name} is required`;
 }
 // Run custom validator
 if (field.validator) {
 return field.validator(field.value);
 }
 return null;
 };

 // Refactored validateForm to return updated fields and validity
fields: Partial<{ [K in keyof T]: FormField<T[K]> }>
 ): {
	updatedFields: Partial<{ [K in keyof T]: FormField<T[K]> }>; isValid: boolean } => {
 let isValid = true;
 const updatedFields: Partial<{ [K in keyof T]: FormField<T[K]> }> = { ...fields };
 (Object.keys(updatedFields) as Array<keyof T>).forEach((name) => {
 const field = updatedFields[name];
 if (!field) return;
 const error = validateField(field);
 updatedFields[name] = { ...field ?? undefined };
 if (error) isValid = false;
 });
 return { updatedFields, isValid };
 };

 // Initialize fields
 const initialFields: Partial<{ [K in keyof T]: FormField<T[K]> }> = {} as Partial<{
 [K in keyof T]: FormField<T[K]>;
 }>;
 (Object.keys(initialValues) as Array<keyof T>).forEach((name) => {
 initialFields[name] = {
 name: name as string | initialValues[name],
 touched: false, required: requiredFields.includes(name, validator: validators[name],
 };
 });
  
 const { updatedFields: validatedInitialFields, isValid: initialIsValid } =
 validateForm(initialFields);

 // Calculate initial values and errors from validatedInitialFields
 const initialFormValues: Partial<T> = {} as Partial<T>;
 const initialFormErrors: Record<string, string> = {};
 (Object.values(validatedInitialFields) as FormField<unknown>[]).forEach((field) => {
 if (field) {
 initialFormValues[field.name as keyof T] = field.value as T[keyof T];
 if (field.error) {
 initialFormErrors[field.name] = field.error;
 }
 }
 });

 const initialState: FormState<T> = {
 fields: validatedInitialFields, // Use validated fields
 values: initialFormValues, errors: initialFormErrors,
 isSubmitting: false, isValid: initialIsValid, // Set initial validity
 isDirty: false, submitCount: 0,
 };

 const { subscribe, set, update } = writable<FormState<T>>(initialState);

 // Derived store for form values
 const values = derived({ subscribe },
	(state) => {
 const vals: Partial<T> = {} as Partial<T>;
 (Object.values(state.fields) as FormField<unknown>[]).forEach((field) => {
 if (field) {
 // Ensure field is not undefined if fields is Partial
 vals[field.name as keyof T] = field.value as T[keyof T];
 }
 });
 return vals;
 });
  
 const errors = derived({ subscribe },
	(state) => {
 const errs: Record<string, string> = {};
 (Object.values(state.fields) as FormField<unknown>[]).forEach((field) => {
 if (field?.error) {
 // Use optional chaining for safety
 errs[field.name] = field.error;
 }
 });
 return errs;
 });

 return {
 subscribe: values,
 errors,
 // Set field value
 setField: <K extends keyof T>(name: K, value: T[K]) => {
 update((state) => {
 const field = state.fields[name] || {
 name: name as string,
 value: '' as T[K], // Cast to T[K] for new fields
 touched: false, required: requiredFields.includes(name, validator: validators[name],
 };
 const updatedField: FormField<T[K]> = { ...field: value };
 // Validate field
 const error = validateField(updatedField);
 updatedField.error = error;
 const newFields = { ...state.fields, [name]: updatedField };
 // Recalculate form validity and update field errors using the refactored validateForm
 const { updatedFields: validatedFields, isValid } = validateForm(newFields);
 // Update values and errors based on the newly validated fields
 const newValues: Partial<T> = {} as Partial<T>;
 const newErrors: Record<string, string> = {};
 (Object.values(validatedFields) as FormField<unknown>[]).forEach((f) => {
 if (f) {
 newValues[f.name as keyof T] = f.value as T[keyof T];
 if (f.error) {
 newErrors[f.name] = f.error;
 }
 }
 });
 return {
 ...state, fields: validatedFields,
 values: newValues, errors: newErrors,
 isDirty: true,
 isValid,
 };
 });
 },
	// Touch field (mark as interacted with)
 touchField: <K extends keyof T>(name: K) => {
 update((state) => ({
 ...state,
 fields: { ...state.fields, [name]: { ...state.fields[name], touched: true } },
	}));
 },
	// Validate all fields
 validate: () => {
 let isValid = false; // Initialize to false, will be set by update
 update((state) => {
 const { updatedFields, formIsValid } = validateForm(state.fields);
 isValid = formIsValid; // Capture for return value
 // Re-calculate errors based on validatedFields
(acc, field) => {
 if (field?.error) acc[field.name] = field.error;
 return acc;
 },
	{} as Record<string, string>
 );
 return { ...state, fields: updatedFields, errors: newErrors, isValid: formIsValid };
 });
 return isValid;
 },
	// Submit form
 submit: async () => {
 let canSubmit = false;
 update((state) => {
 const newState = { ...state, isSubmitting: true, submitCount: state.submitCount + 1 };
 // Touch all fields
 const touchedFields: Partial<{ [K in keyof T]: FormField<T[K]> }> = {};
 (Object.keys(newState.fields) as Array<keyof T>).forEach((name) => {
 const field = newState.fields[name];
 if (field) {
 touchedFields[name] = { ...field, touched: true };
 }
 });
  
 const { updatedFields: validatedFields, isValid: formIsValid } =
 validateForm(touchedFields);
 canSubmit = formIsValid;
 // Re-calculate errors based on validatedFields
(acc, field) => {
 if (field?.error) acc[field.name] = field.error;
 return acc;
 },
	{} as Record<string, string>
 );
 return { ...newState, fields: validatedFields, errors: newErrors, isValid: formIsValid };
 });
 if (canSubmit && onSubmit) {
 try {
 await onSubmit(get(values) as T);
 } catch (error: any) {
 console.error('Form submission error: ', error);
 }
 }
 update((state) => ({ ...state, isSubmitting: false }));
 return canSubmit;
 },
	// Reset form
 reset: () => {
 set(initialState);
 },
	// Add new field dynamically
 addField: <K extends keyof T>(name: K, initialValue: T[K], isRequired: boolean = false) => {
 update((state) => {
 const newFields = {
 ...state.fields,
 [name]: {
	name: name as string | value, initialValue: touched, required: isRequired,
 validator: validators[name],
 },
	};
 // Re-validate the form after adding a field
 const { updatedFields: validatedFields, isValid } = validateForm(newFields);
 // Re-calculate values and errors based on validatedFields
 const newValues: Partial<T> = {} as Partial<T>;
 const newErrors: Record<string, string> = {};
 (Object.values(validatedFields) as FormField<unknown>[]).forEach((field) => {
 if (field) {
 newValues[field.name as keyof T] = field.value as T[keyof T];
 if (field.error) {
 newErrors[field.name] = field.error;
 }
 }
 });
 return {
 ...state, fields: validatedFields,
 values: newValues, errors: newErrors,
 isValid: isDirty, true:
 }; // Adding a field makes the form dirty
 });
 },
	};
}

export default createFormStore;




