#!/usr/bin/env node

/**
 * Service Discovery Demo Script
 * Shows all discovered services with their sources and verification status
 *
 * Usage:
 *   npx tsx discover-services.ts              # Show all services
 *   npx tsx discover-services.ts minio        # Show specific service
 *   npx tsx discover-services.ts --verify     # Verify all services
 *   npx tsx discover-services.ts --cache      # Show cache statistics
 */

import { getServiceDiscovery, initializeCommonServices, COMMON_SERVICES } from '../sveltekit-frontend/src/lib/server/helpers/service-discovery';

async function main() {
  const args = process.argv.slice(2);
  const showVerification = args.includes('--verify');
  const showCache = args.includes('--cache');
  const specificService = args.find(arg => !arg.startsWith('--'));

  console.log('\n🔍 Service Discovery\n');

  try {
    // Initialize all services
    const services = await initializeCommonServices();

    if (specificService) {
      // Show specific service
      const service = services[specificService as keyof typeof services];
      if (!service) {
        console.error(`❌ Service not found: ${specificService}`);
        console.log('\nAvailable services:', Object.keys(services).join(', '));
        process.exit(1);
      }

      console.log(`Service: ${specificService}`);
      console.log(`  URL: ${service.url}`);
      console.log(`  Source: ${service.source}`);

      if (showVerification && service.url.startsWith('http')) {
        const isReachable = await verifyEndpoint(service.url);
        console.log(`  Reachable: ${isReachable ? '✅ Yes' : '❌ No'}`);
      }
    } else {
      // Show all services in a table
      const rows = Object.entries(services).map(([name, service]) => ({
        Service: name,
        URL: service.url,
        Source: service.source.toUpperCase(),
        Status: '✅'
      }));

      console.table(rows);

      if (showVerification) {
        console.log('\n🔗 Verifying endpoints...\n');
        for (const [name, service] of Object.entries(services)) {
          if (service.url.startsWith('http')) {
            const isReachable = await verifyEndpoint(service.url);
            console.log(`  ${isReachable ? '✅' : '❌'} ${name}: ${service.url}`);
          }
        }
      }
    }

    if (showCache) {
      const discovery = getServiceDiscovery();
      const stats = discovery.getCacheStats();
      console.log(`\n📊 Cache Statistics:\n  Entries: ${stats.size}`);
      console.log(`  TTL: 5 minutes\n`);
    }

    console.log('');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function verifyEndpoint(url: string, timeout = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timeoutId);
    return response?.ok ?? false;
  } catch {
    return false;
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
