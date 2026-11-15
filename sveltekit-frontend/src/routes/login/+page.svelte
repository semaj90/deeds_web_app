<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { authMachine } from '$lib/machines/auth-machine.js';
	import { createActor } from 'xstate';
	import { superForm } from 'sveltekit-superforms/client';
	import { zod4Client as zod } from 'sveltekit-superforms/adapters';
	import { loginSchema } from './schema.js';

	interface DemoAccount {
		id: string;
		label: string;
		email: string;
		password: string;
		role: string;
		badge: string;
		badgeClass: string;
	}

	const demoAccounts: DemoAccount[] = [
		{
			id: 'admin',
			label: 'Admin (YoRHa 2B)',
			email: 'admin@yorha.dev',
			password: 'password123',
			role: 'admin',
			badge: 'DEV BYPASS',
			badgeClass: 'badge-gold'
		},
		{
			id: 'prosecutor',
			label: 'Prosecutor (User 1)',
			email: 'test@deeds-legal.ai',
			password: 'password123',
			role: 'prosecutor',
			badge: 'CANONICAL OWNER',
			badgeClass: 'badge-blue'
		},
		{
			id: 'demo',
			label: 'Demo Account',
			email: 'demo@legal-ai.local',
			password: 'password123',
			role: 'admin',
			badge: 'SEEDED',
			badgeClass: 'badge-green'
		}
	];

	function selectDemo(acc: DemoAccount, autoSubmit: boolean = false) {
		email = acc.email;
		password = acc.password;
		$superFormData.username = acc.email;
		$superFormData.password = acc.password;
		if (autoSubmit && !isLoading) {
			actor.send({ type: 'START_LOGIN', data: { email: acc.email, password: acc.password } });
		}
	}

	let { data } = $props();

	function getInitialForm() {
		return data.form;
	}

	const { form: superFormData, errors, enhance, message, delayed } = superForm(getInitialForm(), {
		validators: zod(loginSchema),
		onUpdated({ form }) {
			if (form.valid) {
				actor.send({ type: 'AUTH_SUCCESS', user: (form as any).data.user });
			} else {
				actor.send({ type: 'AUTH_FAILURE', error: form.message || 'Invalid credentials' });
			}
		},
		onError({ result }) {
			actor.send({ type: 'AUTH_FAILURE', error: (result as any).error?.message || 'Server error' });
		}
	});

	let email = $state('');
	let password = $state('');

	$effect(() => {
		$superFormData.username = email;
		$superFormData.password = password;
	});

	// XState v5 auth actor — manages login lifecycle, attempt tracking, lockout
	const actor = createActor(authMachine);
	let snapshot = $state(actor.getSnapshot());

	$effect(() => {
		actor.start();
		const sub = actor.subscribe((s) => {
			snapshot = s;
		});
		return () => {
			sub.unsubscribe();
			actor.stop();
		};
	});

	// Derived state from machine
	let isLoading = $derived(snapshot.matches('authenticating'));
	let isLocked = $derived(snapshot.matches('locked'));
	let isAuthenticated = $derived(snapshot.matches('authenticated'));
	let errorMessage = $derived(snapshot.context.error);
	let loginAttempts = $derived(snapshot.context.loginAttempts);
	let maxAttempts = $derived(snapshot.context.maxLoginAttempts);
	let attemptsRemaining = $derived(maxAttempts - loginAttempts);

	// Redirect on successful auth
	$effect(() => {
		if (isAuthenticated) {
			goto('/');
		}
	});

	// Auto-fill or autologin demo credentials from query params
	$effect(() => {
		const param = $page.url.searchParams.get('demo') || $page.url.searchParams.get('autologin') || $page.url.searchParams.get('autofill');
		if (param && !email && !isLoading && !isAuthenticated) {
			const target = demoAccounts.find((a) => a.id === param || a.role === param) ?? demoAccounts[0];
			const shouldAutoSubmit = $page.url.searchParams.get('autologin') !== null || param === 'true' || param === 'admin';
			setTimeout(() => {
				selectDemo(target, shouldAutoSubmit);
			}, 100);
		}
	});

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (!email.trim() || !password) return;
		actor.send({ type: 'START_LOGIN', data: { email: email.trim(), password } });
	}

	function handleUnlock() {
		actor.send({ type: 'UNLOCK_ACCOUNT' });
	}
