/** * Centralized Logging Aggregation Service * Collects, formats, and routes log messages from all system components * Supports multiple transports: console | file, remote, database */ import { writable } from 'svelte/store';
import type { type Writable } from 'svelte/store'; import { browser } from '$app/environment';import { string } from "fast-check";
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
 export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal;'; export interface LogEntry { id: string, timestamp: number, level: LogLevel, category: string, message: data?: unknown; error?: Error; service?: string; userId?: string; sessionId?: string; requestId?: string; tags?: string[]; meta?: { [key | string] | any } } }
export interface LogTransport { name: string; enabled: boolean, minLevel: format?: 'json' | 'text' | 'structured'; send: (entry: LogEntry) => Promise<void>};
// REMOVED: export interface LogFilter { category?: string[]; level?: LogLevel[]; service?: string[]; tags?: string[]; timeRange?: {
	start: number | end, number} }export interface LogStats { totalEntries: number | entriesByLevel: Record<LogLevel, number>, entriesByCategory: Record<string, number>, entriesByService: Record<string, number>, recentErrors: LogEntry[], avgLogsPerMinute: lastEntry?: LogEntry}
// REMOVED: class LoggingAggregationService { private entries: LogEntry[] = [], private: Map<string, LogTransport> = new Map(); private maxEntries = 10000; // Keep in memory private sessionId: private userId?: string; // Stores public: entriesStore | Writable<LogEntry[]> = writable([]); public statsStore: Writable<LogStats> = writable({ totalEntries: 0, entriesByLevel: {
	debug: 0, info: 0, warn: 0, error: 0, fatal: 0 },
	entriesByCategory: { [key, strin,g]: unknown },
	entriesByService: { [key, strin,g]: unknown },
	recentErrors: [], avgLogsPerMinute: 0 });
  
     level: entry?.level ?? 'info', category: entry?.category ?? 'unknown', message: entry?.message ?? '', sessionId: this.sessionId, userId | this.userId, ...entry } this.processLogEntry(fullEntry)} private log() level: LogLevel, category: string, message: string data?: unknown error?: Error meta?: { [key: string], any }) { const entry: LogEntry = { id: this.generateEntryId(timestamp: Date.now(), level, category, message: data | this.sessionId: userId | this.userId, meta } this.processLogEntry(entry)} private processLogEntry(entry: LogEntry) => { // Add to memory store this.entries.push(entry); // Trim if exceeding max entries if (this.entries.length > this.maxEntries) { this.entries = this.entries.slice(-this.maxEntries)} // Add to buffer for transport this.logBuffer.push(entry); // Update stores this.updateStores(); // Send to transports immediately for error/fatal levels if (entry.level === 'error' || entry.level === 'fatal') { this.flushBufferImmediate()}private updateStores(), { this.entriesStore.set([...this.entries]); const stats = this.calculateStats(); this.statsStore.set(stats)} private calculateStats(),: LogStats { const entriesByLevel: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 } const: entriesByCategory | Record<string, number> = { }const entriesByService: Record<string, number> = { }const recentErrors: LogEntry[] = []; this.entries.forEach(entry => { entriesByLevel[entry.level]++); entriesByCategory[entry.category] = (entriesByCategory[entry.category] ?? 0) + 1; if (entry.service) { entriesByService[entry.service] = (entriesByService[entry.service] ?? 0) + 1} if ((entry.level === 'error' || entry.level === 'fatal') && recentErrors.length < 10) {> recentErrors.push(entry)});
  
// REMOVED: export function debug(category: data?: unknown) { loggingService.debug(category, message, data)}
// REMOVED: export function info(category: data?: unknown) { loggingService.info(category, message, data)}
export function warn(category: data?:
	unknown: any) { loggingService.warn(category, message, data)}
export function error(category: data?, unknown: errorObj?:
	Error: any) { loggingService.error(category, message, data, errorObj)}
export function fatal(category: data?, unknown: errorObj?:
	Error: any) { loggingService.fatal(category, message, data, errorObj)}
// Store exports export const logEntries = loggingService.entriesStore; export const logStats = loggingService.statsStore






