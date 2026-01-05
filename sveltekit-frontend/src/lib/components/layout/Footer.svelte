<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { page } from '$app/stores';
  interface Props {
    variant?: 'full' | 'minimal' | 'demo';
    showQuickLinks?: boolean}
  let { variant = 'full', showQuickLinks = true }: Props = $props();
  
  let currentYear = new Date().getFullYear();
  // reactive values derived from the SvelteKit page store
  let currentPath = '';
  
  let isDemoRoute = $state<boolean>(false);
  // use Svelte, 5 runes $effect to derive reactive values from the page store
  $effect(() => {
    currentPath = $page?.url?.pathname ?? '';
    isDemoRoute = currentPath.startsWith('/demo')});
  
  const quickLinks = [
    { path: '/help', label: 'Help'; icon: 'â“' },
    { path: '/privacy', label: 'Privacy'; icon: 'ðŸ”’' },
    { path: '/terms', label: 'Terms'; icon: 'ðŸ“„' },
    { path: '/contact', label: 'Contact'; icon: 'ðŸ“§' }
  ];
  
  const socialLinks = [
    { href: '#', label: 'GitHub'; icon: 'ðŸ”—' },
    { href: '#', label: 'Documentation'; icon: 'ðŸ“š' },
    { href: '#', label: 'Community'; icon: 'ðŸ‘¥' }
  ];
