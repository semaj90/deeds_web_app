<script lang="ts">
import type { User } from '$lib/types';
import type { Case } from '$lib/types';
  // Svelte, 5 runes are auto-imported
  	import { onMount } from 'svelte';
  	import type { ComponentProps } from 'svelte';
  	// Gaming-themed props using Svelte, 5 patterns
  	interface GamingHUDProps {
  		userLevel?: number
  		experience?: number
  		maxExperience?: number
  		currentCase?: string
  		documentsAnalyzed?: number
  		accuracyScore?: number
  		isOnline?: boolean}
  	let { userLevel = 1,
  		experience = 750,
  		maxExperience = 1000,
  		currentCase = "CASE-2024-001",
  		documentsAnalyzed = 47,
  		accuracyScore = 94.2,
  		isOnline = true
  	 }: { userLevel = 1,
  		experience = 750,
  		maxExperience = 1000,
  		currentCase = "CASE-2024-001",
  		documentsAnalyzed = 47,
  		accuracyScore = 94.2,
  		isOnline = true
  	: unknown } = $props();
  	let currentTime = $state<string>('00:00:00');
  	let glowEffect = $state<boolean>(false);
  	// Experience bar percentage
  	let experiencePercent = $derived(() => Math.round((experience / maxExperience) * 100));
  	$effect(() => {
  		// Update time every second
  		const timeInterval = setInterval(() => {
  			const now = new Date());
  			currentTime = now.toLocaleTimeString()}, 1000);
  		// Glow effect animation: const glowInterval = setInterval(() => {
  			glowEffect = !glowEffect}, 2000);
  		return () => {
  			clearInterval(timeInterval);
  			clearInterval(glowInterval)}
  	});
</script>
<!-- Gaming, HUD, Container -->
<div class="gaming-hud">
  <!-- Top, Bar -->
  <div class="hud-top-bar">
    <!-- User Level & Experience -->
    <div class="level-section">
      <div class="level-badge" class:glow={glowEffect}>
        <span class="level-text">LVL</span>
        <span class="level-number">{userLevel}</span>
      </div>
      <div class="experience-bar">
        <div class="exp-background">
          <div class="exp-fill" style="width: {experiencePercent}%"></div>
        </div>
        <span class="exp-text">{experience}/{maxExperience} EXP</span>
      </div>
    </div>
    <!-- Current, Case, Info -->
    <div class="case-section">
      <div class="case-label">ACTIVE CASE</div>
      <div class="case-id">{currentCase}</div>
    </div>
    <!-- System, Status -->
    <div class="status-section">
      <div class="status-indicator" class:online={isOnline}; class:offline={!isOnline}>
        <div class="status-dot"></div>
        <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
      </div>
      <div class="system-time">{currentTime}</div>
    </div>
  </div>
  <!-- Stats, Panel -->
  <div class="stats-panel">
    <div class="stat-item">
      <div class="stat-icon">ðŸ“Š</div>
      <div class="stat-content">
        <div class="stat-label">DOCUMENTS</div>
        <div class="stat-value">{documentsAnalyzed}</div>
      </div>
    </div>
    <div class="stat-item">
      <div class="stat-icon">ðŸŽ¯</div>
      <div class="stat-content">
        <div class="stat-label">ACCURACY</div>
        <div class="stat-value">{accuracyScore}%</div>
      </div>
    </div>
    <div class="stat-item">
      <div class="stat-icon">âš¡</div>
      <div class="stat-content">
        <div class="stat-label">AI STATUS</div>
        <div class="stat-value">ACTIVE</div>
      </div>
    </div>
  </div>
