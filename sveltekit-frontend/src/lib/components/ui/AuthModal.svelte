<script lang="ts">
	import { Dialog } from 'bits-ui';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { authStore } from '$lib/stores/auth-store.svelte.js';

	interface Props {
		open?: boolean;
		onclose?: () => void;
		/** Message shown above the form explaining why auth is needed */
		prompt?: string;
		returnUrl?: string;
	}

	let {
		open = $bindable(false),
		onclose,
		prompt = 'Sign in to save your research tasks across sessions.',
		returnUrl = '',
	}: Props = $props();

	let tab         = $state<'login' | 'register'>('login');
	let email       = $state('');
	let password    = $state('');
	let firstName   = $state('');
	let lastName    = $state('');
	let submitting  = $state(false);
	let error       = $state<string | null>(null);
	let success     = $state(false);

	function reset() {
		email = ''; password = ''; firstName = ''; lastName = '';
		error = null; success = false; submitting = false;
	}

	function close() {
		open = false;
		reset();
		onclose?.();
	}

	async function submit() {
		if (!email || !password) { error = 'Email and password are required.'; return; }
		submitting = true;
		error = null;

		if (tab === 'login') {
			try {
				const res = await fetch('/api/auth/login', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email, password }),
				});
				const data = await res.json();
				if (!res.ok) {
					error = data.error ?? 'Login failed. Please try again.';
				} else {
					// Reload to hydrate server session
					window.location.href = returnUrl || window.location.href;
				}
			} catch {
				error = 'Network error. Please try again.';
			}
		} else {
			if (!firstName) { error = 'First name is required.'; submitting = false; return; }
			try {
				const res = await fetch('/api/auth/register', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email, password, firstName, lastName }),
				});
				const data = await res.json();
				if (!res.ok) {
					error = data.error ?? 'Registration failed. Please try again.';
				} else {
					success = true;
					setTimeout(() => {
						window.location.href = returnUrl || window.location.href;
					}, 1500);
				}
			} catch {
				error = 'Network error. Please try again.';
			}
		}
		submitting = false;
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !submitting) submit();
	}

	function switchTab(t: 'login' | 'register') {
		tab = t;
		error = null;
	}
</script>

