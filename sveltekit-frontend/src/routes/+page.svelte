<script lang="ts">
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { buttonVariants } from '$lib/components/ui/button-variants';
	import {
		IconAiAssistant,
		IconCitation,
		IconEvidenceFile,
		IconIntegrityShield,
		IconLawBook,
		IconNetworkGraph,
		IconPrecedentCase,
		IconRegulation,
		IconSubjectProfile,
		IconTimeline,
		IconWarningFlag
	} from '$lib/icons/yorha';

	let { data }: { data: PageData } = $props();

	// Derived state from server data
	let user = $derived(data.user);
	let stats = $derived(data.stats);
	let recentCases = $derived(data.recentCases);
	let recentActivity = $derived(data.recentActivity);

	// Legal search state
	let searchQuery = $state('');
	let searchTab = $state<'glossary' | 'statutes' | 'precedents'>('statutes');
	let searchResults = $state<any[]>([]);
	let searchLoading = $state(false);
	let searchTiming = $state<Record<string, number>>({});
	let jurisdictionFilter = $state('');

	async function handleSearch() {
		const q = searchQuery.trim();
		if (!q || q.length < 2) return;
		searchLoading = true;
		searchResults = [];
		searchTiming = {};
		try {
			const endpoint = `/api/${searchTab}/search`;
			const body: Record<string, any> = { query: q, limit: 10 };
			if (searchTab === 'statutes' && jurisdictionFilter) body.jurisdiction = jurisdictionFilter;
			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(30_000)
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const json = await res.json();
			searchResults = json.results ?? [];
			searchTiming = json.timing ?? {};
		} catch (e) {
			console.error('Search failed:', e);
			searchResults = [];
		} finally {
			searchLoading = false;
		}
	}

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
				body: JSON.stringify({ email: loginEmail, password: loginPassword }),
				signal: AbortSignal.timeout(30_000)
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
				}),
				signal: AbortSignal.timeout(30_000)
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

	async function handleDemoLogin(email = 'demo@legal-ai.local', role = 'admin') {
		authError = '';
		authLoading = true;
		try {
			const res = await fetch('/api/auth/demo-login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, role }),
				signal: AbortSignal.timeout(30_000)
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

	function fillDemo(email: string, password = 'password123') {
		loginEmail = email;
		loginPassword = password;
		authError = '';
	}

	function fillDemoCredentials() {
		fillDemo('demo@legal-ai.local', 'password123');
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
 <IconNetworkGraph size={19} class="nav-icon" /> COMMAND CENTER
 </a>
 <a href="/" class="nav-item">
 <IconPrecedentCase size={19} class="nav-icon" /> ACTIVE CASES <span class="badge">{recentCases.length}</span>
 </a>
 <a href="/evidence" class="nav-item">
 <IconEvidenceFile size={19} class="nav-icon" /> EVIDENCE LIBRARY
 </a>
 <a href="/persons-of-interest" class="nav-item">
 <IconSubjectProfile size={19} class="nav-icon" /> PERSONS OF INTEREST
 </a>
 <a href="/analysis-center" class="nav-item">
 <IconTimeline size={19} class="nav-icon" /> ANALYSIS CENTER
 </a>
 <a href="/global-search" class="nav-item">
 <IconLawBook size={19} class="nav-icon" /> GLOBAL SEARCH
 </a>
 <a href="/citations" class="nav-item">
 <IconCitation size={19} class="nav-icon" /> CITATIONS
 </a>
 <a href="/dashboard" class="nav-item">
 <IconRegulation size={19} class="nav-icon" /> DASHBOARD
 </a>
 <a href="/admin/ai-dashboard" class="nav-item">
 <IconIntegrityShield size={19} class="nav-icon" /> AI DASHBOARD
 </a>
 <a href="/chat" class="nav-item">
 <IconAiAssistant size={19} class="nav-icon" /> AI ASSISTANT
 </a>
 <a href="/demos" class="nav-item">
 <IconWarningFlag size={19} class="nav-icon" /> DEMOS
 </a>
 <a href="/terminal" class="nav-item">
 <IconNetworkGraph size={19} class="nav-icon" /> TERMINAL
 </a>
 </nav>

 <div class="sidebar-footer">
 <a href="/system-configuration" class="nav-item">
 <IconIntegrityShield size={19} class="nav-icon" /> SYSTEM CONFIGURATION
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

  <!-- Featured Experimental UI -->
  <section class="featured-demo-banner" style="margin: 0 2rem 1.5rem; padding: 1.5rem; background: #1a3a5a; border: 3px solid #0f0f0f; color: #fdf3d4; display: flex; align-items: center; justify-content: space-between; gap: 1.5rem;">
    <div style="display: flex; align-items: center; gap: 1.25rem;">
      <div style="font-size: 2.5rem;">✨</div>
      <div>
        <h3 style="margin: 0; font-size: 1rem; font-weight: 900; letter-spacing: 1px;">NEW: PREMIUM BENTO DASHBOARD [PROTOTYPE]</h3>
        <p style="margin: 0; font-size: 0.75rem; opacity: 0.8;">Experience the future of the YoRHa intelligence interface with UnoCSS and glassmorphism.</p>
      </div>
    </div>
    <a href="/demos/bento-dashboard" class="view-all-btn" style="background: #0f0f0f; color: #fdf3d4;">LAUNCH PROTOTYPE →</a>
  </section>

 <!-- Legal Glossary / Laws Search -->
 <section class="legal-search-section">
	<div class="section-header">
		<h2>LEGAL CORPUS // SEARCH</h2>
		<div class="search-tabs">
			<button class="search-tab" class:active={searchTab === 'statutes'} onclick={() => { searchTab = 'statutes'; searchResults = []; }}>
				STATUTES
			</button>
			<button class="search-tab" class:active={searchTab === 'glossary'} onclick={() => { searchTab = 'glossary'; searchResults = []; }}>
				GLOSSARY
			</button>
			<button class="search-tab" class:active={searchTab === 'precedents'} onclick={() => { searchTab = 'precedents'; searchResults = []; }}>
				PRECEDENTS
			</button>
		</div>
	</div>

	<div class="search-controls">
		<form class="search-form" onsubmit={(e) => { e.preventDefault(); handleSearch(); }}>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder={searchTab === 'statutes' ? 'Search statutes, codes, sections (e.g. "18 USC 1001", "fraud")...' : searchTab === 'glossary' ? 'Search legal terms (e.g. "habeas corpus", "mens rea")...' : 'Search case law, precedents (e.g. "Miranda", "due process")...'}
				class="search-input"
			/>
			{#if searchTab === 'statutes'}
				<select bind:value={jurisdictionFilter} class="jurisdiction-select">
					<option value="">All Jurisdictions</option>
					<option value="federal">Federal</option>
					<option value="state">State</option>
					<option value="california">California</option>
					<option value="new_york">New York</option>
					<option value="texas">Texas</option>
					<option value="international">International</option>
				</select>
			{/if}
			<button type="submit" class="search-btn" disabled={searchLoading || searchQuery.trim().length < 2}>
				{searchLoading ? '...' : 'SEARCH'}
			</button>
		</form>
	</div>

	{#if searchLoading}
		<div class="search-loading">Searching {searchTab}...</div>
	{/if}

	{#if searchResults.length > 0}
		<div class="search-results">
			<div class="results-header">
				<span>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</span>
				{#if searchTiming.total_ms}
					<span class="timing">{Math.round(searchTiming.total_ms)}ms</span>
				{/if}
			</div>
			{#each searchResults as result}
				<div class="result-card">
					{#if searchTab === 'statutes'}
						<div class="result-title">{result.statuteTitle ?? result.title ?? 'Statute'}</div>
						{#if result.section}<div class="result-section">{result.section}</div>{/if}
						{#if result.jurisdiction}<span class="result-badge jurisdiction">{result.jurisdiction}</span>{/if}
						{#if result.category}<span class="result-badge category">{result.category}</span>{/if}
						{#if result.content}<div class="result-content">{result.content.slice(0, 300)}{result.content.length > 300 ? '...' : ''}</div>{/if}
						{#if result.similarity}<div class="result-score">Relevance: {(result.similarity * 100).toFixed(1)}%</div>{/if}
					{:else if searchTab === 'glossary'}
						<div class="result-title">{result.term ?? result.title ?? 'Term'}</div>
						{#if result.category}<span class="result-badge category">{result.category}</span>{/if}
						{#if result.jurisdiction}<span class="result-badge jurisdiction">{result.jurisdiction}</span>{/if}
						<div class="result-content">{result.definition ?? result.content ?? ''}</div>
						{#if result.relatedTerms?.length}
							<div class="result-related">Related: {result.relatedTerms.join(', ')}</div>
						{/if}
					{:else}
						<div class="result-title">{result.title ?? 'Precedent'}</div>
						{#if result.citation}<div class="result-section">{result.citation}</div>{/if}
						{#if result.court}<span class="result-badge jurisdiction">{result.court}</span>{/if}
						{#if result.summary}<div class="result-content">{result.summary.slice(0, 300)}{result.summary.length > 300 ? '...' : ''}</div>{/if}
						{#if result.similarity}<div class="result-score">Relevance: {(result.similarity * 100).toFixed(1)}%</div>{/if}
					{/if}
				</div>
			{/each}
		</div>
	{:else if !searchLoading && searchQuery.trim().length >= 2}
		<div class="search-empty">No results. Try a different query or tab.</div>
	{/if}
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
				<a href="/dashboard" class="view-all-btn">VIEW LOG →</a>
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
 <a href="/analysis-center" class="status-btn">
 <span class="icon">⏱️</span> TIMELINE ANALYSIS
 </a>
 <a href="/command-center" class="status-btn">
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
<dialog bind:this={authDialogRef} class="auth-dialog dossier-modal-light" onclick={(e) => { if (e.target === authDialogRef) closeAuthDialog(); }}>
	<div class="dialog-inner">
		<!-- Tactical celestial crosshair notches -->
		<div class="hud-notch-tl"></div>
		<div class="hud-notch-tr"></div>
		<div class="hud-notch-bl"></div>
		<div class="hud-notch-br"></div>
		<div class="dossier-star dossier-star-tl">✦</div>
		<div class="dossier-star dossier-star-tr">✦</div>
		<div class="dossier-star dossier-star-bl">✦</div>
		<div class="dossier-star dossier-star-br">✦</div>

		<div class="dialog-header">
			<div class="header-branding">
				<div class="header-icon">⚖</div>
				<div>
					<h2 class="dialog-title">DOSSIER LEX AI // {authTab === 'login' ? 'SIGN IN' : 'REGISTER'}</h2>
					<div class="dialog-subtitle">TACTICAL LEGAL INTELLIGENCE // OPERATOR ACCESS</div>
				</div>
			</div>
			<button class="dialog-close" onclick={closeAuthDialog} aria-label="Close dialog">✕</button>
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
			<div class="dialog-error">
				<span class="error-badge">ERROR</span>
				<span>{authError}</span>
			</div>
		{/if}

		{#if authTab === 'login'}
			<form class="dialog-form" onsubmit={(e) => { e.preventDefault(); handleLogin(); }}>
				<label class="dialog-label">
					OPERATOR EMAIL
					<input type="email" bind:value={loginEmail} required class="dialog-input" placeholder="admin@yorha.dev" />
				</label>
				<label class="dialog-label">
					PASSWORD
					<input type="password" bind:value={loginPassword} required class="dialog-input" placeholder="••••••••••••" />
				</label>
				<button type="submit" class="dialog-btn-primary dossier-btn-primary" disabled={authLoading}>
					{authLoading ? 'AUTHENTICATING...' : 'ACCESS DOSSIER →'}
				</button>
			</form>

			<div class="dialog-divider">
				<span>PRE-AUTHORIZED IDENTITIES</span>
			</div>

			<div class="demo-credentials">
				<div class="demo-row">
					<div class="demo-id-info">
						<span class="demo-badge badge-gold">ADMIN</span>
						<span class="demo-name">YoRHa 2B</span>
						<code>admin@yorha.dev</code>
					</div>
					<div class="demo-actions">
						<button type="button" class="demo-action-btn fill-btn" onclick={() => fillDemo('admin@yorha.dev')}>FILL</button>
						<button type="button" class="demo-action-btn enter-btn" onclick={() => handleDemoLogin('admin@yorha.dev', 'admin')} disabled={authLoading}>LOGIN</button>
					</div>
				</div>
				<div class="demo-row">
					<div class="demo-id-info">
						<span class="demo-badge badge-blue">PROSECUTOR</span>
						<span class="demo-name">User 1</span>
						<code>test@deeds-legal.ai</code>
					</div>
					<div class="demo-actions">
						<button type="button" class="demo-action-btn fill-btn" onclick={() => fillDemo('test@deeds-legal.ai')}>FILL</button>
						<button type="button" class="demo-action-btn enter-btn" onclick={() => handleDemoLogin('test@deeds-legal.ai', 'prosecutor')} disabled={authLoading}>LOGIN</button>
					</div>
				</div>
				<div class="demo-row">
					<div class="demo-id-info">
						<span class="demo-badge badge-green">DEMO</span>
						<span class="demo-name">Seeded User</span>
						<code>demo@legal-ai.local</code>
					</div>
					<div class="demo-actions">
						<button type="button" class="demo-action-btn fill-btn" onclick={() => fillDemo('demo@legal-ai.local')}>FILL</button>
						<button type="button" class="demo-action-btn enter-btn" onclick={() => handleDemoLogin('demo@legal-ai.local', 'admin')} disabled={authLoading}>LOGIN</button>
					</div>
				</div>
			</div>

			<div class="dialog-hint">
				Pre-authorized development keys authenticate against local session tokens and PostgreSQL 18.
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
					<input type="email" bind:value={regEmail} required class="dialog-input" placeholder="you@deeds-legal.ai" />
				</label>
				<label class="dialog-label">
					PASSWORD
					<input type="password" bind:value={regPassword} required minlength="8" class="dialog-input" placeholder="Min 8 characters" />
				</label>
				<button type="submit" class="dialog-btn-primary dossier-btn-primary" disabled={authLoading}>
					{authLoading ? 'CREATING ACCOUNT...' : 'REGISTER DOSSIER OPERATOR'}
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
  flex: 0 0 1.25rem;
  width: 1.25rem;
  height: 1.25rem;
  margin-right: 0.75rem;
  color: #d9bd79;
  filter: drop-shadow(0 0 0.35rem rgb(217 189 121 / 20%));
 }

 .nav-item:hover .nav-icon,
 .nav-item.active .nav-icon { color: #fdf3d4; }

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

 /* Legal Search Section */
 .legal-search-section {
	background: #c4b99a;
	border: 3px solid #0f0f0f;
	padding: 1.5rem;
	margin: 0 2rem;
 }

 .search-tabs {
	display: flex;
	gap: 0;
 }

 .search-tab {
	padding: 0.5rem 1rem;
	background: #1a160f;
	color: #8a7a5a;
	border: 2px solid #0f0f0f;
	font-weight: 700;
	font-size: 0.7rem;
	letter-spacing: 1px;
	cursor: pointer;
 }

 .search-tab.active {
	background: #0f0f0f;
	color: #fdf3d4;
 }

 .search-controls {
	margin-top: 1rem;
 }

 .search-form {
	display: flex;
	gap: 0.5rem;
 }

 .search-input {
	flex: 1;
	padding: 0.75rem 1rem;
	background: #f8f0d9;
	border: 3px solid #0f0f0f;
	font-family: inherit;
	font-size: 0.85rem;
	color: #0f0f0f;
 }

 .search-input:focus {
	outline: none;
	border-color: #2a2016;
	background: #fff;
 }

 .search-input::placeholder {
	color: #8a7a5a;
	font-size: 0.8rem;
 }

 .jurisdiction-select {
	padding: 0.75rem 0.5rem;
	background: #f8f0d9;
	border: 3px solid #0f0f0f;
	font-family: inherit;
	font-size: 0.8rem;
	color: #0f0f0f;
	min-width: 140px;
 }

 .search-btn {
	padding: 0.75rem 1.5rem;
	background: #2a2016;
	color: #f8f0d9;
	border: 3px solid #0f0f0f;
	font-weight: 900;
	font-size: 0.8rem;
	letter-spacing: 1px;
	cursor: pointer;
 }

 .search-btn:hover:not(:disabled) {
	background: #1a160f;
 }

 .search-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
 }

 .search-loading {
	padding: 1.5rem;
	text-align: center;
	font-size: 0.85rem;
	color: #5a4a3a;
	font-weight: 600;
 }

 .search-results {
	margin-top: 1rem;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
 }

 .results-header {
	display: flex;
	justify-content: space-between;
	font-size: 0.75rem;
	font-weight: 700;
	color: #5a4a3a;
	letter-spacing: 0.5px;
	text-transform: uppercase;
 }

 .timing {
	color: #8a7a5a;
	font-weight: 600;
 }

 .result-card {
	background: #f8f0d9;
	border: 3px solid #0f0f0f;
	padding: 1rem 1.25rem;
 }

 .result-title {
	font-weight: 900;
	font-size: 0.95rem;
	letter-spacing: 0.5px;
	margin-bottom: 0.375rem;
 }

 .result-section {
	font-size: 0.8rem;
	color: #5a4a3a;
	font-weight: 700;
	margin-bottom: 0.375rem;
 }

 .result-badge {
	display: inline-block;
	padding: 0.125rem 0.5rem;
	font-size: 0.65rem;
	font-weight: 700;
	letter-spacing: 0.5px;
	text-transform: uppercase;
	margin-right: 0.375rem;
	margin-bottom: 0.375rem;
 }

 .result-badge.jurisdiction {
	background: #2a2016;
	color: #f8f0d9;
 }

 .result-badge.category {
	background: #0f0f0f;
	color: #fdf3d4;
 }

 .result-content {
	font-size: 0.8rem;
	line-height: 1.5;
	color: #2a2016;
	margin-top: 0.5rem;
 }

 .result-score {
	font-size: 0.7rem;
	color: #8a7a5a;
	margin-top: 0.375rem;
	font-weight: 600;
 }

 .result-related {
	font-size: 0.75rem;
	color: #5a4a3a;
	margin-top: 0.5rem;
	font-style: italic;
 }

 .search-empty {
	padding: 1.5rem;
	text-align: center;
	font-size: 0.85rem;
	color: #8a7a5a;
	background: #f8f0d9;
	border: 2px solid #0f0f0f;
	margin-top: 1rem;
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

 /* ═══════════════════════════════════════════════════════════════════
	   DOSSIER LEX AI // LIGHT AUTH DIALOG
	   Royal Parchment, Arcana Filigree & Celestial HUD Accents
	   ═══════════════════════════════════════════════════════════════════ */
	.auth-dialog {
		border: none;
		padding: 0;
		background: transparent;
		max-width: 520px;
		width: 92vw;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		margin: 0;
		outline: none;
	}

	.auth-dialog::backdrop {
		background: rgba(18, 16, 14, 0.65);
		backdrop-filter: blur(8px) saturate(1.1);
		animation: dossierFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.dialog-inner {
		position: relative;
		background: linear-gradient(180deg, #FFFCF9 0%, #FAF6F0 50%, #FAF4EC 100%);
		color: #141312;
		border: 1px solid #D5C6AC;
		border-radius: 14px;
		box-shadow:
			0 0 0 1px rgba(201, 168, 106, 0.25),
			0 24px 60px -12px rgba(45, 35, 25, 0.35),
			0 0 35px rgba(201, 168, 106, 0.12);
		padding: 1.75rem 2rem;
		overflow: hidden;
		animation: dossierScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
	}

	/* Tactical corner notches in burnished attorney gold */
	.hud-notch-tl, .hud-notch-tr, .hud-notch-bl, .hud-notch-br {
		position: absolute;
		width: 12px;
		height: 12px;
		pointer-events: none;
		z-index: 10;
	}
	.hud-notch-tl { top: -1px; left: -1px; border-top: 2.5px solid #C59E2B; border-left: 2.5px solid #C59E2B; }
	.hud-notch-tr { top: -1px; right: -1px; border-top: 2.5px solid #C59E2B; border-right: 2.5px solid #C59E2B; }
	.hud-notch-bl { bottom: -1px; left: -1px; border-bottom: 2.5px solid #C59E2B; border-left: 2.5px solid #C59E2B; }
	.hud-notch-br { bottom: -1px; right: -1px; border-bottom: 2.5px solid #C59E2B; border-right: 2.5px solid #C59E2B; }

	.dossier-star {
		position: absolute;
		font-size: 8px;
		color: #B97F62;
		opacity: 0.45;
		line-height: 1;
		pointer-events: none;
		user-select: none;
		z-index: 2;
	}
	.dossier-star-tl { top: 8px; left: 8px; }
	.dossier-star-tr { top: 8px; right: 8px; }
	.dossier-star-bl { bottom: 8px; left: 8px; }
	.dossier-star-br { bottom: 8px; right: 8px; }

	/* Header */
	.dialog-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.25rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #E2D7C9;
	}

	.header-branding {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	.header-icon {
		width: 38px;
		height: 38px;
		border-radius: 10px;
		background: radial-gradient(circle at 35% 35%, #FFFDF8 0%, #ECDDBA 100%);
		border: 1px solid #CBB68D;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.15rem;
		color: #67140F;
		box-shadow: 0 1px 4px rgba(197, 158, 43, 0.2), inset 0 0 6px rgba(255, 255, 255, 0.7);
		flex-shrink: 0;
	}

	.dialog-title {
		margin: 0;
		font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #141312;
		line-height: 1.2;
	}

	.dialog-subtitle {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: #8C6A23;
		margin-top: 0.2rem;
		text-transform: uppercase;
	}

	.dialog-close {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: #EDE4D6;
		border: 1px solid #DBCCB8;
		color: #6B6150;
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		outline: none;
	}

	.dialog-close:hover {
		background: #E2D4C0;
		color: #67140F;
		border-color: #67140F;
		box-shadow: 0 1px 4px rgba(103, 20, 15, 0.15);
	}

	/* Tabs */
	.dialog-tabs {
		display: flex;
		gap: 4px;
		padding: 4px;
		background: #EFEBE5;
		border: 1px solid #D5C6AC;
		border-radius: 8px;
		margin-bottom: 1.25rem;
	}

	.dialog-tab {
		flex: 1;
		padding: 0.55rem 0.75rem;
		border-radius: 6px;
		border: 1px solid transparent;
		background: transparent;
		color: #6B6150;
		font-family: 'Inter', system-ui, sans-serif;
		font-weight: 600;
		font-size: 0.78rem;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.dialog-tab:hover:not(.active) {
		color: #141312;
		background: rgba(255, 255, 255, 0.5);
	}

	.dialog-inner .dialog-tab.active {
		background: #FAF6F0 !important;
		color: #67140F !important;
		font-weight: 700;
		border-color: #D5C6AC;
		box-shadow: 0 1px 4px rgba(60, 40, 20, 0.08);
	}

	/* Error */
	.dialog-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.65rem 0.85rem;
		border-radius: 6px;
		background: #FDF2F2;
		border: 1px solid #F87171;
		color: #991B1B;
		font-size: 0.8rem;
		margin-bottom: 1rem;
	}

	.error-badge {
		background: #DC2626;
		color: #FFFFFF !important;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		padding: 1px 5px;
		border-radius: 3px;
	}

	/* Form */
	.dialog-form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.dialog-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.dialog-label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: #483D36;
	}

	.dialog-input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.6rem 0.8rem;
		background: #FFFFFF;
		border: 1px solid #CDBFA9;
		border-radius: 6px;
		color: #141312;
		font-family: inherit;
		font-size: 0.85rem;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.dialog-input:focus {
		outline: none;
		border-color: #67140F;
		box-shadow: 0 0 0 2px rgba(103, 20, 15, 0.18);
	}

	.dialog-input::placeholder {
		color: #A39683;
	}

	.dialog-inner .dialog-btn-primary, .dialog-inner .dossier-btn-primary {
		padding: 0.75rem 1.25rem;
		background: linear-gradient(180deg, #67140F 0%, #52100C 100%) !important;
		color: #FFE59A !important;
		border: 1px solid #67140F !important;
		border-radius: 6px;
		font-family: 'Cinzel', 'Cormorant Garamond', Georgia, serif;
		font-weight: 700;
		font-size: 0.85rem;
		letter-spacing: 0.08em;
		cursor: pointer;
		box-shadow: 0 2px 6px rgba(103, 20, 15, 0.25);
		transition: all 0.15s ease;
		margin-top: 0.35rem;
	}

	.dialog-inner .dialog-btn-primary:hover:not(:disabled), .dialog-inner .dossier-btn-primary:hover:not(:disabled) {
		background: linear-gradient(180deg, #7E1B14 0%, #67140F 100%) !important;
		color: #FFFFFF;
		box-shadow: 0 3px 10px rgba(103, 20, 15, 0.35);
		transform: translateY(-1px);
	}

	.dialog-btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Divider */
	.dialog-divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 1.25rem 0 0.85rem;
	}

	.dialog-divider::before,
	.dialog-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: #D5C6AC;
	}

	.dialog-divider span {
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: #6B6150;
		text-transform: uppercase;
	}

	/* Demo Credentials */
	.demo-credentials {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin-bottom: 0.85rem;
	}

	.demo-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.45rem 0.65rem;
		background: #FAF4EC;
		border: 1px solid #E2D7C9;
		border-radius: 8px;
		transition: border-color 0.15s ease, background 0.15s ease;
	}

	.demo-row:hover {
		border-color: #C9A86A;
		background: #FFFDF8;
	}

	.demo-id-info {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex-wrap: wrap;
		font-size: 0.72rem;
	}

	.demo-badge {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		padding: 1px 5px;
		border-radius: 4px;
	}

	.badge-gold {
		background: rgba(201, 168, 106, 0.2);
		color: #8C6A23;
		border: 1px solid rgba(201, 168, 106, 0.45);
	}

	.badge-blue {
		background: rgba(37, 99, 235, 0.1);
		color: #1E40AF;
		border: 1px solid rgba(37, 99, 235, 0.3);
	}

	.badge-green {
		background: rgba(22, 101, 52, 0.1);
		color: #166534;
		border: 1px solid rgba(22, 101, 52, 0.3);
	}

	.demo-name {
		font-weight: 600;
		color: #141312;
	}

	.demo-row code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.68rem;
		color: #6B6150;
		background: rgba(0, 0, 0, 0.03);
		padding: 1px 4px;
		border-radius: 3px;
	}

	.demo-actions {
		display: flex;
		gap: 0.3rem;
		flex-shrink: 0;
	}

	.demo-action-btn {
		padding: 0.22rem 0.5rem;
		border-radius: 5px;
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.dialog-inner .fill-btn {
		background: #FAF6F0 !important;
		border: 1px solid #D5C6AC !important;
		color: #483D36 !important;
	}

	.fill-btn:hover {
		background: #FFFFFF;
		border-color: #67140F;
		color: #67140F;
		box-shadow: 0 1px 4px rgba(103, 20, 15, 0.12);
	}

	.dialog-inner .enter-btn {
		background: #5C493F !important;
		border: 1px solid #483D36 !important;
		color: #FAF4EC !important;
	}

	.dialog-inner .enter-btn:hover:not(:disabled) {
		background: #67140F !important;
		border-color: #67140F !important;
		color: #FFE59A !important;
		box-shadow: 0 1px 4px rgba(103, 20, 15, 0.2);
	}

	.enter-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.dialog-hint {
		text-align: center;
		font-size: 0.68rem;
		color: #6B6150;
		line-height: 1.4;
	}

	@keyframes dossierFadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes dossierScaleIn {
		from { opacity: 0; transform: scale(0.96); }
		to { opacity: 1; transform: scale(1); }
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

 /* Shared rounded, high-contrast surfaces used by the legal search controls. */
 .stat-card {
  background: #17130e;
  color: #fdf3d4;
  border-radius: 14px;
  box-shadow: 0 4px 12px rgb(15 15 15 / 14%);
 }

 .stat-label { color: #fdf3d4; }

 .legal-search-section,
 .cases-section,
 .activity-section {
  border-radius: 18px;
 }

 .search-tabs {
  gap: 0.5rem;
  flex-wrap: wrap;
 }

 .search-tab {
  border: 1px solid #0f0f0f;
  border-radius: 999px;
  padding: 0.55rem 1rem;
  color: #fdf3d4;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
 }

 .search-tab:hover { transform: translateY(-1px); }

 .search-tab.active {
  background: #0f0f0f;
  color: #fdf3d4;
  box-shadow: inset 0 -2px #e7bd61;
 }

 .search-input,
 .jurisdiction-select {
  border-radius: 12px;
 }

 .search-btn,
 .view-all-btn,
 .header-btn,
 .case-action-btn {
  border-radius: 12px;
 }

 .result-card,
 .search-empty,
 .case-card,
 .activity-item {
  border-radius: 14px;
  box-shadow: 0 3px 10px rgb(15 15 15 / 8%);
 }

 .featured-demo-banner { border-radius: 18px; }

 .search-tab:focus-visible,
 .search-input:focus-visible,
 .jurisdiction-select:focus-visible,
 .search-btn:focus-visible,
 .view-all-btn:focus-visible {
  outline: 3px solid #d8a83e;
  outline-offset: 3px;
 }
</style>




