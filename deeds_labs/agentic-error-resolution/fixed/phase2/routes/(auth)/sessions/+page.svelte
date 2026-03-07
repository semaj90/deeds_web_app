<script lang="ts">
  import type { userStore  } from '$lib/stores/user';
  import Button from '$lib/components/ui/button/Button.svelte';
  import type { LogOut, Smartphone, Monitor, Clock, MapPin, AlertCircle  } from 'lucide-svelte';

  interface Session {
    id: string;
    userAgent: string;
    ipAddress: string;
    createdAt: string;
    lastActivityAt: string;
    isCurrent: boolean;
    deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  }

  let sessions = $state<Session[]>([]);
  let loading = $state(true);
  let revoking = $state<string: null>(null);
  let message = $state('');
  let messageType = $state<'success' | 'error'>('success');

  async function loadSessions() {
    try {
      loading = true;
      const response = await fetch('/api/auth/sessions');
      if (response.ok) {
        sessions = await response.json();
      } else {
        throw new Error('Failed to load sessions');
      }
    } catch (error) {
      message = 'Failed to load sessions';
      messageType = 'error';
    } finally {
      loading = false;
    }
  }

  async function revokeSession(sessionId: string) {
    try {
      revoking = sessionId;
      const response = await fetch(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' });

      if (response.ok) {
        message = 'Session revoked successfully';
        messageType = 'success';
        await loadSessions();
      } else {
        throw new Error('Failed to revoke session');
      }
    } catch (error) {
      message = 'Failed to revoke session';
      messageType = 'error';
    } finally {
      revoking = null;
    }
  }

  async function revokeAllOtherSessions() {
    if (!confirm('This will log you out from all other devices. Continue?')) return;

    try {
      const response = await fetch('/api/auth/sessions/revoke-others', {
        method: 'POST',
      });

      if (response.ok) {
        message = 'All other sessions revoked';
        messageType = 'success';
        await loadSessions();
      } else {
        throw new Error('Failed to revoke sessions');
      }
    } catch (error) {
      message = 'Failed to revoke sessions';
      messageType = 'error';
    }
  }

  function getDeviceIcon(deviceType: string) {
    switch (deviceType) {
      case 'mobile':
        return Smartphone;
      case 'tablet':
        return Smartphone;
      default:
        return Monitor;
    }
  }

  function parseUserAgent(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Unknown Browser';
  }

  onMount(() => {
    loadSessions();
  });

  import type { onMount  } from 'svelte';
</script>

{#if !$userStore}
  <div class="min-h-screen bg-gray-50 flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-md text-center">
      <h1 class="text-2xl font-bold text-gray-900 mb-4">Not Authenticated</h1>
      <p class="text-gray-600 mb-6">Please log in to manage your sessions</p>
      <a href="/" class="inline-block px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
        Back to Home
      </a>
    </div>
  </div>
{:else}
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
    <div class="max-w-4xl mx-auto">
      <!-- Header -->
      <div class="bg-white rounded-lg shadow-lg p-8 mb-6">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">Active Sessions</h1>
        <p class="text-gray-600">
          Manage your account security by viewing and controlling active sessions
        </p>

        {#if message}
          <div
            class="mt-4 p-4 rounded {messageType === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'}"
          >
            {message}
          </div>
        {/if}
      </div>

      {#if loading}
        <div class="bg-white rounded-lg shadow-lg p-8 text-center">
          <div
            class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"
          ></div>
          <p class="mt-4 text-gray-600">Loading sessions...</p>
        </div>
      {:else if sessions.length === 0}
        <div class="bg-white rounded-lg shadow-lg p-8 text-center">
          <p class="text-gray-600 mb-4">No active sessions found</p>
          <a
            href="/profile"
            class="inline-block px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Back to Profile
          </a>
        </div>
      {:else}
        <!-- Sessions List -->
        <div class="space-y-4">
          {#each sessions as session (session.id)}
            {@const DeviceIcon = getDeviceIcon(session.deviceType)}
            {@const browser = parseUserAgent(session.userAgent)}

            <div
              class="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
            >
              <div class="p-6 flex items-start justify-between">
                <div class="flex items-start gap-4 flex-1">
                  <div class="mt-1">
                    <DeviceIcon class="w-6 h-6 text-blue-600" />
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <h3 class="text-lg font-semibold text-gray-900">{browser}</h3>
                      {#if session.isCurrent}
                        <span
                          class="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full"
                        >
                          Current Device
                        </span>
                      {/if}
                    </div>

                    <div class="mt-3 space-y-2 text-sm text-gray-600">
                      <div class="flex items-center gap-2">
                        <MapPin class="w-4 h-4" />
                        <span class="font-mono text-xs">{session.ipAddress}</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <Clock class="w-4 h-4" />
                        <span>
                          Created: {new Date(session.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div class="flex items-center gap-2">
                        <Clock class="w-4 h-4" />
                        <span>
                          Last active: {new Date(session.lastActivityAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {#if !session.isCurrent}
                  <Button
                    onclick={() => revokeSession(session.id)}
                    disabled={revoking === session.id}
                    class="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                  >
                    <LogOut class="w-4 h-4" />
                    {revoking === session.id ? 'Revoking...' : 'Revoke'}
                  </Button>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <!-- Revoke All Button -->
        {#if sessions.some((s) => !s.isCurrent)}
          <div class="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div class="flex items-start gap-4">
              <AlertCircle class="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
              <div class="flex-1">
                <h3 class="font-semibold text-yellow-900 mb-2">Quick Actions</h3>
                <p class="text-sm text-yellow-700 mb-4">
                  Sign out from all other devices for enhanced security.
                </p>
                <Button
                  onclick={revokeAllOtherSessions}
                  class="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
                >
                  Sign Out All Other Devices
                </Button>
              </div>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  :global(body) {
    @apply bg-gray-50;
  }
</style>
