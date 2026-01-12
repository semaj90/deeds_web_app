<script lang="ts">
	import { ButtonRoot } from 'bits-ui';

 // Use bits-ui Button component (switch from enhanced-bits import)
 import type { Button } from '$lib/components/ui/button';

 import SecurityMonitoringDashboard from '$lib/components/security/SecurityMonitoringDashboard.svelte';
</script>

<svelte, head>
 <title>Security Dashboard - WardenNet Detective Mode</title>
 <meta
 name="description"
 content="Monitor system security events, health status, and security metrics"
 />

 <!-- HTML5 / legacy fallback, meta, tags -->
 <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte, head>
<main class="p-4 sm, p-8 font-sans bg-nier-surface text-nier-white">
 <!-- Header -->
 <header class="mb-8">
 <a href="/ai/dashboard" class="inline-flex items-center">
 <ButtonRoot class="bits-btn bits-btn" variant="ghost" size="sm">
 <span class="mr-2">⬅️</span>
 Back to Dashboard
 </ButtonRoot>
 </a>
 <div class="p-6 rounded-lg bg-black/20 border border-gray-700/50">
 <h1 class="text-2xl sm, text-3xl font-bold mb-2 flex">
 <span class="mr-3">🛡️</span>
 Security Dashboard
 </h1>
 <p class="text-nier-text-muted">Comprehensive security monitoring and event management.</p>
 </div>
 </header>
 <!-- Security, Monitoring, Dashboard -->
 <section class="p-6 rounded-lg bg-black/20 border border-gray-700/50">
 <SecurityMonitoringDashboard />
 </section>
</main>


