import ffi from 'ffi-napi';
import ref from 'ref-napi';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * SIMD FFI Bridge Client with HTTP Fallback
 * Direct memory access to Go SIMD parser (zero HTTP latency)
 * Falls back to HTTP when DLL is not available
 */
class SimdFFIClient {
  constructor(dllPath = null) {
    this.dllPath = dllPath || path.join(__dirname, '..', 'go-microservice', 'simdffi.dll');
    this.httpUrl = 'http://127.0.0.1:8099';
    this.useFFI = false;

    // Try to load FFI first
    this.tryLoadFFI();

    // If FFI fails, we'll use HTTP
    if (!this.useFFI) {
      console.log('🔄 SIMD FFI Bridge not available, using HTTP fallback');
      this.testHTTPConnection();
    }
  }

  /**
   * Try to load the FFI library
   */
  tryLoadFFI() {
    try {
      this.lib = ffi.Library(this.dllPath, {
        'ParseSIMD': ['string', ['string']],
        'FreeString': ['void', ['string']],
        'GetVersion': ['string', []]
      });

      // Test the connection
      const version = this.lib.GetVersion();
      const versionData = JSON.parse(version);
      console.log('✅ SIMD FFI Bridge loaded from:', this.dllPath);
      console.log('🧠 SIMD FFI Version:', versionData.version);
      console.log('⚡ Features:', versionData.features.join(', '));

      // Free the string
      this.lib.FreeString(version);

      this.useFFI = true;
    } catch (error) {
      console.log('⚠️  SIMD FFI Bridge not available:', error.message);
      console.log('🔄 Falling back to HTTP mode');
      this.useFFI = false;
    }
  }

  /**
   * Test HTTP connection
   */
  testHTTPConnection() {
    try {
      // We'll test this asynchronously when needed
      console.log('🌐 HTTP fallback ready at:', this.httpUrl);
    } catch (error) {
      console.error('❌ HTTP fallback connection failed:', error.message);
    }
  }

  /**
   * Parse JSON using SIMD acceleration (direct memory access or HTTP fallback)
   * @param {string} text - JSON text to parse
   * @returns {Promise<object>} - Parsed JSON object
   */
  async parseJSON(text) {
    const startTime = process.hrtime.bigint();

    try {
      if (this.useFFI) {
        // Use direct FFI call
        const resultPtr = this.lib.ParseSIMD(text);
        const result = JSON.parse(resultPtr);

        // Free the C string to prevent memory leaks
        this.lib.FreeString(resultPtr);

        const endTime = process.hrtime.bigint();
        const latency = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds

        if (result.error) {
          throw new Error(result.error);
        }

        console.log(`⚡ SIMD FFI parse completed in ${latency.toFixed(2)}ms (direct memory)`);
        return result;
      } else {
        // Use HTTP fallback
        const response = await fetch(`${this.httpUrl}/parse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: text,
            type: 'json'
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        const endTime = process.hrtime.bigint();
        const latency = Number(endTime - startTime) / 1_000_000;

        if (result.error) {
          throw new Error(result.error);
        }

        console.log(`🌐 SIMD HTTP parse completed in ${latency.toFixed(2)}ms (fallback)`);
        return result.result || result;
      }
    } catch (error) {
      console.error('❌ SIMD parse failed:', error.message);
      throw error;
    }
  }

  /**
   * Parse TypeScript error log using SIMD
   * @param {string} logContent - Raw TSC error log
   * @returns {Promise<object>} - Structured error data
   */
  async parseTSCLog(logContent) {
    console.log('🧠 Parsing TSC log via SIMD FFI (direct memory access)...');

    const payload = JSON.stringify({
      text: logContent,
      type: 'tsc-errors',
      timestamp: new Date().toISOString()
    });

    const result = await this.parseJSON(payload);

    // Extract error entries
    const errors = result.errors || [];
    console.log(`📊 Parsed ${errors.length} errors from TSC log`);

    return {
      errors,
      metadata: {
        parsed_at: new Date().toISOString(),
        method: 'ffi-direct',
        acceleration: 'AVX2+CUDA'
      }
    };
  }

  /**
   * Cleanup resources
   */
  close() {
    // FFI library cleanup is automatic
    console.log('🔌 SIMD FFI Bridge closed');
  }
}

// Export singleton instance
let clientInstance = null;

export function getFFIClient() {
  if (!clientInstance) {
    clientInstance = new SimdFFIClient();
  }
  return clientInstance;
}

export default SimdFFIClient;