# Command Center Incremental Rebuild Diagnosis

**Date**: March 1, 2026
**Session**: 93r28c

## Problem
Original 1,345-line command-center page rendered blank (tan/beige screen)

## Root Cause Found

**BROKEN COMPONENT**: `SystemStatus` from `$lib/components/dashboard`

## Incremental Test Results

| Step | Components Added | Result | Screenshot |
|------|-----------------|---------|------------|
| 0 | Minimal inline HTML only | ✅ PASS | Dark gradient background, "PAGE IS RENDERING!" message |
| 1 | Card, CardHeader, CardTitle, CardContent | ✅ PASS | Card titles visible, JSON data displays |
| 2 | + StatsCard | ✅ PASS | Beautiful metric cards with trends (+5.2%, -2.1%, +12.8%) |
| 3 | + SystemStatus | ❌ FAIL | **Page goes blank (tan/beige)** |

## Broken Component Details

**File**: `src/lib/components/dashboard/SystemStatus.svelte` (8.3KB, last modified Feb 28 10:56)

**Used in original command-center**:
```typescript
import { StatsCard, SystemStatus, QuickActions } from '$lib/components/dashboard';

// ...

<SystemStatus
  alerts={systemAlerts}
  title="System Status"
  maxHeight="500px"
  onDismiss={dismissAlert}
/>
```

## Working Components (Verified Safe)

✅ `Card`, `CardHeader`, `CardTitle`, `CardContent` - All render correctly
✅ `StatsCard` - Renders beautifully with metrics, trends, icons
❓ `QuickActions` - Not tested yet
❌ `SystemStatus` - **BREAKS PAGE RENDERING**

## Next Steps

1. **Fix SystemStatus.svelte**:
   - Check for Svelte 5 syntax errors
   - Verify `Alert` type exports
   - Test `onDismiss` callback prop
   - Check for undefined prop access

2. **Test QuickActions** once SystemStatus is fixed

3. **Test remaining imports** from original:
   - `Button`
   - `CodebaseSearch`
   - `YoRHaDetectiveCommandCenter`
   - `PhoenixProsecutorDashboard`

4. **Rebuild full dashboard** once all components pass

## Files

- **Original (broken)**: `deeds_labs/command-center-original/+page.svelte` (1,345 lines)
- **Step 2 (working)**: See inline version below (has StatsCard working)
- **Current (minimal)**: `src/routes/(app)/command-center/+page.svelte` (19 lines)

## Step 2 Working Version (StatsCard + Cards)

```svelte
<script lang="ts">
	import Card from '$lib/components/ui/card/Card.svelte';
	import CardContent from '$lib/components/ui/card/CardContent.svelte';
	import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
	import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
	import { StatsCard } from '$lib/components/dashboard';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let metrics = $state({
		totalCases: 42,
		activeCases: 15,
		evidenceProcessed: 237,
		trends: { totalCases: 5.2, activeCases: -2.1, evidenceProcessed: 12.8 }
	});
</script>

<svelte:head>
	<title>Command Center - YoRHa Legal AI</title>
</svelte:head>

<div style="min-height: 100vh; background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%); color: white; padding: 2rem;">
	<h1 style="font-size: 2rem; margin-bottom: 1rem;">Command Center</h1>

	<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-top: 2rem;">
		<StatsCard icon="gavel" label="Total Cases" value={metrics.totalCases}
		           trend={metrics.trends.totalCases} trendLabel="vs last month" />
		<StatsCard icon="activity" label="Active Cases" value={metrics.activeCases}
		           trend={metrics.trends.activeCases} trendLabel="vs last week" />
		<StatsCard icon="file-text" label="Evidence Items" value={metrics.evidenceProcessed}
		           trend={metrics.trends.evidenceProcessed} trendLabel="this month" />
	</div>

	<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-top: 2rem;">
		<Card>
			<CardHeader><CardTitle style="color: white;">Service Health</CardTitle></CardHeader>
			<CardContent>
				<pre style="font-size: 0.8rem; color: #e0e0e0;">{JSON.stringify(data.serviceHealth, null, 2)}</pre>
			</CardContent>
		</Card>
		<Card>
			<CardHeader><CardTitle style="color: white;">User</CardTitle></CardHeader>
			<CardContent>
				<p style="color: #e0e0e0;">{data.user ? data.user.email : 'No user'}</p>
			</CardContent>
		</Card>
	</div>
</div>
```

## Recommendation

**DO NOT use SystemStatus component** in command-center until it's fixed.
Use Step 2 version as baseline for rebuilding the dashboard.
