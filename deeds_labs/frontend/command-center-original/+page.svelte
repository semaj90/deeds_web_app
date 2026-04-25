<script lang="ts">
	import Card from '$lib/components/ui/card/Card.svelte';
	import CardContent from '$lib/components/ui/card/CardContent.svelte';
	import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
	import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CodebaseSearch from '$lib/components/CodebaseSearch.svelte';
	import YoRHaDetectiveCommandCenter from '$lib/components/yorha/YoRHaDetectiveCommandCenter.svelte';
	import PhoenixProsecutorDashboard from '$lib/components/yorha/PhoenixProsecutorDashboard.svelte';
	import { StatsCard, SystemStatus, QuickActions } from '$lib/components/dashboard';
	import type { Alert, QuickAction } from '$lib/components/dashboard';

	let showCodebaseSearch = $state(false);
	let showDetectiveCenter = $state(false);
	let showProsecutorDashboard = $state(false);
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData }
	let { data }: Props = $props();

	// Use SSR health data from legalAIService.healthCheck()
	let serviceHealth = $derived(data.serviceHealth);

	// Svelte 5 runes state
	let metrics = $state({
		totalCases: 0,
		activeCases: 0,
		evidenceProcessed: 0,
		aiQueries: 0,
		systemHealth: 'operational',
		gpuStatus: 'active',
		ragIndexSize: 0,
		ocrAccuracy: 0,
		trends: {
totalCases: 5.2,
			activeCases: -2.1,
			evidenceProcessed: 12.8,
			aiQueries: 8.5
		}
	});

	let activeCases = $state<Array<{ id: string, title: string;
		status: 'active' | 'pending' | 'critical';
		lastActivity: string;
	evidenceCount: number;
		priority: 'low' | 'medium' | 'high' | 'urgent';
	}>>([]);

	let systemAlerts = $state<Alert[]>([]);

	let notifications = $state<Array<{ id: string, type: 'info' | 'success' | 'warning' | 'error';
		title: string;
	message: string;
		timestamp: string;
		read?: boolean;
	}>>([]);

	let currentView = $state<'dashboard'>('dashboard');
	let isDarkTheme = $state(true);
	let showNotifications = $state(false);
	let showQuickActions = $state(false);
	let isRefreshing = $state(false);
	let lastRefresh = $state(new Date());

	// Real-time update interval
	let refreshInterval: ReturnType<typeof setInterval> | undefined;

	// Click outside handler
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.quick-actions-dropdown') && !target.closest('[onclick*="showQuickActions"]')) {
			showQuickActions = false;
		}
		if (!target.closest('.notifications-dropdown') && !target.closest('[onclick*="showNotifications"]')) {
			showNotifications = false;
		}
	}

	// Add click outside listener
	$effect(() => {
		(async () => {
			await loadAllData();
			refreshInterval = setInterval(async () => {
				await loadAllData();
			}, 30000);
		})();

		document.addEventListener('keydown', handleKeydown);
		document.addEventListener('click', handleClickOutside);

		return () => {
			if (refreshInterval) {
				clearInterval(refreshInterval);
			}
			document.removeEventListener('keydown', handleKeydown);
			document.removeEventListener('click', handleClickOutside);
		};
	});

	async function loadAllData() {
		isRefreshing = true;
		try {
			await Promise.all([
				loadMetrics(),
				loadActiveCases(),
				loadSystemAlerts(),
				loadNotifications()
			]);
			lastRefresh = new Date();
		} finally {
			isRefreshing = false;
		}
	}

	async function loadMetrics() {
		try {
			// Fetch real data from APIs in parallel
			const [casesRes, healthRes] = await Promise.all([
				fetch('/api/cases?limit=1000').then(r => r.ok ? r.json() : null).catch(() => null),
				fetch('/api/health/services').then(r => r.ok ? r.json() : null).catch(() => null)
			]);

			const allCases = casesRes?.data ?? [];
			const openCases = allCases.filter((c: any) => c.status === 'open' || c.status === 'active');
			const healthStatus = healthRes?.status ?? 'unknown';
			const services = healthRes?.services ?? {};
			const gpuUp = services.qdrant || services.trtllm;

			metrics = {
				totalCases: allCases.length,
				activeCases: openCases.length,
				evidenceProcessed: allCases.reduce((sum: number, c: any) => sum + (c.evidenceCount ?? 0), 0),
				aiQueries: 0,
				systemHealth: healthStatus === 'healthy' ? 'operational' : healthStatus === 'degraded' ? 'warning' : 'error',
				gpuStatus: gpuUp ? 'active' : 'offline',
				ragIndexSize: 0,
				ocrAccuracy: 0,
				trends: {
					totalCases: 0,
					activeCases: 0,
					evidenceProcessed: 0,
					aiQueries: 0
				}
			};
		} catch (error) {
			console.error('Failed to load metrics:', error);
		}
	}

	async function loadActiveCases() {
		try {
			const res = await fetch('/api/cases?status=active&limit=5');
			if (!res.ok) return;
			const json = await res.json();
			const dbCases = json.data ?? [];

			activeCases = dbCases.map((c: any) => ({
				id: c.id?.substring(0, 13) ?? 'CASE-???',
				title: c.title ?? 'Untitled Case',
				status: c.status === 'open' ? 'active' : (c.priority === 'urgent' ? 'critical' : 'pending'),
				lastActivity: c.updatedAt ? formatRelativeTime(c.updatedAt) : 'unknown',
				evidenceCount: c.evidenceCount ?? 0,
				priority: c.priority ?? 'medium'
			}));
		} catch (error) {
			console.error('Failed to load active cases:', error);
		}
	}

	function formatRelativeTime(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 60) return `${mins} minutes ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours} hours ago`;
		const days = Math.floor(hours / 24);
		return `${days} days ago`;
	}

	async function loadSystemAlerts() {
		try {
			const res = await fetch('/api/health/services');
			if (!res.ok) {
				systemAlerts = [{
					id: 'alert-health-down',
					type: 'error',
					message: 'Health check endpoint unreachable',
					timestamp: new Date().toLocaleTimeString()
				}];
				return;
			}
			const health = await res.json();
			const alerts: typeof systemAlerts = [];
			const services = health.services ?? {};

			for (const [name, up] of Object.entries(services)) {
				if (!up) {
					alerts.push({
						id: `alert-${name}`,
						type: 'error',
						message: `${name} service is down`,
						timestamp: new Date().toLocaleTimeString()
					});
				}
			}

			if (health.status === 'degraded') {
				alerts.push({
					id: 'alert-degraded',
					type: 'warning',
					message: `System is degraded (${health.responseTimeMs ?? '?'}ms response)`,
					timestamp: new Date().toLocaleTimeString()
				});
			}

			if (alerts.length === 0) {
				alerts.push({
					id: 'alert-ok',
					type: 'info',
					message: `All services operational (${health.responseTimeMs ?? '?'}ms)`,
					timestamp: new Date().toLocaleTimeString()
				});
			}

			systemAlerts = alerts;
		} catch (error) {
			console.error('Failed to load system alerts:', error);
		}
	}

	async function loadNotifications() {
		try {
			// Derive notifications from real case data
			const res = await fetch('/api/cases?limit=10');
			if (!res.ok) return;
			const json = await res.json();
			const cases = json.data ?? [];

			const notifs: typeof notifications = [];

			// Cases with urgent priority
			const urgentCases = cases.filter((c: any) => c.priority === 'urgent');
			for (const c of urgentCases) {
				notifs.push({
					id: `notif-urgent-${c.id}`,
					type: 'warning',
					title: 'Urgent Case Attention',
					message: `"${c.title}" requires immediate attention`,
					timestamp: c.updatedAt ? formatRelativeTime(c.updatedAt) : 'recently',
					read: false
				});
			}

			// Recent cases (updated in last 24h)
			const dayAgo = Date.now() - 86400000;
			const recentCases = cases.filter((c: any) => new Date(c.updatedAt).getTime() > dayAgo && c.priority !== 'urgent');
			for (const c of recentCases.slice(0, 3)) {
				notifs.push({
					id: `notif-recent-${c.id}`,
					type: 'info',
					title: 'Case Updated',
					message: `"${c.title}" was updated ${formatRelativeTime(c.updatedAt)}`,
					timestamp: formatRelativeTime(c.updatedAt),
					read: true
				});
			}

			if (notifs.length === 0) {
				notifs.push({
					id: 'notif-empty',
					type: 'info',
					title: 'All Clear',
					message: 'No pending notifications',
					timestamp: 'now',
					read: true
				});
			}

			notifications = notifs;
		} catch (error) {
			console.error('Failed to load notifications:', error);
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'operational': return 'text-green-400';
			case 'active': return 'text-blue-400';
			case 'warning': return 'text-yellow-400';
			case 'error': return 'text-red-400';
			default:return 'text-gray-400';
		}
	}

	function getPriorityColor(priority: string) {
		switch (priority) {
			case 'urgent': return 'bg-red-500/20 text-red-300 border-red-500/30';
			case 'high': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
			case 'medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
			case 'low': return 'bg-green-500/20 text-green-300 border-green-500/30';
			default:return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
		}
	}

	function getAlertIcon(type: string): string {
		switch (type) {
			case 'error': return 'alert-triangle';
			case 'warning': return 'alert-triangle';
			case 'info': return 'activity';
			default:return 'activity';
		}
	}

	function getTrendIcon(trend: number): string {
		return trend >= 0 ? 'trending-up' : 'trending-down';
	}

	function getTrendColor(trend: number) {
		return trend >= 0 ? 'text-green-400' : 'text-red-400';
	}

	function toggleTheme() {
		isDarkTheme = !isDarkTheme;
		document.documentElement.classList.toggle('dark', isDarkTheme);
	}

	function dismissAlert(alertId: string) {
		systemAlerts = systemAlerts.map(alert =>
			alert.id === alertId ? { ...alert, dismissed: true } : alert
		);
	}

	function markNotificationRead(notificationId: string) {
		notifications = notifications.map(notif =>
			notif.id === notificationId ? { ...notif, read: true } :notif
		);
	}

	function dismissNotification(notificationId: string) {
		notifications = notifications.filter(notif => notif.id !== notificationId);
	}

	function handleKeydown(event: KeyboardEvent) {
		// Ctrl/Cmd + R for refresh
		if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
			event.preventDefault();
			loadAllData();
		}

		// Ctrl/Cmd + K for search
		if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
			event.preventDefault();
			// Focus search input (to be implemented)
		}

		// Escape to close modals
		if (event.key === 'Escape') {
			showNotifications = false;
			showQuickActions = false;
		}
	}

	// Quick actions — navigate to real routes (client-side)
	async function createNewCase() {
		showQuickActions = false;
		await goto('/cases/new');
	}

	async function uploadEvidence() {
		showQuickActions = false;
		await goto('/evidence');
	}

	async function runAIAnalysis() {
		showQuickActions = false;
		await goto('/analysis-center');
	}

	async function generateReport() {
		showQuickActions = false;
		await goto('/ai-dashboard');
	}

	// Computed values
	let unreadNotificationsCount = $derived(notifications.filter(n => !n.read).length);
	let activeAlertsCount = $derived(systemAlerts.filter(a => !a.dismissed).length);

	// Quick actions configuration
	const quickActions: QuickAction[] = [
		{
			id: 'new-case',
			icon: 'gavel',
			label: 'New Case',
			description: 'Create a new legal case',
			variant: 'primary',
			onClick: createNewCase
		},
		{
			id: 'upload-evidence',
			icon: 'upload',
			label: 'Upload Evidence',
			description: 'Add evidence documents',
			variant: 'default',
			onClick: uploadEvidence
		},
		{
			id: 'ai-analysis',
			icon: 'brain',
			label: 'AI Analysis',
			description: 'Run case analysis',
			variant: 'success',
			onClick: runAIAnalysis
		}
	];
