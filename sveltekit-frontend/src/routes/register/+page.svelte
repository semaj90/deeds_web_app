<script lang="ts">
	import { superForm } from 'sveltekit-superforms/client';
	import { zod4Client as zodClient } from 'sveltekit-superforms/adapters';
	import { fade, fly } from 'svelte/transition';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { registerSchema } from './schema.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Superforms v2 — server-validated registration with Zod adapter.
	// svelte-ignore state_referenced_locally
	const { form, errors, message, enhance, submitting, delayed } = superForm(data.form, {
		validators: zodClient(registerSchema as any),
		resetForm:  false,
		invalidateAll: false,
		onResult({ result }) {
			if (result.type === 'redirect') {
				step = 'success';
			}
		},
	});

	let showPassword = $state(false);
	let step = $state<'form' | 'success'>('form');

	// Derived password strength (client-only — server enforces 8-char min via Zod).
	let passwordStrength = $derived.by(() => {
		const p = $form.password ?? '';
		if (!p) return { score: 0, label: '', color: '' };
		let score = 0;
		if (p.length >= 8) score++;
		if (p.length >= 12) score++;
		if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
		if (/\d/.test(p)) score++;
		if (/[^A-Za-z0-9]/.test(p)) score++;
		if (score <= 1) return { score, label: 'Weak',   color: '#ef4444' };
		if (score <= 2) return { score, label: 'Fair',   color: '#f59e0b' };
		if (score <= 3) return { score, label: 'Good',   color: '#63b3ed' };
		return                  { score, label: 'Strong', color: '#48bb78' };
	});

	let passwordsMatch = $derived(($form.password ?? '') === ($form.confirmPassword ?? ''));
</script>

<div class="register-container">
	{#if step === 'success'}
		<div class="success-card" in:fly={{ y: 20, duration: 400 }}>
			<div class="success-icon">
				<Icon name="circle-check" size={48} />
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

			{#if $message}
				<div class="error-banner" role="alert" in:fly={{ y: -10, duration: 200 }}>
					{$message}
				</div>
			{/if}

			<form method="POST" use:enhance>
				<div class="name-row">
					<div class="form-group">
						<label for="firstName">First Name</label>
						<input
							id="firstName"
							name="firstName"
							type="text"
							required
							bind:value={$form.firstName}
							placeholder="First name"
							disabled={$submitting}
							autocomplete="given-name"
						/>
						{#if $errors.firstName}
							<span class="field-error" in:fade={{ duration: 150 }}>{$errors.firstName[0]}</span>
						{/if}
					</div>
					<div class="form-group">
						<label for="lastName">Last Name</label>
						<input
							id="lastName"
							name="lastName"
							type="text"
							required
							bind:value={$form.lastName}
							placeholder="Last name"
							disabled={$submitting}
							autocomplete="family-name"
						/>
						{#if $errors.lastName}
							<span class="field-error" in:fade={{ duration: 150 }}>{$errors.lastName[0]}</span>
						{/if}
					</div>
				</div>

				<div class="form-group">
					<label for="email">Email</label>
					<input
						id="email"
						name="email"
						type="email"
						required
						bind:value={$form.email}
						placeholder="you@example.com"
						disabled={$submitting}
						autocomplete="email"
					/>
					{#if $errors.email}
						<span class="field-error" in:fade={{ duration: 150 }}>{$errors.email[0]}</span>
					{/if}
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
							bind:value={$form.password}
							placeholder="At least 8 characters"
							disabled={$submitting}
							autocomplete="new-password"
						/>
						<button
							type="button"
							class="password-toggle"
							onclick={() => (showPassword = !showPassword)}
							aria-label={showPassword ? 'Hide password' : 'Show password'}
						>
							<Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
						</button>
					</div>
					{#if $form.password}
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
					{#if $errors.password}
						<span class="field-error" in:fade={{ duration: 150 }}>{$errors.password[0]}</span>
					{/if}
				</div>

				<div class="form-group">
					<label for="confirmPassword">Confirm Password</label>
					<input
						id="confirmPassword"
						name="confirmPassword"
						type={showPassword ? 'text' : 'password'}
						required
						bind:value={$form.confirmPassword}
						placeholder="Confirm your password"
						disabled={$submitting}
						autocomplete="new-password"
					/>
					{#if $form.confirmPassword && !passwordsMatch}
						<span class="field-error" in:fade={{ duration: 150 }}>Passwords don't match</span>
					{:else if $errors.confirmPassword}
						<span class="field-error" in:fade={{ duration: 150 }}>{$errors.confirmPassword[0]}</span>
					{/if}
				</div>

				<button type="submit" class="submit-btn" disabled={$submitting || !passwordsMatch}>
					{#if $delayed}
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

			<div class="demo-panel">
				<p class="demo-title">Demo Account</p>
				<p class="demo-copy">
					<code>demo@legal-ai.local</code> / <code>password123</code>
				</p>
				<a href="/login?demo=true" class="demo-btn">Login as Demo</a>
			</div>
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
		display: block;
		width: 100%;
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #f3dfbf;
		text-align: center;
		text-decoration: none;
		background: rgba(196, 168, 130, 0.12);
		border: 1px solid rgba(196, 168, 130, 0.35);
		border-radius: 6px;
		transition: background 0.2s, border-color 0.2s;
	}

	.demo-btn:hover {
		background: rgba(196, 168, 130, 0.2);
		border-color: rgba(196, 168, 130, 0.5);
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
		0%   { transform: scale(0);   opacity: 0; }
		60%  { transform: scale(1.2); }
		100% { transform: scale(1);   opacity: 1; }
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
		to   { width: 100%; }
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
