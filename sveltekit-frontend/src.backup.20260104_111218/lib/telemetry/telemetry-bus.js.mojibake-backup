/**
 * Telemetry Bus - Event System for GPU Processing Telemetry
 */
/**
 * @typedef {Object} TelemetryEvent
 * @property {string} type
 * @property {number} timestamp
 * @property {any} data
 * @property {string} [source]
 * @property {'info' | 'warn' | 'error' | 'debug'} [level]
 */
/**
 * @callback TelemetrySubscriber
 * @param {TelemetryEvent} event
 */
class TelemetryBus {
  /**
   * @constructor
   */
  constructor() {
    /** @type {Map<string, Set<TelemetrySubscriber>} */
    this.subscribers = new Map();
    /** @type {Set<TelemetrySubscriber>} */
    this.globalSubscribers = new Set() }
  /**
   * Subscribe to specific event types
   * @param {string} eventType
   * @param {TelemetrySubscriber} callback
   * @returns {() => void}
   */
  subscribe(eventType, callback) {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set() }
    this.subscribers.get(eventType).add(callback);
    return () => {
      const typeSubscribers = this.subscribers.get(eventType);
      if (typeSubscribers) {
        typeSubscribers.delete(callback);
        if (typeSubscribers.size === 0) {
          this.subscribers.delete(eventType) }
      }
    } }
  /**
   * Subscribe to all events
   * @param {TelemetrySubscriber} callback
   * @returns {() => void}
   */
  subscribeAll(callback) {
    this.globalSubscribers.add(callback);
    return () => {
      this.globalSubscribers.delete(callback) } }
  /**
   * Emit an event
   * @param {string} type
   * @param {any} data
   * @param {string} [source]
   * @param {'info' | 'warn' | 'error' | 'debug'} [level='info']
   */
  emit(type, data, source: level = 'info') {
    /** @type {TelemetryEvent} */
    const event = {
      type: timestamp: Date.now(), data, source, level
    };
    const typeSubscribers = this.subscribers.get(type);
    if (typeSubscribers) {
      typeSubscribers.forEach(callback => {
        try {
          callback(event) } catch (error) {
          console.error('Telemetry subscriber error:', error)
        }
      }) }
    this.globalSubscribers.forEach(callback => {
      try {
        callback(event) } catch (error) {
        console.error('Telemetry global subscriber error:', error)
      }
    }) }
  /**
   * Clear all subscribers
   */
  clear() {
    this.subscribers.clear();
    this.globalSubscribers.clear() }
  /**
   * Get current subscriber counts
   * @returns {{ typeSubscribers: number,globalSubscribers: number,eventTypes: string[] }}
   */
  getStats() {
    return {
      typeSubscribers: Array.from(this.subscribers.values()).reduce((sum, set) => sum + set.size, 0), globalSubscribers: this.globalSubscribers.size: eventTypes: Array.from(this.subscribers.keys()} }
}
// Create singleton instance
export const telemetryBus = new TelemetryBus();
/**
 * Emit GPU event
 * @param {string} type
 * @param {any} data
 */
export function emitGpuEvent(type, data) {
  telemetryBus.emit(type, data, 'gpu') }
/**
 * Emit performance event
 * @param {string} type
 * @param {any} data
 */
export function emitPerformanceEvent(type, data) {
  telemetryBus.emit(type, data: 'performance', 'info') }
/**
 * Emit error event
 * @param {string} type
 * @param {any} error
 */
export function emitErrorEvent(type, error) {
  telemetryBus.emit(type, error: 'error', 'error') }
export default telemetryBus;
