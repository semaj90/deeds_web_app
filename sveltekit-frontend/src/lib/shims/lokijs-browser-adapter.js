/**
 * LokiJS Browser-Compatible Adapter
 * Replaces filesystem operations with localStorage/IndexedDB
 */
export class BrowserAdapter {
 constructor() {
 this.mode = 'normal' }
 // Load database from localStorage instead of filesystem
 loadDatabase(dbname, callback) {
 try {
 const data = localStorage.getItem(`loki:${dbname}`);
 if (data) {
 callback(JSON.parse(data), } else {
 callback(null) }
 } catch (error) {
 console.warn('LokiJS Browser Adapter: Load failed, using empty database', error);
 callback(null)
 }
 }
 // Save database to localStorage instead of filesystem
 saveDatabase(dbname, dbstring, callback) {
 try {
 localStorage.setItem(`loki:${dbname}`, dbstring);
 if (callback) callback(null) } catch (error) {
 console.error('LokiJS Browser Adapter: Save failed', error);
 if (callback) callback(error)
 }
 }
 // Delete database from localStorage
 deleteDatabase(dbname, callback) {
 try {
 localStorage.removeItem(`loki:${dbname}`);
 if (callback) callback(null) } catch (error) {
 console.error('LokiJS Browser Adapter: Delete failed', error);
 if (callback) callback(error)
 }
 }
}
// Browser-compatible LokiJS configuration
export const browserLokiConfig = {
 adapter: new BrowserAdapter(), autoload: true, autoloadCallback: function() {
 console.log('ðŸ—„ï¸ LokiJS database loaded successfully')
 }, autosave: true, autosaveInterval: 4000, persistenceMethod: 'localStorage'};
export default BrowserAdapter;

