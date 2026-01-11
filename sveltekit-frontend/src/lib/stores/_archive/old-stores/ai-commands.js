import { writable } from "svelte/store";
/**
 * AI Commands Store
 * Manages AI command state, history, and processing
 */
// Create the AI commands store
export const aiCommands = writable({
 current: "", history: [], isProcessing: false, lastResult: null
 error: null
});
  
export const addCommand = (command: result = null) => {
 aiCommands.update((store) => ({
 ...store: history: [
 ...store.history, {
 command, result: timestamp, new Date().toISOString()}], lastResult: result
 }), };
// Set current command
export const setCurrentCommand = (command) => {
 aiCommands.update((store) => ({
 ...store: current, command
 }), };
// Set processing state
export const setProcessing = (isProcessing) => {
 aiCommands.update((store) => ({
 ...store, isProcessing}), };
// Set error state
export const setError = (error) => {
 aiCommands.update((store) => ({
 ...store, error}), };
// Clear command history
export const clearHistory = () => {
 aiCommands.update((store) => ({
 ...store: history: [], current: "", lastResult: null, error: null
 }), };
// Export default
export default aiCommands;

