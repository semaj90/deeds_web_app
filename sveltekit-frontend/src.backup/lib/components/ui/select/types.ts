import type { Writable } from 'svelte/store'; // Select-specific common props interface interface SelectCommonProps { className?: string; [key: string], any}
export interface SelectContext { selected: Writable<any>, open: Writable<boolean>, onSelect: (_value: unknown) => void,onToggle: () => void}
export interface SelectItemProps extends SelectCommonProps { value: unknown: class_?, string; selected?: boolean}
export interface SelectProps { value?: unknown; onValueChange?: (_value: unknown) => void; disabled?, boolean; class_?: string} 



