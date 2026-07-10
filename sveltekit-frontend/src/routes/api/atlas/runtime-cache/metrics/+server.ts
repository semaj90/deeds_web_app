import type { RequestHandler } from '@sveltejs/kit';
import { getTelemetryCollector } from '$lib/server/atlas/runtime-cache-telemetry.js';

/**
 * Prometheus-compatible metrics endpoint
 * GET /api/atlas/runtime-cache/metrics
 *
 * Returns HELP + TYPE + value lines for Grafana scraping.
 */
export const GET: RequestHandler = async () => {
  try {
    const telemetry = getTelemetryCollector();
    const metrics = await telemetry.getMetrics();

    if (!metrics) {
      return new Response('# ERROR: Failed to fetch metrics\n', {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    let output = '';

    // Browser L1 cache metrics
    output += '# HELP runtime_cache_browser_l1_hits Total browser L1 cache hits\n';
    output += '# TYPE runtime_cache_browser_l1_hits counter\n';
    output += `runtime_cache_browser_l1_hits ${metrics.browser_cache_hits}\n`;

    output += '# HELP runtime_cache_browser_l1_misses Total browser L1 cache misses\n';
    output += '# TYPE runtime_cache_browser_l1_misses counter\n';
    output += `runtime_cache_browser_l1_misses ${metrics.browser_cache_misses}\n`;

    // Valkey hot metrics
    output += '# HELP runtime_cache_valkey_hot_hits Total Valkey hot cache hits\n';
    output += '# TYPE runtime_cache_valkey_hot_hits counter\n';
    output += `runtime_cache_valkey_hot_hits ${metrics.valkey_hot_hits}\n`;

    output += '# HELP runtime_cache_valkey_hot_misses Total Valkey hot cache misses\n';
    output += '# TYPE runtime_cache_valkey_hot_misses counter\n';
    output += `runtime_cache_valkey_hot_misses ${metrics.valkey_hot_misses}\n`;

    // Valkey warm metrics
    output += '# HELP runtime_cache_valkey_warm_hits Total Valkey warm cache hits\n';
    output += '# TYPE runtime_cache_valkey_warm_hits counter\n';
    output += `runtime_cache_valkey_warm_hits ${metrics.valkey_warm_hits}\n`;

    output += '# HELP runtime_cache_valkey_warm_misses Total Valkey warm cache misses\n';
    output += '# TYPE runtime_cache_valkey_warm_misses counter\n';
    output += `runtime_cache_valkey_warm_misses ${metrics.valkey_warm_misses}\n`;

    // SOM lookup metrics
    output += '# HELP runtime_cache_som_exact_hits Total SOM exact cell hits\n';
    output += '# TYPE runtime_cache_som_exact_hits counter\n';
    output += `runtime_cache_som_exact_hits ${metrics.som_exact_hits}\n`;

    output += '# HELP runtime_cache_som_neighbor_searches Total SOM neighbor radius searches\n';
    output += '# TYPE runtime_cache_som_neighbor_searches counter\n';
    output += `runtime_cache_som_neighbor_searches ${metrics.som_neighbor_searches}\n`;

    // Promotion routing metrics
    output += '# HELP runtime_cache_promotion_destinations Promotion destination routing counts\n';
    output += '# TYPE runtime_cache_promotion_destinations gauge\n';
    for (const [dest, count] of Object.entries(metrics.promotion_destinations)) {
      output += `runtime_cache_promotion_destinations{destination="${dest}"} ${count}\n`;
    }

    // LOD emission metrics
    output += '# HELP runtime_cache_lod_emissions LOD level emission counts\n';
    output += '# TYPE runtime_cache_lod_emissions gauge\n';
    for (const [lod, count] of Object.entries(metrics.lod_emissions)) {
      output += `runtime_cache_lod_emissions{lod="${lod}"} ${count}\n`;
    }

    // Validation gate metrics
    output += '# HELP runtime_cache_validation_gate_passed Validation gates passed\n';
    output += '# TYPE runtime_cache_validation_gate_passed counter\n';
    output += `runtime_cache_validation_gate_passed ${metrics.validation_gates.passed}\n`;

    output += '# HELP runtime_cache_validation_gate_failed Validation gates failed\n';
    output += '# TYPE runtime_cache_validation_gate_failed counter\n';
    output += `runtime_cache_validation_gate_failed ${metrics.validation_gates.failed}\n`;

    return new Response(output, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store'
      }
    });
  } catch (err) {
    console.error('Failed to generate Prometheus metrics:', err);
    return new Response('# ERROR: Failed to generate metrics\n', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};
