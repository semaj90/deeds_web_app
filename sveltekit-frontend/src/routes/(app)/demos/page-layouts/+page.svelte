<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import MicroInteraction from '$lib/components/ui/MicroInteraction.svelte';

	let viewMode = $state<'dark' | 'warm' | 'split'>('split');
	let activeTab = $state<'general' | 'ai' | 'gpu' | 'security'>('general');

	let config = $state({
		theme: 'yorha',
		language: 'en',
		autoSave: true,
		notifications: true,
		model: 'gemma3-legal',
		temperature: 0.7,
		maxTokens: 2048,
		enableGPU: true,
		enableCUDA: true,
		precision: 'fp16',
		encryption: 'AES256',
		sessionTimeout: 3600,
		twoFactor: false,
		auditLogging: true,
	});

	const tabs = [
		{ key: 'general', icon: 'settings', label: 'GENERAL' },
		{ key: 'ai', icon: 'brain', label: 'AI_ENGINE' },
		{ key: 'gpu', icon: 'zap', label: 'GPU_ACCEL' },
		{ key: 'security', icon: 'shield', label: 'SECURITY' },
	] as const;

	const metrics = [
		{ label: 'CPU_USAGE', value: 45, unit: '%' },
		{ label: 'MEMORY', value: 50, unit: '%', detail: '8.0 / 16.0 GB' },
		{ label: 'DISK', value: 38, unit: '%', detail: '195 / 512 GB' },
	];
</script>

