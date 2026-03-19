<script lang="ts">
 import { page } from '$app/state';
 import type { Snippet } from 'svelte';

 interface Props {
 title?: string;
 subtitle?: string;
 showRightRail?: boolean;
 rightRailContent?: any;
 children?: Snippet;
 }

 let { children, title, subtitle, showRightRail = true, rightRailContent }: Props = $props();

 let sidebarOpen = $state(false);
 let systemStatus = $state({
 online: true,
 gpu: 'idle',
 time: new Date().toLocaleTimeString(),
 });

 $effect(() => {
 const interval = setInterval(() => {
 systemStatus.time = new Date().toLocaleTimeString();
 }, 1000);
 return () => clearInterval(interval);
 });

 const navItems = [
 { label: 'Command Center', href: '/command-center', icon: '⚙️' },
 { label: 'Active Cases', href: '/cases', icon: '📋' },
 { label: 'Evidence', href: '/evidence-board', icon: '🔍' },
 { label: 'Laws & Statutes', href: '/laws', icon: '📚' },
 { label: 'Analysis', href: '/analysis-center', icon: '📊' },
 { label: 'AI Chat', href: '/aichat', icon: '💬' }];
</script>

<div class="legal-ai-layout">
 <!-- Sidebar -->
 <aside class="sidebar" class:open={sidebarOpen}>
 <div class="sidebar-header">
 <div class="logo">
 <span class="logo-icon">⚖️</span>
 <span class="logo-text">Legal AI</span>
 </div>
 <button
 class="sidebar-toggle"
 onclick={() => (sidebarOpen = !sidebarOpen)}
 aria-label="Toggle sidebar"
 >
 ✕
 </button>
 </div>

 <nav class="sidebar-nav">
 {#each navItems as item}
 <a
 href={item.href}
 class="nav-item"
 class:active={page.url.pathname.startsWith(item.href)}
 >
 <span class="nav-icon">{item.icon}</span>
 <span class="nav-label">{item.label}</span>
 </a>
 {/each}
 </nav>

 <div class="sidebar-footer">
 <div class="system-strip">
 <div class="status-indicator" class:online={systemStatus.online}></div>
 <span class="status-text">
 {systemStatus.online ? 'Online' : 'Offline'}
 </span>
 </div>
 <div class="system-info">
 <div class="info-row">
 <span class="label">System:</span>
 <span class="value">Operational</span>
 </div>
 <div class="info-row">
 <span class="label">GPU:</span>
 <span class="value">{systemStatus.gpu}</span>
 </div>
 <div class="info-row">
 <span class="label">Time:</span>
 <span class="value">{systemStatus.time}</span>
 </div>
 </div>
 </div>
 </aside>

 <!-- Main Content -->
 <main class="main-content">
 {#if title}
 <header class="content-header">
 <div class="header-text">
 <h1 class="page-title">{title}</h1>
 {#if subtitle}
 <p class="page-subtitle">{subtitle}</p>
 {/if}
 </div>
 </header>
 {/if}

 <div class="content-area">
 {@render children?.()}
 </div>
 </main>

 <!-- Right Rail -->
 {#if showRightRail}
 <aside class="right-rail">
 <div class="rail-section">
 <h3 class="rail-title">AI Assistant</h3>
 <div class="ai-terminal">
 <div class="terminal-header">Legal AI Terminal</div>
 <div class="terminal-content">
 <p class="terminal-text">Ready for analysis...</p>
 </div>
 <input
 type="text"
 placeholder="Ask a legal question..."
 class="terminal-input"
 />
 </div>
 </div>

 <div class="rail-section">
 <h3 class="rail-title">System Status</h3>
 <div class="status-panel">
 <div class="status-item">
 <span class="status-label">Postgres</span>
 <div class="status-bar">
 <div class="bar-fill" style="width, 65%"></div>
 </div>
 <span class="status-value">6.5 GB</span>
 </div>
 <div class="status-item">
 <span class="status-label">Qdrant Vectors</span>
 <div class="status-bar">
 <div class="bar-fill" style="width, 42%"></div>
 </div>
 <span class="status-value">4.2 GB</span>
 </div>
 <div class="status-item">
 <span class="status-label">Neo4j Graph</span>
 <div class="status-bar">
 <div class="bar-fill" style="width, 28%"></div>
 </div>
 <span class="status-value">2.8 GB</span>
 </div>
 </div>
 </div>

 <div class="rail-section">
 <h3 class="rail-title">Quick Actions</h3>
 <div class="quick-actions">
 <button class="action-btn">📋 New Case</button>
 <button class="action-btn">📤 Export</button>
 <button class="action-btn">⚙️ Settings</button>
 </div>
 </div>
 </aside>
 {/if}

 <!-- Mobile Sidebar Toggle -->
 <button
 class="mobile-toggle"
 onclick={() => (sidebarOpen = !sidebarOpen)}
 aria-label="Toggle navigation"
 >
 ☰
 </button>
</div>

<style>
 .legal-ai-layout {
 display: grid;
 grid-template-columns: 1fr 2.4fr 1.2fr;
 min-height: 100vh;
 background-color: #f5f1e8;
		color: #2c2c2c;
 font-family: 'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
 }

 /* Sidebar */
 .sidebar {
 background-color: #2c2c2c;
		color: #f5f1e8;
 padding: 1.5rem 1rem;
 border-right: 2px solid #8b4513;
 display: flex;
 flex-direction: column;
 overflow-y: auto;
 }

 .sidebar-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 2rem;
 padding-bottom: 1rem;
 border-bottom: 1px solid #8b4513;
 }

 .logo {
 display: flex;
 align-items: center;
		gap: 0.75rem;
 font-weight: 600;
 font-size: 1.1rem;
 }

 .logo-icon {
 font-size: 1.5rem;
 }

 .logo-text {
 color: #d4a574;
 }

 .sidebar-toggle { display: none;
		background: none;
 border: none;
		color: #f5f1e8;
 font-size: 1.5rem;
		cursor: pointer;
 }

 .sidebar-nav { flex: 1;
		display: flex;
 flex-direction: column;
		gap: 0.5rem;
 }

 .nav-item {
 display: flex;
 align-items: center;
		gap: 0.75rem;
 padding: 0.75rem 1rem;
 border-radius: 6px;
 text-decoration: none;
		color: #b8b8b8;
 transition: all 0.2s;
 font-size: 0.95rem;
 }

 .nav-item:hover {
 background-color: #3a3a3a;
		color: #d4a574;
 }

 .nav-item.active {
 background-color: #8b4513;
		color: #f5f1e8;
 font-weight: 500;
 }

 .nav-icon {
 font-size: 1.25rem;
 min-width: 1.5rem;
 }

 .nav-label {
 flex: 1;
 }

 .sidebar-footer {
 padding-top: 1rem;
 border-top: 1px solid #8b4513;
 }

 .system-strip {
 display: flex;
 align-items: center;
		gap: 0.5rem;
 margin-bottom: 1rem;
		padding: 0.5rem;
 background-color: #3a3a3a;
 border-radius: 4px;
 font-size: 0.85rem;
 }

 .status-indicator { width: 8px;
		height: 8px;
 border-radius: 50%;
 background-color: #ff4444;
		animation: pulse 2s infinite;
 }

 .status-indicator.online {
 background-color: #44ff44;
 }

 @keyframes pulse {
 0% { opacity: 0.5; } 100% {
 opacity: 1;
 }
 50% {
 opacity: 0.5;
 }
 }

 .status-text {
 color: #b8b8b8;
 }

 .system-info {
 font-size: 0.8rem;
		color: #999;
 }

 .info-row {
 display: flex;
 justify-content: space-between;
		padding: 0.25rem 0;
 }

 .label {
 color: #b8b8b8;
 }

 .value {
 color: #d4a574;
 font-weight: 500;
 }

 /* Main Content */
 .main-content {
 padding: 2rem;
 overflow-y: auto;
 background-color: #f5f1e8;
 }

 .content-header {
 margin-bottom: 2rem;
 padding-bottom: 1.5rem;
 border-bottom: 2px solid #d4a574;
 }

 .header-text {
 display: flex;
 flex-direction: column;
		gap: 0.5rem;
 }

 .page-title {
 font-family: 'Crimson Text', Georgia, serif;
 font-size: 2.5rem;
 font-weight: 700;
		margin: 0;
 color: #2c2c2c;
 }

 .page-subtitle {
 font-size: 1rem;
		color: #666;
 margin: 0;
 }

 .content-area {
 display: flex;
 flex-direction: column;
		gap: 1.5rem;
 }

 /* Right Rail */
 .right-rail {
 background-color: #f0ebe0;
		padding: 1.5rem 1rem;
 border-left: 2px solid #d4a574;
 overflow-y: auto;
		display: flex;
 flex-direction: column;
		gap: 1.5rem;
 }

 .rail-section {
 display: flex;
 flex-direction: column;
		gap: 0.75rem;
 }

 .rail-title {
 font-family: 'Crimson Text', Georgia, serif;
 font-size: 1.1rem;
 font-weight: 600;
		margin: 0;
 color: #2c2c2c;
 padding-bottom: 0.5rem;
 border-bottom: 1px solid #d4a574;
 }

 .ai-terminal {
 background-color: #1a1a1a;
		border: 1px solid #8b4513;
 border-radius: 6px;
		overflow: hidden;
 display: flex;
 flex-direction: column;
 }

 .terminal-header {
 background-color: #2c2c2c;
		color: #d4a574;
 padding: 0.5rem 0.75rem;
 font-size: 0.8rem;
 font-weight: 600;
 border-bottom: 1px solid #8b4513;
 }

 .terminal-content { padding: 0.75rem;
		flex: 1;
 min-height: 60px;
		color: #44ff44;
 font-family: 'Monaco', 'Courier New', monospace;
 font-size: 0.8rem;
 line-height: 1.4;
 }

 .terminal-text {
 margin: 0;
 }

 .terminal-input {
 padding: 0.5rem 0.75rem;
 background-color: #2c2c2c;
		color: #44ff44;
 border: none;
 border-top: 1px solid #8b4513;
 font-family: 'Monaco', 'Courier New', monospace;
 font-size: 0.8rem;
 }

 .terminal-input::placeholder {
 color: #666;
 }

 .terminal-input:focus {
 outline: none;
 background-color: #3a3a3a;
 }

 .status-panel {
 display: flex;
 flex-direction: column;
		gap: 1rem;
 }

 .status-item {
 display: flex;
 flex-direction: column;
		gap: 0.25rem;
 }

 .status-label {
 font-size: 0.8rem;
 font-weight: 600;
		color: #2c2c2c;
 }

 .status-bar {
 height: 6px;
 background-color: #e0d5c7;
 border-radius: 3px;
		overflow: hidden;
 }

 .bar-fill { height: 100%;
		background: linear-gradient(90deg, #8b4513, #d4a574);
 border-radius: 3px;
 }

 .status-value {
 font-size: 0.75rem;
		color: #666;
 }

 .quick-actions {
 display: flex;
 flex-direction: column;
		gap: 0.5rem;
 }

 .action-btn {
 padding: 0.5rem 0.75rem;
 background-color: #e0d5c7;
		border: 1px solid #d4a574;
 border-radius: 4px;
		color: #2c2c2c;
 font-size: 0.85rem;
 font-weight: 500;
		cursor: pointer;
 transition: all 0.2s;
 }

 .action-btn:hover {
 background-color: #d4a574;
		color: #f5f1e8;
 }

 .mobile-toggle { display: none;
		position: fixed;
 bottom: 1rem;
		right: 1rem;
 width: 50px;
		height: 50px;
 background-color: #8b4513;
		color: #f5f1e8;
 border: none;
 border-radius: 50%;
 font-size: 1.5rem;
		cursor: pointer;
 z-index: 1000;
 }

 /* Responsive */
 @media (max-width: 1024px) {
 .legal-ai-layout {
 grid-template-columns: 1fr 2fr;
 }

 .right-rail {
 display: none;
 }
 }

 @media (max-width: 768px) {
 .legal-ai-layout {
 grid-template-columns: 1fr;
 }

 .sidebar { position: fixed;
		left: 0;
 top: 0;
		height: 100vh;
 width: 250px;
 z-index: 999;
		transform: translateX(-100%);
 transition: transform 0.3s;
 }

 .sidebar.open {
 transform: translateX(0);
 }

 .sidebar-toggle {
 display: block;
 }

 .mobile-toggle {
 display: block;
 }

 .main-content {
 padding: 1rem;
 }

 .page-title {
 font-size: 1.75rem;
 }
 }
</style>



