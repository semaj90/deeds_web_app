<script lang="ts">
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { buttonVariants } from '$lib/components/ui/button-variants';

	let { data }: { data: PageData } = $props();

	// Derived state from server data
	let user = $derived(data.user);
	let stats = $derived(data.stats);
	let recentCases = $derived(data.recentCases);
	let recentActivity = $derived(data.recentActivity);

	// Local state
	let aiMode = $state('9S');
	let assistantMessage = $state('Greetings, Detective! I am 9S, your AI investigation assistant.');

	let systemStatus = $state({
		database: 'online',
		redis: 'online',
		ollama: 'online',
		assistant: 'online'
	});

	// Auth dialog state
	let authDialogRef: HTMLDialogElement | undefined = $state();
	let authTab = $state<'login' | 'register'>('login');
	let authError = $state('');
	let authLoading = $state(false);
	let loginEmail = $state('');
	let loginPassword = $state('');
	let regEmail = $state('');
	let regFirstName = $state('');
	let regLastName = $state('');
	let regPassword = $state('');

	function openAuthDialog(tab: 'login' | 'register') {
		authTab = tab;
		authError = '';
		authDialogRef?.showModal();
	}

	function closeAuthDialog() {
		authDialogRef?.close();
		authError = '';
	}

	async function handleLogin() {
		authError = '';
		authLoading = true;
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: loginEmail, password: loginPassword })
			});
			const json = await res.json();
			if (!res.ok) {
				authError = json.error || 'Login failed';
				return;
			}
			closeAuthDialog();
			await invalidateAll();
		} catch {
			authError = 'Network error';
		} finally {
			authLoading = false;
		}
	}

	async function handleRegister() {
		authError = '';
		authLoading = true;
		try {
			const res = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: regEmail,
					firstName: regFirstName,
					lastName: regLastName,
					password: regPassword
				})
			});
			const json = await res.json();
			if (!res.ok) {
				authError = json.error || 'Registration failed';
				return;
			}
			closeAuthDialog();
			await invalidateAll();
		} catch {
			authError = 'Network error';
		} finally {
			authLoading = false;
		}
	}

	async function handleDemoLogin() {
		authError = '';
		authLoading = true;
		try {
			const res = await fetch('/api/auth/demo-login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'demo@legal-ai.local', role: 'admin' })
			});
			if (!res.ok) {
				authError = 'Demo login failed';
				return;
			}
			closeAuthDialog();
			await invalidateAll();
		} catch {
			authError = 'Network error';
		} finally {
			authLoading = false;
		}
	}

	function fillDemoCredentials() {
		loginEmail = 'demo@legal-ai.local';
		loginPassword = 'demo123';
	}

	function cycleAIMode() {
		const modes = ['9S', 'A2', '2B'];
		const current = modes.indexOf(aiMode);
		aiMode = modes[(current + 1) % modes.length];

		const messages: Record<string, string> = {
			'9S': 'Hello, Detective! 9S mode active.',
			'A2': 'A2 combat mode engaged. Ready for aggressive analysis.',
			'2B': '2B escort mode active. All evidence secured.'
		};
		assistantMessage = messages[aiMode];
	}

	function getPriorityClass(priority: string) {
		return priority === 'high' ? 'priority-high' :
			priority === 'medium' ? 'priority-medium' : 'priority-low';
	}

	function getStatusIcon(status: string) {
		return status === 'online' ? '✓' :
			status === 'checking' ? '⏳' : '✗';
	}

	$effect(() => {
		if (browser) {
			// Health check logic can be added here later
		}
	});
</script>