<div class="layout-demo">
	<header class="demo-header">
		<div class="demo-title-row">
			<Icon name="layout" size={18} />
			<h1>PAGE_LAYOUTS</h1>
			<span class="demo-subtitle">Theme Showcase</span>
		</div>
		<div class="toggle-bar">
			<button class="toggle-btn" class:active={viewMode === 'dark'} onclick={() => viewMode = 'dark'}>
				<Icon name="moon" size={14} /> Dark
			</button>
			<button class="toggle-btn" class:active={viewMode === 'warm'} onclick={() => viewMode = 'warm'}>
				<Icon name="sun" size={14} /> Warm
			</button>
			<button class="toggle-btn" class:active={viewMode === 'split'} onclick={() => viewMode = 'split'}>
				<Icon name="columns" size={14} /> Split
			</button>
		</div>
	</header>

	<div class="panels" class:split={viewMode === 'split'}>
		<!-- ═══ DARK THEME PANEL ═══ -->
		{#if viewMode === 'dark' || viewMode === 'split'}
		<section class="panel dark-panel">
			<div class="panel-label">YORHA_DARK</div>
			<div class="panel-grid">
				<nav class="dark-sidebar">
					{#each tabs as tab}
						<button class="dark-nav" class:active={activeTab === tab.key} onclick={() => activeTab = tab.key as any}>
							<Icon name={tab.icon} size={14} /> {tab.label}
						</button>
					{/each}
					<div class="dark-divider"></div>
					<div class="dark-status-badge">ONLINE</div>
				</nav>

				<main class="dark-content">
					{#if activeTab === 'general'}
						<h2 class="dark-heading">GENERAL_SETTINGS</h2>
						<div class="dark-form-grid">
							<div class="dark-field">
								<label>Theme System</label>
								<select bind:value={config.theme}>
									<option value="yorha">YoRHa (Dark)</option>
									<option value="light">Resistance (Light)</option>
									<option value="hc">Machine (High Contrast)</option>
								</select>
							</div>
							<div class="dark-field">
								<label>System Language</label>
								<select bind:value={config.language}>
									<option value="en">English (US)</option>
									<option value="ja">Japanese</option>
									<option value="es">Spanish</option>
								</select>
							</div>
							<div class="dark-field checkbox">
								<label><input type="checkbox" bind:checked={config.autoSave}> Enable Auto-Save</label>
							</div>
							<div class="dark-field checkbox">
								<label><input type="checkbox" bind:checked={config.notifications}> Notifications</label>
							</div>
						</div>
					{:else if activeTab === 'ai'}
						<h2 class="dark-heading">AI_MODEL_CONFIGURATION</h2>
						<div class="dark-form-grid">
							<div class="dark-field">
								<label>Active Model</label>
								<select bind:value={config.model}>
									<option value="gemma3-legal">gemma3-legal:latest</option>
									<option value="llama3">llama3:8b</option>
								</select>
							</div>
							<div class="dark-field">
								<label>Temperature</label>
								<input type="range" min="0" max="1" step="0.1" bind:value={config.temperature}>
								<span class="dark-range-val">{config.temperature}</span>
							</div>
							<div class="dark-field">
								<label>Max Tokens</label>
								<select bind:value={config.maxTokens}>
									<option value={1024}>1024</option>
									<option value={2048}>2048</option>
									<option value={4096}>4096</option>
								</select>
							</div>
						</div>
					{:else if activeTab === 'gpu'}
						<h2 class="dark-heading">GPU_ACCELERATION</h2>
						<div class="dark-form-grid">
							<div class="dark-field checkbox">
								<label><input type="checkbox" bind:checked={config.enableGPU}> Enable WebGPU</label>
							</div>
							<div class="dark-field checkbox">
								<label><input type="checkbox" bind:checked={config.enableCUDA}> Enable CUDA</label>
							</div>
							<div class="dark-field">
								<label>Precision</label>
								<select bind:value={config.precision}>
									<option value="fp16">FP16 (Half)</option>
									<option value="fp32">FP32 (Full)</option>
									<option value="int8">INT8 (Quantized)</option>
								</select>
							</div>
						</div>
					{:else if activeTab === 'security'}
						<h2 class="dark-heading">SECURITY_SETTINGS</h2>
						<div class="dark-form-grid">
							<div class="dark-field">
								<label>Encryption</label>
								<select bind:value={config.encryption}>
									<option value="AES256">AES-256</option>
									<option value="AES128">AES-128</option>
								</select>
							</div>
							<div class="dark-field checkbox">
								<label><input type="checkbox" bind:checked={config.twoFactor}> Two-Factor Auth</label>
							</div>
							<div class="dark-field checkbox">
								<label><input type="checkbox" bind:checked={config.auditLogging}> Audit Logging</label>
							</div>
						</div>
					{/if}

					<div class="dark-actions">
						<MicroInteraction effect="press"><button class="dark-btn-secondary">Reset Defaults</button></MicroInteraction>
						<MicroInteraction effect="press"><button class="dark-btn-primary">Apply Changes</button></MicroInteraction>
					</div>
				</main>

				<aside class="dark-metrics">
					<h3>SYSTEM_METRICS</h3>
					{#each metrics as m}
						<div class="dark-metric">
							<div class="dark-metric-header">
								<span>{m.label}</span>
								<span class="dark-metric-val">{m.value}{m.unit}</span>
							</div>
							<div class="dark-bar"><div class="dark-fill" style="width: {m.value}%"></div></div>
							{#if m.detail}<span class="dark-metric-detail">{m.detail}</span>{/if}
						</div>
					{/each}
					<div class="dark-uptime">
						<Icon name="clock" size={12} />
						<span>Uptime: 2d 14h 32m</span>
					</div>
				</aside>
			</div>
		</section>
		{/if}

		<!-- ═══ WARM THEME PANEL ═══ -->
		{#if viewMode === 'warm' || viewMode === 'split'}
		<section class="panel warm-panel">
			<div class="panel-label warm-label">PARCHMENT_WARM</div>
			<div class="panel-grid">
				<nav class="warm-sidebar">
					{#each tabs as tab}
						<button class="warm-nav" class:active={activeTab === tab.key} onclick={() => activeTab = tab.key as any}>
							<Icon name={tab.icon} size={14} /> {tab.label}
						</button>
					{/each}
					<div class="warm-divider"></div>
					<div class="warm-status-badge">ONLINE</div>
				</nav>

				<main class="warm-content">
					{#if activeTab === 'general'}
						<h2 class="warm-heading">GENERAL_SETTINGS</h2>
						<div class="warm-form-grid">
							<div class="warm-field">
								<label>Theme System</label>
								<select bind:value={config.theme}>
									<option value="yorha">YoRHa (Dark)</option>
									<option value="light">Resistance (Light)</option>
									<option value="hc">Machine (High Contrast)</option>
								</select>
							</div>
							<div class="warm-field">
								<label>System Language</label>
								<select bind:value={config.language}>
									<option value="en">English (US)</option>
									<option value="ja">Japanese</option>
									<option value="es">Spanish</option>
								</select>
							</div>
							<div class="warm-field checkbox">
								<label><input type="checkbox" bind:checked={config.autoSave}> Enable Auto-Save</label>
							</div>
							<div class="warm-field checkbox">
								<label><input type="checkbox" bind:checked={config.notifications}> Notifications</label>
							</div>
						</div>
					{:else if activeTab === 'ai'}
						<h2 class="warm-heading">AI_MODEL_CONFIGURATION</h2>
						<div class="warm-form-grid">
							<div class="warm-field">
								<label>Active Model</label>
								<select bind:value={config.model}>
									<option value="gemma3-legal">gemma3-legal:latest</option>
									<option value="llama3">llama3:8b</option>
								</select>
							</div>
							<div class="warm-field">
								<label>Temperature</label>
								<input type="range" min="0" max="1" step="0.1" bind:value={config.temperature}>
								<span class="warm-range-val">{config.temperature}</span>
							</div>
							<div class="warm-field">
								<label>Max Tokens</label>
								<select bind:value={config.maxTokens}>
									<option value={1024}>1024</option>
									<option value={2048}>2048</option>
									<option value={4096}>4096</option>
								</select>
							</div>
						</div>
					{:else if activeTab === 'gpu'}
						<h2 class="warm-heading">GPU_ACCELERATION</h2>
						<div class="warm-form-grid">
							<div class="warm-field checkbox">
								<label><input type="checkbox" bind:checked={config.enableGPU}> Enable WebGPU</label>
							</div>
							<div class="warm-field checkbox">
								<label><input type="checkbox" bind:checked={config.enableCUDA}> Enable CUDA</label>
							</div>
							<div class="warm-field">
								<label>Precision</label>
								<select bind:value={config.precision}>
									<option value="fp16">FP16 (Half)</option>
									<option value="fp32">FP32 (Full)</option>
									<option value="int8">INT8 (Quantized)</option>
								</select>
							</div>
						</div>
					{:else if activeTab === 'security'}
						<h2 class="warm-heading">SECURITY_SETTINGS</h2>
						<div class="warm-form-grid">
							<div class="warm-field">
								<label>Encryption</label>
								<select bind:value={config.encryption}>
									<option value="AES256">AES-256</option>
									<option value="AES128">AES-128</option>
								</select>
							</div>
							<div class="warm-field checkbox">
								<label><input type="checkbox" bind:checked={config.twoFactor}> Two-Factor Auth</label>
							</div>
							<div class="warm-field checkbox">
								<label><input type="checkbox" bind:checked={config.auditLogging}> Audit Logging</label>
							</div>
						</div>
					{/if}

					<div class="warm-actions">
						<MicroInteraction effect="press"><button class="warm-btn-secondary">Reset Defaults</button></MicroInteraction>
						<MicroInteraction effect="press"><button class="warm-btn-primary">Apply Changes</button></MicroInteraction>
					</div>
				</main>

				<aside class="warm-metrics">
					<h3>SYSTEM_METRICS</h3>
					{#each metrics as m}
						<div class="warm-metric">
							<div class="warm-metric-header">
								<span>{m.label}</span>
								<span class="warm-metric-val">{m.value}{m.unit}</span>
							</div>
							<div class="warm-bar"><div class="warm-fill" style="width: {m.value}%"></div></div>
							{#if m.detail}<span class="warm-metric-detail">{m.detail}</span>{/if}
						</div>
					{/each}
					<div class="warm-uptime">
						<Icon name="clock" size={12} />
						<span>Uptime: 2d 14h 32m</span>
					</div>
				</aside>
			</div>
		</section>
		{/if}
	</div>
</div>

<style>
	/* ═══ PAGE SHELL ═══ */
	.layout-demo {
		min-height: 100vh;
		background: #0a0a1a;
		margin: -2.5rem;
		padding: 2rem;
		color: #e2e8f0;
		font-family: 'Inter', system-ui, sans-serif;
	}

	.demo-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 2rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.demo-title-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.demo-title-row h1 {
		font-family: 'JetBrains Mono', monospace;
		font-size: 1.5rem;
		margin: 0;
		letter-spacing: -0.03em;
	}

	.demo-subtitle {
		font-size: 0.75rem;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.toggle-bar {
		display: flex;
		gap: 0.25rem;
		background: #1e293b;
		border-radius: 8px;
		padding: 0.25rem;
		border: 1px solid #334155;
	}

	.toggle-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		border: none;
		background: transparent;
		color: #94a3b8;
		cursor: pointer;
		border-radius: 6px;
		font-size: 0.8rem;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.2s;
	}

	.toggle-btn:hover { color: #e2e8f0; background: #334155; }
	.toggle-btn.active { background: #2563eb; color: white; }

	.panels { display: flex; flex-direction: column; gap: 2rem; }
	.panels.split { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }

	.panel { border-radius: 12px; overflow: hidden; position: relative; }

	.panel-label {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
		background: rgba(37, 99, 235, 0.2);
		color: #60a5fa;
		border: 1px solid rgba(37, 99, 235, 0.3);
		z-index: 2;
	}

	.panel-label.warm-label {
		background: rgba(196, 117, 43, 0.2);
		color: #c4752b;
		border-color: rgba(196, 117, 43, 0.3);
	}

	.panel-grid {
		display: grid;
		grid-template-columns: 180px 1fr 200px;
		gap: 0;
		min-height: 420px;
	}

	/* ═══ DARK THEME ═══ */
	.dark-panel { background: #0f172a; border: 1px solid #334155; }

	.dark-sidebar {
		background: #1e293b;
		padding: 1rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		border-right: 1px solid #334155;
	}

	.dark-nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		background: transparent;
		border: none;
		color: #94a3b8;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		border-radius: 4px;
		transition: all 0.15s;
		text-align: left;
	}
	.dark-nav:hover { background: #334155; color: #f1f5f9; }
	.dark-nav.active { background: #2563eb; color: white; }

	.dark-divider { border-top: 1px solid #334155; margin: 0.5rem 0; }

	.dark-status-badge {
		background: #059669;
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: bold;
		font-family: 'JetBrains Mono', monospace;
		text-align: center;
		margin-top: auto;
	}

	.dark-content {
		padding: 1.5rem;
		background: #1e293b;
		display: flex;
		flex-direction: column;
	}

	.dark-heading {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.9rem;
		color: #94a3b8;
		border-bottom: 2px solid #334155;
		padding-bottom: 0.5rem;
		margin: 0 0 1.5rem 0;
		letter-spacing: 0.05em;
	}

	.dark-form-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.dark-field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.dark-field label {
		font-size: 0.75rem;
		color: #cbd5e1;
	}
	.dark-field select, .dark-field input[type="text"] {
		background: #0f172a;
		border: 1px solid #475569;
		color: white;
		padding: 0.5rem;
		border-radius: 4px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
	}
	.dark-field input[type="range"] {
		accent-color: #2563eb;
		width: 100%;
	}
	.dark-field.checkbox {
		flex-direction: row;
		align-items: center;
	}
	.dark-field.checkbox label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}
	.dark-field.checkbox input[type="checkbox"] { accent-color: #2563eb; }
	.dark-range-val {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		color: #60a5fa;
		text-align: right;
	}

	.dark-actions {
		margin-top: auto;
		padding-top: 1.5rem;
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		border-top: 1px solid #334155;
	}

	.dark-btn-primary, .dark-btn-secondary {
		padding: 0.45rem 1.25rem;
		border-radius: 4px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	.dark-btn-primary { background: #2563eb; color: white; border: none; }
	.dark-btn-primary:hover { background: #1d4ed8; }
	.dark-btn-secondary { background: transparent; color: #94a3b8; border: 1px solid #475569; }
	.dark-btn-secondary:hover { background: #334155; color: white; }

	.dark-metrics {
		background: #0f172a;
		padding: 1.25rem;
		border-left: 1px solid #334155;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.dark-metrics h3 {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		color: #94a3b8;
		margin: 0;
		letter-spacing: 0.1em;
	}
	.dark-metric { display: flex; flex-direction: column; gap: 0.3rem; }
	.dark-metric-header { display: flex; justify-content: space-between; font-size: 0.65rem; color: #cbd5e1; }
	.dark-metric-val { font-family: 'JetBrains Mono', monospace; color: white; font-weight: 600; }
	.dark-bar { height: 4px; background: #334155; border-radius: 2px; overflow: hidden; }
	.dark-fill { height: 100%; background: #10b981; border-radius: 2px; transition: width 0.3s; }
	.dark-metric-detail { font-size: 0.6rem; color: #64748b; }
	.dark-uptime {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: auto;
		font-size: 0.65rem;
		color: #64748b;
		font-family: 'JetBrains Mono', monospace;
	}

	/* ═══ WARM THEME ═══ */
	.warm-panel { background: #f5f0e8; border: 1px solid rgba(42, 37, 32, 0.15); }

	.warm-sidebar {
		background: #faf7f0;
		padding: 1rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		border-right: 1px solid rgba(42, 37, 32, 0.12);
	}

	.warm-nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		background: transparent;
		border: none;
		color: #4a4238;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		border-radius: 4px;
		transition: all 0.15s;
		text-align: left;
	}
	.warm-nav:hover { background: #e8e2d6; color: #2a2520; }
	.warm-nav.active { background: #c4752b; color: #faf7f0; }

	.warm-divider { border-top: 1px solid rgba(42, 37, 32, 0.12); margin: 0.5rem 0; }

	.warm-status-badge {
		background: #2d8a56;
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.65rem;
		font-weight: bold;
		font-family: 'JetBrains Mono', monospace;
		text-align: center;
		margin-top: auto;
	}

	.warm-content {
		padding: 1.5rem;
		background: #faf7f0;
		display: flex;
		flex-direction: column;
		color: #2a2520;
	}

	.warm-heading {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.9rem;
		color: #4a4238;
		border-bottom: 2px solid rgba(42, 37, 32, 0.15);
		padding-bottom: 0.5rem;
		margin: 0 0 1.5rem 0;
		letter-spacing: 0.05em;
	}

	.warm-form-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	.warm-field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.warm-field label {
		font-size: 0.75rem;
		color: #4a4238;
	}
	.warm-field select, .warm-field input[type="text"] {
		background: white;
		border: 1px solid rgba(42, 37, 32, 0.2);
		color: #2a2520;
		padding: 0.5rem;
		border-radius: 4px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
	}
	.warm-field select:focus, .warm-field input[type="text"]:focus {
		border-color: #c4752b;
		outline: none;
		box-shadow: 0 0 0 2px rgba(196, 117, 43, 0.15);
	}
	.warm-field input[type="range"] {
		accent-color: #c4752b;
		width: 100%;
	}
	.warm-field.checkbox {
		flex-direction: row;
		align-items: center;
	}
	.warm-field.checkbox label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		color: #2a2520;
	}
	.warm-field.checkbox input[type="checkbox"] { accent-color: #c4752b; }
	.warm-range-val {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		color: #c4752b;
		text-align: right;
	}

	.warm-actions {
		margin-top: auto;
		padding-top: 1.5rem;
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		border-top: 1px solid rgba(42, 37, 32, 0.12);
	}

	.warm-btn-primary, .warm-btn-secondary {
		padding: 0.45rem 1.25rem;
		border-radius: 4px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	.warm-btn-primary { background: #c4752b; color: white; border: none; }
	.warm-btn-primary:hover { background: #a5621f; }
	.warm-btn-secondary { background: transparent; color: #4a4238; border: 1px solid rgba(42, 37, 32, 0.25); }
	.warm-btn-secondary:hover { background: #e8e2d6; color: #2a2520; }

	.warm-metrics {
		background: #f0ebe0;
		padding: 1.25rem;
		border-left: 1px solid rgba(42, 37, 32, 0.12);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		color: #2a2520;
	}
	.warm-metrics h3 {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		color: #4a4238;
		margin: 0;
		letter-spacing: 0.1em;
	}
	.warm-metric { display: flex; flex-direction: column; gap: 0.3rem; }
	.warm-metric-header { display: flex; justify-content: space-between; font-size: 0.65rem; color: #4a4238; }
	.warm-metric-val { font-family: 'JetBrains Mono', monospace; color: #2a2520; font-weight: 600; }
	.warm-bar { height: 4px; background: rgba(42, 37, 32, 0.12); border-radius: 2px; overflow: hidden; }
	.warm-fill { height: 100%; background: #c4752b; border-radius: 2px; transition: width 0.3s; }
	.warm-metric-detail { font-size: 0.6rem; color: #7a6f60; }
	.warm-uptime {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: auto;
		font-size: 0.65rem;
		color: #7a6f60;
		font-family: 'JetBrains Mono', monospace;
	}

	/* ═══ RESPONSIVE ═══ */
	@media (max-width: 1200px) {
		.panels.split { grid-template-columns: 1fr; }
	}
	@media (max-width: 768px) {
		.panel-grid { grid-template-columns: 1fr; }
		.dark-sidebar, .warm-sidebar { flex-direction: row; flex-wrap: wrap; border-right: none; border-bottom: 1px solid #334155; }
		.warm-sidebar { border-bottom-color: rgba(42, 37, 32, 0.12); }
		.dark-metrics, .warm-metrics { border-left: none; border-top: 1px solid #334155; }
		.warm-metrics { border-top-color: rgba(42, 37, 32, 0.12); }
	}
</style>