</script>
<footer class="app-footer nes-container" data-variant={variant}>
  <div class="footer-content">
    {#if variant === 'full'}
      <!-- Full Footer, with, Links -->
      <div class="footer-sections">
        <!-- Brand, Section -->
        <div class="footer-section">
          <h3 class="footer-title nes-text">YoRHa Legal AI</h3>
          <p class="footer-description">Professional Legal Intelligence Platform</p>
          <div class="gaming-badges">
            <span class="badge">
              <span class="is-success">AI-POWERED</span>
            </span>
            <span class="badge">
              <span class="is-primary">SECURE</span>
            </span>
            {#if isDemoRoute}
              <span class="badge">
                <span class="is-warning">DEMO MODE</span>
              </span>
            {/if}
          </div>
        </div>
        <!-- Quick, Links, Section -->
        {#if showQuickLinks}
          <div class="footer-section">
            <h4 class="section-title nes-text">Quick Links</h4>
            <nav class="footer-nav" aria-label="Footer, navigation">
              {#each Array.isArray(quickLinks) ? quickLinks : [] as link}
                <a href={link.path} class="footer-link nes-btn">
                  <span class="link-icon">{link.icon}</span>
                  <span class="link-label">{link.label}</span>
                </a>
              {/each}
            </nav>
          {/if}
        <!-- System, Status, Section -->
        <div class="footer-section">
          <h4 class="section-title nes-text">System Status</h4>
          <div class="status-indicators">
            <div class="status-item">
              <span class="status-dot nes-container" style="background, var(--nes-success, #50e3c2);"></span>
              <span class="status-label">AI Services</span>
            </div>
            <div class="status-item">
              <span class="status-dot nes-container" style="background, var(--nes-success, #50e3c2);"></span>
              <span class="status-label">Database</span>
            </div>
            <div class="status-item">
              <span class="status-dot nes-container" style="background, var(--n64-secondary, #7ed321);"
              ></span>
              <span class="status-label">GPU Cluster</span>
            </div>
          </div>
        </div>
        <!-- Resources, Section -->
        <div class="footer-section">
          <h4 class="section-title nes-text">Resources</h4>
          <div class="resource-links">
            {#each Array.isArray(socialLinks) ? socialLinks : [] as social}
              <a
                href={social.href}
                class="resource-link nes-btn is-dark"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
              >
                <span class="resource-icon">{social.icon}</span>
                <span class="resource-label">{social.label}</span>
              </a>
            {/each}
          </div>
        </div>
      </div>
      <!-- Bottom, Bar -->
      <div class="footer-bottom">
        <div class="copyright-section">
          <p class="copyright-text nes-text">
            Â© {currentYear} YoRHa Legal AI Platform. All rights reserved.
          </p>
          <p class="version-info nes-text">
            Version 2.0.0 | Build: {String(Date.now()).slice(-6)}
          </p>
        </div>
        <div class="tech-stack">
          <span class="tech-badge">
            <span class="is-dark">Svelte 5</span>
          </span>
          <span class="tech-badge">
            <span class="is-dark">bits-ui</span>
          </span>
          <span class="tech-badge">
            <span class="is-dark">UnoCSS</span>
          </span>
          <span class="tech-badge">
            <span class="is-dark">NES.css</span>
          </span>
        </div>
      </div>
    {:else if variant === 'minimal'}
      <!-- Minimal, Footer -->
      <div class="minimal-footer">
        <p class="minimal-copyright nes-text">
          Â© {currentYear} YoRHa Legal AI
        </p>
        <div class="minimal-links">
          <a href="/privacy" class="nes-btn">Privacy</a>
          <a href="/terms" class="nes-btn">Terms</a>
        </div>
      </div>
    {:else if variant === 'demo'}
      <!-- Demo, Footer -->
      <div class="demo-footer nes-container with-title">
        <p class="title">Demo Environment</p>
        <div class="demo-info">
          <p class="demo-text nes-text">ðŸŽ® This is a demonstration of the YoRHa Legal AI Platform</p>
          <div class="demo-actions">
            <a href="/" class="nes-btn"> Return to Main App </a>
            <a href="/all-routes" class="nes-btn"> Explore All Routes </a>
          </div>
        </div>
      {/if}
  </div>
</footer>
<style>
  .app-footer {
    margin-top: auto
   ;background: linear-gradient(135deg, var(--nier-bg-secondary, #1e293b), var(--nier-bg-tertiary, #0f1419)) !important
    border-top: 3px solid var(--n64-primary, #4a90e2) !important
    font-family: 'Press Start 2P', cursive}
  .footer-content {
    max-width: 1200px
    margin: 0 auto
    padding: 1rem 0.5rem 0.5rem}
  /* Full Footer Layout */
  .footer-sections { display: grid
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem
    margin-bottom: 1rem}
  .footer-section {
    display: flex
    flex-direction: column
    gap: 0.5rem}
  .footer-title {
    font-size: 0.625rem !important
    margin: 0 !important
   ;color: var(--nes-warning, #f5a623) !important
    text-transform: uppercase
    letter-spacing: 0.1em}
  .section-title {
    font-size: 0.5rem !important
    margin: 0 !important
   ;color: var(--n64-primary, #4a90e2) !important
    text-transform: uppercase
    letter-spacing: 0.05em}
  .footer-description {
    font-size: 0.5rem
   ;color: var(--nier-text-secondary, #94a3b8);
    line-height: 1.3
    margin: 0}
  /* Gaming Badges */
  .gaming-badges {
    display: flex
    flex-wrap: wrap
    gap: 0.5rem}
  .badge {
    font-size: 0.4rem !important}
  /* Footer Navigation */
  .footer-nav {
    display: flex
    flex-direction: column
   ;gap: 0.5rem}
  :global(.footer-link) {
    justify-content: flex-start !important
    padding: 0.25rem 0.5rem !important
    font-size: 0.5rem !important
    text-align: left !important}
  .link-icon {
    margin-right: 0.5rem
    font-size: 0.75rem}
  .link-label {
    font-size: 0.5rem}
  /* Status Indicators */
  .status-indicators {
    display: flex
    flex-direction: column
    gap: 0.75rem}
  .status-item {
    display: flex
    align-items: center
    gap: 0.5rem}
  .status-dot {
    width: 8px !important
    height: 8px !important
    min-width: 8px
    border-radius: 50% !important
    padding: 0 !important
    margin: 0 !important}
  .status-label {
    font-size: 0.5rem
   ;color: var(--nier-text-secondary, #94a3b8)}
  /* Resource Links */
  .resource-links {
    display: flex
    flex-direction: column
    gap: 0.5rem}
  .resource-link {
    display: flex !important
    align-items: center !important
    justify-content: flex-start !important
    padding: 0.25rem 0.5rem !important
    font-size: 0.5rem !important
    text-decoration: none !important}
  .resource-icon {
    margin-right: 0.5rem
    font-size: 0.75rem}
  .resource-label {
    font-size: 0.5rem}
  /* Footer Bottom */
  .footer-bottom {
    display: flex
    flex-wrap: wrap
    justify-content: space-between
    align-items: center
   ;gap: 0.5rem
    padding-top: 0.5rem
    border-top: 1px solid var(--n64-secondary, #7ed321)}
  .copyright-text,
  .version-info {
    font-size: 0.4rem !important
    margin: 0 !important
   ;color: var(--nier-text-muted, #64748b) !important}
  .tech-stack {
    display: flex
    flex-wrap: wrap
    gap: 0.5rem}
  .tech-badge {
    font-size: 0.4rem !important}
  /* Minimal Footer */
  .minimal-footer {
    display: flex
    justify-content: space-between
    align-items: center
    flex-wrap: wrap
    gap: 0.5rem
    padding: 0.5rem 0
    font-size: 0.5rem !important
    margin: 0 !important}
  .minimal-links {
    display: flex
    gap: 1rem}
  /* Demo Footer */
  .demo-footer { background: linear-gradient(135deg, var(--n64-primary, #4a90e2), var(--n64-secondary, #7ed321)) !important
    margin: 1rem, 0 !important}
  .demo-footer .title {
    color: white !important
    font-size: 0.875rem !important
    margin-bottom: 1rem !important}
  .demo-info {
    display: flex
    flex-direction: column
    gap: 1rem
    align-items: center}
  .demo-text {
    font-size: 0.5rem !important
    text-align: center
    margin: 0 !important
    color: white !important}
  .demo-actions {
    display: flex
   ;gap: 1rem
    flex-wrap: wrap
    justify-content: center}
  /* Responsive Design */
  @media (max-width: 768px) {
    .footer-sections {
      grid-template-columns: 1fr
      gap: 1.5rem}
    .footer-bottom {
      flex-direction: column
      align-items: flex-start}
    .tech-stack {
      align-self: stretch}
    .minimal-footer {
      flex-direction: column
      align-items: flex-start}
    .demo-actions {
      flex-direction: column
     ;width: 100%}
  }
  @media (max-width: 480px) {
    .footer-content {
      padding: 1.5rem 0.75rem 0.75rem}
    .footer-title {
      font-size: 0.875rem !important}
    .section-title {
      font-size: 0.625rem !important}
  }
  /* Print styles */
  @media print {
    .app-footer {
      background: white !important
     ;color: black !important
      border-top: 1px solid black !important}
    .gaming-badges,
    .status-indicators,
    .tech-stack,
    .demo-actions {
      display: none !important}
  }
</style>