<Dialog.Root bind:open onOpenChange={(v) => { if (!v) close(); }}>
	<Dialog.Portal>
		<Dialog.Overlay class="auth-overlay" />
		<Dialog.Content class="auth-dialog" onkeydown={handleKey}>
			<div class="auth-header">
				<div class="auth-brand">
					<Icon name="scale" size={18} />
					<span>Legal AI Platform</span>
				</div>
				<Dialog.Close class="auth-close" onclick={close}>
					<Icon name="x" size={16} />
				</Dialog.Close>
			</div>

			{#if success}
				<div class="auth-success">
					<Icon name="check-circle" size={32} />
					<p>Account created! Signing you in…</p>
				</div>
			{:else}
				{#if prompt}
					<p class="auth-prompt">{prompt}</p>
				{/if}

				<div class="auth-tabs">
					<button class="auth-tab" class:active={tab === 'login'} onclick={() => switchTab('login')}>
						Sign In
					</button>
					<button class="auth-tab" class:active={tab === 'register'} onclick={() => switchTab('register')}>
						Create Account
					</button>
				</div>

				<div class="auth-form">
					{#if tab === 'register'}
						<div class="auth-row">
							<div class="auth-field">
								<label class="auth-label" for="auth-first">First Name</label>
								<input id="auth-first" class="auth-input" type="text"
									placeholder="Jane" bind:value={firstName} autocomplete="given-name" />
							</div>
							<div class="auth-field">
								<label class="auth-label" for="auth-last">Last Name</label>
								<input id="auth-last" class="auth-input" type="text"
									placeholder="Smith" bind:value={lastName} autocomplete="family-name" />
							</div>
						</div>
					{/if}

					<div class="auth-field">
						<label class="auth-label" for="auth-email">Email</label>
						<input id="auth-email" class="auth-input" type="email"
							placeholder="you@example.com" bind:value={email} autocomplete="email" />
					</div>

					<div class="auth-field">
						<label class="auth-label" for="auth-password">Password</label>
						<input id="auth-password" class="auth-input" type="password"
							placeholder={tab === 'register' ? 'Min 8 characters' : '••••••••'}
							bind:value={password} autocomplete={tab === 'login' ? 'current-password' : 'new-password'} />
					</div>

					{#if error}
						<div class="auth-error">
							<Icon name="alert-circle" size={14} />
							{error}
						</div>
					{/if}

					<button class="auth-submit" onclick={submit} disabled={submitting}>
						{#if submitting}
							<span class="auth-spinner"></span>
							{tab === 'login' ? 'Signing in…' : 'Creating account…'}
						{:else}
							{tab === 'login' ? 'Sign In' : 'Create Account'}
						{/if}
					</button>
				</div>

				<div class="auth-footer">
					{#if tab === 'login'}
						<a href="/login" class="auth-link" onclick={close}>Full login page</a>
					{:else}
						<a href="/register" class="auth-link" onclick={close}>Full registration page</a>
					{/if}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.auth-overlay) {
		position: fixed;
		inset: 0;
		z-index: 8000;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(4px);
	}

	:global(.auth-dialog) {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 8001;
		width: min(420px, 92vw);
		background: #1c1917;
		border: 1px solid #44403c;
		border-radius: 12px;
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.auth-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1.25rem;
		border-bottom: 1px solid #292524;
	}

	.auth-brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		color: #34d399;
		letter-spacing: 0.04em;
	}

	:global(.auth-close) {
		background: none;
		border: none;
		color: #78716c;
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
		border-radius: 4px;
		transition: color 0.15s;
	}

	:global(.auth-close:hover) { color: #e7e5e4; }

	.auth-prompt {
		margin: 0;
		padding: 0.75rem 1.25rem 0;
		font-size: 0.8rem;
		color: #a8a29e;
		line-height: 1.5;
	}

	.auth-tabs {
		display: flex;
		gap: 0;
		padding: 0.75rem 1.25rem 0;
	}

	.auth-tab {
		flex: 1;
		padding: 0.5rem 0;
		background: #292524;
		border: 1px solid #44403c;
		color: #78716c;
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.auth-tab:first-child { border-radius: 6px 0 0 6px; }
	.auth-tab:last-child  { border-radius: 0 6px 6px 0; border-left: none; }

	.auth-tab.active {
		background: #292524;
		color: #34d399;
		border-color: #34d399;
	}

	.auth-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
	}

	.auth-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.auth-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.auth-label {
		font-size: 0.7rem;
		font-weight: 600;
		color: #a8a29e;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.auth-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: #0c0a09;
		border: 1px solid #44403c;
		border-radius: 6px;
		color: #e7e5e4;
		font-size: 0.85rem;
		outline: none;
		transition: border-color 0.15s;
		box-sizing: border-box;
	}

	.auth-input:focus { border-color: #34d399; }
	.auth-input::placeholder { color: #57534e; }

	.auth-error {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.75rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.25);
		border-radius: 6px;
		font-size: 0.78rem;
		color: #fca5a5;
	}

	.auth-submit {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.625rem;
		background: #34d399;
		border: none;
		border-radius: 6px;
		color: #0c0a09;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.auth-submit:hover:not(:disabled) { background: #6ee7b7; }
	.auth-submit:disabled { opacity: 0.5; cursor: not-allowed; }

	.auth-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(0, 0, 0, 0.2);
		border-top-color: #0c0a09;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.auth-footer {
		padding: 0.625rem 1.25rem 1rem;
		text-align: center;
	}

	.auth-link {
		font-size: 0.75rem;
		color: #57534e;
		text-decoration: underline;
		cursor: pointer;
	}

	.auth-link:hover { color: #a8a29e; }

	.auth-success {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 2rem 1.25rem;
		color: #34d399;
		font-size: 0.9rem;
	}
</style>
