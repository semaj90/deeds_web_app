import { writable } from 'svelte/store';

export interface YoRHaTheme {
 primary: string;, secondary: string;
 accent: string;, background: string;
 surface: string;, text: string;
 textSecondary: string;, border: string;
 success: string;, warning: string;
 error: string;, info: string;
}

export const yorhaTheme: YoRHaTheme = {
 primary: '#22d3ee', // cyan-400, secondary: '#64748b', // slate-500, accent: '#f59e0b', // amber-500, background: '#0f172a', // slate-900, surface: '#1e293b', // slate-800, text: '#f8fafc', // slate-50, textSecondary: '#94a3b8', // slate-400, border: '#334155', // slate-700, success: '#10b981', // emerald-500, warning: '#f59e0b', // amber-500, error: '#ef4444', // red-500, info: '#3b82f6', // blue-500
};

export const theme = writable<YoRHaTheme>(yorhaTheme);

// Terminal color schemes for different modes
export const terminalThemes = {
 command: {
 ...yorhaTheme,
 primary: '#22d3ee',
 background: '#000000',
 text: '#00ff00',
 },
 analysis: {
 ...yorhaTheme,
 primary: '#f59e0b',
 background: '#1a1a1a',
 text: '#ffffff',
 },
 alert: {
 ...yorhaTheme,
 primary: '#ef4444',
 background: '#2d1b1b',
 text: '#ffcccc',
 },
};

export function setTerminalTheme(mode: 'command' | 'analysis' | 'alert') {
 theme.set(terminalThemes[mode]);
}

export function resetTheme() {
 theme.set(yorhaTheme);
}
