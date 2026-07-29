#!/usr/bin/env node

/**
 * Schema Validation Cache
 *
 * Prevents redundant Zod schema validation across multiple graphify:daily pipeline stages.
 * Caches schema validation results with TTL to avoid duplicated contract checks within
 * a single graphify run.
 *
 * Usage:
 *   const validator = new SchemaValidationCache({ ttl: 300_000 });  // 5 min
 *   const result = await validator.validatePacket(packet, 'AddressablePacketV1');
 *   if (!result.ok) console.error(result.errors);
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class SchemaValidationCache {
  constructor({ ttl = 300_000, cacheDir = '.tmp', verbose = false } = {}) {
    this.ttl = ttl;  // milliseconds
    this.cacheDir = cacheDir;
    this.verbose = verbose;
    this.memCache = new Map();  // in-memory cache (fast path)
    this.diskCache = new Map(); // disk-backed cache (persistent)
    this.hitStats = { memory: 0, disk: 0, miss: 0 };

    // Create cache directory if missing
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Load existing disk cache
    this._loadDiskCache();
  }

  /**
   * Generate stable cache key for packet + schema combo
   * Key = hash(packet_key or id + schema_name + version)
   */
  _makeCacheKey(packet, schemaName) {
    const pk = packet.packet_key || packet.id || JSON.stringify(packet);
    const key = `${pk}__${schemaName}`;
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  }

  /**
   * Get cache entry with TTL check
   */
  _getCacheEntry(key) {
    // Try memory cache first (fastest)
    if (this.memCache.has(key)) {
      const entry = this.memCache.get(key);
      if (Date.now() < entry.expiresAt) {
        this.hitStats.memory++;
        return entry.value;
      }
      // Expired in memory cache
      this.memCache.delete(key);
    }

    // Try disk cache (fallback)
    if (this.diskCache.has(key)) {
      const entry = this.diskCache.get(key);
      if (Date.now() < entry.expiresAt) {
        // Promote to memory cache
        this.memCache.set(key, entry);
        this.hitStats.disk++;
        return entry.value;
      }
      // Expired in disk cache
      this.diskCache.delete(key);
      this._saveDiskCache();
    }

    this.hitStats.miss++;
    return null;
  }

  /**
   * Store cache entry with TTL
   */
  _setCacheEntry(key, value) {
    const entry = { value, expiresAt: Date.now() + this.ttl };
    this.memCache.set(key, entry);
    this.diskCache.set(key, entry);
  }

  /**
   * Load disk cache from file
   */
  _loadDiskCache() {
    const cacheFile = path.join(this.cacheDir, 'schema-validation.cache.json');
    if (!fs.existsSync(cacheFile)) return;

    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      for (const [key, entry] of Object.entries(data || {})) {
        if (Date.now() < entry.expiresAt) {
          this.diskCache.set(key, entry);
        }
      }
      if (this.verbose) {
        console.log(`[schema-validation-cache] Loaded ${this.diskCache.size} entries from disk`);
      }
    } catch (err) {
      if (this.verbose) {
        console.warn(`[schema-validation-cache] Failed to load disk cache: ${err.message}`);
      }
    }
  }

  /**
   * Save disk cache to file
   */
  _saveDiskCache() {
    const cacheFile = path.join(this.cacheDir, 'schema-validation.cache.json');
    const data = Object.fromEntries(this.diskCache);

    try {
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      if (this.verbose) {
        console.warn(`[schema-validation-cache] Failed to save disk cache: ${err.message}`);
      }
    }
  }

  /**
   * Validate packet against schema (with caching)
   *
   * @param packet - Object to validate
   * @param schemaValidator - Zod schema or validation function returning { ok, errors }
   * @param schemaName - Human-readable schema name for logging
   * @returns { ok: boolean, errors: string[], cached: boolean }
   */
  async validatePacket(packet, schemaValidator, schemaName = 'Unknown') {
    const cacheKey = this._makeCacheKey(packet, schemaName);

    // Check cache first
    const cached = this._getCacheEntry(cacheKey);
    if (cached !== null) {
      return { ...cached, cached: true };
    }

    // Run validation
    let result;
    try {
      if (typeof schemaValidator.parse === 'function') {
        // Zod schema
        schemaValidator.parse(packet);
        result = { ok: true, errors: [] };
      } else if (typeof schemaValidator === 'function') {
        // Custom validation function
        result = await schemaValidator(packet);
      } else {
        result = { ok: false, errors: ['Invalid validator type'] };
      }
    } catch (err) {
      result = {
        ok: false,
        errors: [err.message || String(err)]
      };
    }

    // Store in cache
    this._setCacheEntry(cacheKey, result);

    if (this.verbose) {
      const status = result.ok ? '✓' : '✗';
      console.log(
        `[schema-validation-cache] ${status} ${schemaName} ` +
        `(packet: ${packet.packet_key || packet.id || 'unknown'})`
      );
    }

    return { ...result, cached: false };
  }

  /**
   * Validate batch of packets (parallel, with deduplication)
   *
   * @param packets - Array of objects
   * @param schemaValidator - Zod schema or validation function
   * @param schemaName - Schema name for logging
   * @param { parallelism = 10 } - Max concurrent validations
   * @returns { valid: [], invalid: [], stats: { memory, disk, miss } }
   */
  async validateBatch(packets, schemaValidator, schemaName = 'Unknown', { parallelism = 10 } = {}) {
    const results = { valid: [], invalid: [], stats: { ...this.hitStats } };

    // Deduplicate packets by packet_key
    const seen = new Set();
    const unique = [];
    for (const packet of packets) {
      const pk = packet.packet_key || packet.id;
      if (pk && !seen.has(pk)) {
        seen.add(pk);
        unique.push(packet);
      }
    }

    // Validate with parallelism limit
    for (let i = 0; i < unique.length; i += parallelism) {
      const batch = unique.slice(i, i + parallelism);
      const validationResults = await Promise.all(
        batch.map(p => this.validatePacket(p, schemaValidator, schemaName))
      );

      for (const result of validationResults) {
        if (result.ok) {
          results.valid.push(result);
        } else {
          results.invalid.push(result);
        }
      }
    }

    results.stats = { ...this.hitStats };
    return results;
  }

  /**
   * Clear cache (memory + disk)
   */
  clear() {
    this.memCache.clear();
    this.diskCache.clear();
    this.hitStats = { memory: 0, disk: 0, miss: 0 };

    const cacheFile = path.join(this.cacheDir, 'schema-validation.cache.json');
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hitStats.memory + this.hitStats.disk + this.hitStats.miss;
    const hitRate = total > 0 ? ((this.hitStats.memory + this.hitStats.disk) / total * 100).toFixed(1) : '0.0';
    return {
      memory: this.hitStats.memory,
      disk: this.hitStats.disk,
      miss: this.hitStats.miss,
      total,
      hitRate: `${hitRate}%`,
      cacheSize: this.diskCache.size
    };
  }
}

/**
 * Singleton instance for use across graphify pipeline
 */
let _instance = null;

export function getValidationCache(options = {}) {
  if (!_instance) {
    _instance = new SchemaValidationCache(options);
  }
  return _instance;
}

export function resetValidationCache() {
  if (_instance) {
    _instance.clear();
  }
  _instance = null;
}
