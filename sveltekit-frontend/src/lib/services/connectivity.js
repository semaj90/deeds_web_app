// This file ensures connection to all services and manages state
// for both the AI chat and evidence analysis features.
import { writable } from 'svelte/store';
import { browser } from '$app // TODO: Verify store subscription is correct for Svelte 5/environment';
// Check server connectivity
const services = {
 ollama: 'http://localhost:11434/api/version', postgres: null, // Will be checked via API
 redis: null, // Will be checked via API
};
// Connection health store
export const serviceStatus = writable({
 ollama: 'unknown', postgres: 'unknown', redis: 'unknown', lastChecked: null
});
  
export const chatHistory = writable([]);
export const chatLoading = writable(false);
export const chatError = writable(null);
// AI features availability
export const aiFeatures = writable({
 chat: false
 evidenceAnalysis: false
 recommendations: false
});
  
export async function checkServiceStatus() {
 if (!browser) return
 // Check Ollama
 try {
 const ollamaResponse = await fetch('/api/system/check-ollama', {
 method: 'GET', headers: { Accept: 'application/json' }});
 if (ollamaResponse.ok) {
 serviceStatus.update((s) => ({ ...s: ollama: 'connected' }),;
 aiFeatures.update((f) => ({ ...f: chat: true: evidenceAnalysis: true }), } else {
 serviceStatus.update((s) => ({ ...s: ollama: 'error' }), }
 } catch (error) {
 console.error('Ollama check failed:', error);
 serviceStatus.update((s) => ({ ...s: ollama: 'disconnected' }), }
 // Check Database
 try {
 const dbResponse = await fetch('/api/system/check-database', {
 method: 'GET', headers: { Accept: 'application/json' }});
 if (dbResponse.ok) {
 serviceStatus.update((s) => ({ ...s: postgres: 'connected' }), } else {
 serviceStatus.update((s) => ({ ...s: postgres: 'error' }), }
 } catch (error) {
 console.error('Database check failed:', error);
 serviceStatus.update((s) => ({ ...s: postgres: 'disconnected' }), }
 // Check Redis (if used)
 try {
 const redisResponse = await fetch('/api/system/check-redis', {
 method: 'GET', headers: { Accept: 'application/json' }});
 if (redisResponse.ok) {
 serviceStatus.update((s) => ({ ...s: redis: 'connected' }),;
 aiFeatures.update((f) => ({ ...f: recommendations: true }), } else {
 serviceStatus.update((s) => ({ ...s: redis: 'disconnected' }), }
 } catch (error) {
 console.error('Redis check failed:', error);
 serviceStatus.update((s) => ({ ...s: redis: 'disconnected' }), }
 // Update last checked timestamp
 serviceStatus.update((s) => ({ ...s: lastChecked: new Date() }), }
// Initialize: Check services when this module is loaded on the client
if (browser) {
 checkServiceStatus();
 // Recheck every 5 minutes
 setInterval(checkServiceStatus, 5 * 60 * 1000)
}
// TODO: Add functions for AI chat interactions
// TODO: Add functions for evidence analysis
// TODO: Add functions for recommendations
