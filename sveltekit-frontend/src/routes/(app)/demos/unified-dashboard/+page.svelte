<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import MicroInteraction from '$lib/components/ui/MicroInteraction.svelte';

	let activeSection = $state<'overview' | 'cases' | 'evidence' | 'analytics' | 'settings'>('overview');
	let sidebarCollapsed = $state(false);
	let commandOpen = $state(false);

	const navItems = [
		{ key: 'overview', icon: 'layout-dashboard', label: 'Overview' },
		{ key: 'cases', icon: 'briefcase', label: 'Case Files' },
		{ key: 'evidence', icon: 'file-search', label: 'Evidence' },
		{ key: 'analytics', icon: 'bar-chart-3', label: 'Analytics' },
		{ key: 'settings', icon: 'settings', label: 'Settings' },
	] as const;

	const caseData = [
		{ id: 'DX-2847', title: 'Securities Fraud Investigation', status: 'active', priority: 'critical', lead: 'Det. Vasquez', updated: '2h ago', progress: 72 },
		{ id: 'DX-2851', title: 'Corporate Embezzlement Ring', status: 'active', priority: 'high', lead: 'Det. Chen', updated: '5h ago', progress: 45 },
		{ id: 'DX-2839', title: 'Insurance Claim Analysis', status: 'review', priority: 'medium', lead: 'Det. Okafor', updated: '1d ago', progress: 91 },
		{ id: 'DX-2855', title: 'Digital Asset Recovery', status: 'active', priority: 'high', lead: 'Det. Park', updated: '3h ago', progress: 28 },
		{ id: 'DX-2842', title: 'Witness Protection Filing', status: 'closed', priority: 'low', lead: 'Det. Rivera', updated: '3d ago', progress: 100 },
	];

	const recentActivity = [
		{ action: 'Evidence uploaded', detail: 'Financial records Q4 2025', time: '12 min ago', icon: 'upload' },
		{ action: 'Case note added', detail: 'DX-2847 — witness deposition summary', time: '28 min ago', icon: 'file-text' },
		{ action: 'AI analysis complete', detail: 'Document cluster similarity: 94.2%', time: '1h ago', icon: 'brain' },
		{ action: 'Citation linked', detail: 'Cal. Penal Code § 502(c)', time: '2h ago', icon: 'link' },
		{ action: 'Report generated', detail: 'Case packet DX-2839 exported', time: '3h ago', icon: 'file-output' },
	];

	const systemMetrics = [
		{ label: 'Active Cases', value: '24', trend: '+3', icon: 'briefcase' },
		{ label: 'Evidence Items', value: '1,847', trend: '+127', icon: 'database' },
		{ label: 'AI Queries Today', value: '342', trend: '+18%', icon: 'brain' },
		{ label: 'Avg Response', value: '1.2s', trend: '-0.3s', icon: 'zap' },
	];

	const infraStatus = [
		{ name: 'PostgreSQL', status: 'healthy', latency: '2ms' },
		{ name: 'Qdrant Vector DB', status: 'healthy', latency: '8ms' },
		{ name: 'Redis Cache', status: 'healthy', latency: '<1ms' },
		{ name: 'Ollama LLM', status: 'healthy', latency: '45ms' },
		{ name: 'RabbitMQ', status: 'healthy', latency: '3ms' },
		{ name: 'MinIO Storage', status: 'warning', latency: '120ms' },
	];

	function getPriorityClass(p: string) {
		return p === 'critical' ? 'priority-critical' : p === 'high' ? 'priority-high' : p === 'medium' ? 'priority-medium' : 'priority-low';
	}

	function getStatusClass(s: string) {
		return s === 'active' ? 'status-active' : s === 'review' ? 'status-review' : 'status-closed';
	}
</script>

