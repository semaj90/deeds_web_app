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
	import YoRHaDetectiveCommandCenter from '$lib/components/yorha/YoRHaDetectiveCommandCenter.svelte';
	import PhoenixProsecutorDashboard from '$lib/components/yorha/PhoenixProsecutorDashboard.svelte';

	let { data }: { data: PageData } = $props();

	let metrics = $derived({
		totalCases: data.metrics?.totalCases ?? 0,
		activeCases: data.metrics?.activeCases ?? 0,
		evidenceProcessed: data.metrics?.evidenceProcessed ?? 0,
	});

	// Dismissed alert IDs tracked separately (derived is read-only)
	let dismissedIds = $state(new Set<string>());

	// System alerts derived from actual service health
	let systemAlerts = $derived.by(() => {
		const alerts: Alert[] = [];
		const health = data.serviceHealth ?? {};
		const overall = (health as Record<string, unknown>).overall as string | undefined;

		if (overall === 'healthy') {
			alerts.push({ id: 'overall', type: 'success', message: 'All services operational', timestamp: new Date().toLocaleTimeString() });
		} else if (overall === 'degraded') {
			alerts.push({ id: 'overall', type: 'warning', message: 'Some services degraded', timestamp: new Date().toLocaleTimeString() });
		} else {
			alerts.push({ id: 'overall', type: 'error', message: 'System health check failed', timestamp: new Date().toLocaleTimeString() });
		}

		for (const [service, status] of Object.entries(health).filter(([k]) => k !== 'overall')) {
			if (!status) {
				alerts.push({ id: service, type: 'error', message: `${service} is offline`, timestamp: new Date().toLocaleTimeString() });
			}
		}

		if (alerts.length === 1 && alerts[0].type === 'success') {
			alerts.push({ id: 'db', type: 'info', message: `${metrics.totalCases} cases, ${metrics.evidenceProcessed} evidence items`, timestamp: new Date().toLocaleTimeString() });
		}

		return alerts.filter(a => !dismissedIds.has(a.id));
	});

	function dismissAlert(id: string) {
		dismissedIds = new Set([...dismissedIds, id]);
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
		<StatsCard icon="gavel" label="Total Cases" value={metrics.totalCases} />
		<StatsCard icon="activity" label="Active Cases" value={metrics.activeCases} />
		<StatsCard icon="file-text" label="Evidence Items" value={metrics.evidenceProcessed} />
	</div>

	<!-- Main Grid: Service Health + System Status -->
	<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-top: 2rem;">
		<Card>
			<CardHeader><CardTitle style="color: white;">Service Health</CardTitle></CardHeader>
			<CardContent>
				<div style="display: grid; gap: 0.5rem;">
					{#each Object.entries(data.serviceHealth ?? {}).filter(([k]) => k !== 'overall') as [service, status]}
						<div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0.8rem; background: rgba(255,255,255,0.05); border-radius: 6px; border-left: 3px solid {status ? '#22c55e' : '#ef4444'};">
							<span style="font-size: 0.85rem; color: #e0e0e0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">{service}</span>
							<span style="font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 4px; background: {status ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}; color: {status ? '#4ade80' : '#f87171'};">
								{status ? 'ONLINE' : 'OFFLINE'}
							</span>
						</div>
					{/each}
					{#if data.serviceHealth?.overall}
						<div style="margin-top: 0.5rem; padding: 0.5rem 0.8rem; text-align: center; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; border-radius: 6px;
							background: {data.serviceHealth.overall === 'healthy' ? 'rgba(34,197,94,0.1)' : data.serviceHealth.overall === 'degraded' ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)'};
							color: {data.serviceHealth.overall === 'healthy' ? '#4ade80' : data.serviceHealth.overall === 'degraded' ? '#facc15' : '#f87171'};
							border: 1px solid {data.serviceHealth.overall === 'healthy' ? 'rgba(34,197,94,0.2)' : data.serviceHealth.overall === 'degraded' ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.2)'};">
							System: {data.serviceHealth.overall}
						</div>
					{/if}
				</div>
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

	<!-- YoRHa Detective Command Center -->
	<YoRHaDetectiveCommandCenter currentUser={data.user} />

	<!-- Phoenix Prosecutor Dashboard -->
	<PhoenixProsecutorDashboard />
</div>
