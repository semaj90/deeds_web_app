<script lang="ts">
	import { goto } from '$app/navigation';
	import { authMachine } from '$lib/machines/auth-machine.js';
	import { createActor } from 'xstate';
	import { fade, fly } from 'svelte/transition';
	import Icon from '$lib/components/ui/Icon.svelte';

	let firstName = $state('');
	let lastName = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let showPassword = $state(false);
	let step = $state<'form' | 'success'>('form');

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

	let isLoading = $derived(snapshot.matches('registering'));
	let isAuthenticated = $derived(snapshot.matches('authenticated'));
	let errorMessage = $derived(snapshot.context.error);

	// Redirect on successful registration
	$effect(() => {
		if (isAuthenticated) {
			step = 'success';
			// Brief pause to show success state, then redirect to dashboard
			// Authenticated app routes decide whether onboarding should appear
			setTimeout(() => goto('/dashboard'), 1500);
		}
	});

	// Validation
	let passwordsMatch = $derived(password === confirmPassword);
	let passwordStrength = $derived.by(() => {
		if (!password) return { score: 0, label: '', color: '' };
		let score = 0;
		if (password.length >= 8) score++;
		if (password.length >= 12) score++;
		if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
		if (/\d/.test(password)) score++;
		if (/[^A-Za-z0-9]/.test(password)) score++;

		if (score <= 1) return { score, label: 'Weak', color: '#ef4444' };
		if (score <= 2) return { score, label: 'Fair', color: '#f59e0b' };
		if (score <= 3) return { score, label: 'Good', color: '#63b3ed' };
		return { score, label: 'Strong', color: '#48bb78' };
	});

	let canSubmit = $derived(
		firstName.trim() &&
		lastName.trim() &&
		email.trim() &&
		password.length >= 8 &&
		passwordsMatch &&
		!isLoading
	);

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (!canSubmit) return;
		actor.send({
			type: 'START_REGISTRATION',
			data: {
				email: email.trim(),
				password,
				firstName: firstName.trim(),
				lastName: lastName.trim()
			}
		});
	}
</script>