<div class="unified-shell" class:collapsed={sidebarCollapsed}>
	<!-- ═══ DARK SIDEBAR ═══ -->
	<aside class="sidebar">
		<div class="sidebar-header">
			<div class="logo-mark">
				<Icon name="shield" size={20} />
			</div>
			{#if !sidebarCollapsed}
				<div class="logo-text">
					<span class="logo-title">DEEDS</span>
					<span class="logo-sub">Legal Intelligence</span>
				</div>
			{/if}
			<button class="collapse-btn" onclick={() => sidebarCollapsed = !sidebarCollapsed}>
				<Icon name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'} size={14} />
			</button>
		</div>

		<nav class="sidebar-nav">
			{#each navItems as item}
				<button
					class="nav-item"
					class:active={activeSection === item.key}
					onclick={() => activeSection = item.key as any}
					title={sidebarCollapsed ? item.label : undefined}
				>
					<Icon name={item.icon} size={18} />
					{#if !sidebarCollapsed}
						<span>{item.label}</span>
					{/if}
				</button>
			{/each}
		</nav>

		<div class="sidebar-footer">
			{#if !sidebarCollapsed}
				<div class="user-badge">
					<div class="user-avatar">JD</div>
					<div class="user-info">
						<span class="user-name">James Doe</span>
						<span class="user-role">Senior Analyst</span>
					</div>
				</div>
			{:else}
				<div class="user-avatar compact">JD</div>
			{/if}
		</div>
	</aside>

	<!-- ═══ MAIN AREA ═══ -->
	<div class="main-area">
		<!-- Top Bar: dark chrome -->
		<header class="topbar">
			<div class="topbar-left">
				<h1 class="page-title">
					{#if activeSection === 'overview'}Investigation Overview
					{:else if activeSection === 'cases'}Case Management
					{:else if activeSection === 'evidence'}Evidence Repository
					{:else if activeSection === 'analytics'}Analytics Dashboard
					{:else}System Settings
					{/if}
				</h1>
			</div>
			<div class="topbar-right">
				<button class="cmd-trigger" onclick={() => commandOpen = !commandOpen}>
					<Icon name="search" size={14} />
					<span>Search cases...</span>
					<kbd>Ctrl+K</kbd>
				</button>
				<button class="topbar-icon" title="Notifications">
					<Icon name="bell" size={16} />
					<span class="notif-dot"></span>
				</button>
			</div>
		</header>

		<!-- ═══ WARM CONTENT AREA ═══ -->
		<div class="content-area">
			{#if activeSection === 'overview'}
				<!-- KPI Cards -->
				<div class="kpi-row">
					{#each systemMetrics as m}
						<MicroInteraction effect="lift">
							<div class="kpi-card">
								<div class="kpi-icon-wrap">
									<Icon name={m.icon} size={18} />
								</div>
								<div class="kpi-data">
									<span class="kpi-value">{m.value}</span>
									<span class="kpi-label">{m.label}</span>
								</div>
								<span class="kpi-trend">{m.trend}</span>
							</div>
						</MicroInteraction>
					{/each}
				</div>

				<div class="content-grid">
					<!-- Case Table: warm parchment card -->
					<div class="content-card cases-card">
						<div class="card-header">
							<h2>Active Investigations</h2>
							<MicroInteraction effect="press"><button class="card-action">View All <Icon name="arrow-right" size={12} /></button></MicroInteraction>
						</div>
						<div class="case-table">
							<div class="table-head">
								<span class="th-id">Case ID</span>
								<span class="th-title">Title</span>
								<span class="th-status">Status</span>
								<span class="th-priority">Priority</span>
								<span class="th-lead">Lead</span>
								<span class="th-progress">Progress</span>
							</div>
							{#each caseData as c}
								<div class="table-row">
									<span class="td-id">{c.id}</span>
									<span class="td-title">{c.title}</span>
									<span class="td-status"><span class="status-tag {getStatusClass(c.status)}">{c.status}</span></span>
									<span class="td-priority"><span class="priority-dot {getPriorityClass(c.priority)}"></span>{c.priority}</span>
									<span class="td-lead">{c.lead}</span>
									<span class="td-progress">
										<div class="mini-bar"><div class="mini-fill" style="width: {c.progress}%"></div></div>
										<span class="progress-pct">{c.progress}%</span>
									</span>
								</div>
							{/each}
						</div>
					</div>

					<!-- Right column -->
					<div class="right-col">
						<!-- Activity Feed: warm card -->
						<div class="content-card activity-card">
							<div class="card-header">
								<h2>Recent Activity</h2>
							</div>
							<div class="activity-feed">
								{#each recentActivity as a}
									<div class="activity-item">
										<div class="activity-icon">
											<Icon name={a.icon} size={14} />
										</div>
										<div class="activity-text">
											<span class="activity-action">{a.action}</span>
											<span class="activity-detail">{a.detail}</span>
										</div>
										<span class="activity-time">{a.time}</span>
									</div>
								{/each}
							</div>
						</div>

						<!-- Infrastructure: dark-accent card -->
						<MicroInteraction effect="glow">
							<div class="content-card infra-card">
								<div class="card-header">
									<h2>Infrastructure</h2>
									<span class="infra-badge">All Systems</span>
								</div>
								<div class="infra-list">
									{#each infraStatus as svc}
										<div class="infra-row">
											<span class="infra-dot" class:warning={svc.status === 'warning'}></span>
											<span class="infra-name">{svc.name}</span>
											<span class="infra-latency">{svc.latency}</span>
										</div>
									{/each}
								</div>
							</div>
						</MicroInteraction>
					</div>
				</div>

			{:else if activeSection === 'cases'}
				<div class="content-card full-card">
					<div class="card-header">
						<h2>All Cases</h2>
						<div class="card-actions-row">
							<MicroInteraction effect="press"><button class="filter-btn"><Icon name="filter" size={14} /> Filters</button></MicroInteraction>
							<MicroInteraction effect="press"><button class="primary-action"><Icon name="plus" size={14} /> New Case</button></MicroInteraction>
						</div>
					</div>
					<div class="case-table">
						<div class="table-head">
							<span class="th-id">Case ID</span>
							<span class="th-title">Title</span>
							<span class="th-status">Status</span>
							<span class="th-priority">Priority</span>
							<span class="th-lead">Lead</span>
							<span class="th-progress">Progress</span>
						</div>
						{#each caseData as c}
							<div class="table-row">
								<span class="td-id">{c.id}</span>
								<span class="td-title">{c.title}</span>
								<span class="td-status"><span class="status-tag {getStatusClass(c.status)}">{c.status}</span></span>
								<span class="td-priority"><span class="priority-dot {getPriorityClass(c.priority)}"></span>{c.priority}</span>
								<span class="td-lead">{c.lead}</span>
								<span class="td-progress">
									<div class="mini-bar"><div class="mini-fill" style="width: {c.progress}%"></div></div>
									<span class="progress-pct">{c.progress}%</span>
								</span>
							</div>
						{/each}
					</div>
				</div>

			{:else if activeSection === 'evidence'}
				<div class="content-card full-card">
					<div class="card-header">
						<h2>Evidence Repository</h2>
						<div class="card-actions-row">
							<MicroInteraction effect="press"><button class="filter-btn"><Icon name="search" size={14} /> Search</button></MicroInteraction>
							<MicroInteraction effect="press"><button class="primary-action"><Icon name="upload" size={14} /> Upload</button></MicroInteraction>
						</div>
					</div>
					<div class="evidence-grid">
						{#each [
							{ name: 'Financial_Records_Q4.pdf', type: 'PDF', size: '4.2 MB', date: 'Mar 18', case: 'DX-2847' },
							{ name: 'Deposition_Transcript.docx', type: 'DOCX', size: '1.8 MB', date: 'Mar 17', case: 'DX-2847' },
							{ name: 'Surveillance_Photo_003.jpg', type: 'IMG', size: '2.1 MB', date: 'Mar 16', case: 'DX-2851' },
							{ name: 'Email_Chain_Export.eml', type: 'EML', size: '340 KB', date: 'Mar 15', case: 'DX-2839' },
							{ name: 'Bank_Statements_2024.xlsx', type: 'XLSX', size: '890 KB', date: 'Mar 14', case: 'DX-2855' },
							{ name: 'Witness_Audio_Recording.mp3', type: 'AUDIO', size: '12.4 MB', date: 'Mar 13', case: 'DX-2847' },
						] as item}
							<MicroInteraction effect="press">
								<div class="evidence-item">
									<div class="evidence-icon-box">
										<Icon name={item.type === 'PDF' ? 'file-text' : item.type === 'IMG' ? 'image' : item.type === 'AUDIO' ? 'mic' : 'file'} size={20} />
									</div>
									<div class="evidence-info">
										<span class="evidence-name">{item.name}</span>
										<span class="evidence-meta">{item.size} &middot; {item.date} &middot; {item.case}</span>
									</div>
									<span class="evidence-type-tag">{item.type}</span>
								</div>
							</MicroInteraction>
						{/each}
					</div>
				</div>

			{:else if activeSection === 'analytics'}
				<div class="kpi-row">
					{#each [
						{ label: 'Total Queries', value: '12,847', trend: '+24%', icon: 'search' },
						{ label: 'Avg Accuracy', value: '96.3%', trend: '+1.2%', icon: 'target' },
						{ label: 'Documents Processed', value: '3,291', trend: '+412', icon: 'file-stack' },
						{ label: 'Cost Savings', value: '$48.2K', trend: '+12%', icon: 'trending-up' },
					] as m}
						<MicroInteraction effect="lift">
							<div class="kpi-card">
								<div class="kpi-icon-wrap">
									<Icon name={m.icon} size={18} />
								</div>
								<div class="kpi-data">
									<span class="kpi-value">{m.value}</span>
									<span class="kpi-label">{m.label}</span>
								</div>
								<span class="kpi-trend">{m.trend}</span>
							</div>
						</MicroInteraction>
					{/each}
				</div>
				<div class="content-card full-card analytics-placeholder">
					<div class="card-header"><h2>Query Volume — 30 Day Trend</h2></div>
					<div class="chart-placeholder">
						<div class="chart-bars">
							{#each [35, 42, 28, 55, 67, 45, 72, 58, 80, 63, 48, 71, 85, 59, 90, 77, 65, 82, 94, 70, 88, 75, 92, 68, 79, 86, 95, 73, 81, 89] as val, i}
								<div class="chart-bar" style="height: {val}%; animation-delay: {i * 30}ms"></div>
							{/each}
						</div>
						<div class="chart-baseline"></div>
					</div>
				</div>

			{:else if activeSection === 'settings'}
				<div class="settings-grid">
					<div class="content-card settings-card">
						<div class="card-header"><h2>General</h2></div>
						<div class="settings-form">
							<div class="form-field">
								<label>Organization Name</label>
								<input type="text" value="DEEDS Legal AI Division" readonly />
							</div>
							<div class="form-field">
								<label>System Language</label>
								<select><option>English (US)</option><option>Japanese</option><option>Spanish</option></select>
							</div>
							<div class="form-toggle">
								<div class="toggle-info">
									<span class="toggle-label">Auto-Save</span>
									<span class="toggle-desc">Automatically save changes every 30 seconds</span>
								</div>
								<label class="switch"><input type="checkbox" checked /><span class="slider"></span></label>
							</div>
							<div class="form-toggle">
								<div class="toggle-info">
									<span class="toggle-label">Desktop Notifications</span>
									<span class="toggle-desc">Receive alerts for case updates and AI completions</span>
								</div>
								<label class="switch"><input type="checkbox" checked /><span class="slider"></span></label>
							</div>
						</div>
					</div>
					<div class="content-card settings-card">
						<div class="card-header"><h2>AI Engine</h2></div>
						<div class="settings-form">
							<div class="form-field">
								<label>Active Model</label>
								<select><option>gemma3-legal:latest (11.8B)</option><option>llama3:8b</option></select>
							</div>
							<div class="form-field">
								<label>Temperature</label>
								<div class="range-row">
									<input type="range" min="0" max="1" step="0.1" value="0.7" />
									<span class="range-value">0.7</span>
								</div>
							</div>
							<div class="form-toggle">
								<div class="toggle-info">
									<span class="toggle-label">GPU Acceleration</span>
									<span class="toggle-desc">Use RTX 3060 Ti for inference (CUDA 12.x)</span>
								</div>
								<label class="switch"><input type="checkbox" checked /><span class="slider"></span></label>
							</div>
							<div class="form-toggle">
								<div class="toggle-info">
									<span class="toggle-label">Audit Logging</span>
									<span class="toggle-desc">Log all AI interactions for compliance review</span>
								</div>
								<label class="switch"><input type="checkbox" checked /><span class="slider"></span></label>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Status Bar: dark chrome -->
		<footer class="statusbar">
			<div class="statusbar-left">
				<span class="status-indicator"></span>
				<span>All systems operational</span>
			</div>
			<div class="statusbar-right">
				<span>PostgreSQL 16</span>
				<span class="sep">|</span>
				<span>Qdrant v1.15</span>
				<span class="sep">|</span>
				<span>Ollama GPU</span>
				<span class="sep">|</span>
				<span>Uptime 2d 14h</span>
			</div>
		</footer>
	</div>
</div>

<style>
	/* ═══ SHELL: dark chrome frame ═══ */
	.unified-shell {
		display: grid;
		grid-template-columns: 240px 1fr;
		min-height: 100vh;
		margin: -2.5rem;
		background: #0a0e1a;
		font-family: 'Inter', -apple-system, system-ui, sans-serif;
		transition: grid-template-columns 0.25s ease;
	}
	.unified-shell.collapsed {
		grid-template-columns: 64px 1fr;
	}

	/* ═══ SIDEBAR: deep dark ═══ */
	.sidebar {
		background: #0d1117;
		border-right: 1px solid rgba(255, 255, 255, 0.06);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1.25rem 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.logo-mark {
		width: 36px;
		height: 36px;
		background: linear-gradient(135deg, #c4752b, #d4983f);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}

	.logo-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.logo-title {
		font-family: 'JetBrains Mono', monospace;
		font-weight: 800;
		font-size: 1rem;
		color: #f0ebe0;
		letter-spacing: 0.12em;
	}

	.logo-sub {
		font-size: 0.6rem;
		color: #64748b;
		letter-spacing: 0.05em;
	}

	.collapse-btn {
		margin-left: auto;
		background: none;
		border: none;
		color: #64748b;
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 4px;
		flex-shrink: 0;
	}
	.collapse-btn:hover { color: #94a3b8; background: rgba(255, 255, 255, 0.05); }

	.sidebar-nav {
		flex: 1;
		padding: 0.75rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 0.75rem;
		background: none;
		border: none;
		color: #8b949e;
		cursor: pointer;
		border-radius: 6px;
		font-size: 0.82rem;
		font-weight: 500;
		transition: all 0.15s;
		text-align: left;
		white-space: nowrap;
	}
	.nav-item:hover {
		background: rgba(255, 255, 255, 0.04);
		color: #c9d1d9;
	}
	.nav-item.active {
		background: linear-gradient(135deg, rgba(196, 117, 43, 0.15), rgba(196, 117, 43, 0.08));
		color: #d4983f;
		font-weight: 600;
	}

	.sidebar-footer {
		padding: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.user-badge {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}

	.user-avatar {
		width: 32px;
		height: 32px;
		border-radius: 6px;
		background: linear-gradient(135deg, #334155, #475569);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
		font-weight: 700;
		color: #e2e8f0;
		letter-spacing: 0.05em;
		flex-shrink: 0;
	}
	.user-avatar.compact { margin: 0 auto; }

	.user-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.user-name {
		font-size: 0.78rem;
		font-weight: 600;
		color: #c9d1d9;
	}

	.user-role {
		font-size: 0.62rem;
		color: #64748b;
	}

	/* ═══ MAIN AREA ═══ */
	.main-area {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		overflow: hidden;
	}

	/* ═══ TOPBAR: dark chrome header ═══ */
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.5rem;
		background: #0d1117;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
	}

	.page-title {
		font-size: 1.1rem;
		font-weight: 700;
		color: #f0ebe0;
		margin: 0;
		letter-spacing: -0.01em;
	}

	.topbar-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.cmd-trigger {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		color: #64748b;
		cursor: pointer;
		font-size: 0.78rem;
		transition: all 0.15s;
	}
	.cmd-trigger:hover {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.12);
		color: #94a3b8;
	}
	.cmd-trigger kbd {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.6rem;
		padding: 0.1rem 0.35rem;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		color: #64748b;
	}

	.topbar-icon {
		background: none;
		border: none;
		color: #8b949e;
		cursor: pointer;
		padding: 0.35rem;
		border-radius: 6px;
		position: relative;
	}
	.topbar-icon:hover { color: #c9d1d9; background: rgba(255, 255, 255, 0.04); }
	.notif-dot {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 6px;
		height: 6px;
		background: #c4752b;
		border-radius: 50%;
		border: 1.5px solid #0d1117;
	}

	/* ═══ CONTENT AREA: warm parchment ═══ */
	.content-area {
		flex: 1;
		padding: 1.5rem;
		background: #f5f0e8;
		overflow-y: auto;
	}

	/* KPI Cards */
	.kpi-row {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.kpi-card {
		background: #faf7f0;
		border: 1px solid rgba(42, 37, 32, 0.1);
		border-radius: 10px;
		padding: 1rem 1.25rem;
		display: flex;
		align-items: center;
		gap: 0.85rem;
		box-shadow: 0 1px 3px rgba(42, 37, 32, 0.04);
		transition: box-shadow 0.2s, transform 0.2s;
	}
	.kpi-card:hover {
		box-shadow: 0 4px 12px rgba(42, 37, 32, 0.08);
		transform: translateY(-1px);
	}

	.kpi-icon-wrap {
		width: 40px;
		height: 40px;
		border-radius: 8px;
		background: linear-gradient(135deg, rgba(196, 117, 43, 0.12), rgba(196, 117, 43, 0.05));
		display: flex;
		align-items: center;
		justify-content: center;
		color: #c4752b;
		flex-shrink: 0;
	}

	.kpi-data {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.kpi-value {
		font-size: 1.35rem;
		font-weight: 800;
		color: #2a2520;
		line-height: 1.1;
		font-family: 'JetBrains Mono', monospace;
	}

	.kpi-label {
		font-size: 0.7rem;
		color: #7a6f60;
		letter-spacing: 0.02em;
	}

	.kpi-trend {
		margin-left: auto;
		font-size: 0.72rem;
		font-weight: 600;
		color: #2d8a56;
		background: rgba(45, 138, 86, 0.08);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		font-family: 'JetBrains Mono', monospace;
		white-space: nowrap;
	}

	/* Content Grid */
	.content-grid {
		display: grid;
		grid-template-columns: 1fr 360px;
		gap: 1.25rem;
	}

	.right-col {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	/* Cards: warm bone bg */
	.content-card {
		background: #faf7f0;
		border: 1px solid rgba(42, 37, 32, 0.1);
		border-radius: 10px;
		overflow: hidden;
		box-shadow: 0 1px 3px rgba(42, 37, 32, 0.04);
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid rgba(42, 37, 32, 0.08);
	}

	.card-header h2 {
		font-size: 0.85rem;
		font-weight: 700;
		color: #2a2520;
		margin: 0;
		letter-spacing: -0.01em;
	}

	.card-action {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		background: none;
		border: none;
		color: #c4752b;
		cursor: pointer;
		font-size: 0.72rem;
		font-weight: 600;
	}
	.card-action:hover { color: #a5621f; }

	.card-actions-row {
		display: flex;
		gap: 0.5rem;
	}

	.filter-btn {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.75rem;
		background: transparent;
		border: 1px solid rgba(42, 37, 32, 0.15);
		border-radius: 6px;
		color: #4a4238;
		cursor: pointer;
		font-size: 0.72rem;
	}
	.filter-btn:hover { background: #f0ebe0; }

	.primary-action {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.85rem;
		background: #c4752b;
		border: none;
		border-radius: 6px;
		color: white;
		cursor: pointer;
		font-size: 0.72rem;
		font-weight: 600;
	}
	.primary-action:hover { background: #a5621f; }

	/* Case Table */
	.case-table {
		padding: 0 1.25rem 1rem;
	}

	.table-head {
		display: grid;
		grid-template-columns: 80px 1fr 80px 90px 120px 120px;
		padding: 0.65rem 0;
		border-bottom: 1px solid rgba(42, 37, 32, 0.08);
		font-size: 0.65rem;
		font-weight: 700;
		color: #7a6f60;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.table-row {
		display: grid;
		grid-template-columns: 80px 1fr 80px 90px 120px 120px;
		padding: 0.7rem 0;
		border-bottom: 1px solid rgba(42, 37, 32, 0.04);
		align-items: center;
		font-size: 0.78rem;
		transition: background 0.1s;
	}
	.table-row:hover { background: rgba(196, 117, 43, 0.03); }

	.td-id {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
		color: #c4752b;
		font-weight: 600;
	}
	.td-title { color: #2a2520; font-weight: 500; }
	.td-lead { color: #4a4238; font-size: 0.72rem; }

	.status-tag {
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.status-active { background: rgba(45, 138, 86, 0.1); color: #2d8a56; }
	.status-review { background: rgba(196, 117, 43, 0.1); color: #c4752b; }
	.status-closed { background: rgba(100, 116, 139, 0.1); color: #64748b; }

	.td-priority {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.72rem;
		color: #4a4238;
		text-transform: capitalize;
	}

	.priority-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.priority-critical { background: #dc2626; }
	.priority-high { background: #f59e0b; }
	.priority-medium { background: #3b82f6; }
	.priority-low { background: #94a3b8; }

	.td-progress {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.mini-bar {
		flex: 1;
		height: 4px;
		background: rgba(42, 37, 32, 0.08);
		border-radius: 2px;
		overflow: hidden;
	}
	.mini-fill {
		height: 100%;
		background: linear-gradient(90deg, #c4752b, #d4983f);
		border-radius: 2px;
		transition: width 0.5s ease;
	}
	.progress-pct {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.65rem;
		color: #7a6f60;
		min-width: 30px;
		text-align: right;
	}

	/* Activity Feed */
	.activity-feed {
		padding: 0.5rem 1.25rem 1rem;
	}

	.activity-item {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.65rem 0;
		border-bottom: 1px solid rgba(42, 37, 32, 0.04);
	}
	.activity-item:last-child { border-bottom: none; }

	.activity-icon {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		background: rgba(196, 117, 43, 0.08);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #c4752b;
		flex-shrink: 0;
	}

	.activity-text {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}

	.activity-action {
		font-size: 0.76rem;
		font-weight: 600;
		color: #2a2520;
	}

	.activity-detail {
		font-size: 0.68rem;
		color: #7a6f60;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.activity-time {
		margin-left: auto;
		font-size: 0.62rem;
		color: #94a3b8;
		white-space: nowrap;
		flex-shrink: 0;
	}

	/* Infrastructure card: dark accent inside warm */
	.infra-card {
		background: #161b22;
		border-color: rgba(255, 255, 255, 0.06);
	}
	.infra-card .card-header {
		border-bottom-color: rgba(255, 255, 255, 0.06);
	}
	.infra-card .card-header h2 {
		color: #c9d1d9;
	}

	.infra-badge {
		font-size: 0.6rem;
		font-weight: 700;
		color: #2d8a56;
		background: rgba(45, 138, 86, 0.12);
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.infra-list {
		padding: 0.5rem 1.25rem 1rem;
	}

	.infra-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
	}
	.infra-row:last-child { border-bottom: none; }

	.infra-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #2d8a56;
		flex-shrink: 0;
		box-shadow: 0 0 6px rgba(45, 138, 86, 0.4);
	}
	.infra-dot.warning {
		background: #f59e0b;
		box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);
	}

	.infra-name {
		font-size: 0.75rem;
		color: #c9d1d9;
	}

	.infra-latency {
		margin-left: auto;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		color: #64748b;
	}

	/* Full-width card */
	.full-card {
		margin-bottom: 1.25rem;
	}

	/* Evidence grid */
	.evidence-grid {
		padding: 0.5rem 1.25rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.evidence-item {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 0.65rem 0.5rem;
		border-radius: 6px;
		transition: background 0.1s;
	}
	.evidence-item:hover { background: rgba(196, 117, 43, 0.04); }

	.evidence-icon-box {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		background: rgba(196, 117, 43, 0.08);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #c4752b;
		flex-shrink: 0;
	}

	.evidence-info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}

	.evidence-name {
		font-size: 0.8rem;
		font-weight: 600;
		color: #2a2520;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.evidence-meta {
		font-size: 0.65rem;
		color: #7a6f60;
	}

	.evidence-type-tag {
		margin-left: auto;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.6rem;
		font-weight: 700;
		color: #7a6f60;
		background: rgba(42, 37, 32, 0.06);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		text-transform: uppercase;
	}

	/* Analytics chart placeholder */
	.chart-placeholder {
		padding: 1.5rem 1.25rem;
		position: relative;
	}

	.chart-bars {
		display: flex;
		align-items: flex-end;
		gap: 3px;
		height: 180px;
	}

	.chart-bar {
		flex: 1;
		background: linear-gradient(to top, #c4752b, #d4983f);
		border-radius: 2px 2px 0 0;
		opacity: 0.7;
		animation: barGrow 0.6s ease-out both;
	}
	.chart-bar:hover { opacity: 1; }

	@keyframes barGrow {
		from { height: 0% !important; }
	}

	.chart-baseline {
		height: 1px;
		background: rgba(42, 37, 32, 0.12);
	}

	/* Settings */
	.settings-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
	}

	.settings-form {
		padding: 1rem 1.25rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.form-field label {
		font-size: 0.72rem;
		font-weight: 600;
		color: #4a4238;
	}

	.form-field input,
	.form-field select {
		padding: 0.55rem 0.75rem;
		background: white;
		border: 1px solid rgba(42, 37, 32, 0.15);
		border-radius: 6px;
		font-size: 0.8rem;
		color: #2a2520;
		transition: border-color 0.15s;
	}
	.form-field input:focus,
	.form-field select:focus {
		outline: none;
		border-color: #c4752b;
		box-shadow: 0 0 0 3px rgba(196, 117, 43, 0.1);
	}

	.range-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.range-row input[type="range"] {
		flex: 1;
		accent-color: #c4752b;
		border: none;
		padding: 0;
	}
	.range-value {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		color: #c4752b;
		font-weight: 700;
		min-width: 24px;
		text-align: right;
	}

	.form-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0;
		border-top: 1px solid rgba(42, 37, 32, 0.06);
	}

	.toggle-info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.toggle-label {
		font-size: 0.78rem;
		font-weight: 600;
		color: #2a2520;
	}

	.toggle-desc {
		font-size: 0.65rem;
		color: #7a6f60;
	}

	/* Custom toggle switch */
	.switch {
		position: relative;
		display: inline-block;
		width: 38px;
		height: 20px;
		flex-shrink: 0;
	}
	.switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}
	.slider {
		position: absolute;
		cursor: pointer;
		inset: 0;
		background: rgba(42, 37, 32, 0.15);
		border-radius: 20px;
		transition: background 0.25s;
	}
	.slider::before {
		content: '';
		position: absolute;
		height: 14px;
		width: 14px;
		left: 3px;
		bottom: 3px;
		background: white;
		border-radius: 50%;
		transition: transform 0.25s;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
	}
	.switch input:checked + .slider {
		background: #c4752b;
	}
	.switch input:checked + .slider::before {
		transform: translateX(18px);
	}

	/* ═══ STATUS BAR: dark chrome footer ═══ */
	.statusbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.4rem 1.5rem;
		background: #0d1117;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		font-size: 0.65rem;
		color: #64748b;
		flex-shrink: 0;
	}

	.statusbar-left {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.status-indicator {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #2d8a56;
		box-shadow: 0 0 6px rgba(45, 138, 86, 0.5);
	}

	.statusbar-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.62rem;
	}

	.sep { color: rgba(255, 255, 255, 0.1); }

	/* ═══ RESPONSIVE ═══ */
	@media (max-width: 1200px) {
		.content-grid { grid-template-columns: 1fr; }
		.settings-grid { grid-template-columns: 1fr; }
	}
	@media (max-width: 900px) {
		.kpi-row { grid-template-columns: repeat(2, 1fr); }
	}
	@media (max-width: 768px) {
		.unified-shell { grid-template-columns: 1fr; }
		.sidebar { display: none; }
		.table-head, .table-row { grid-template-columns: 80px 1fr 80px; }
		.th-priority, .th-lead, .th-progress, .td-priority, .td-lead, .td-progress { display: none; }
	}
</style>