</script>

<div class="login-container keep-dark-shell" data-theme="dark">
	<div class="login-card-box">
		<!-- Decorative corner brackets -->
		<div class="bracket bracket-tl"></div>
		<div class="bracket bracket-tr"></div>
		<div class="bracket bracket-bl"></div>
		<div class="bracket bracket-br"></div>

		<div class="login-header">
			<div class="telemetry-bar">
				<span class="telemetry-glyph">❖</span>
				<span class="telemetry-tag">YORHA // COMMAND TERMINAL 8/13.10</span>
				<span class="telemetry-glyph">❖</span>
			</div>
			<h1 class="yorha-title">YoRHa Legal AI</h1>
			<p class="header-sub">LEX ET IUSTITIA · SECURE JUDICIAL INTAKE</p>
			<div class="header-divider"></div>
		</div>

		{#if errorMessage}
			<div class="error-banner" role="alert">
				<span class="error-glyph">⚠</span>
				<div class="error-text">
					<strong>Authentication Rejected</strong>
					<p>{errorMessage}</p>
					{#if attemptsRemaining > 0 && attemptsRemaining < maxAttempts}
						<span class="attempts-warning">({attemptsRemaining} attempts remaining)</span>
					{/if}
				</div>
			</div>
		{/if}

		{#if isLocked}
			<div class="lockout-banner" role="alert">
				<p class="lockout-title">🔒 Terminal Locked (Security Protocol)</p>
				<p>Too many failed credentials. Terminal resets in 15 minutes.</p>
				<button type="button" class="unlock-btn" onclick={handleUnlock}>
					Override Security Lock
				</button>
			</div>
		{:else}
			<form onsubmit={handleSubmit} class="login-form">
				<div class="form-group">
					<label for="email">
						<span class="label-dot"></span>
						IDENTIFIER (EMAIL OR USERNAME)
					</label>
					<input
						id="email"
						type="text"
						bind:value={email}
						placeholder="admin@yorha.dev"
						required
						disabled={isLoading}
						autocomplete="username"
						class="yorha-input"
					/>
					{#if $errors.username}
						<span class="field-error">{$errors.username}</span>
					{/if}
				</div>

				<div class="form-group">
					<label for="password">
						<span class="label-dot"></span>
						SECURITY CIPHER (PASSWORD)
					</label>
					<input
						id="password"
						type="password"
						bind:value={password}
						placeholder="••••••••••••"
						required
						disabled={isLoading}
						autocomplete="current-password"
						class="yorha-input"
					/>
					{#if $errors.password}
						<span class="field-error">{$errors.password}</span>
					{/if}
				</div>

				<button type="submit" class="submit-btn" disabled={isLoading || !email.trim() || !password}>
					{#if isLoading}
						<span class="spinner"></span>
						AUTHENTICATING...
					{:else}
						SIGN IN TO TERMINAL →
					{/if}
				</button>
			</form>
		{/if}

		<div class="demo-identities-section">
			<div class="demo-section-header">
				<div class="demo-title-group">
					<span class="demo-icon">⚙</span>
					<span class="demo-title">Development & Demo Identities</span>
				</div>
				<span class="demo-subtitle">1-Click Fast Auth</span>
			</div>

			<div class="demo-accounts-grid">
				{#each demoAccounts as acc}
					<div class="demo-card-item">
						<div class="demo-card-top">
							<span class="demo-card-label">{acc.label}</span>
							<span class="demo-badge {acc.badgeClass}">{acc.badge}</span>
						</div>
						<div class="demo-card-creds">
							<code>{acc.email}</code>
							<span class="demo-sep">/</span>
							<code>{acc.password}</code>
						</div>
						<div class="demo-actions">
							<button
								type="button"
								class="demo-btn-sm demo-btn-fill"
								onclick={() => selectDemo(acc, false)}
								title="Fill fields without submitting"
							>
								Autofill
							</button>
							<button
								type="button"
								class="demo-btn-sm demo-btn-signin"
								onclick={() => selectDemo(acc, true)}
								disabled={isLoading}
								title="Fill and submit login"
							>
								{#if isLoading && email === acc.email}
									<span class="spinner-sm"></span> Signing In...
								{:else}
									⚡ Sign In
								{/if}
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="login-footer">
			<p class="register-link">
				Unregistered entity? <a href="/register">Request Credentials</a>
			</p>
			<span class="footer-telemetry">POSTGRESQL 18 · LUCIA V3 · YORHA SECURE OS</span>
		</div>

		<noscript>
			<form method="POST" action="?/login" class="noscript-form">
				<input name="username" type="text" required placeholder="Email or username" />
				<input name="password" type="password" required placeholder="Password" />
				<button type="submit">Sign in (Standard HTML)</button>
			</form>
		</noscript>
	</div>
</div>

<style>
	.login-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2.5rem 1rem;
		background:
			radial-gradient(ellipse at 50% 12%, rgba(196, 168, 130, 0.16), transparent 50%),
			radial-gradient(ellipse at 85% 85%, rgba(114, 184, 150, 0.08), transparent 45%),
			radial-gradient(ellipse at 15% 80%, rgba(112, 165, 216, 0.08), transparent 45%),
			linear-gradient(135deg, #090b10 0%, #10131b 50%, #0c0e14 100%) !important;
		color: #e2d9cd !important;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	}

	.login-card-box {
		position: relative;
		width: 100%;
		max-width: 480px;
		padding: 2.5rem 2.25rem;
		background: rgba(18, 21, 30, 0.95) !important;
		border: 1px solid rgba(196, 168, 130, 0.3) !important;
		border-radius: 8px;
		box-shadow:
			0 16px 48px rgba(0, 0, 0, 0.75),
			0 0 0 1px rgba(255, 255, 255, 0.05),
			inset 0 1px 0 rgba(196, 168, 130, 0.25);
		backdrop-filter: blur(16px);
		box-sizing: border-box;
	}

	/* Corner technical brackets */
	.bracket {
		position: absolute;
		width: 12px;
		height: 12px;
		pointer-events: none;
	}
	.bracket-tl {
		top: -1px;
		left: -1px;
		border-top: 2px solid #c4a882;
		border-left: 2px solid #c4a882;
	}
	.bracket-tr {
		top: -1px;
		right: -1px;
		border-top: 2px solid #c4a882;
		border-right: 2px solid #c4a882;
	}
	.bracket-bl {
		bottom: -1px;
		left: -1px;
		border-bottom: 2px solid #c4a882;
		border-left: 2px solid #c4a882;
	}
	.bracket-br {
		bottom: -1px;
		right: -1px;
		border-bottom: 2px solid #c4a882;
		border-right: 2px solid #c4a882;
	}

	.login-header {
		text-align: center;
		margin-bottom: 1.75rem;
	}

	.telemetry-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-family: 'Consolas', 'Courier New', monospace;
		font-size: 0.6875rem;
		letter-spacing: 0.12em;
		color: #c4a882;
		opacity: 0.9;
	}

	.telemetry-glyph {
		font-size: 0.625rem;
		color: #ae8745;
	}

	.yorha-title {
		font-family: 'Cinzel', 'Playfair Display', 'Georgia', serif;
		font-size: 2rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: #f3dfbf !important;
		margin: 0;
		text-shadow: 0 2px 12px rgba(196, 168, 130, 0.25);
	}

	.header-sub {
		margin: 0.375rem 0 0;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		color: #a39580 !important;
		text-transform: uppercase;
	}

	.header-divider {
		width: 56px;
		height: 2px;
		background: linear-gradient(90deg, transparent, #c4a882, transparent);
		margin: 0.875rem auto 0;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 1.125rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
	}

	.form-group label {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.375rem;
		font-family: 'Consolas', 'Courier New', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		color: #c4a882 !important;
		text-transform: uppercase;
	}

	.label-dot {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: #c4a882;
	}

	.yorha-input {
		width: 100%;
		padding: 0.75rem 0.875rem;
		font-size: 0.875rem;
		color: #f3dfbf !important;
		background: #141722 !important;
		border: 1px solid rgba(196, 168, 130, 0.35) !important;
		border-radius: 5px;
		outline: none;
		transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
		box-sizing: border-box;
	}

	.yorha-input:focus {
		border-color: #c4a882 !important;
		background: #181c2b !important;
		box-shadow: 0 0 0 3px rgba(196, 168, 130, 0.2);
	}

	.yorha-input:-webkit-autofill,
	.yorha-input:-webkit-autofill:hover, 
	.yorha-input:-webkit-autofill:focus {
		-webkit-box-shadow: 0 0 0 30px #141722 inset !important;
		-webkit-text-fill-color: #f3dfbf !important;
		caret-color: #f3dfbf;
	}

	.yorha-input::placeholder {
		color: rgba(196, 168, 130, 0.35);
	}

	.field-error {
		display: block;
		margin-top: 0.375rem;
		font-size: 0.75rem;
		color: #e06c75;
	}

	.submit-btn {
		margin-top: 0.375rem;
		width: 100%;
		padding: 0.8125rem;
		font-family: 'Consolas', 'Courier New', monospace;
		font-size: 0.8125rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #12151d !important;
		background: linear-gradient(135deg, #c4a882 0%, #b39268 100%) !important;
		border: 1px solid #d4be9c !important;
		border-radius: 5px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		transition: all 0.2s ease;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
	}

	.submit-btn:hover:not(:disabled) {
		background: linear-gradient(135deg, #d4be9c 0%, #c4a882 100%) !important;
		box-shadow: 0 0 16px rgba(196, 168, 130, 0.45);
		transform: translateY(-1px);
	}

	.submit-btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		background: #33312c !important;
		border-color: #4a453c !important;
		color: #7d7568 !important;
		box-shadow: none;
	}

	.error-banner {
		padding: 0.75rem 1rem;
		display: flex;
		gap: 0.625rem;
		background: rgba(224, 108, 117, 0.12);
		border: 1px solid rgba(224, 108, 117, 0.35);
		border-radius: 6px;
		margin-bottom: 1.25rem;
	}

	.error-glyph {
		font-size: 1rem;
		color: #e06c75;
	}

	.error-text strong {
		display: block;
		font-size: 0.8125rem;
		color: #e06c75;
		margin-bottom: 0.125rem;
	}

	.error-text p {
		margin: 0;
		font-size: 0.75rem;
		color: #e2d9cd;
	}

	.attempts-warning {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.6875rem;
		color: rgba(224, 108, 117, 0.8);
	}

	.lockout-banner {
		padding: 1.25rem;
		text-align: center;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.3);
		border-radius: 6px;
	}

	.lockout-title {
		font-weight: 700;
		color: #fbbf24;
		margin-bottom: 0.25rem;
	}

	.unlock-btn {
		margin-top: 0.75rem;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #12151d;
		background: #fbbf24;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	/* Demo & Development Accounts Section */
	.demo-identities-section {
		margin-top: 1.75rem;
		padding-top: 1.25rem;
		border-top: 1px solid rgba(196, 168, 130, 0.25);
		background: transparent !important;
	}

	.demo-section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.875rem;
	}

	.demo-title-group {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.demo-icon {
		font-size: 0.75rem;
		color: #c4a882;
	}

	.demo-title {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #c4a882 !important;
		margin: 0;
	}

	.demo-subtitle {
		font-size: 0.6875rem;
		font-family: 'Consolas', 'Courier New', monospace;
		color: rgba(196, 168, 130, 0.75);
	}

	.demo-accounts-grid {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.demo-card-item {
		padding: 0.75rem 0.875rem;
		border-radius: 6px;
		background: rgba(12, 14, 20, 0.85) !important;
		border: 1px solid rgba(196, 168, 130, 0.22) !important;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		transition: border-color 0.15s, background-color 0.15s, transform 0.15s;
		box-sizing: border-box;
	}

	.demo-card-item:hover {
		border-color: rgba(196, 168, 130, 0.45) !important;
		background: rgba(16, 19, 28, 0.95) !important;
		transform: translateY(-1px);
	}

	.demo-card-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.demo-card-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: #f3dfbf;
	}

	.demo-badge {
		font-family: 'Consolas', 'Courier New', monospace;
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
	}

	.badge-gold {
		background: rgba(196, 168, 130, 0.18);
		color: #c4a882;
		border: 1px solid rgba(196, 168, 130, 0.4);
	}

	.badge-blue {
		background: rgba(112, 165, 216, 0.18);
		color: #8bbbe8;
		border: 1px solid rgba(112, 165, 216, 0.4);
	}

	.badge-green {
		background: rgba(114, 184, 150, 0.18);
		color: #8ed6af;
		border: 1px solid rgba(114, 184, 150, 0.4);
	}

	.demo-card-creds {
		font-size: 0.75rem;
		display: flex;
		align-items: center;
		gap: 0.375rem;
		color: rgba(226, 217, 205, 0.75);
	}

	.demo-card-creds code {
		font-family: 'Consolas', 'Courier New', monospace;
		padding: 0.0625rem 0.3125rem;
		border-radius: 3px;
		background: rgba(0, 0, 0, 0.6) !important;
		color: #f3dfbf !important;
		border: 1px solid rgba(196, 168, 130, 0.2) !important;
	}

	.demo-sep {
		color: rgba(196, 168, 130, 0.4);
	}

	.demo-actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.375rem;
	}

	.demo-btn-sm {
		flex: 1;
		padding: 0.4375rem 0.625rem;
		font-family: 'Consolas', 'Courier New', monospace;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		transition: all 0.15s ease;
		box-sizing: border-box;
	}

	.demo-btn-fill {
		color: #c4a882 !important;
		background: transparent !important;
		border: 1px solid rgba(196, 168, 130, 0.35) !important;
	}

	.demo-btn-fill:hover {
		background: rgba(196, 168, 130, 0.16) !important;
		border-color: #c4a882 !important;
	}

	.demo-btn-signin {
		color: #12151d !important;
		background: #c4a882 !important;
		border: 1px solid #c4a882 !important;
	}

	.demo-btn-signin:hover:not(:disabled) {
		background: #f3dfbf !important;
		border-color: #f3dfbf !important;
		box-shadow: 0 0 10px rgba(196, 168, 130, 0.45);
	}

	.demo-btn-signin:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.login-footer {
		margin-top: 1.75rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		text-align: center;
	}

	.register-link {
		margin: 0;
		font-size: 0.75rem;
		color: rgba(226, 217, 205, 0.6) !important;
	}

	.register-link a {
		color: #c4a882;
		text-decoration: none;
		font-weight: 600;
	}

	.register-link a:hover {
		text-decoration: underline;
		color: #f3dfbf;
	}

	.footer-telemetry {
		font-family: 'Consolas', 'Courier New', monospace;
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		color: rgba(196, 168, 130, 0.4);
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(18, 21, 29, 0.3);
		border-top-color: #12151d;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.spinner-sm {
		width: 10px;
		height: 10px;
		border: 2px solid rgba(18, 21, 29, 0.3);
		border-top-color: #12151d;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.noscript-form {
		margin-top: 1rem;
		padding: 1rem;
		border: 1px dashed rgba(255, 255, 255, 0.2);
	}
</style>
