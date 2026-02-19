/**
 * Service Discovery Demo - TypeScript Version
 *
 * This script demonstrates the Docker service discovery system.
 * It lists all discovered services and their endpoints.
 */

import {
  getServiceDiscovery,
  initializeCommonServices,
  COMMON_SERVICES,
  ServiceDiscoveryResult,
} from '../src/lib/server/helpers/service-discovery';

async function main() {
  const args = process.argv.slice(2);
  const isVerify = args.includes('--verify');
  const specificService = args[0];
  const isDev = process.env.NODE_ENV === 'development';
  const discoveryEnabled = process.env.DEV_DOCKER_DISCOVERY === 'true';

  console.log('\n🔍 Service Discovery Configuration');
  console.log('═'.repeat(60));
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Docker Discovery: ${discoveryEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`Service Verification: ${isVerify ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log('═'.repeat(60));

  try {
    const discovery = getServiceDiscovery();

    // If specific service requested
    if (specificService && specificService in COMMON_SERVICES) {
      console.log(`\n🎯 Discovering: ${specificService}`);
      const result = await discovery.getServiceUrl(
        specificService,
        COMMON_SERVICES[specificService as keyof typeof COMMON_SERVICES]
      );
      printServiceResult(specificService, result);
    } else {
      // Discover all common services
      console.log('\n🚀 Discovering all common services...\n');
      const results = await discovery.getMultipleServices(COMMON_SERVICES);

      // Print results in a table
      const tableData = Object.entries(results).map(([name, result]) => ({
        Service: name,
        URL: result.url,
        Source: result.source.toUpperCase(),
        Verified: result.verified ? '✅' : result.verified === false ? '❌' : '⊘',
      }));

      console.table(tableData);

      // Print summary
      console.log('\n📊 Summary');
      console.log('═'.repeat(60));
      const sources = {
        env: Object.values(results).filter((r) => r.source === 'env').length,
        discovery: Object.values(results).filter((r) => r.source === 'discovery').length,
        fallback: Object.values(results).filter((r) => r.source === 'fallback').length,
      };
      console.log(`Configured via ENV: ${sources.env}`);
      console.log(`Discovered via Docker: ${sources.discovery}`);
      console.log(`Using Fallback: ${sources.fallback}`);

      // Print environment variables
      console.log('\n🔐 Environment Variables');
      console.log('═'.repeat(60));
      for (const [name, config] of Object.entries(COMMON_SERVICES)) {
        const envValue = process.env[config.envVar];
        console.log(`${config.envVar}: ${envValue ? '✅ SET' : '❌ NOT SET'}`);
      }
    }

    // Cache statistics
    const cacheStats = discovery.getCacheStats();
    console.log('\n💾 Cache Statistics');
    console.log('═'.repeat(60));
    console.log(`Cached Entries: ${cacheStats.size}`);
    if (cacheStats.size > 0) {
      console.log('Cached Services:');
      cacheStats.entries.forEach((entry) => console.log(`  - ${entry}`));
    }

    console.log('\n✅ Service discovery complete!');
    console.log('\nUsage Tips:');
    console.log('  • Enable Docker discovery: DEV_DOCKER_DISCOVERY=true npm run dev');
    console.log('  • Verify specific service: node scripts/discover-services.ts minio');
    console.log('  • Set env var to override: MINIO_ENDPOINT=http://custom:9000');
  } catch (error) {
    console.error('❌ Service discovery failed:');
    console.error(error);
    process.exit(1);
  }
}

function printServiceResult(name: string, result: ServiceDiscoveryResult): void {
  console.log(`\n📍 ${name.toUpperCase()}`);
  console.log('─'.repeat(40));
  console.log(`URL:      ${result.url}`);
  console.log(`Source:   ${result.source.toUpperCase()}`);
  console.log(
    `Verified: ${result.verified ? '✅ YES' : result.verified === false ? '❌ NO' : '⊘ SKIPPED'}`
  );
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
