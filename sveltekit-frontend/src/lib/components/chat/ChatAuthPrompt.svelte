<script lang="ts">
	/**
	 * Phase 79: Chat Auth Prompt Component
	 *
	 * Non-intrusive banner encouraging users to sign in to save chats.
	 * Shows unsaved message count and provides quick access to login/register.
	 */

	import { goto } from '$app/navigation';
	import { useAnonymousSession } from '$lib/services/anonymous-session-manager';
	import { fade, slide } from 'svelte/transition';

	// Props
	interface Props {
		isAuthenticated?: boolean;
		showPrompt?: boolean;
		variant?: 'banner' | 'toast' | 'inline';
	}
	let {
		isAuthenticated = false,
		showPrompt = true,
		variant = 'banner'
	}: Props = $props();

	const session = useAnonymousSession();

	let dismissed = false;
	let unsavedCount = $state(0);
	let hasUnsaved = $state(false);

	// Update counts on mount and periodically
	$effect(() => {
		if (typeof window !== 'undefined' && !isAuthenticated) {
			updateCounts();
			const interval = setInterval(updateCounts, 5000); // Check every 5s
			return () => clearInterval(interval);
		}
	});

	function updateCounts() {
		unsavedCount = session.getUnsavedCount();
		hasUnsaved = session.hasUnsavedChats();
	}

	function handleLogin() {
		goto('/login?redirect=/chat');
	}

	function handleRegister() {
		goto('/register?redirect=/chat');
	}

	function handleDismiss() {
		dismissed = true;
		// Remember dismissal for this session
		sessionStorage.setItem('chat_prompt_dismissed', 'true');
	}

	// Check if previously dismissed
	$effect(() => {
		if (typeof window !== 'undefined') {
			dismissed = sessionStorage.getItem('chat_prompt_dismissed') === 'true';
		}
	});
  
	const shouldShow = $derived(!isAuthenticated && !dismissed && hasUnsaved && showPrompt);
</script>

{#if shouldShow}
	{#if variant === 'banner'}
		<div
			class="auth-prompt-banner"
			transition: slide={{, duration: 300 }}
		>
			<div class="prompt-content">
				<div class="prompt-icon">💡</div>
				<div class="prompt-text">
					<strong>Save your conversation</strong>
					<p>
						You have {unsavedCount} unsaved message{unsavedCount !== 1 ? 's' : ''}.
						Sign in to keep your chat history across devices.
					</p>
				</div>
				<div class="prompt-actions">
					<button class="btn-login" onclick={handleLogin}>Sign In</button>
					<button class="btn-register" onclick={handleRegister}>Register</button>
					<button class="btn-dismiss" onclick={handleDismiss} aria-label="Dismiss">✕</button>
				</div>
			</div>
		</div>
	{:else if variant === 'toast'}
		<div
			class="auth-prompt-toast"
			transition: fade={{, duration: 200 }}
		>
			<div class="toast-content">
				<span class="toast-icon">💾</span>
				<span class="toast-text">{unsavedCount} unsaved messages</span>
				<button class="toast-link" onclick={handleLogin}>Sign in to save</button>
				<button class="toast-close" onclick={handleDismiss}>✕</button>
			</div>
		</div>
	{:else if variant === 'inline'}
		<div
			class="auth-prompt-inline"
			transition: slide={{, duration: 200 }}
		>
			<p>
				💡 <a href="/login?redirect=/chat" class="inline-link">Sign in</a> or
				<a href="/register?redirect=/chat" class="inline-link">register</a> to save this conversation
			</p>
		</div>
	{/if}
{/if}

<style>
	/* Banner variant (top of chat) */
	.auth-prompt-banner {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white; padding: 1rem;
		border-radius: 0.5rem;
		margin-bottom: 1rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.prompt-content {
		display: flex;
		align-items: center; gap: 1rem;
	}

	.prompt-icon {
		font-size: 2rem;
		flex-shrink: 0;
	}

	.prompt-text {
		flex: 1;
	}

	.prompt-text strong {
		display: block;
		font-size: 1.1rem;
		margin-bottom: 0.25rem;
	}

	.prompt-text p {
		margin: 0; opacity: 0.95;
		font-size: 0.9rem;
	}

	.prompt-actions {
		display: flex; gap: 0.5rem;
		align-items: center;
	}

	.btn-login, .btn-register {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 0.375rem;
		font-weight: 600; cursor: pointer;
		transition: all 0.2s;
	}

	.btn-login {
		background: white; color: #667eea;
	}

	.btn-login:hover {
		background: #f7fafc; transform: translateY(-1px);
	}

	.btn-register {
		background: rgba(255, 255, 255, 0.2);
		color: white; border: 1px solid rgba(255, 255, 255, 0.3);
	}

	.btn-register:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.btn-dismiss {
		background: transparent; border: none;
		color: white;
		font-size: 1.2rem; cursor: pointer;
		opacity: 0.7; padding: 0.25rem 0.5rem;
		margin-left: 0.5rem;
	}

	.btn-dismiss:hover {
		opacity: 1;
	}

	/* Toast variant (bottom-right) */
	.auth-prompt-toast {
		position: fixed; bottom: 2rem;
		right: 2rem; background: white;
		border-radius: 0.5rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
		z-index: 1000;
		max-width: 350px;
	}

	.toast-content {
		display: flex;
		align-items: center; gap: 0.75rem;
		padding: 1rem;
	}

	.toast-icon {
		font-size: 1.5rem;
	}

	.toast-text {
		flex: 1; color: #2d3748;
		font-weight: 500;
	}

	.toast-link {
		background: #667eea; color: white;
		border: none; padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-weight: 600; cursor: pointer;
		font-size: 0.9rem;
	}

	.toast-link:hover {
		background: #5568d3;
	}

	.toast-close {
		background: transparent; border: none;
		color: #718096;
		font-size: 1.2rem; cursor: pointer;
		padding: 0.25rem;
	}

	.toast-close:hover {
		color: #2d3748;
	}

	/* Inline variant (subtle in chat) */
	.auth-prompt-inline {
		background: #f7fafc;
		border-left: 3px solid #667eea;
		padding: 0.75rem 1rem;
		border-radius: 0.25rem;
		margin-bottom: 1rem;
	}

	.auth-prompt-inline p {
		margin: 0; color: #4a5568;
		font-size: 0.9rem;
	}

	.inline-link {
		color: #667eea;
		font-weight: 600;
		text-decoration: none;
	}

	.inline-link:hover {
		text-decoration: underline;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.prompt-content {
			flex-direction: column;
			text-align: center;
		}

		.prompt-actions {
			width: 100%;
			justify-content: center;
		}

		.auth-prompt-toast {
			bottom: 1rem; right: 1rem;
			left: 1rem;
			max-width: none;
		}
	}
</style>