{#snippet caseCard(caseItem: any)}
	<div class="case-card">
		<div class="case-header">
			<h3>{caseItem.title}</h3>
			<div class="case-badges">
				<span class="badge {getPriorityClass(caseItem.priority)}">{caseItem.priority}</span>
				<span class="badge status-{caseItem.status}">{caseItem.status}</span>
			</div>
		</div>
	<div class="case-meta">
		<span>🕒 {new Date(caseItem.updatedAt).toLocaleDateString()}</span>
	</div>
	<a href="/cases/{caseItem.id}" class="case-action-btn">→</a>
</div>
{/snippet}

{#snippet activityItem(activity: any)}
	<div class="activity-item">
		<div class="activity-icon">{activity.action === 'create' ? '➕' : '✏️'}</div>
		<div class="activity-details">
			<div class="activity-text">
				<span class="activity-user">{activity.userId}</span>
				{activity.action}
				<span class="activity-target">{activity.resourceType}</span>
			</div>
			<div class="activity-time">{new Date(activity.createdAt).toLocaleString()}</div>
		</div>
	</div>
{/snippet}


<main class="yorha-command-center">
 <!-- Sidebar -->
 <aside class="sidebar">
 <div class="sidebar-header">
 <div class="logo">
 <div class="logo-text">YORHA</div>
 <div class="logo-subtitle">DETECTIVE</div>
 </div>
 <div class="subtitle">Investigation Interface</div>
 </div>

 <nav class="sidebar-nav">
 <a href="/command-center" class="nav-item active">
 <span class="nav-icon">📋</span> COMMAND CENTER
 </a>
 <a href="/" class="nav-item">
 <span class="nav-icon">📁</span> ACTIVE CASES <span class="badge">{recentCases.length}</span>
 </a>
 <a href="/evidence" class="nav-item">
 <span class="nav-icon">📊</span> EVIDENCE LIBRARY
 </a>
 <a href="/persons-of-interest" class="nav-item">
 <span class="nav-icon">👤</span> PERSONS OF INTEREST
 </a>
 <a href="/analysis-center" class="nav-item">
 <span class="nav-icon">🔍</span> ANALYSIS CENTER
 </a>
 <a href="/global-search" class="nav-item">
 <span class="nav-icon">🔍</span> GLOBAL SEARCH
 </a>
 <a href="/citations" class="nav-item">
 <span class="nav-icon">📜</span> CITATIONS
 </a>
 <a href="/dashboard" class="nav-item">
 <span class="nav-icon">📈</span> DASHBOARD
 </a>
 <a href="/ai-dashboard" class="nav-item">
 <span class="nav-icon">🧠</span> AI DASHBOARD
 </a>
 <a href="/chat" class="nav-item">
 <span class="nav-icon">🤖</span> AI ASSISTANT
 </a>
 <a href="/terminal" class="nav-item">
 <span class="nav-icon">🔧</span> TERMINAL
 </a>
 </nav>

 <div class="sidebar-footer">
 <a href="/system-configuration" class="nav-item">
 <span class="nav-icon">⚙️</span> SYSTEM CONFIGURATION
 </a>
 </div>

 <div class="version-info">
 <div>YoRHa</div>
 <div class="version">v2.0</div>
 <div class="subtitle">Detective Operations</div>
 </div>
 </aside>

 <!-- Main Content -->
 <div class="main-content">
 <!-- Header -->
 <header class="page-header">
		<div class="header-left">
			<h1>COMMAND CENTER {user ? `// ${user.username}` : ''}</h1>
			<div class="header-subtitle">YoRHa <span class="dimmed">Detective Interface / 8/13.10</span></div>
		</div>
 <div class="header-right">
		{#if !user}
			<button onclick={() => openAuthDialog('login')} class="{buttonVariants({variant: 'outline', size: 'sm'})} header-btn">
				SIGN IN
			</button>
			<button onclick={() => openAuthDialog('register')} class="{buttonVariants({variant: 'default', size: 'sm'})} header-btn new-case-btn">
				REGISTER
			</button>
		{:else}
			<button class="{buttonVariants({variant: 'outline', size: 'sm'})} header-btn">
				<span class="icon">🔔</span> HELP <span class="badge">0</span>
			</button>
			<button class="{buttonVariants({variant: 'outline', size: 'sm'})} header-btn">
				<span class="icon">⚙️</span> OPTIONS
			</button>
			<a href="/cases/new" class="{buttonVariants({variant: 'default', size: 'sm'})} header-btn new-case-btn">
				<span class="icon">➕</span> NEW CASE
			</a>
		{/if}
 </div>
 </header>

 <!-- Quick Stats Grid -->
 <section class="quick-stats">
 <div class="stat-card">
 <div class="stat-label">Active Cases</div>
 <div class="stat-value">{stats.activeCases}</div>
 <div class="stat-icon">📁</div>
 </div>
 <div class="stat-card">
 <div class="stat-label">Evidence Items</div>
 <div class="stat-value">{stats.evidenceItems}</div>
 <div class="stat-icon">📄</div>
 </div>
 <div class="stat-card">
 <div class="stat-label">Persons of Interest</div>
 <div class="stat-value">{stats.personsOfInterest}</div>
 <div class="stat-icon">👤</div>
 </div>
 <div class="stat-card">
 <div class="stat-label">Recent Activity</div>
 <div class="stat-value">{stats.recentActivity}</div>
 <div class="stat-icon">📊</div>
 </div>
 </section>

 <!-- Main Grid -->
 <div class="content-grid">
 <!-- Active Cases Section -->
 <section class="cases-section">
 <div class="section-header">
 <h2>ACTIVE CASES</h2>
 <a href="/cases" class="view-all-btn">VIEW ALL →</a>
 </div>

		<div class="cases-list">
			{#each recentCases as caseItem}
				{@render caseCard(caseItem)}
			{/each}
		</div>
		</section>

		<!-- Recent Activity Section -->
		<section class="activity-section">
			<div class="section-header">
				<h2>RECENT ACTIVITY</h2>
				<a href="/activity" class="view-all-btn">VIEW LOG →</a>
			</div>
			<div class="activity-list">
				{#each recentActivity as activity}
					{@render activityItem(activity)}
				{/each}
			</div>
		</section>

		<!-- AI Assistant Panel -->
 <aside class="ai-assistant-panel">
 <div class="panel-header">
 <span>AI LEGAL ASSISTANT — {aiMode} MODE ACTIVE</span>
 <button class="mode-toggle" onclick={cycleAIMode} aria-label="Toggle AI mode">
 <span class="status-dot active"></span>
 </button>
 </div>

 <div class="assistant-content">
 <div class="assistant-avatar">
 <div class="avatar-icon">🤖</div>
 <div class="avatar-label">
 AI {aiMode} Assistant:<br />
 {aiMode} mode Active
 </div>
 </div>

 <div class="assistant-message">
 {assistantMessage}
 </div>

 <ul class="assistant-status">
 <li>Autocom: status check out 10 minutes ago</li>
 <li>Evidence analysis queue processing slowly</li>
 <li>1 hour ago</li>
 </ul>

 <div class="assistant-actions">
 <div class="assistant-prompt">
 AI analysis requested...
 </div>
 </div>
 </div>

 <div class="system-status-panel">
 <h3>SYSTEM STATUS</h3>
 <div class="status-buttons">
 <a href="/evidence" class="status-btn">
 <span class="icon">📊</span> EVIDENCE BOARD
 </a>
 <a href="/timeline-analysis" class="status-btn">
 <span class="icon">⏱️</span> TIMELINE ANALYSIS
 </a>
 <a href="/quick-actions" class="status-btn">
 <span class="icon">⚡</span> QUICK ACTIONS
 </a>
 </div>
 </div>
 </aside>
 </div>

 <!-- System Health Footer -->
 <footer class="system-health">
 <div class="health-item">
 <span class="health-icon">{getStatusIcon(systemStatus.database)}</span>
 <span>Database: {systemStatus.database}</span>
 </div>
 <div class="health-item">
 <span class="health-icon">{getStatusIcon(systemStatus.redis)}</span>
 <span>Redis: {systemStatus.redis}</span>
 </div>
 <div class="health-item">
 <span class="health-icon">{getStatusIcon(systemStatus.ollama)}</span>
 <span>Ollama: {systemStatus.ollama}</span>
 </div>
 <div class="health-item">
 <span class="health-icon">{getStatusIcon(systemStatus.assistant)}</span>
 <span>AI Assistant: {systemStatus.assistant}</span>
 </div>
 <div class="health-time">
 <span>Last Updated: {new Date().toLocaleTimeString()}</span>
 </div>
 </footer>
 </div>
</main>

<!-- Auth Dialog -->
<dialog bind:this={authDialogRef} class="auth-dialog" onclick={(e) => { if (e.target === authDialogRef) closeAuthDialog(); }}>
	<div class="dialog-inner">
		<div class="dialog-header">
			<h2>YORHA // {authTab === 'login' ? 'SIGN IN' : 'REGISTER'}</h2>
			<button class="dialog-close" onclick={closeAuthDialog}>X</button>
		</div>

		<div class="dialog-tabs">
			<button class="dialog-tab" class:active={authTab === 'login'} onclick={() => { authTab = 'login'; authError = ''; }}>
				SIGN IN
			</button>
			<button class="dialog-tab" class:active={authTab === 'register'} onclick={() => { authTab = 'register'; authError = ''; }}>
				REGISTER
			</button>
		</div>

		{#if authError}
			<div class="dialog-error">{authError}</div>
		{/if}

		{#if authTab === 'login'}
			<form class="dialog-form" onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
				<label class="dialog-label">
					EMAIL
					<input type="email" bind:value={loginEmail} required class="dialog-input" placeholder="demo@legal-ai.local" />
				</label>
				<label class="dialog-label">
					PASSWORD
					<input type="password" bind:value={loginPassword} required class="dialog-input" placeholder="demo123" />
				</label>
				<button type="submit" class="dialog-btn-primary" disabled={authLoading}>
					{authLoading ? 'AUTHENTICATING...' : 'SIGN IN'}
				</button>
			</form>

			<div class="dialog-divider">
				<span>DEMO ACCOUNTS</span>
			</div>

			<div class="demo-credentials">
				<div class="demo-row">
					<span class="demo-label">Admin:</span>
					<code>demo@legal-ai.local</code> / <code>demo123</code>
					<button class="demo-fill-btn" onclick={fillDemoCredentials}>FILL</button>
				</div>
				<div class="demo-row">
					<span class="demo-label">Prosecutor:</span>
					<code>prosecutor@legal.ai</code> / <code>password123</code>
				</div>
				<div class="demo-row">
					<span class="demo-label">Detective:</span>
					<code>detective@legal.ai</code> / <code>password123</code>
				</div>
			</div>

			<button class="dialog-btn-demo" onclick={handleDemoLogin} disabled={authLoading}>
				QUICK DEMO LOGIN (admin)
			</button>

			<div class="dialog-hint">
				Run <code>npm run db:seed</code> to create demo accounts
			</div>
		{:else}
			<form class="dialog-form" onsubmit={(e) => { e.preventDefault(); handleRegister(); }}>
				<div class="dialog-row">
					<label class="dialog-label">
						FIRST NAME
						<input type="text" bind:value={regFirstName} required class="dialog-input" placeholder="Jane" />
					</label>
					<label class="dialog-label">
						LAST NAME
						<input type="text" bind:value={regLastName} required class="dialog-input" placeholder="Prosecutor" />
					</label>
				</div>
				<label class="dialog-label">
					EMAIL
					<input type="email" bind:value={regEmail} required class="dialog-input" placeholder="you@legal.ai" />
				</label>
				<label class="dialog-label">
					PASSWORD
					<input type="password" bind:value={regPassword} required minlength="8" class="dialog-input" placeholder="Min 8 characters" />
				</label>
				<button type="submit" class="dialog-btn-primary" disabled={authLoading}>
					{authLoading ? 'CREATING ACCOUNT...' : 'REGISTER'}
				</button>
			</form>
		{/if}
	</div>
</dialog>

<style>
 /* YoRHa Detective Command Center Styles */
 .yorha-command-center {
 display: flex;
 min-height: 100vh;
		background: #d4c9a9;
 font-family: 'JetBrains Mono', 'Courier New', monospace;
 color: #0f0f0f;
 }

 /* Sidebar */
 .sidebar { width: 280px;
		background: #2a2016;
 color: #f8f0d9;
		display: flex;
 flex-direction: column;
 border-right: 4px solid #0f0f0f;
 }

 .sidebar-header {
 padding: 1.5rem;
 border-bottom: 2px solid #0f0f0f;
 }

 .logo {
 margin-bottom: 0.5rem;
 }

 .logo-text {
 font-size: 1.75rem;
 font-weight: 900;
 letter-spacing: 2px;
 }

 .logo-subtitle {
 font-size: 1.25rem;
 font-weight: 700;
 letter-spacing: 1px;
 }

 .subtitle {
 font-size: 0.75rem;
		color: #b4a080;
 text-transform: uppercase;
 letter-spacing: 1px;
 }

 .sidebar-nav { flex: 1;
		padding: 1rem 0;
 }

 .nav-item {
 display: flex;
 align-items: center;
		padding: 0.875rem 1.5rem;
 color: #f8f0d9;
 text-decoration: none;
 font-size: 0.85rem;
 font-weight: 600;
 letter-spacing: 0.5px;
 border-left: 4px solid transparent;
 transition: all 0.2s ease;
 }

 .nav-item:hover {
 background: #1a160f;
 border-left-color: #fdf3d4;
 }

 .nav-item.active {
 background: #12100c;
 border-left-color: #fdf3d4;
 font-weight: 700;
 }

 .nav-icon {
 margin-right: 0.75rem;
 }

 .badge {
 margin-left: auto;
		background: #0f0f0f;
 color: #fdf3d4;
		padding: 0.125rem 0.5rem;
 border-radius: 10px;
 font-size: 0.7rem;
 font-weight: 700;
 }

 .sidebar-footer {
 border-top: 2px solid #0f0f0f;
 padding: 1rem 0;
 }

 .version-info {
 padding: 1rem 1.5rem;
 border-top: 2px solid #0f0f0f;
 text-align: right;
 font-size: 0.75rem;
		color: #8a7a5a;
 }

 .version {
 font-size: 0.7rem;
 }

 /* Main Content */
 .main-content { flex: 1;
		display: flex;
 flex-direction: column;
		background: #d4c9a9;
 }

 .page-header {
 padding: 1.5rem 2rem;
 background: #c4b99a;
 border-bottom: 4px solid #0f0f0f;
 display: flex;
 justify-content: space-between;
 align-items: center;
 }

 .page-header h1 {
 margin: 0;
 font-size: 1.75rem;
 font-weight: 900;
 letter-spacing: 2px;
 }

 .header-subtitle {
 font-size: 0.85rem;
 margin-top: 0.25rem;
 }

 .dimmed {
 opacity: 0.6;
 }

 .header-right { display: flex;
		gap: 0.75rem;
 }

 .header-btn {
 padding: 0.5rem 1rem;
 background: #2a2016;
		color: #f8f0d9;
 border: 2px solid #0f0f0f;
 font-size: 0.75rem;
 font-weight: 700;
		cursor: pointer;
 transition: all 0.2s ease;
 }

 .header-btn:hover {
 background: #1a160f;
 }

 .icon {
 margin-right: 0.375rem;
 }

 /* Quick Stats */
 .quick-stats {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1.25rem;
		padding: 1.5rem 2rem;
	background: #c4b99a;
 }

 .stat-card { background: #f8f0d9;
		border: 3px solid #0f0f0f;
 padding: 1.25rem;
		position: relative;
 display: flex;
 flex-direction: column;
		gap: 0.5rem;
 }

 .stat-label {
 font-size: 0.75rem;
 font-weight: 700;
 text-transform: uppercase;
 letter-spacing: 1px;
		opacity: 0.8;
 }

 .stat-value {
 font-size: 2rem;
 font-weight: 900;
 line-height: 1;
 }

 .stat-icon { position: absolute;
		top: 1rem;
 right: 1rem;
 font-size: 2rem;
		opacity: 0.2;
 }

 /* Content Grid */
 .content-grid { flex: 1;
		display: grid;
 grid-template-columns: 1fr 400px;
 gap: 1.5rem;
		padding: 1.5rem 2rem;
 }

 /* Cases Section */
 .cases-section { background: #c4b99a;
		border: 3px solid #0f0f0f;
 padding: 1.5rem;
 }

 .section-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1.25rem;
 padding-bottom: 0.75rem;
 border-bottom: 2px solid #0f0f0f;
 }

 .section-header h2 {
 margin: 0;
 font-size: 1.25rem;
 font-weight: 900;
 letter-spacing: 1px;
 }

 .view-all-btn {
 font-size: 0.75rem;
 font-weight: 700;
		color: #0f0f0f;
 text-decoration: none;
		padding: 0.375rem 0.75rem;
 border: 2px solid #0f0f0f;
 transition: all 0.2s ease;
 }

 .view-all-btn:hover { background: #0f0f0f;
		color: #f8f0d9;
 }

 .cases-list {
 display: flex;
 flex-direction: column;
		gap: 1rem;
 }

 .case-card { background: #f8f0d9;
		border: 3px solid #0f0f0f;
 padding: 1.25rem;
		position: relative;
 transition: all 0.2s ease;
 }

 .case-card:hover {
 transform: translateX(4px);
 }

 .case-header {
 display: flex;
 justify-content: space-between;
 align-items: start;
 margin-bottom: 0.75rem;
 }

 .case-header h3 {
 margin: 0;
 font-size: 1rem;
 font-weight: 900;
 letter-spacing: 0.5px;
		flex: 1;
 }

 .case-badges { display: flex;
		gap: 0.5rem;
 }

 .priority-high { background: #d32f2f;
		color: white;
 }

 .priority-medium { background: #ff9800;
		color: white;
 }

 .priority-low { background: #4caf50;
		color: white;
 }

 .status-active { background: #00c853;
		color: white;
 }

 .status-pending { background: #ff9800;
		color: white;
 }

 .case-meta { display: flex;
		gap: 1.5rem;
 font-size: 0.8rem;
		opacity: 0.8;
 }

 .case-action-btn { position: absolute;
		bottom: 1rem;
 right: 1rem;
		width: 32px;
 height: 32px;
		background: #0f0f0f;
 color: #fdf3d4;
		border: none;
 font-size: 1.25rem;
		cursor: pointer;
 transition: all 0.2s ease;
 }

 .case-action-btn:hover {
 background: #2a2016;
 }

 /* Activity Section */
	.activity-section { background: #c4b99a;
		border: 3px solid #0f0f0f;
		padding: 1.5rem;
		margin-top: 1.5rem;
	}

	.activity-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.activity-item { display: flex;
		gap: 1rem;
		padding: 0.75rem;
		background: #f8f0d9;
		border: 2px solid #0f0f0f;
		align-items: center;
	}

	.activity-icon {
		font-size: 1.25rem;
	}

	.activity-details { flex: 1;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.activity-text {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.activity-user {
		color: #8a7a5a;
		margin-right: 0.25rem;
	}

	.activity-target {
		font-weight: 700;
		margin-left: 0.25rem;
	}

	.activity-time {
		font-size: 0.75rem;
		opacity: 0.7;
	}

 /* AI Assistant Panel */
 .ai-assistant-panel {
 display: flex;
 flex-direction: column;
		gap: 1.5rem;
 }

 .panel-header { background: #12100c;
		color: #fdf3d4;
 padding: 0.875rem 1.25rem;
 font-size: 0.75rem;
 font-weight: 700;
 letter-spacing: 1px;
		display: flex;
 justify-content: space-between;
 align-items: center;
		border: 3px solid #0f0f0f;
 }

 .mode-toggle { background: transparent;
		border: none;
 cursor: pointer;
		padding: 0;
 }

 .status-dot { width: 12px;
		height: 12px;
 border-radius: 50%;
		background: #4ade80;
 display: inline-block;
 }

 .status-dot.active {
 animation: pulse 2s ease-in-out infinite;
 }

 @keyframes pulse {
 0%, 100% { opacity: 1;
		transform: scale(1); }
 50% { opacity: 0.6;
		transform: scale(1.1); }
 }

 .assistant-content { background: #1a160f;
		color: #f8f0d9;
 border: 3px solid #0f0f0f;
 padding: 1.5rem;
		flex: 1;
 min-height: 300px;
 }

 .assistant-avatar {
 display: flex;
 align-items: center;
		gap: 1rem;
 margin-bottom: 1.5rem;
 padding-bottom: 1rem;
 border-bottom: 1px solid #2a2016;
 }

 .avatar-icon {
 font-size: 3rem;
 }

 .avatar-label {
 font-size: 0.85rem;
 line-height: 1.4;
 }

 .assistant-message { background: #12100c;
		border: 2px solid #2a2016;
 padding: 1rem;
 margin-bottom: 1.25rem;
 font-size: 0.85rem;
 line-height: 1.5;
 }

 .assistant-status {
 list-style: none;
		padding: 0;
 margin: 0 0 1.25rem 0;
 font-size: 0.8rem;
 line-height: 1.8;
 }

 .assistant-status li::before {
 content: '▷ ';
 opacity: 0.6;
 margin-right: 0.5rem;
 }

 .assistant-prompt { background: #12100c;
		border: 2px solid #2a2016;
 padding: 1rem;
 font-size: 0.8rem;
 font-style: italic;
		opacity: 0.8;
 }

 .system-status-panel { background: #f8f0d9;
		border: 3px solid #0f0f0f;
 padding: 1.5rem;
 }

 .system-status-panel h3 {
 margin: 0 0 1rem 0;
 font-size: 1rem;
 font-weight: 900;
 letter-spacing: 1px;
 }

 .status-buttons {
 display: flex;
 flex-direction: column;
		gap: 0.75rem;
 }

 .status-btn { background: #2a2016;
		color: #f8f0d9;
 padding: 0.875rem 1.25rem;
 border: 2px solid #0f0f0f;
 text-decoration: none;
 font-size: 0.8rem;
 font-weight: 700;
 letter-spacing: 0.5px;
		display: flex;
 align-items: center;
		transition: all 0.2s ease;
 }

 .status-btn:hover {
 background: #1a160f;
 }

 /* System Health Footer */
 .system-health { background: #2a2016;
		color: #f8f0d9;
 padding: 1rem 2rem;
 border-top: 3px solid #0f0f0f;
 display: flex;
		gap: 2rem;
 font-size: 0.75rem;
 font-weight: 600;
 }

 .health-item {
 display: flex;
 align-items: center;
		gap: 0.5rem;
 }

 .health-icon {
 font-weight: 900;
 }

 .health-time {
 margin-left: auto;
		opacity: 0.6;
 }

 /* Auth Dialog */
 .auth-dialog {
	border: none;
	padding: 0;
	background: transparent;
	max-width: 480px;
	width: 90vw;
 }

 .auth-dialog::backdrop {
	background: rgba(15, 15, 15, 0.7);
	backdrop-filter: blur(4px);
 }

 .dialog-inner {
	background: #2a2016;
	color: #f8f0d9;
	border: 4px solid #0f0f0f;
	padding: 2rem;
 }

 .dialog-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 1.5rem;
	padding-bottom: 1rem;
	border-bottom: 2px solid #0f0f0f;
 }

 .dialog-header h2 {
	margin: 0;
	font-size: 1.25rem;
	font-weight: 900;
	letter-spacing: 2px;
 }

 .dialog-close {
	background: transparent;
	border: 2px solid #f8f0d9;
	color: #f8f0d9;
	width: 32px;
	height: 32px;
	font-weight: 900;
	cursor: pointer;
	font-size: 0.85rem;
 }

 .dialog-close:hover {
	background: #f8f0d9;
	color: #2a2016;
 }

 .dialog-tabs {
	display: flex;
	gap: 0;
	margin-bottom: 1.5rem;
 }

 .dialog-tab {
	flex: 1;
	padding: 0.75rem;
	background: #1a160f;
	color: #8a7a5a;
	border: 2px solid #0f0f0f;
	font-weight: 700;
	font-size: 0.8rem;
	letter-spacing: 1px;
	cursor: pointer;
 }

 .dialog-tab.active {
	background: #0f0f0f;
	color: #fdf3d4;
	border-bottom-color: #fdf3d4;
 }

 .dialog-error {
	background: #4a1010;
	border: 2px solid #d32f2f;
	padding: 0.75rem 1rem;
	margin-bottom: 1rem;
	font-size: 0.8rem;
	color: #ff8a80;
 }

 .dialog-form {
	display: flex;
	flex-direction: column;
	gap: 1rem;
 }

 .dialog-row {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1rem;
 }

 .dialog-label {
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
	font-size: 0.7rem;
	font-weight: 700;
	letter-spacing: 1px;
	color: #b4a080;
 }

 .dialog-input {
	padding: 0.625rem 0.75rem;
	background: #12100c;
	border: 2px solid #0f0f0f;
	color: #f8f0d9;
	font-family: inherit;
	font-size: 0.85rem;
 }

 .dialog-input:focus {
	outline: none;
	border-color: #fdf3d4;
 }

 .dialog-input::placeholder {
	color: #5a4a3a;
 }

 .dialog-btn-primary {
	padding: 0.875rem;
	background: #f8f0d9;
	color: #0f0f0f;
	border: 3px solid #0f0f0f;
	font-weight: 900;
	font-size: 0.85rem;
	letter-spacing: 1px;
	cursor: pointer;
	margin-top: 0.5rem;
 }

 .dialog-btn-primary:hover:not(:disabled) {
	background: #fdf3d4;
 }

 .dialog-btn-primary:disabled {
	opacity: 0.5;
	cursor: not-allowed;
 }

 .dialog-divider {
	display: flex;
	align-items: center;
	margin: 1.5rem 0 1rem;
	gap: 1rem;
 }

 .dialog-divider::before,
 .dialog-divider::after {
	content: '';
	flex: 1;
	height: 1px;
	background: #0f0f0f;
 }

 .dialog-divider span {
	font-size: 0.7rem;
	font-weight: 700;
	letter-spacing: 1px;
	color: #8a7a5a;
 }

 .demo-credentials {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	margin-bottom: 1rem;
 }

 .demo-row {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-size: 0.75rem;
	padding: 0.375rem 0.625rem;
	background: #12100c;
	border: 1px solid #1a160f;
 }

 .demo-label {
	font-weight: 700;
	color: #b4a080;
	min-width: 80px;
 }

 .demo-row code {
	color: #fdf3d4;
	font-size: 0.7rem;
 }

 .demo-fill-btn {
	margin-left: auto;
	padding: 0.25rem 0.5rem;
	background: #0f0f0f;
	color: #fdf3d4;
	border: 1px solid #fdf3d4;
	font-size: 0.65rem;
	font-weight: 700;
	letter-spacing: 0.5px;
	cursor: pointer;
 }

 .demo-fill-btn:hover {
	background: #fdf3d4;
	color: #0f0f0f;
 }

 .dialog-btn-demo {
	width: 100%;
	padding: 0.75rem;
	background: #1a3a1a;
	color: #4ade80;
	border: 2px solid #4ade80;
	font-weight: 700;
	font-size: 0.8rem;
	letter-spacing: 1px;
	cursor: pointer;
	margin-bottom: 1rem;
 }

 .dialog-btn-demo:hover:not(:disabled) {
	background: #2a4a2a;
 }

 .dialog-btn-demo:disabled {
	opacity: 0.5;
	cursor: not-allowed;
 }

 .dialog-hint {
	text-align: center;
	font-size: 0.7rem;
	color: #8a7a5a;
 }

 .dialog-hint code {
	color: #b4a080;
	font-size: 0.7rem;
 }

 /* Responsive */
 @media (max-width: 1200px) {
 .content-grid {
 grid-template-columns: 1fr;
 }

 .ai-assistant-panel {
 grid-column: 1;
 }
 }

 @media (max-width: 768px) {
 .yorha-command-center {
 flex-direction: column;
 }

 .sidebar {
 width: 100%;
 border-right: none;
 border-bottom: 4px solid #0f0f0f;
 }

 .page-header {
 flex-direction: column;
 align-items: flex-start;
		gap: 1rem;
 }

 .header-right {
 width: 100%;
 flex-wrap: wrap;
 }

 .quick-stats {
 grid-template-columns: repeat(2, 1fr);
 }
 }
</style>




