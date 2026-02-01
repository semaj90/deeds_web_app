<script lang="ts">
 // Migrated to $effect
 import { LogOut } from "lucide-svelte";
import { Smartphone } from "lucide-svelte";
import { Monitor } from "lucide-svelte";
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

 interface Session {
 id: string; userAgent: string;
 ipAddress: string; createdAt: string;
 lastActivityAt: string; isCurrent: boolean;
 deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown';
 }

 let sessions = $state<Session[]>([]);
 let loading = $state<boolean>(true);
 let revoking = $state<string | null>(null);
 let message = $state<string>('');
 let messageType = $state<'success' | 'error'>('success');

 async function loadSessions(): Promise<void> {
 try {
 loading = true;
 const response = await fetch('/api/auth/sessions');
 if (response.ok) {
 sessions = await response.json();
 } else {
 throw new Error('Failed to load sessions');
 }
 } catch (err) {
 message = 'Failed to load sessions';
 messageType = 'error';
 } finally {
 loading = false;
 }
 }

 async function revokeSession(sessionId: string): Promise<void> {
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
 } catch (err) {
 message = 'Failed to revoke session';
 messageType = 'error';
 } finally {
 revoking = null;
 }
 }

 async function revokeAllOtherSessions(): Promise<void> {
 if (!confirm('This will log you out from all other devices. Continue?')) return;
 try {
 const response = await fetch('/api/auth/sessions/revoke-others', { method: 'POST' });
 if (response.ok) {
 message = 'All other sessions revoked';
 messageType = 'success';
 await loadSessions();
 } else {
 throw new Error('Failed to revoke sessions');
 }
 } catch (err) {
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
 case 'desktop':
 return Monitor;
 default:
 return Monitor;
 }
 }

 function parseUserAgent(userAgent: string): string {
 if (!userAgent) return 'Unknown Browser';
 if (userAgent.includes('Chrome')) return 'Chrome';
 if (userAgent.includes('Safari')) return 'Safari';
 if (userAgent.includes('Firefox')) return 'Firefox';
 if (userAgent.includes('Edge')) return 'Edge';
 return 'Unknown Browser';
 }

 $effect(() => {

 loadSessions();
 
});
</script>

<main class="page-sessions">
 <h1>Active Sessions</h1>

 {#if message}
 <div
 class="alert"
 class:success={messageType === 'success'}
 class:error={messageType === 'error'}
 >
 {message}
 </div>
 {/if}

 <div class="actions">
 <button class="bits-btn" onclick={revokeAllOtherSessions} aria-label="Revoke other sessions">
 <LogOut /> Revoke other sessions
 </button>
 </div>

 {#if loading}
 <p>Loading sessions…</p>
 {:else if sessions.length === 0}
 <p>No active sessions found.</p>
 {:else}
 <ul class="sessions-list">
 {#each sessions as session (session.id)}
 {@const Icon = getDeviceIcon(session.deviceType)}
 <li class="session-item">
 <Icon class="device-icon" />
 <div class="meta">
 <div class="ua">
 <strong>{parseUserAgent(session.userAgent)}</strong> — {session.userAgent}
 </div>
 <div class="ip">IP: {session.ipAddress}</div>
 <div class="times">
 Created: {session.createdAt} · Last active: {session.lastActivityAt}
 </div>
 </div>
 <div class="controls">
 {#if session.isCurrent}
 <span class="badge current">Current session</span>
 {:else}
 <button
 class="revoke-btn"
 onclick={() => revokeSession(session.id)}
 disabled={revoking === session.id}
 aria-label="Revoke session"
 >
 {revoking === session.id ? 'Revoking…' : 'Revoke'}
 </button>
 {/if}
 </div>
 </li>
 {/each}
 </ul>
 {/if}
</main>

<style>
 :global(body) {
 background: #f9fafb;
 }
 .page-sessions {
 padding: 1rem;
 }
 .actions {
 margin: 0.5rem 0 1rem;
 }
 .sessions-list {
 list-style: none; padding: 0;
 margin: 0;
 }
 .session-item {
 display: flex;
 align-items: center; gap: 0.75rem;
 padding: 0.5rem 0;
 border-bottom: 1px solid rgba(0, 0, 0, 0.04);
 }
 .device-icon {
 width: 28px; height: 28px;
 }
 .meta {
 flex: 1;
 font-size: 0.9rem; color: #111827;
 }
 .controls {
 margin-left: 0.5rem;
 }
 .alert {
 padding: 0.5rem;
 border-radius: 4px;
 margin-bottom: 0.5rem;
 }
 .alert.success {
 background: #ecfdf5; color: #065f46;
 }
 .alert.error {
 background: #fef2f2; color: #991b1b;
 }
 .badge.current {
 background: #eef2ff; padding: 0.25rem 0.5rem;
 border-radius: 4px;
 font-size: 0.8rem;
 }
 .bits-btn {
 display: inline-flex;
 align-items: center; gap: 0.5rem;
 padding: 0.4rem 0.6rem;
 border-radius: 6px; background: #111827;
 color: #fff; border: none;
 cursor: pointer;
 }
 .revoke-btn {
 padding: 0.35rem 0.6rem;
 border-radius: 6px; border: 1px solid #e5e7eb;
 background: #fff; cursor: pointer;
 }
 .revoke-btn[disabled] {
 opacity: 0.6; cursor:not-allowed;
 }
</style>



