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
| 3a | + SystemStatus (without props) | ❌ FAIL | **Page goes blank (tan/beige)** - Missing systemAlerts/dismissAlert |
| 3b | + SystemStatus (with props) | ❌ FAIL | **TDZ error** - bits-ui ScrollArea has `let props = $props()` bug |
| 3c | + SystemStatus (plain div scrolling) | ✅ PASS | **3 alerts rendering**, badge shows "1 WARNINGS", dismiss buttons work |
| 4 | + QuickActions | ✅ PASS | **4 action buttons** (New Case, Upload Evidence, Global Search, Analytics) |
| 5 | + CodebaseSearch | ✅ PASS | **Native `<dialog>` element**, no bits-ui, Ctrl/Cmd+K keyboard shortcut |

## Root Cause Analysis

**Component**: `SystemStatus.svelte` itself is FINE (364 lines, clean Svelte 5 + bits-ui)

**Actual Problem**: The command-center page didn't define required props:
- `systemAlerts` (Alert[] array) - UNDEFINED
- `dismissAlert` (function) - UNDEFINED

When SystemStatus tried to access undefined props, it threw an error that broke the page.

**Fix 1 - Missing Props**: Defined both variables in command-center/+page.svelte:
```typescript
let systemAlerts = $state<Alert[]>([
  { id: '1', type: 'success', message: 'All services operational', timestamp: '...' },
  { id: '2', type: 'info', message: 'Database connection healthy', timestamp: '...' },
  { id: '3', type: 'warning', message: 'High memory usage detected (72%)', timestamp: '...' }
]);

function dismissAlert(id: string) {
  const alert = systemAlerts.find(a => a.id === id);
  if (alert) {
    alert.dismissed = true;
    systemAlerts = [...systemAlerts]; // Trigger reactivity
  }
}
```

**Fix 2 - bits-ui ScrollArea TDZ Bug**: Replaced ScrollArea with plain div
```typescript
// BEFORE (broken):
import { ScrollArea } from 'bits-ui';
<ScrollArea.Root type="hover">...</ScrollArea.Root>

// AFTER (working):
<div style="overflow-y: auto;">...</div>
// + CSS scrollbar styling (webkit-scrollbar, scrollbar-width, scrollbar-color)
```

**Root cause of Fix 2**: bits-ui v2.16.2 ScrollArea uses `let props = $props()` (un-destructured) which triggers TDZ error in Svelte 5.46.0. Same bug as Dialog component from Session 93r14.

## Working Components (Verified Safe)

✅ `Card`, `CardHeader`, `CardTitle`, `CardContent` - All render correctly
✅ `StatsCard` - Renders beautifully with metrics, trends, icons
✅ `SystemStatus` - **FIXED** - Now works with plain div scrolling (3 alerts, dismiss buttons)
✅ `QuickActions` - 4 action buttons with icons, labels, onClick handlers
✅ `CodebaseSearch` - Native dialog element, 2-stage MCP search (Fuse→Qdrant)

## Next Steps

1. ✅ **SystemStatus Fixed**: Props defined + ScrollArea replaced with plain div

2. **Test QuickActions** (Step 4):
   - Needs `actions` prop (QuickAction[] array)
   - Needs `onActionClick` handler

4. **Test remaining imports** from original:
   - `Button` (already works - used in StatsCard)
   - `CodebaseSearch`
   - `YoRHaDetectiveCommandCenter`
   - `PhoenixProsecutorDashboard`

5. **Rebuild full dashboard** once all components pass

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

## Status: FIXED ✅

**SystemStatus component** is now properly wired with required props. Ready to test Step 3b.

**Pattern for adding dashboard components**:
1. Always check what props the component requires
2. Define $state variables and handlers BEFORE importing component
3. Test incrementally to catch undefined prop errors early
