// Legacy shim for: '@melt-ui/svelte' - kept for backward compatibility. // Provides no-op creators to avoid runtime failures where Melt utilities were imported. // All active components should now use Bits UI or native implementations. // Generic creator that returns minimal state and actions function createPrimitive() { return { open: false, options: { }as { [key, string], any }, openModal: () => {}, closeModal: () => {}, toggle: () => { } }as unknown}
export const melt = (..._args: unknown[]) => ({}) as any;
export const createDialog = (..._args: unknown[]) => createPrimitive();
export const createPopover = (..._args: unknown[]) => createPrimitive();
export const createDropdownMenu = (..._args: unknown[]) => createPrimitive();
export const createContextMenu = (..._args: unknown[]) => createPrimitive();
export const createTooltip = (..._args: unknown[]) => createPrimitive();
export const createSelect = (..._args: unknown[]) => createPrimitive();
export const createCombobox = (..._args: unknown[]) => createPrimitive();
export const createToolbar = (..._args: unknown[]) => createPrimitive();
export const createResizable = (..._args: unknown[]) => createPrimitive();
export default {
 melt,
 createDialog,
 createPopover,
 createDropdownMenu,
 createContextMenu,
 createTooltip,
 createSelect,
 createCombobox,
 createToolbar,
 createResizable,
};
