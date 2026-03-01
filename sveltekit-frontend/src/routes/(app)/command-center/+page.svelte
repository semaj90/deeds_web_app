<script lang="ts">
	import Card from '$lib/components/ui/card/Card.svelte';
	import CardContent from '$lib/components/ui/card/CardContent.svelte';
	import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
	import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
	import { StatsCard, SystemStatus, QuickActions } from '$lib/components/dashboard';
	import type { Alert, QuickAction } from '$lib/components/dashboard';
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import CodebaseSearch from '$lib/components/CodebaseSearch.svelte';

	let { data }: { data: PageData } = $props();

	let metrics = $state({
		totalCases: 42,
		activeCases: 15,
		evidenceProcessed: 237,
		trends: { totalCases: 5.2, activeCases: -2.1, evidenceProcessed: 12.8 }
	});

	// System alerts for SystemStatus component
	let systemAlerts = $state<Alert[]>([
		{
			id: '1',
			type: 'success',
			message: 'All services operational',
			timestamp: new Date().toLocaleTimeString()
		},
		{
			id: '2',
			type: 'info',
			message: 'Database connection healthy',
			timestamp: new Date().toLocaleTimeString()
		},
		{
			id: '3',
			type: 'warning',
			message: 'High memory usage detected (72%)',
			timestamp: new Date().toLocaleTimeString()
		}
	]);

	function dismissAlert(id: string) {
		const alert = systemAlerts.find(a => a.id === id);
		if (alert) {
			alert.dismissed = true;
			systemAlerts = [...systemAlerts]; // Trigger reactivity
		}
	}

	// Quick actions for QuickActions component
	let quickActions: QuickAction[] = [
		{
			id: 'new-case',
			icon: 'gavel',
			label: 'New Case',
			description: 'Create a new legal case',
			variant: 'primary',
			onClick: () => goto('/cases')
		},
		{
			id: 'upload-evidence',
			icon: 'upload',
			label: 'Upload Evidence',
			description: 'Add evidence to existing cases',
			variant: 'success',
			onClick: () => goto('/evidence')
		},
		{
			id: 'search',
			icon: 'search',
			label: 'Global Search',
			description: 'Search across all cases and evidence',
			variant: 'default',
			onClick: () => goto('/global-search')
		},
		{
			id: 'analytics',
			icon: 'bar-chart-2',
			label: 'Analytics',
			description: 'View case statistics and trends',
			variant: 'default',
			onClick: () => goto('/dashboard')
		}
	];
</script>

<svelte:head>
	<title>Command Center - YoRHa Legal AI</title>
</svelte:head>

<div style="min-height: 100vh; background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%); color: white; padding: 2rem;">
	<h1 style="font-size: 2rem; margin-bottom: 1rem;">Command Center</h1>

	<!-- Stats Cards Row -->
	<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-top: 2rem;">
		<StatsCard icon="gavel" label="Total Cases" value={metrics.totalCases}
		           trend={metrics.trends.totalCases} trendLabel="vs last month" />
		<StatsCard icon="activity" label="Active Cases" value={metrics.activeCases}
		           trend={metrics.trends.activeCases} trendLabel="vs last week" />
		<StatsCard icon="file-text" label="Evidence Items" value={metrics.evidenceProcessed}
		           trend={metrics.trends.evidenceProcessed} trendLabel="this month" />
	</div>

	<!-- Main Grid: Service Health + System Status -->
	<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-top: 2rem;">
		<Card>
			<CardHeader><CardTitle style="color: white;">Service Health</CardTitle></CardHeader>
			<CardContent>
				<pre style="font-size: 0.8rem; color: #e0e0e0;">{JSON.stringify(data.serviceHealth, null, 2)}</pre>
			</CardContent>
		</Card>

		<SystemStatus
			alerts={systemAlerts}
			title="System Status"
			maxHeight="500px"
			onDismiss={dismissAlert}
		/>
	</div>

	<!-- User Info + Quick Actions Grid -->
	<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-top: 1rem;">
		<Card>
			<CardHeader><CardTitle style="color: white;">User</CardTitle></CardHeader>
			<CardContent>
				<p style="color: #e0e0e0;">{data.user ? data.user.email : 'No user'}</p>
			</CardContent>
		</Card>

		<QuickActions actions={quickActions} title="Quick Actions" layout="grid" compact={true} />
	</div>

	<!-- CodebaseSearch (Ctrl/Cmd+K to open) -->
	<CodebaseSearch />
</div>
