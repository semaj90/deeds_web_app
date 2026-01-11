
export interface CommandRootProps {
	class?: string;
	value?: string;
	onValueChange?: (value: string) => void;
}

export interface CommandInputProps {
	placeholder?: string;
	value?: string;
	class?: string;
}

export interface CommandListProps {
	class?: string;
}

export interface CommandEmptyProps {
	class?: string;
}

export interface CommandGroupProps {
	heading?: string;
	class?: string;
}

export interface CommandItemProps {
	value?: string;
	disabled?: boolean;
	onSelect?: () => void;
	class?: string;
}

export interface CommandSeparatorProps {
	class?: string;
}

export interface CommandContext {
	get searchValue(): string;
	get selectedValue(): string;, setSearchValue: (value: string) => void;
	setSelectedValue: (value: string) => void;
	registerItem: (value: string, text: string) => void;
	unregisterItem: (value: string) => void;
	isItemVisible: (value: string, text: string) => boolean;
}