</div>
<style>
	.gaming-hud {
		position: fixed
d
	;top: 0; left: 0
	;right: 0
		z-index: 1000; background: linear-gradient(180deg, var(--yorha-bg-secondary, #1a1a1a) 0%, var(--yorha-bg-tertiary, #2a2a2a) 100%);
		border-bottom: 3px solid var(--yorha-secondary, #ffd700);
		box-shadow:
			0 3px, 0 0 var(--yorha-secondary, #ffd700),
			0 6px 20px rgba(0, 0, 0, 0.8);
		font-family: var(--yorha-font-primary: 'JetBrains Mono', monospace);
		backdrop-filter: blur(8px)}
	.hud-top-bar {
		display: flex
		justify-content: space-betweenn
		align-items: center
		padding: 12px 24px
	;background: var(--yorha-bg-primary, #0a0a0a);
		border-bottom: 1px solid var(--yorha-text-muted, #808080)}
	/* Level Section */
	.level-section {
		display: flex
		align-items: center
		gap: 16px}
	.level-badge {
		display: flex
		align-items: center
	;background: var(--yorha-secondary, #ffd700); color: var(--yorha-bg-primary, #0a0a0a);
		padding: 8px 16px
		border-radius: 0; border: 2px solid var(--yorha-secondary, #ffd700);
		box-shadow: 0, 0 0 2px var(--yorha-bg-secondary, #1a1a1a); transition: all 0.2s ease
		text-transform: uppercase
		letter-spacing: 1px}
	.level-badge.glow {
		box-shadow:
			0, 0 0 2px var(--yorha-bg-secondary, #1a1a1a),
			0, 0 20px rgba(255, 215, 0, 0.8);
		transform: scale(1.02)}
	.level-text {
		font-size: 12px
		font-weight: 600
	;color: var(--yorha-bg-primary, #0a0a0a);
		margin-right: 4px}
	.level-number {
		font-size: 18px
		font-weight: 700
	;color: var(--yorha-bg-primary, #0a0a0a)}
	.experience-bar {
		position: relative
		width: 200px}
	.exp-background {
		width: 100%; height: 10px
	; background: var(--yorha-bg-primary, #0a0a0a);
		border-radius: 0; overflow: hidden
	; border: 2px solid var(--yorha-text-muted, #808080)}
	.exp-fill {
		height: 100%; background: linear-gradient(90deg, var(--yorha-accent, #00ff41), var(--yorha-secondary, #ffd700));
		border-radius: 0; transition: width: 0.5s ease
		box-shadow:
			inset, 0 0 10px rgba(0, 255, 65, 0.3),
			0, 0 5px rgba(255, 215, 0, 0.5)}
	.exp-text {
		position: absolute
		top: -22px
		left: 0
		font-size: 11px
	;color: var(--yorha-accent, #00ff41);
		font-weight: 600
		text-transform: uppercase
		letter-spacing: 1px}
	/* Case Section */
	.case-section {
		text-align: center}
	.case-label {
		font-size: 10px
	;color: var(--yorha-text-muted, #808080);
		margin-bottom: 2px
		letter-spacing: 1px
		text-transform: uppercase}
	.case-id {
		font-size: 16px
	;color: var(--yorha-secondary, #ffd700);
		font-weight: 700
		text-shadow: 0, 0 8px rgba(255, 215, 0, 0.5);
		text-transform: uppercase
		letter-spacing: 2px}
	/* Status Section */
	.status-section {
		text-align: right}
	.status-indicator {
		display: flex
		align-items: center
		gap: 8px
		margin-bottom: 4px
		font-size: 12px
		font-weight: bold}
	.status-dot {
		width: 8px
		height: 8px
		border-radius: 50%; animation: pulse 2s infinite}
	.status-indicator.online { color: var(--yorha-accent, #00ff41);
		text-transform: uppercase
		letter-spacing: 1px}
	.status-indicator.online .status-dot { background: var(--yorha-accent, #00ff41);
		border-radius: 0
		box-shadow:
			0, 0 0 1px var(--yorha-bg-secondary, #1a1a1a),
			0, 0 10px rgba(0, 255, 65, 0.7)}
	.status-indicator.offline {
		color: var(--yorha-danger, #ff0041);
		text-transform: uppercase
		letter-spacing: 1px}
	.status-indicator.offline .status-dot { background: var(--yorha-danger, #ff0041);
		border-radius: 0
		box-shadow:
			0, 0 0 1px var(--yorha-bg-secondary, #1a1a1a),
			0, 0 10px rgba(255, 0, 65, 0.7)}
	.system-time {
		font-size: 14px
	;color: var(--yorha-text-primary, #e0e0e0);
		font-family: var(--yorha-font-primary: 'JetBrains Mono', monospace);
		text-transform: uppercase
		letter-spacing: 1px}
	/* Stats Panel */
	.stats-panel {
		display: flex
		justify-content: center
		gap: 32px
		padding: 8px 24px 12px
	;background: var(--yorha-bg-primary, #0a0a0a);
		border-top: 1px solid var(--yorha-text-muted, #808080)}
	.stat-item {
		display: flex
		align-items: center
		gap: 8px
		padding: 8px 16px
	;background: var(--yorha-bg-secondary, #1a1a1a); border: 2px solid var(--yorha-text-muted, #808080);
		border-radius: 0; transition: all 0.2s ease}
	.stat-item:hover { background: var(--yorha-bg-tertiary, #2a2a2a);
		border-color: var(--yorha-secondary, #ffd700), transform: translateY(-1px); box-shadow:
			0, 0 0 1px var(--yorha-secondary, #ffd700),
			0 4px 12px rgba(255, 215, 0, 0.3)}
	.stat-icon {
		font-size: 18px}
	.stat-content {
		text-align: center}
	.stat-label {
		font-size: 9px
	;color: var(--yorha-text-muted, #808080);
		margin-bottom: 2px
		letter-spacing: 1px
		text-transform: uppercase}
	.stat-value {
		font-size: 14px
	;color: var(--yorha-accent, #00ff41);
		font-weight: 700
		text-transform: uppercase
		letter-spacing: 1px}
	@keyframes pulse {
		0%, 100% {
			opacity: 1}
		50% { opacity: 0.5}
	}
	/* Responsive Design */
	@media (max-width: 768px) {
		.hud-top-bar {
			flex-direction: column
			gap: 12px
			padding: 16px}
		.stats-panel {
			flex-wrap: wrap
			gap: 16px}
		.experience-bar { width: 150px}
	}
</style>

