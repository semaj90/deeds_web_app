<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { authMachine } from '$lib/machines/auth-machine.js';
	import { createActor } from 'xstate';
	import { superForm } from 'sveltekit-superforms';
	import { zod } from 'sveltekit-superforms/adapters';
	import { loginSchema } from './schema.js';

	const demoCredentials = {
		email: 'demo@legal-ai.local',
		password: 'password123'
	} as const;

	let { data } = $props();
	
	const { form: superFormData, errors, enhance, message, delayed } = superForm(data.form, {
		validators: zod(loginSchema),
		onUpdated({ form }) {
			if (form.valid) {
				// Machine will handle redirection via $effect below
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

	// Sync local state to superForm for machine compatibility if needed, 
	// though superForm can bind directly to inputs.
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

	// Auto-fill demo credentials from ?demo=true query param
	$effect(() => {
		const isDemo = $page.url.searchParams.get('demo') === 'true';
		if (isDemo && !email && !isLoading && !isAuthenticated) {
			email = demoCredentials.email;
			password = demoCredentials.password;
			// Small delay to let fields render before submitting
			setTimeout(() => {
				actor.send({ type: 'START_LOGIN', data: { email: demoCredentials.email, password: demoCredentials.password } });
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

	function handleDemoLogin() {
		if (isLoading) return;
		email = demoCredentials.email;
		password = demoCredentials.password;
		actor.send({ type: 'START_LOGIN', data: { email: demoCredentials.email, password: demoCredentials.password } });
	}
</script>

<div class="login-container">
	<div class="login-card">
		<div class="login-header">
			<h1>YoRHa Legal AI</h1>
			<p>Sign in to your account</p>
		</div>

		{#if errorMessage}
			<div class="error-banner" role="alert">
				{errorMessage}
				{#if attemptsRemaining > 0 && attemptsRemaining < maxAttempts}
					<span class="attempts-warning">({attemptsRemaining} attempts remaining)</span>
				{/if}
			</div>
		{/if}

		{#if isLocked}
			<div class="lockout-banner" role="alert">
				<p>Account locked due to too many failed attempts.</p>
				<p>Try again in 15 minutes or</p>
				<button type="button" class="unlock-btn" onclick={handleUnlock}>
					Unlock Account
				</button>
			</div>
		{:else}
			<form method="POST" action="?/login" use:enhance>
				<div class="form-group">
					<label for="email">Email</label>
					<input
						id="username"
						name="username"
						type="text"
						required
						bind:value={email}
						placeholder="Email or username"
						disabled={isLoading}
						autocomplete="username"
					/>
					{#if $errors.username}
						<span class="field-error">{$errors.username}</span>
					{/if}
				</div>
				<div class="form-group">
					<label for="password">Password</label>
					<input
						id="password"
						name="password"
						type="password"
						required
						bind:value={password}
						placeholder="Password"
						disabled={isLoading}
						autocomplete="current-password"
					/>
					{#if $errors.password}
						<span class="field-error">{$errors.password}</span>
					{/if}
				</div>

				<button type="submit" class="submit-btn" disabled={isLoading || !email.trim() || !password}>
					{#if isLoading}
						<span class="spinner"></span>
						Signing in...
					{:else}
						Sign in
					{/if}
				</button>
			</form>
		{/if}

		<div class="demo-panel">
			<p class="demo-title">Demo Account</p>
			<p class="demo-copy">
				<code>{demoCredentials.email}</code> / <code>{demoCredentials.password}</code>
			</p>

			<button type="button" class="demo-btn" onclick={handleDemoLogin} disabled={isLoading}>
				{#if isLoading}
					<span class="spinner"></span>
					Signing in...
				{:else}
					Demo Login
				{/if}
			</button>
		</div>

		<p class="register-link">
			Don't have an account?
			<a href="/register">Create one</a>
		</p>

		<noscript>
			<form method="POST" action="?/login">
				<input name="username" type="text" required placeholder="Email or username" />
				<input name="password" type="password" required placeholder="Password" />
				<button type="submit">Sign in (no JS)</button>
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
		background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
		color: white;
	}

	.login-card {
		width: 100%;
		max-width: 420px;
		padding: 2.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		backdrop-filter: blur(10px);
	}

	.login-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.login-header h1 {
		font-size: 1.75rem;
		font-weight: 700;
		color: #c4a882;
	}

	.login-header p {
		margin-top: 0.5rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.field-error {
		display: block;
		margin-top: 0.375rem;
		font-size: 0.75rem;
		color: #fca5a5;
	}

	.error-banner {
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		color: #fca5a5;
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 8px;
		margin-bottom: 1.5rem;
	}

	.attempts-warning {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.75rem;
		color: rgba(252, 165, 165, 0.7);
	}

	.lockout-banner {
		padding: 1.25rem;
		text-align: center;
		color: #fbbf24;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.3);
		border-radius: 8px;
	}

	.lockout-banner p {
		margin: 0.25rem 0;
	}

	.unlock-btn {
		margin-top: 0.75rem;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		color: white;
		background: rgba(245, 158, 11, 0.3);
		border: 1px solid rgba(245, 158, 11, 0.5);
		border-radius: 6px;
		cursor: pointer;
	}

	.unlock-btn:hover {
		background: rgba(245, 158, 11, 0.5);
	}

	.form-group {
		margin-bottom: 1.25rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.375rem;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.form-group input {
		width: 100%;
		padding: 0.625rem 0.75rem;
		font-size: 0.9375rem;
		color: white;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		outline: none;
		transition: border-color 0.2s;
		box-sizing: border-box;
	}

	.form-group input:focus {
		border-color: #c4a882;
	}

	.form-group input:disabled {
		opacity: 0.5;
	}

	.submit-btn {
		width: 100%;
		padding: 0.75rem;
		font-size: 0.9375rem;
		font-weight: 600;
		color: white;
		background: #c4a882;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		transition: background 0.2s;
	}

	.submit-btn:hover:not(:disabled) {
		background: #b89a74;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.register-link {
		text-align: center;
		margin-top: 1.5rem;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.demo-panel {
		margin-top: 1.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid rgba(255, 255, 255, 0.12);
	}

	.demo-title {
		margin: 0 0 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #c4a882;
	}

	.demo-copy {
		margin: 0 0 0.875rem;
		font-size: 0.8125rem;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.65);
	}

	.demo-copy code {
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.25);
		color: #f3dfbf;
	}

	.demo-btn {
		width: 100%;
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #f3dfbf;
		background: rgba(196, 168, 130, 0.12);
		border: 1px solid rgba(196, 168, 130, 0.35);
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		transition: background 0.2s, border-color 0.2s;
	}

	.demo-btn:hover:not(:disabled) {
		background: rgba(196, 168, 130, 0.2);
		border-color: rgba(196, 168, 130, 0.5);
	}

	.demo-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.register-link a {
		color: #c4a882;
		text-decoration: none;
	}

	.register-link a:hover {
		text-decoration: underline;
	}
</style>
