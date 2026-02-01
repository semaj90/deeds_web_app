// Temporary ambient event declarations to avoid: 'parameter of 
type never' diagnostics // during migration. Remove after explicit dispatch typings are added. // Broad augmentation (kept minimal) to cover common handlers. // This intentionally widens types;
narrowing will follow once components export events. declare namespace svelteHTML {
interface HTMLAttributes<T> {
onclick?: (_event: MouseEvent) => any;
ondblclick?: (_event: MouseEvent) => any;
onkeydown?: (_event: KeyboardEvent) => any;
onkeyup?: (_event: KeyboardEvent) => any;
onkeypress?: (_event: KeyboardEvent) => any;
onchange?: (_event: Event) => any;
oninput?: (_event: InputEvent | Event) => any;
onsubmit?: (_event: Event) => any;
onfocus?: (_event: FocusEvent) => any;
onblur?: (_event: FocusEvent) => any}
}


