// Common component properties for UI components
export interface CommonProps {
	class?: string;
	id?: string;
	'data-testid'?: string;
	'aria-label'?: string;
	'aria-describedby'?: string;
	role?: string;
	tabIndex?: number;
	tabindex?: number;
	[attr: `data-${string}`]: unknown;
	[attr: `aria-${string}`]: unknown;
}

export interface ButtonProps extends CommonProps {
	variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'legal' | 'evidence' | 'case';
	size?: 'default' | 'sm' | 'lg' | 'icon' | 'xs';
	disabled?: boolean;
	loading?: boolean;
	loadingText?: string;
	type?: 'button' | 'submit' | 'reset';
	href?: string;
	target?: string;
	onclick?: (e: MouseEvent) => void;
}

export interface InputProps extends CommonProps {
	type?: HTMLInputElement['type'];
	value?: string | number;
	placeholder?: string;
	disabled?: boolean;
	readonly?: boolean;
	required?: boolean;
	name?: string;
	autocomplete?: string;
}

export interface FormFieldProps extends CommonProps {
	label?: string;
	description?: string;
	error?: string;
	required?: boolean;
}
