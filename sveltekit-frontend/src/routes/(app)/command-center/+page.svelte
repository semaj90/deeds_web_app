<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui';
	import { Svelte5Button as Button } from '$lib/components/ui/svelte5-index';
	import Activity from 'lucide-svelte/icons/activity';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
	import Bell from 'lucide-svelte/icons/bell';
	import Brain from 'lucide-svelte/icons/brain';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Database from 'lucide-svelte/icons/database';
	import FileText from 'lucide-svelte/icons/file-text';
	import Gavel from 'lucide-svelte/icons/gavel';
	import Moon from 'lucide-svelte/icons/moon';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Search from 'lucide-svelte/icons/search';
	import Settings from 'lucide-svelte/icons/settings';
	import Sun from 'lucide-svelte/icons/sun';
	import TrendingDown from 'lucide-svelte/icons/trending-down';
	import TrendingUp from 'lucide-svelte/icons/trending-up';
	import Users from 'lucide-svelte/icons/users';
	import X from 'lucide-svelte/icons/x';
	import Zap from 'lucide-svelte/icons/zap';
	import { onDestroy, onMount } from 'svelte';

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
		trends: { totalCases: 5.2,
			activeCases: -2.1,
			evidenceProcessed: 12.8,
			aiQueries: 8.5
		}
	});

	let activeCases = $state<Array<{
		id: string; title: string;
		status: 'active' | 'pending' | 'critical';
		lastActivity: string; evidenceCount: number;
		priority: 'low' | 'medium' | 'high' | 'urgent';
	}>>([]);

	let systemAlerts = $state<Array<{
		id: string; type: 'info' | 'warning' | 'error';
		message: string; timestamp: string;
		dismissed?: boolean;
	}>>([]);

	let notifications = $state<Array<{
		id: string; type: 'info' | 'success' | 'warning' | 'error';
		title: string; message: string;
		timestamp: string;
		read?: boolean;
	}>>([]);

	let currentView = $state<'dashboard' | 'cases' | 'evidence' | 'ai' | 'persons' | 'analysis' | 'system'>('dashboard');
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
	onMount(() => {
 (async () => {
 		await loadAllData();
 		// Set up real-time updates every 30 seconds
 		refreshInterval = setInterval(async () => {
 			await loadAllData();
 		}, 30000);

 		// Keyboard shortcuts
 		document.addEventListener('keydown', handleKeydown);
 		// Click outside handler
 		document.addEventListener('click', handleClickOutside);
 })();
 });

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
		document.removeEventListener('keydown', handleKeydown);
		document.removeEventListener('click', handleClickOutside);
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
			// TODO: Replace with actual API calls
			const baseMetrics = {
				totalCases: 47,
				activeCases: 12,
				evidenceProcessed: 1284,
				aiQueries: 892,
				systemHealth: 'operational',
				gpuStatus: 'active',
				ragIndexSize: 2500000,
				ocrAccuracy: 94.2
			};

			// Add some randomization for demo purposes
			const variation = Math.random() * 0.1 - 0.05; // ±5%
			metrics = {
				...baseMetrics,
				totalCases: Math.round(baseMetrics.totalCases * (1 + variation)),
			activeCases: Math.round(baseMetrics.activeCases * (1 + variation)),
			evidenceProcessed: Math.round(baseMetrics.evidenceProcessed * (1 + variation)),
			aiQueries: Math.round(baseMetrics.aiQueries * (1 + variation)),
			trends: { totalCases: (Math.random() - 0.5) * 20, // Random trend between -10% and +10%
					activeCases: (Math.random() - 0.5) * 20,
					evidenceProcessed: (Math.random() - 0.5) * 20,
					aiQueries: (Math.random() - 0.5) * 20
				}
			};
		} catch (error) {
			console.error('Failed to load metrics:', error);
		}
	}

	async function loadActiveCases() {
		try {
			// TODO: Replace with actual API calls
			activeCases = [
				{
					id: 'CASE-2025-001',
					title: 'Corporate Espionage Investigation',
					status: 'active',
					lastActivity: '2 hours ago',
					evidenceCount: 47,
					priority: 'high'
				},
				{
					id: 'CASE-2025-002',
					title: 'Financial Fraud Case',
					status: 'critical',
					lastActivity: '30 minutes ago',
					evidenceCount: 23,
					priority: 'urgent'
				},
				{
					id: 'CASE-2025-003',
					title: 'Intellectual Property Dispute',
					status: 'active',
					lastActivity: '1 day ago',
					evidenceCount: 89,
					priority: 'medium'
				},
				{
					id: 'CASE-2025-004',
					title: 'Employment Discrimination Claim',
					status: 'pending',
					lastActivity: '3 days ago',
					evidenceCount: 156,
					priority: 'medium'
				}
			];
		} catch (error) {
			console.error('Failed to load active cases:', error);
		}
	}

	async function loadSystemAlerts() {
		try {
			// TODO: Replace with actual API calls
			systemAlerts = [
				{
					id: 'alert-1',
					type: 'info',
					message: 'OCR pipeline processing 3 documents',
					timestamp: '5 minutes ago'
				},
				{
					id: 'alert-2',
					type: 'warning',
					message: 'GPU memory usage at 85%',
					timestamp: '12 minutes ago'
				},
				{
					id: 'alert-3',
					type: 'error',
					message: 'Database connection pool exhausted',
					timestamp: '1 hour ago'
				}
			];
		} catch (error) {
			console.error('Failed to load system alerts:', error);
		}
	}

	async function loadNotifications() {
		try {
			// TODO: Replace with actual API calls
			notifications = [
				{
					id: 'notif-1',
					type: 'success',
					title: 'Case Analysis Complete',
					message: 'AI analysis for CASE-2025-001 has been completed',
					timestamp: '10 minutes ago',
					read: false
				},
				{
					id: 'notif-2',
					type: 'warning',
					title: 'Evidence Review Due',
					message: '23 evidence items require review in CASE-2025-002',
					timestamp: '1 hour ago',
					read: false
				},
				{
					id: 'notif-3',
					type: 'info',
					title: 'System Update',
					message: 'OCR accuracy improved to 94.2%',
					timestamp: '2 hours ago',
					read: true
				}
			];
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
			default: return 'text-gray-400';
		}
	}

	function getPriorityColor(priority: string) {
		switch (priority) {
			case 'urgent': return 'bg-red-500/20 text-red-300 border-red-500/30';
			case 'high': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
			case 'medium': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
			case 'low': return 'bg-green-500/20 text-green-300 border-green-500/30';
			default: return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
		}
	}

	function getAlertIcon(type: string) {
		switch (type) {
			case 'error': return AlertTriangle;
			case 'warning': return AlertTriangle;
			case 'info': return Activity;
			default: return Activity;
		}
	}

	function getTrendIcon(trend: number) {
		return trend >= 0 ? TrendingUp : TrendingDown;
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

	// Quick actions
	async function createNewCase() {
		// TODO: Implement case creation
		console.log('Creating new case...');
		showQuickActions = false;
	}

	async function uploadEvidence() {
		// TODO: Implement evidence upload
		console.log('Uploading evidence...');
		showQuickActions = false;
	}

	async function runAIAnalysis() {
		// TODO: Implement AI analysis
		console.log('Running AI analysis...');
		showQuickActions = false;
	}

	async function generateReport() {
		// TODO: Implement report generation
		console.log('Generating report...');
		showQuickActions = false;
	}

	// Computed values
	let unreadNotificationsCount = $derived(notifications.filter(n => !n.read).length);
	let activeAlertsCount = $derived(systemAlerts.filter(a => !a.dismissed).length);
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
					<RefreshCw class={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
					Refresh
				</Button>

				<!-- Global Search -->
				<Button class="bits-btn" variant="outline" size="sm">
					<Search class="h-4 w-4 mr-2" />
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
						<Zap class="h-4 w-4 mr-2" />
						Quick Actions
						<ChevronDown class="h-4 w-4 ml-2" />
					</Button>

					{#if showQuickActions}
						<div class="quick-actions-dropdown">
							<Button onclick={createNewCase} class="quick-action-item bits-btn">
								<Gavel class="h-4 w-4" />
								Create New Case
							</Button>
							<Button onclick={uploadEvidence} class="quick-action-item bits-btn">
								<FileText class="h-4 w-4" />
								Upload Evidence
							</Button>
							<Button onclick={runAIAnalysis} class="quick-action-item bits-btn">
								<Brain class="h-4 w-4" />
								Run AI Analysis
							</Button>
							<Button onclick={generateReport} class="quick-action-item bits-btn">
								<BarChart3 class="h-4 w-4" />
								Generate Report
							</Button>
						</div>
					{/if}
				</div>

				<!-- Notifications -->
				<div class="relative">
					<Button class="bits-btn"
						variant="outline"
						size="sm"
						onclick={() => showNotifications = !showNotifications}
						class="notification-btn"
					>
						<Bell class="h-4 w-4 mr-2" />
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
									<X class="h-4 w-4" />
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
												<X class="h-4 w-4" />
											</Button>
										</div>
									</div>
								{/each}
								{#if notifications.length === 0}
									<div class="no-notifications">
										<Bell class="h-8 w-8 text-muted-foreground" />
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
						<Sun class="h-4 w-4" />
					{:else}
						<Moon class="h-4 w-4" />
					{/if}
				</Button>

				<!-- Settings -->
				<Button class="bits-btn" variant="outline" size="sm">
					<Settings class="h-4 w-4" />
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
		<!-- Sidebar Navigation -->
		<nav class="sidebar">
			<div class="nav-section">
				<h3 class="nav-title">Operations</h3>
				<ul class="nav-list">
					<li class="nav-item" class:active={currentView === 'dashboard'}>
						<Button class="bits-btn" onclick={() => currentView = 'dashboard'} class="nav-link">
							<Activity class="h-4 w-4" />
							Dashboard
						</Button>
					</li>
					<li class="nav-item" class:active={currentView === 'cases'}>
						<Button class="bits-btn" onclick={() => currentView = 'cases'} class="nav-link">
							<Gavel class="h-4 w-4" />
							Cases
						</Button>
					</li>
					<li class="nav-item" class:active={currentView === 'evidence'}>
						<Button class="bits-btn" onclick={() => currentView = 'evidence'} class="nav-link">
							<FileText class="h-4 w-4" />
							Evidence
						</Button>
					</li>
					<li class="nav-item" class:active={currentView === 'ai'}>
						<Button class="bits-btn" onclick={() => currentView = 'ai'} class="nav-link">
							<Brain class="h-4 w-4" />
							AI Chat
						</Button>
					</li>
				</ul>
			</div>

			<div class="nav-section">
				<h3 class="nav-title">Intelligence</h3>
				<ul class="nav-list">
					<li class="nav-item" class:active={currentView === 'persons'}>
						<Button class="bits-btn" onclick={() => currentView = 'persons'} class="nav-link">
							<Users class="h-4 w-4" />
							Persons
						</Button>
					</li>
					<li class="nav-item" class:active={currentView === 'analysis'}>
						<Button class="bits-btn" onclick={() => currentView = 'analysis'} class="nav-link">
							<Search class="h-4 w-4" />
							Analysis
						</Button>
					</li>
				</ul>
			</div>

			<div class="nav-section">
				<h3 class="nav-title">System</h3>
				<ul class="nav-list">
					<li class="nav-item" class:active={currentView === 'system'}>
						<Button class="bits-btn" onclick={() => currentView = 'system'} class="nav-link">
							<Database class="h-4 w-4" />
							System
						</Button>
					</li>
				</ul>
			</div>
		</nav>

		<!-- Main Dashboard Content -->
		<main class="dashboard-content">
			{#if currentView === 'dashboard'}
				<!-- Metrics Grid -->
				<div class="metrics-grid">
					<Card class="metric-card">
						<CardHeader class="pb-2">
							<CardTitle class="text-sm flex items-center">
								<Gavel class="h-4 w-4 mr-2" />
								Total Cases
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="metric-value">{metrics.totalCases}</div>
							{@const SvelteComponent = getTrendIcon(metrics.trends.totalCases)}
							<div class="metric-trend">
								<SvelteComponent class={`h-3 w-3 mr-1 ${getTrendColor(metrics.trends.totalCases)}`} />
								<span class={`${getTrendColor(metrics.trends.totalCases)}`}>
									{metrics.trends.totalCases >= 0 ? '+' : ''}{metrics.trends.totalCases.toFixed(1)}%
								</span>
								<span class="text-xs text-muted-foreground ml-2">vs last month</span>
							</div>
						</CardContent>
					</Card>

					<Card class="metric-card">
						<CardHeader class="pb-2">
							<CardTitle class="text-sm flex items-center">
								<Activity class="h-4 w-4 mr-2" />
								Active Cases
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="metric-value">{metrics.activeCases}</div>
							{@const SvelteComponent_1 = getTrendIcon(metrics.trends.activeCases)}
							<div class="metric-trend">
								<SvelteComponent_1 class={`h-3 w-3 mr-1 ${getTrendColor(metrics.trends.activeCases)}`} />
								<span class={`${getTrendColor(metrics.trends.activeCases)}`}>
									{metrics.trends.activeCases >= 0 ? '+' : ''}{metrics.trends.activeCases.toFixed(1)}%
								</span>
								<span class="text-xs text-muted-foreground ml-2">vs last week</span>
							</div>
						</CardContent>
					</Card>

					<Card class="metric-card">
						<CardHeader class="pb-2">
							<CardTitle class="text-sm flex items-center">
								<FileText class="h-4 w-4 mr-2" />
								Evidence Processed
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="metric-value">{metrics.evidenceProcessed.toLocaleString()}</div>
							{@const SvelteComponent_2 = getTrendIcon(metrics.trends.evidenceProcessed)}
							<div class="metric-trend">
								<SvelteComponent_2 class={`h-3 w-3 mr-1 ${getTrendColor(metrics.trends.evidenceProcessed)}`} />
								<span class={`${getTrendColor(metrics.trends.evidenceProcessed)}`}>
									{metrics.trends.evidenceProcessed >= 0 ? '+' : ''}{metrics.trends.evidenceProcessed.toFixed(1)}%
								</span>
								<span class="text-xs text-muted-foreground ml-2">{metrics.ocrAccuracy}% OCR accuracy</span>
							</div>
						</CardContent>
					</Card>

					<Card class="metric-card">
						<CardHeader class="pb-2">
							<CardTitle class="text-sm flex items-center">
								<Brain class="h-4 w-4 mr-2" />
								AI Queries
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="metric-value">{metrics.aiQueries.toLocaleString()}</div>
							{@const SvelteComponent_3 = getTrendIcon(metrics.trends.aiQueries)}
							<div class="metric-trend">
								<SvelteComponent_3 class={`h-3 w-3 mr-1 ${getTrendColor(metrics.trends.aiQueries)}`} />
								<span class={`${getTrendColor(metrics.trends.aiQueries)}`}>
									{metrics.trends.aiQueries >= 0 ? '+' : ''}{metrics.trends.aiQueries.toFixed(1)}%
								</span>
								<span class="text-xs text-muted-foreground ml-2">this month</span>
							</div>
						</CardContent>
					</Card>

					<Card class="metric-card system-health-card">
						<CardHeader class="pb-2">
							<CardTitle class="text-sm flex items-center">
								<Database class="h-4 w-4 mr-2" />
								System Health
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="metric-value {getStatusColor(metrics.systemHealth)}">
								{metrics.systemHealth}
							</div>
							<div class="text-xs text-muted-foreground">
								GPU: {metrics.gpuStatus}
							</div>
						</CardContent>
					</Card>
				</div>

				<!-- Active Cases & System Status -->
				<div class="content-grid">
					<!-- Active Cases -->
					<Card>
						<CardHeader>
							<CardTitle class="flex items-center">
								<Gavel class="h-5 w-5 mr-2" />
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

					<!-- System Status & Alerts -->
					<Card>
						<CardHeader>
							<CardTitle class="flex items-center">
								<Activity class="h-5 w-5 mr-2" />
								System Status
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="space-y-4">
								<!-- System Metrics -->
								<div class="system-metrics">
									<div class="metric-item">
										<span class="metric-label">RAG Index Size</span>
										<span class="metric-value">{(metrics.ragIndexSize / 1000000).toFixed(1)}M vectors</span>
									</div>
									<div class="metric-item">
										<span class="metric-label">GPU Memory</span>
										<span class="metric-value">RTX 3060Ti Active</span>
									</div>
									<div class="metric-item">
										<span class="metric-label">OCR Workers</span>
										<span class="metric-value">4 workers online</span>
									</div>
								</div>

								<!-- System Alerts -->
								{#if systemAlerts.filter(a => !a.dismissed).length > 0}
									<div class="alerts-section">
										<h4 class="alerts-title">Recent Alerts</h4>
										<div class="alerts-list">
											{#each systemAlerts.filter(a => !a.dismissed) as alert}
												{@const AlertIcon = getAlertIcon(alert.type)}
												<div class="alert-item alert-{alert.type}">
													<AlertIcon class="h-4 w-4" />
													<span class="alert-message">{alert.message}</span>
													<span class="alert-time">{alert.timestamp}</span>
													<Button class="bits-btn"
														onclick={() => dismissAlert(alert.id)}
														class="alert-dismiss"
														aria-label="Dismiss alert"
													>
														<X class="h-3 w-3" />
													</Button>
												</div>
											{/each}
										</div>
									</div>
								{:else}
									<div class="no-alerts">
										<Activity class="h-6 w-6 text-green-400" />
										<span class="text-sm text-muted-foreground">All systems operational</span>
									</div>
								{/if}
							</div>
						</CardContent>
					</Card>
				</div>
			{:else}
				<!-- Placeholder for other views -->
				<Card>
					<CardContent class="p-8 text-center">
						<div class="text-muted-foreground">
							<h3 class="text-lg font-semibold mb-2">{currentView.charAt(0).toUpperCase() + currentView.slice(1)} View</h3>
							<p>This section is under development. Check back soon!</p>
						</div>
					</CardContent>
				</Card>
			{/if}
		</main>
	</div>
</div>

<style>
	.command-center {
		min-height: 100vh; background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
		color: white;
	}

	.header {
		background: rgba(255, 255, 255, 0.05);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(10px);
	}

	.header-content {
		max-width: 1400px; margin: 0 auto;
		padding: 1rem 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.logo-section {
		display: flex;
		align-items: center; gap: 1rem;
	}

	.logo {
		font-size: 1.5rem;
		font-weight: bold; background: linear-gradient(45deg, #00d4ff, #ff6b35);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.subtitle {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
	}

	.header-actions {
		display: flex; gap: 0.5rem;
		align-items: center;
	}

	.keyboard-shortcut {
		margin-left: 0.5rem;
		font-size: 0.7rem; color: rgba(255, 255, 255, 0.5);
		background: rgba(255, 255, 255, 0.1);
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
	}

	.refresh-btn:disabled {
		opacity: 0.6; cursor:not-allowed;
	}

	/* Quick Actions Dropdown */
	.quick-actions-dropdown {
		position: absolute; top: 100%;
		right: 0;
		margin-top: 0.5rem; background: rgba(0, 0, 0, 0.9);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px; padding: 0.5rem;
		min-width: 200px;
		z-index: 1000;
		backdrop-filter: blur(10px);
	}

	.quick-action-item {
		display: flex;
		align-items: center; gap: 0.75rem;
		width: 100%; padding: 0.75rem 1rem;
		border-radius: 6px; background: transparent;
		border: none; color: rgba(255, 255, 255, 0.8);
		text-align: left; transition: all 0.2s ease;
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

	.notification-badge {
		position: absolute; top: -8px;
		right: -8px; background: #ef4444;
		color: white;
		border-radius: 50%; width: 20px;
		height: 20px; display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
		font-weight: bold; border: 2px solid rgba(15, 15, 35, 1);
	}

	.notifications-dropdown {
		position: absolute; top: 100%;
		right: 0;
		margin-top: 0.5rem; background: rgba(0, 0, 0, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px; width: 400px;
		max-height: 500px;
		z-index: 1000;
		backdrop-filter: blur(10px);
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
	}

	.notifications-header {
		display: flex;
		justify-content: space-between;
		align-items: center; padding: 1rem 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.notifications-title {
		font-size: 1rem;
		font-weight: 600; color: white;
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
		font-weight: 600; color: white;
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

	.notification-actions {
		display: flex; gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.no-notifications {
		padding: 2rem;
		text-align: center; color: rgba(255, 255, 255, 0.5);
	}

	/* Status Bar */
	.status-bar {
		background: rgba(255, 255, 255, 0.05);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		padding: 0.5rem 2rem;
		display: flex; gap: 2rem;
		font-size: 0.875rem;
	}

	.status-item {
		display: flex;
		align-items: center; gap: 0.5rem;
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
		max-width: 1400px; margin: 0 auto;
		padding: 2rem; gap: 2rem;
	}

	.sidebar {
		width: 280px;
		flex-shrink: 0; background: rgba(255, 255, 255, 0.05);
		border-radius: 12px; padding: 1.5rem;
		height: fit-content;
		backdrop-filter: blur(10px);
	}

	.nav-section {
		margin-bottom: 2rem;
	}

	.nav-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em; color: rgba(255, 255, 255, 0.6);
		margin-bottom: 0.75rem;
	}

	.nav-list {
		list-style: none; padding: 0;
		margin: 0;
	}

	.nav-item {
		margin-bottom: 0.25rem;
	}

	.nav-link {
		display: flex;
		align-items: center; gap: 0.75rem;
		width: 100%; padding: 0.75rem 1rem;
		border-radius: 8px; background: transparent;
		border: none; color: rgba(255, 255, 255, 0.8);
		text-align: left; transition: all 0.2s ease;
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
		font-weight: bold; color: white;
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

	.case-item {
		padding: 1rem; background: rgba(255, 255, 255, 0.05);
		border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);
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
		font-weight: 500; border: 1px solid;
	}

	.case-meta {
		display: flex; gap: 1rem;
		font-size: 0.75rem; color: rgba(255, 255, 255, 0.6);
	}

	.system-metrics {
		display: flex;
		flex-direction: column; gap: 0.75rem;
	}

	.metric-item {
		display: flex;
		justify-content: space-between;
		align-items: center; padding: 0.5rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.metric-item:last-child {
		border-bottom: none;
	}

	.metric-label {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.875rem;
	}

	.metric-value {
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
		font-weight: 600; color: rgba(255, 255, 255, 0.8);
		margin-bottom: 0.75rem;
	}

	.alerts-list {
		display: flex;
		flex-direction: column; gap: 0.5rem;
	}

	.alert-item {
		display: flex;
		align-items: center; gap: 0.5rem;
		padding: 0.75rem;
		border-radius: 6px;
		font-size: 0.75rem; position: relative;
		transition: all 0.2s ease;
	}

	.alert-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.alert-info {
		background: rgba(0, 212, 255, 0.1);
		color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.2);
	}

	.alert-warning {
		background: rgba(255, 107, 53, 0.1);
		color: #ff6b35; border: 1px solid rgba(255, 107, 53, 0.2);
	}

	.alert-error {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2);
	}

	.alert-message {
		flex: 1;
	}

	.alert-time {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.7rem;
	}

	.alert-dismiss {
		background: none; border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer; padding: 0.25rem;
		border-radius: 3px; transition: all 0.2s ease;
		opacity: 0;
	}

	.alert-dismiss:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.no-alerts {
		display: flex;
		align-items: center;
		justify-content: center; gap: 0.5rem;
		padding: 1rem; color: rgba(34, 197, 94, 0.8);
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
			flex-direction: column; gap: 1rem;
			align-items: flex-start;
		}

		.header-actions {
			flex-wrap: wrap; width: 100%;
			justify-content: center;
		}

		.status-bar {
			flex-direction: column; gap: 0.5rem;
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






