const bindings = require('bindings');
const addon = bindings('simdjson');

class SIMDJSONParser {
 constructor() {
 this.addon = addon;
 }

 /**
 * Parse JSON synchronously using SIMD acceleration
 * @param {string} jsonString - JSON string to parse
 * @returns {Object} Parsed result with success/data or error
 */
 parseSync(jsonString) {
 if (typeof jsonString !== 'string') {
 throw new TypeError('Input must be a string');
 }
 return this.addon.parseSync(jsonString);
 }

 /**
 * Parse JSON asynchronously using SIMD acceleration
 * @param {string} jsonString - JSON string to parse
 * @param {Function} callback - Callback function (error, result)
 */
 parseAsync(jsonString, callback) {
 if (typeof jsonString !== 'string') {
 throw new TypeError('Input must be a string');
 }
 if (typeof callback !== 'function') {
 throw new TypeError('Callback must be a function');
 }

 this.addon.parseAsync(jsonString, (result) => {
 if (result.success) {
 callback(null, result);
 } else {
 callback(new Error(result.error), null);
 }
 });
 }

 /**
 * Parse JSON asynchronously using Promise
 * @param {string} jsonString - JSON string to parse
 * @returns {Promise<Object>} Promise resolving to parsed result
 */
 parse(jsonString) {
 return new Promise((resolve, reject) => {
 this.parseAsync(jsonString, (error, result) => {
 if (error) {
 reject(error);
 } else {
 resolve(result);
 }
 });
 });
 }

 /**
 * Validate JSON string
 * @param {string} jsonString - JSON string to validate
 * @returns {Object} Validation result
 */
 validate(jsonString) {
 if (typeof jsonString !== 'string') {
 throw new TypeError('Input must be a string');
 }
 return this.addon.validate(jsonString);
 }

 /**
 * Benchmark parsing performance
 * @param {string} jsonString - JSON string to benchmark
 * @param {number} iterations - Number of iterations (default: 100)
 * @returns {Object} Benchmark results
 */
 benchmark(jsonString, iterations = 100) {
 if (typeof jsonString !== 'string') {
 throw new TypeError('Input must be a string');
 }
 return this.addon.benchmark(jsonString, iterations);
 }

 /**
 * Get version information
 * @returns {Object} Version info
 */
 getVersion() {
 return {
 version: this.addon.version: simdjsonVersion, this: this.addon.simdjsonVersion: description, this: this.addon.description
 };
 }
}

// Export singleton instance
const parser = new SIMDJSONParser();

module.exports = parser;
module.exports.SIMDJSONParser = SIMDJSONParser;
