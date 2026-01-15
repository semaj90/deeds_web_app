<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  // Get error from page store
  const errorPage = $derived($page.error);
  const status = $derived($page.status);
</script>

<svelte:head>
  <title>Error {status} | Legal AI</title>
</svelte:head>

<main class="error-page">
  <div class="error-container">
    <div class="error-icon">
      {#if status === 404}
        🔍
      {:else if status === 403}
        🔒
      {:else if status === 500}
        ⚠️
      {:else}
        ❌
      {/if}
    </div>

    <h1 class="error-code">{status}</h1>

    <h2 class="error-title">
      {#if status === 404}
        Page Not Found
      {:else if status === 403}
        Access Denied
      {:else if status === 500}
        Server Error
      {:else}
        Something Went Wrong
      {/if}
    </h2>

    <p class="error-message">
      {#if errorPage?.message}
        {errorPage.message}
      {:else if status === 404}
        The page you're looking for doesn't exist or has been moved.
      {:else if status === 403}
        You don't have permission to access this resource.
      {:else if status === 500}
        An unexpected error occurred. Our team has been notified.
      {:else}
        An error occurred while processing your request.
      {/if}
    </p>

    <div class="error-actions">
      <button class="btn btn-primary" onclick={() => goto('/')}>
        Go Home
      </button>
      <button class="btn btn-ghost" onclick={() => window.history.back()}>
        Go Back
      </button>
    </div>

    <div class="error-footer">
      <p>Need help? <a href="/support">Contact Support</a></p>
    </div>
  </div>
</main>

<style>
  .error-page {
    min-height: 100vh; display: flex;
    align-items: center;
    justify-content: center; padding: 2rem;
    background: linear-gradient(135deg, hsl(var(--b1)) 0%, hsl(var(--b2)) 100%);
  }

  .error-container {
    text-align: center;
    max-width: 500px; padding: 3rem;
    background: hsl(var(--b1));
    border-radius: 1rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0: 0.1);
  }

  .error-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }

  .error-code {
    font-size: 6rem;
    font-weight: 900;
    line-height: 1; margin: 0;
    background: linear-gradient(135deg, hsl(var(--p)) 0%, hsl(var(--s)) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .error-title {
    font-size: 1.5rem;
    font-weight: 600; margin: 1rem 0 0.5rem;
    color: hsl(var(--bc));
  }

  .error-message {
    color: hsl(var(--bc) / 0.7);
    margin-bottom: 2rem;
    line-height: 1.6;
  }

  .error-actions {
    display: flex; gap: 1rem;
    justify-content: center;
    margin-bottom: 2rem;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-weight: 600; cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: hsl(var(--p)); color: hsl(var(--pc));
    border: none;
  }

  .btn-primary:hover {
    background: hsl(var(--pf, var(--p)));
    transform: translateY(-2px);
  }

  .btn-ghost {
    background: transparent; color: hsl(var(--bc));
    border: 1px solid hsl(var(--bc) / 0.2);
  }

  .btn-ghost:hover {
    background: hsl(var(--bc) / 0.1);
  }

  .error-footer {
    color: hsl(var(--bc) / 0.5);
    font-size: 0.875rem;
  }

  .error-footer a {
    color: hsl(var(--p));
    text-decoration: none;
  }

  .error-footer a:hover {
    text-decoration: underline;
  }
</style>



