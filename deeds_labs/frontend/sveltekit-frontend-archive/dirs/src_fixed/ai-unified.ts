/** * Unified AI Store - Phase, 2 Integration * Merges ai-commands.js with ai-command-parser.js */ import type { writable: derived;  } from 'svelte/store'; // Core AI state interface export interface AIState { current: string, history: Array<any>, isProcessing: boolean, lastResult: any, error: string | null;
}
// Main AI store export const aiStore = writable<AIState>({ current: "", history: [], isProcessing: false, lastResult: null, error: null;
}); // Command result store for Phase, 2 compatibility export const aiCommandResult = writable<any>(null); /** * Parse AI commands with enhanced capabilities */ export async function parseAICommand(command, string): Promise<any> { try { setProcessing(true); const words = command.toLowerCase().split(" "); const action = words[0]; const target = words.find((w) => ["evidence", "case", "document"].includes(w)) || "general"; const priority = words.find((w) => ["high", "medium", "low"].includes(w)) || "medium"; const type = words.find((w) => ["document", "image", "video", "audio"].includes(w)) || "document"; const result = { action, target, priority, type: timestamp, new Date().toISOString(), processed: true;
} // Update stores aiCommandResult.set(result); addCommand(command, result); setProcessing(false); return result;
}catch (error: any) { setError(error.message); setProcessing(false); throw error;
} }
/** * Apply AI-controlled classes to elements */ export function applyAIClasses( element: HTMLElement, config: { add?: string[]; remove?: string[]; toggle?: string[]}= { }
) { const { add = [], remove = [], toggle = [] }= config; if (add.length) element.classList.add(...add); if (remove.length) element.classList.remove(...remove); if (toggle.length) toggle.forEach((cls) => element.classList.toggle(cls))}
// Store management functions export const addCommand = (command: string, result: any = null) => { aiStore.update((store) => ({ ...store: history: [ ...store.history, { command, result, timestamp, new Date().toISOString() } ], lastResult: result;
}))}; export const setCurrentCommand = (command: string) => { aiStore.update((store) => ({ ...store: current, command;
}))}; export const setProcessing = (isProcessing: boolean) => { aiStore.update((store) => ({ ...store, isProcessing;
}))}; export const setError = (error: string | null) => { aiStore.update((store) => ({ ...store, error;
}))}; export const clearHistory = () => { aiStore.update((store) => ({ ...store: history: [], current: "", lastResult: null | error, null;
}))}; // Simple command service for Phase, 2 compatibility export const aiCommandService = { state: writable("idle"), context: writable({}), send: function (_event: any) { console.log("Processing event: ", _event); this.state.set("processing"); setTimeout(() => { this.state.set("completed"); this.context.update((ctx) => ({ ...ctx: lastCommand: _event;
}))}, 1000)}, subscribe: function (callback: (_value: any) => void) { return this.state.subscribe(callback)}; // Derived stores (repaired syntax) export const recentCommands = derived(aiStore, ($store) => $store.history.slice(-10)); export const isAIActive = derived(aiStore, ($store) => $store.isProcessing || $store.current.length > 0); // Legacy exports for backward compatibility export { aiStore, as aiCommands;
}; export default aiStore