</script>

<svelte:head>
	<title>Command Center - YoRHa Legal AI</title>
</svelte:head>

<div class="command-center">
	<!-- Header -->
	<header class="header">
		<div class="header-content">
			<div class="logo-section">
				<div class="logo">YoRHa</div>
				<span class="subtitle">Legal AI Command Center</span>
			</div>
			<div class="header-actions">
				<!-- Refresh Button -->
				<Button
					variant="outline"
					size="sm"
					onclick={loadAllData}
					disabled={isRefreshing}
					class="refresh-btn bits-btn"
				>
					<Icon name="refresh-cw" class={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
					Refresh
				</Button>

				<!-- Global Search -->
				<Button class="bits-btn" variant="outline" size="sm" onclick={() => goto('/global-search')}>
					<Icon name="search" class="h-4 w-4 mr-2" />
					Global Search
					<span class="keyboard-shortcut">⌘K</span>
				</Button>

				<!-- Quick Actions -->
				<div class="relative">
					<Button class="bits-btn"
						variant="outline"
						size="sm"
						onclick={() => showQuickActions = !showQuickActions}
					>
						<Icon name="zap" class="h-4 w-4 mr-2" />
						Quick Actions
						<Icon name="chevron-down" class="h-4 w-4 ml-2" />
					</Button>

					{#if showQuickActions}
						<div class="quick-actions-dropdown">
							<Button onclick={createNewCase} class="quick-action-item bits-btn">
								<Icon name="gavel" class="h-4 w-4" />
								Create New Case
							</Button>
							<Button onclick={uploadEvidence} class="quick-action-item bits-btn">
								<Icon name="file-text" class="h-4 w-4" />
								Upload Evidence
							</Button>
							<Button onclick={runAIAnalysis} class="quick-action-item bits-btn">
								<Icon name="brain" class="h-4 w-4" />
								Run AI Analysis
							</Button>
							<Button onclick={generateReport} class="quick-action-item bits-btn">
								<Icon name="bar-chart-3" class="h-4 w-4" />
								Generate Report
							</Button>
						</div>
					{/if}
				</div>

				<!-- Notifications -->
				<div class="relative">
					<Button
						variant="outline"
						size="sm"
						onclick={() => showNotifications = !showNotifications}
						class="bits-btn notification-btn"
					>
						<Icon name="bell" class="h-4 w-4 mr-2" />
						Notifications
						{#if unreadNotificationsCount > 0}
							<span class="notification-badge">{unreadNotificationsCount}</span>
						{/if}
					</Button>

					{#if showNotifications}
						<div class="notifications-dropdown">
							<div class="notifications-header">
								<h3 class="notifications-title">Notifications</h3>
								<Button class="bits-btn"
									variant="ghost"
									size="sm"
									onclick={() => showNotifications = false}
								>
									<Icon name="x" class="h-4 w-4" />
								</Button>
							</div>
							<div class="notifications-list">
								{#each notifications as notification}
									<div class="notification-item notification-{notification.type} {notification.read ? 'read' : 'unread'}">
										<div class="notification-content">
											<div class="notification-title">{notification.title}</div>
											<div class="notification-message">{notification.message}</div>
											<div class="notification-time">{notification.timestamp}</div>
										</div>
										<div class="notification-actions">
											{#if !notification.read}
												<Button class="bits-btn"
													variant="ghost"
													size="sm"
													onclick={() => markNotificationRead(notification.id)}
												>
													Mark Read
												</Button>
											{/if}
											<Button class="bits-btn"
												variant="ghost"
												size="sm"
												onclick={() => dismissNotification(notification.id)}
											>
												<Icon name="x" class="h-4 w-4" />
											</Button>
										</div>
									</div>
								{/each}
								{#if notifications.length === 0}
									<div class="no-notifications">
										<Icon name="bell" class="h-8 w-8 text-muted-foreground" />
										<p>No notifications</p>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				<!-- Theme Toggle -->
				<Button class="bits-btn" variant="outline" size="sm" onclick={toggleTheme}>
					{#if isDarkTheme}
						<Icon name="sun" class="h-4 w-4" />
					{:else}
						<Icon name="moon" class="h-4 w-4" />
					{/if}
				</Button>

				<!-- Settings -->
				<Button class="bits-btn" variant="outline" size="sm">
					<Icon name="settings" class="h-4 w-4" />
				</Button>
			</div>
		</div>

		<!-- Status Bar -->
		<div class="status-bar">
			<div class="status-item">
				<span class="status-label">Last Refresh:</span>
				<span class="status-value">{lastRefresh.toLocaleTimeString()}</span>
			</div>
			<div class="status-item">
				<span class="status-label">System Health:</span>
				<span class={`status-value ${getStatusColor(metrics.systemHealth)}`}>
					{metrics.systemHealth}
				</span>
			</div>
			<div class="status-item">
				<span class="status-label">Active Alerts:</span>
				<span class="status-value text-yellow-400">{activeAlertsCount}</span>
			</div>
		</div>
	</header>

	<div class="main-content">
		<!-- Sidebar with Quick Actions -->
		<aside class="sidebar">
			<!-- Quick Actions Panel -->
			<div class="sidebar-section">
				<QuickActions actions={quickActions} layout="list" compact={true} />
			</div>

			<!-- Navigation -->
			<div class="sidebar-section">
				<div class="nav-section">
					<h3 class="nav-title">Operations</h3>
					<ul class="nav-list">
						<li class="nav-item active">
							<Button class="bits-btn nav-link" onclick={() => currentView = 'dashboard'}>
								<Icon name="activity" class="h-4 w-4" />
								Dashboard
							</Button>
						</li>
						<li class="nav-item">
							<Button class="bits-btn nav-link" onclick={() => goto('/cases')}>
								<Icon name="gavel" class="h-4 w-4" />
								Cases
							</Button>
						</li>
						<li class="nav-item">
							<Button class="bits-btn nav-link" onclick={() => goto('/evidence')}>
								<Icon name="file-text" class="h-4 w-4" />
								Evidence
							</Button>
						</li>
					</ul>
				</div>

				<div class="nav-section">
					<h3 class="nav-title">Intelligence</h3>
					<ul class="nav-list">
						<li class="nav-item">
							<Button class="bits-btn nav-link" onclick={() => goto('/persons-of-interest')}>
								<Icon name="users" class="h-4 w-4" />
								Persons
							</Button>
						</li>
						<li class="nav-item">
							<Button class="bits-btn nav-link" onclick={() => goto('/ai-dashboard')}>
								<Icon name="brain" class="h-4 w-4" />
								AI Chat
							</Button>
						</li>
					</ul>
				</div>
			</div>
		</aside>

		<!-- Main Dashboard Content -->
		<main class="dashboard-content">
			{#if currentView === 'dashboard'}
				<!-- Metrics Grid - Using New StatsCard Components -->
				<div class="metrics-grid">
					<StatsCard
						icon="gavel"
						label="Total Cases"
						value={metrics.totalCases}
						trend={metrics.trends.totalCases}
						trendLabel="vs last month"
					/>

					<StatsCard
						icon="activity"
						label="Active Cases"
						value={metrics.activeCases}
						trend={metrics.trends.activeCases}
						trendLabel="vs last week"
					/>

					<StatsCard
						icon="file-text"
						label="Evidence Items"
						value={metrics.evidenceProcessed}
						trend={metrics.trends.evidenceProcessed}
						trendLabel="this month"
					/>

					<StatsCard
						icon="brain"
						label="AI Queries"
						value={metrics.aiQueries}
						trend={metrics.trends.aiQueries}
						trendLabel="this month"
					/>

					<StatsCard
						icon="database"
						label="System Health"
						value={metrics.systemHealth}
						variant={metrics.systemHealth === 'operational' ? 'success' : 'warning'}
					/>
				</div>

				<!-- Active Cases & System Status -->
				<div class="content-grid">
					<!-- Active Cases -->
					<Card>
						<CardHeader>
							<CardTitle class="flex items-center">
								<Icon name="gavel" class="h-5 w-5 mr-2" />
								Active Cases
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="space-y-3">
								{#each activeCases as caseItem}
									<div class="case-item">
										<div class="case-header">
											<div class="case-title">{caseItem.title}</div>
											<div class="case-priority">
												<span class="priority-badge {getPriorityColor(caseItem.priority)}">
													{caseItem.priority}
												</span>
											</div>
										</div>
										<div class="case-meta">
											<span class="case-id">{caseItem.id}</span>
											<span class="case-evidence">{caseItem.evidenceCount} evidence items</span>
											<span class="case-activity">{caseItem.lastActivity}</span>
										</div>
									</div>
								{/each}
							</div>
						</CardContent>
					</Card>

					<!-- System Status - Using New SystemStatus Component -->
					<SystemStatus
						alerts={systemAlerts}
						title="System Status"
						maxHeight="500px"
						onDismiss={dismissAlert}
					/>
				</div>
			{/if}
		</main>
	</div>

	<!-- Codebase Search Panel -->
	<div class="codebase-search-toggle">
		<button class="codebase-toggle-btn" class:active={showCodebaseSearch} onclick={() => (showCodebaseSearch = !showCodebaseSearch)}>
			{showCodebaseSearch ? '[-] HIDE CODEBASE SEARCH' : '[+] CODEBASE SEARCH (Ctrl+K)'}
		</button>
	</div>
	{#if showCodebaseSearch}
		<div class="codebase-search-panel">
			<CodebaseSearch />
		</div>
	{/if}

	<!-- Detective Command Center -->
	<div class="codebase-search-toggle">
		<button class="codebase-toggle-btn" class:active={showDetectiveCenter} onclick={() => (showDetectiveCenter = !showDetectiveCenter)}>
			{showDetectiveCenter ? '[-] HIDE DETECTIVE CENTER' : '[+] DETECTIVE COMMAND CENTER'}
		</button>
	</div>
	{#if showDetectiveCenter}
		<div class="codebase-search-panel">
			<YoRHaDetectiveCommandCenter currentUser={data.user} />
		</div>
	{/if}

	<!-- Phoenix Prosecutor Dashboard -->
	<div class="codebase-search-toggle">
		<button class="codebase-toggle-btn" class:active={showProsecutorDashboard} onclick={() => (showProsecutorDashboard = !showProsecutorDashboard)}>
			{showProsecutorDashboard ? '[-] HIDE PROSECUTOR DASHBOARD' : '[+] PHOENIX PROSECUTOR DASHBOARD'}
		</button>
	</div>
	{#if showProsecutorDashboard}
		<div class="codebase-search-panel">
			<PhoenixProsecutorDashboard />
		</div>
	{/if}
</div>

<style>
	.codebase-search-toggle {
		padding: 0.5rem 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.codebase-toggle-btn {
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.5);
		font-family: inherit;
		font-size: 0.7rem;
		padding: 0.3rem 0.75rem;
		cursor: pointer;
		letter-spacing: 0.05em;
		transition: all 0.2s;
	}

	.codebase-toggle-btn:hover { background: rgba(255, 255, 255, 0.05); color: white; }
	.codebase-toggle-btn.active { background: rgba(255, 255, 255, 0.05); color: white; border-color: rgba(255, 255, 255, 0.3); }

	.codebase-search-panel {
		padding: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.command-center {
		min-height: 100vh;
	background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
		color: white;
	}

	.header {
		background: rgba(255, 255, 255, 0.05);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(10px);
	}

	.header-content {
		max-width: 1400px;
	margin: 0 auto;
		padding: 1rem 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.logo-section {
		display: flex;
		align-items: center;
	gap: 1rem;
	}

	.logo {
		font-size: 1.5rem;
		font-weight: bold;
	background: linear-gradient(45deg, #00d4ff, #ff6b35);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.subtitle {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
	}

	.header-actions { display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.keyboard-shortcut {
		margin-left: 0.5rem;
		font-size: 0.7rem;
	color: rgba(255, 255, 255, 0.5);
		background: rgba(255, 255, 255, 0.1);
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
	}

	.refresh-btn:disabled { opacity: 0.6;
		cursor:not-allowed;
	}

	/* Quick Actions Dropdown */
	.quick-actions-dropdown { position: absolute;
		top: 100%;
		right: 0;
		margin-top: 0.5rem;
	background: rgba(0, 0, 0, 0.9);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
	padding: 0.5rem;
		min-width: 200px;
		z-index: 1000;
		backdrop-filter: blur(10px);
	}

	.quick-action-item {
		display: flex;
		align-items: center;
	gap: 0.75rem;
		width: 100%;
	padding: 0.75rem 1rem;
		border-radius: 6px;
	background: transparent;
		border: none;
	color: rgba(255, 255, 255, 0.8);
		text-align: left;
	transition: all 0.2s ease;
		font-size: 0.875rem;
	}

	.quick-action-item:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	/* Notifications */
	.notification-btn {
		position: relative;
	}

	.notification-badge { position: absolute;
		top: -8px;
		right: -8px;
	background: #ef4444;
		color: white;
		border-radius: 50%;
	width: 20px;
		height: 20px;
	display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
		font-weight: bold;
	border: 2px solid rgba(15, 15, 35, 1);
	}

	.notifications-dropdown { position: absolute;
		top: 100%;
		right: 0;
		margin-top: 0.5rem;
	background: rgba(0, 0, 0, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
	width: 400px;
		max-height: 500px;
		z-index: 1000;
		backdrop-filter: blur(10px);
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
	}

	.notifications-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	padding: 1rem 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.notifications-title {
		font-size: 1rem;
		font-weight: 600;
	color: white;
	}

	.notifications-list {
		max-height: 400px;
		overflow-y: auto;
	}

	.notification-item {
		padding: 1rem 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		transition: background-color 0.2s ease;
	}

	.notification-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.notification-item.unread {
		border-left: 3px solid #00d4ff;
		background: rgba(0, 212, 255, 0.05);
	}

	.notification-content {
		flex: 1;
	}

	.notification-title {
		font-weight: 600;
	color: white;
		margin-bottom: 0.25rem;
	}

	.notification-message {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.875rem;
		margin-bottom: 0.25rem;
	}

	.notification-time {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.75rem;
	}

	.notification-actions { display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.no-notifications {
		padding: 2rem;
		text-align: center;
	color: rgba(255, 255, 255, 0.5);
	}

	/* Status Bar */
	.status-bar {
		background: rgba(255, 255, 255, 0.05);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		padding: 0.5rem 2rem;
		display: flex;
	gap: 2rem;
		font-size: 0.875rem;
	}

	.status-item {
		display: flex;
		align-items: center;
	gap: 0.5rem;
	}

	.status-label {
		color: rgba(255, 255, 255, 0.6);
	}

	.status-value {
		color: rgba(255, 255, 255, 0.9);
		font-weight: 500;
	}

	.main-content {
		display: flex;
		max-width: 1400px;
	margin: 0 auto;
		padding: 2rem;
	gap: 2rem;
	}

	.sidebar {
		width: 320px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.sidebar-section {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		backdrop-filter: blur(10px);
	}

	.sidebar-section:has(.nav-section) {
		padding: 1.5rem;
	}

	.nav-section {
		margin-bottom: 2rem;
	}

	.nav-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	color: rgba(255, 255, 255, 0.6);
		margin-bottom: 0.75rem;
	}

	.nav-list {
		list-style: none;
	padding: 0;
		margin: 0;
	}

	.nav-item {
		margin-bottom: 0.25rem;
	}

	.nav-link {
		display: flex;
		align-items: center;
	gap: 0.75rem;
		width: 100%;
	padding: 0.75rem 1rem;
		border-radius: 8px;
	background: transparent;
		border: none;
	color: rgba(255, 255, 255, 0.8);
		text-align: left;
	transition: all 0.2s ease;
		font-size: 0.875rem;
	}

	.nav-link:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.dashboard-content {
		flex: 1;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.metric-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: all 0.3s ease;
	}

	.metric-card:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
		transform: translateY(-2px);
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
	}

	.metric-value {
		font-size: 2rem;
		font-weight: bold;
	color: white;
		margin-bottom: 0.5rem;
	}

	.metric-trend {
		display: flex;
		align-items: center;
		font-size: 0.875rem;
	}

	.system-health-card {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(0, 212, 255, 0.1));
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.content-grid {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 1.5rem;
	}

	.case-item { padding: 1rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
	border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.case-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.5rem;
	}

	.case-title {
		font-weight: 600;
		font-size: 0.875rem;
	}

	.priority-badge {
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
	border: 1px solid;
	}

	.case-meta { display: flex;
		gap: 1rem;
		font-size: 0.75rem;
	color: rgba(255, 255, 255, 0.6);
	}

	.system-metrics {
		display: flex;
		flex-direction: column;
	gap: 0.75rem;
	}

	.metric-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
	padding: 0.5rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.metric-item:last-child {
		border-bottom: none;
	}

	.metric-label {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.875rem;
	}

	.metric-label-value {
		color: rgba(255, 255, 255, 0.9);
		font-weight: 500;
		font-size: 0.875rem;
	}

	.alerts-section {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.alerts-title {
		font-size: 0.875rem;
		font-weight: 600;
	color: rgba(255, 255, 255, 0.8);
		margin-bottom: 0.75rem;
	}

	.alerts-list {
		display: flex;
		flex-direction: column;
	gap: 0.5rem;
	}

	.alert-item {
		display: flex;
		align-items: center;
	gap: 0.5rem;
		padding: 0.75rem;
		border-radius: 6px;
		font-size: 0.75rem;
	position: relative;
		transition: all 0.2s ease;
	}

	.alert-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.alert-info {
		background: rgba(0, 212, 255, 0.1);
		color: #00d4ff;
	border: 1px solid rgba(0, 212, 255, 0.2);
	}

	.alert-warning {
		background: rgba(255, 107, 53, 0.1);
		color: #ff6b35;
	border: 1px solid rgba(255, 107, 53, 0.2);
	}

	.alert-error {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
	border: 1px solid rgba(239, 68, 68, 0.2);
	}

	.alert-message {
		flex: 1;
	}

	.alert-time {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.7rem;
	}

	.alert-dismiss { background: none;
		border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
	padding: 0.25rem;
		border-radius: 3px;
	transition: all 0.2s ease;
		opacity: 0;
	}

	.alert-dismiss:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.no-alerts {
		display: flex;
		align-items: center;
		justify-content: center;
	gap: 0.5rem;
		padding: 1rem;
	color: rgba(34, 197, 94, 0.8);
		font-size: 0.875rem;
	}

	@media (max-width: 1024px) {
		.main-content {
			flex-direction: column;
		}

		.sidebar {
			width: 100%;
		}

		.content-grid {
			grid-template-columns: 1fr;
		}

		.header-content {
			flex-direction: column;
	gap: 1rem;
			align-items: flex-start;
		}

		.header-actions {
			flex-wrap: wrap;
	width: 100%;
			justify-content: center;
		}

		.status-bar {
			flex-direction: column;
	gap: 0.5rem;
			align-items: flex-start;
		}

		.notifications-dropdown {
			width: 90vw;
			max-width: 400px;
		}

		.quick-actions-dropdown {
			min-width: 150px;
		}
	}

	@media (max-width: 640px) {
		.header-content {
			padding: 1rem;
		}

		.main-content {
			padding: 1rem;
		}

		.metrics-grid {
			grid-template-columns: 1fr;
		}

		.header-actions {
			justify-content: flex-start;
		}

		.status-bar {
			padding: 0.5rem 1rem;
		}
	}
</style>








