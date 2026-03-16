<script lang="ts">
	import { goto } from '$app/navigation';
	import { authMachine } from '$lib/machines/auth-machine.js';
	import { createActor } from 'xstate';

	let email = $state('');
	let password = $state('');

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

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (!email.trim() || !password) return;
		actor.send({ type: 'START_LOGIN', data: { email: email.trim(), password } });
	}

	function handleUnlock() {
		actor.send({ type: 'UNLOCK_ACCOUNT' });
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
			<form onsubmit={handleSubmit}>
				<div class="form-group">
					<label for="email">Email</label>
					<input
						id="email"
						name="email"
						type="text"
						required
						bind:value={email}
						placeholder="Email or username"
						disabled={isLoading}
						autocomplete="email"
					/>
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

	.register-link a {
		color: #c4a882;
		text-decoration: none;
	}

	.register-link a:hover {
		text-decoration: underline;
	}
</style>
