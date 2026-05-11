/**
 * POST /api/test/webgpu-modules
 *
 * Direct test of WebGPU module integration to verify orphan revival is working.
 * Tests SOM cache, texture streaming, and N64 LOD system initialization.
 */

import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!dev) return json({ error: 'Test endpoints are dev-only' }, { status: 403 });
	const results: Record<string, string> = {};
	const timings: Record<string, number> = {};
	let allPassed = true;

	try {
    // Test 1: SOM Cache module import
    const somStart = performance.now();
    try {
      const { somWebGPUCache } = await import('$lib/webgpu/som-webgpu-cache');
      timings.somImport = Math.round(performance.now() - somStart);
      results.somImport = somWebGPUCache ? '✅ SOM Cache module loaded' : '❌ SOM Cache is null';
      if (!somWebGPUCache) allPassed = false;
    } catch (err) {
      timings.somImport = Math.round(performance.now() - somStart);
      results.somImport = `❌ SOM Cache import failed: ${(err as Error).message}`;
      allPassed = false;
    }

    // Test 2: Texture Streaming module import
    const textureStart = performance.now();
    try {
      const { WebGPUTextureStreamer } = await import('$lib/webgpu/texture-streaming');
      timings.textureImport = Math.round(performance.now() - textureStart);

      // Verify class has required methods
      const hasGetMemoryStats = 'getMemoryStats' in WebGPUTextureStreamer.prototype;
      const hasDispose = 'dispose' in WebGPUTextureStreamer.prototype;
      const hasInitialize = 'initialize' in WebGPUTextureStreamer.prototype;

      if (hasGetMemoryStats && hasDispose && hasInitialize) {
        results.textureImport = '✅ Texture Streaming module loaded (3 methods verified)';
      } else {
        results.textureImport = `⚠️ Texture Streaming loaded but missing methods (getMemoryStats: ${hasGetMemoryStats}, dispose: ${hasDispose}, initialize: ${hasInitialize})`;
        allPassed = false;
      }
    } catch (err) {
      timings.textureImport = Math.round(performance.now() - textureStart);
      results.textureImport = `❌ Texture Streaming import failed: ${(err as Error).message}`;
      allPassed = false;
    }

    // Test 3: N64 LOD System module import
    const lodStart = performance.now();
    try {
      const { n64TextureLOD } = await import('$lib/webgpu/N64TextureLODSystem');
      timings.lodImport = Math.round(performance.now() - lodStart);
      results.lodImport = n64TextureLOD
        ? '✅ N64 LOD System module loaded'
        : '❌ N64 LOD System is null';
      if (!n64TextureLOD) allPassed = false;
    } catch (err) {
      timings.lodImport = Math.round(performance.now() - lodStart);
      results.lodImport = `❌ N64 LOD System import failed: ${(err as Error).message}`;
      allPassed = false;
    }

    // Test 4: WebGPU Texture Streaming Demo component import
    const componentStart = performance.now();
    try {
      const component = await import('$lib/components/evidence/WebGPUTextureStreamingDemo.svelte');
      timings.componentImport = Math.round(performance.now() - componentStart);
      results.componentImport = component.default
        ? '✅ WebGPUTextureStreamingDemo component loaded'
        : '❌ Component is null';
      if (!component.default) allPassed = false;
    } catch (err) {
      timings.componentImport = Math.round(performance.now() - componentStart);
      results.componentImport = `❌ Component import failed: ${(err as Error).message}`;
      allPassed = false;
    }

    // Test 5: Check showcase route file exists (filesystem check — can't import .svelte from server)
    const showcaseStart = performance.now();
    try {
      const { existsSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const showcasePath = resolve('src/routes/(app)/demos/webgpu-showcase/+page.svelte');
      const exists = existsSync(showcasePath);
      timings.showcaseRoute = Math.round(performance.now() - showcaseStart);
      results.showcaseRoute = exists
        ? '✅ WebGPU Showcase route file exists'
        : '❌ Showcase route file missing';
      if (!exists) allPassed = false;
    } catch (err) {
      timings.showcaseRoute = Math.round(performance.now() - showcaseStart);
      results.showcaseRoute = `❌ Showcase route check failed: ${(err as Error).message}`;
      allPassed = false;
    }

    const totalTime = Object.values(timings).reduce((sum, t) => sum + t, 0);

    return json({
      success: allPassed,
      summary: allPassed ? '✅ All 5 WebGPU modules passed' : '❌ Some WebGPU modules failed',
      modules: {
        somCache: results.somImport,
        textureStreaming: results.textureImport,
        n64Lod: results.lodImport,
        demoComponent: results.componentImport,
        showcaseRoute: results.showcaseRoute,
      },
      timings: {
        ...timings,
        totalMs: totalTime,
      },
      metadata: {
        testCount: 5,
        passedCount: Object.values(results).filter((r) => r.startsWith('✅')).length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
		return json(
			{
				success: false,
				error: (err as Error)?.message ?? 'WebGPU modules test failed',
				results,
			},
			{ status: 500 }
		);
	}
};