<div class="register-container">
	{#if step === 'success'}
		<div class="success-card" in:fly={{ y: 20, duration: 400 }}>
			<div class="success-icon">
				<Icon name="check-circle" size={48} />
			</div>
			<h1>Account Created!</h1>
			<p>Welcome aboard. Redirecting to your dashboard...</p>
			<div class="redirect-bar">
				<div class="redirect-fill"></div>
			</div>
		</div>
	{:else}
		<div class="register-card" in:fade={{ duration: 300 }}>
			<div class="register-header">
				<h1>YoRHa Legal AI</h1>
				<p>Create your account</p>
			</div>

			{#if errorMessage}
				<div class="error-banner" role="alert" in:fly={{ y: -10, duration: 200 }}>
					{errorMessage}
				</div>
			{/if}

			<form onsubmit={handleSubmit}>
				<div class="name-row">
					<div class="form-group">
						<label for="firstName">First Name</label>
						<input
							id="firstName"
							name="firstName"
							type="text"
							required
							bind:value={firstName}
							placeholder="First name"
							disabled={isLoading}
							autocomplete="given-name"
						/>
					</div>
					<div class="form-group">
						<label for="lastName">Last Name</label>
						<input
							id="lastName"
							name="lastName"
							type="text"
							required
							bind:value={lastName}
							placeholder="Last name"
							disabled={isLoading}
							autocomplete="family-name"
						/>
					</div>
				</div>

				<div class="form-group">
					<label for="email">Email</label>
					<input
						id="email"
						name="email"
						type="email"
						required
						bind:value={email}
						placeholder="you@example.com"
						disabled={isLoading}
						autocomplete="email"
					/>
				</div>

				<div class="form-group">
					<label for="password">Password</label>
					<div class="password-wrapper">
						<input
							id="password"
							name="password"
							type={showPassword ? 'text' : 'password'}
							required
							minlength={8}
							bind:value={password}
							placeholder="At least 8 characters"
							disabled={isLoading}
							autocomplete="new-password"
						/>
						<button
							type="button"
							class="password-toggle"
							onclick={() => showPassword = !showPassword}
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							<Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
						</button>
					</div>
					{#if password}
						<div class="password-strength" in:fade={{ duration: 150 }}>
							<div class="strength-bar">
								<div
									class="strength-fill"
									style="width: {(passwordStrength.score / 5) * 100}%; background: {passwordStrength.color};"
								></div>
							</div>
							<span class="strength-label" style="color: {passwordStrength.color};">
								{passwordStrength.label}
							</span>
						</div>
					{/if}
				</div>

				<div class="form-group">
					<label for="confirmPassword">Confirm Password</label>
					<input
						id="confirmPassword"
						name="confirmPassword"
						type={showPassword ? 'text' : 'password'}
						required
						bind:value={confirmPassword}
						placeholder="Confirm your password"
						disabled={isLoading}
						autocomplete="new-password"
					/>
					{#if confirmPassword && !passwordsMatch}
						<span class="field-error" in:fade={{ duration: 150 }}>Passwords don't match</span>
					{/if}
				</div>

				<button type="submit" class="submit-btn" disabled={!canSubmit}>
					{#if isLoading}
						<span class="spinner"></span>
						Creating account...
					{:else}
						Create Account
					{/if}
				</button>
			</form>

			<p class="login-link">
				Already have an account?
				<a href="/login">Sign in</a>
			</p>
		</div>
	{/if}
</div>

<style>
	.register-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
		color: white;
		padding: 2rem;
	}

	.register-card {
		width: 100%;
		max-width: 480px;
		padding: 2.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		backdrop-filter: blur(10px);
	}

	.register-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.register-header h1 {
		font-size: 1.75rem;
		font-weight: 700;
		color: #c4a882;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.register-header p {
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

	.name-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
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
		font-family: inherit;
	}

	.form-group input:focus {
		border-color: #c4a882;
	}

	.form-group input:disabled {
		opacity: 0.5;
	}

	.password-wrapper {
		position: relative;
	}

	.password-wrapper input {
		padding-right: 2.5rem;
	}

	.password-toggle {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.4);
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
	}

	.password-toggle:hover {
		color: rgba(255, 255, 255, 0.7);
	}

	.password-strength {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.375rem;
	}

	.strength-bar {
		flex: 1;
		height: 3px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		overflow: hidden;
	}

	.strength-fill {
		height: 100%;
		border-radius: 2px;
		transition: width 0.3s, background 0.3s;
	}

	.strength-label {
		font-size: 0.6875rem;
		font-family: 'JetBrains Mono', monospace;
		font-weight: 500;
		min-width: 3rem;
	}

	.field-error {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.75rem;
		color: #fca5a5;
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
		font-family: inherit;
		margin-top: 0.5rem;
	}

	.submit-btn:hover:not(:disabled) {
		background: #b89a74;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.login-link {
		text-align: center;
		margin-top: 1.5rem;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.login-link a {
		color: #c4a882;
		text-decoration: none;
	}

	.login-link a:hover {
		text-decoration: underline;
	}

	/* Success state */
	.success-card {
		text-align: center;
		padding: 3rem 2rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(72, 187, 120, 0.3);
		border-radius: 12px;
		backdrop-filter: blur(10px);
		max-width: 400px;
		width: 100%;
	}

	.success-icon {
		color: #48bb78;
		margin-bottom: 1rem;
		animation: success-pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
	}

	@keyframes success-pop {
		0% { transform: scale(0); opacity: 0; }
		60% { transform: scale(1.2); }
		100% { transform: scale(1); opacity: 1; }
	}

	.success-card h1 {
		font-size: 1.5rem;
		color: #48bb78;
		margin-bottom: 0.5rem;
	}

	.success-card p {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.875rem;
	}

	.redirect-bar {
		margin-top: 1.5rem;
		height: 3px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		overflow: hidden;
	}

	.redirect-fill {
		height: 100%;
		background: #48bb78;
		border-radius: 2px;
		animation: redirect-progress 1.5s linear forwards;
	}

	@keyframes redirect-progress {
		from { width: 0; }
		to { width: 100%; }
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
		to { transform: rotate(360deg); }
	}
</style>
