/**
 * Gemma4 Service Health Check
 * Verifies connectivity to the Gemma4 inference endpoint
 */

export interface Gemma4HealthResponse {
  healthy: boolean;
  message: string;
  endpoint: string;
  models?: string[];
  supports_system_role?: boolean;
  supports_tool_calls?: boolean;
}

/**
 * Check Gemma4 health via /v1/models endpoint
 * Compatible with both Bifrost and direct TurboQuant servers
 */
export async function checkGemma4Health(
  baseUrl: string = process.env.GEMMA4_OPENAI_BASE_URL ?? 'http://127.0.0.1:3040/v1',
  timeoutMs: number = 5000
): Promise<Gemma4HealthResponse> {
  try {
    const modelsUrl = new URL('/models', baseUrl).toString();

    const response = await Promise.race([
      fetch(modelsUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), timeoutMs)
      ),
    ]);

    if (!response.ok) {
      return {
        healthy: false,
        message: `HTTP ${response.status}: ${response.statusText}`,
        endpoint: baseUrl,
      };
    }

    const data = (await response.json()) as any;

    // Expected shape: { data: [{ id: "model-name", ... }, ...] }
    const models = data?.data?.map((m: any) => m.id) ?? [];

    return {
      healthy: true,
      message: `Gemma4 service healthy (${models.length} models available)`,
      endpoint: baseUrl,
      models,
      supports_system_role: data?.supports_system_role ?? true,
      supports_tool_calls: data?.supports_tool_calls ?? true,
    };
  } catch (error: any) {
    return {
      healthy: false,
      message: `Health check failed: ${error.message}`,
      endpoint: baseUrl,
    };
  }
}

/**
 * CLI entrypoint: check Gemma4 health
 * Usage: node --loader tsx src/lib/server/ai/gemma4-health.ts [base_url]
 */
async function main() {
  const baseUrl = process.argv[2] ?? process.env.GEMMA4_OPENAI_BASE_URL ?? 'http://127.0.0.1:3040/v1';
  const result = await checkGemma4Health(baseUrl);
  console.log(`\n🔍 Gemma4 Health Check: ${baseUrl}`);
  console.log(`   Status: ${result.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
  console.log(`   Message: ${result.message}`);
  if (result.models?.length) {
    console.log(`   Models: ${result.models.join(', ')}`);
  }
  if (result.supports_system_role !== undefined) {
    console.log(`   System role support: ${result.supports_system_role ? '✅' : '❌'}`);
  }
  if (result.supports_tool_calls !== undefined) {
    console.log(`   Tool calls support: ${result.supports_tool_calls ? '✅' : '❌'}`);
  }
  console.log('');

  process.exit(result.healthy ? 0 : 1);
}

// Run if called directly (not imported)
if (process.argv[1].endsWith('gemma4-health.ts') || process.argv[1].endsWith('gemma4-health.js')) {
  main().catch(console.error);
}
