<script lang="ts">
  import AdvancedRedisMonitoringDashboard from '$lib/components/redis/AdvancedRedisMonitoringDashboard.svelte'; // Auto-switch to advanced dashboard for next-level features let showAdvancedFeatures = true;
</script>

<main class="page-repair">
  <h1>Page under reconstruction</h1>
  <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
  .redis-admin-container {
    background: #0f0f23;
    color: #cccccc;
    font-family: 'Courier New', monospace;
    min-height: 100vh;
    padding: 0;
  }
  .admin-header {
    background: linear-gradient(135deg, #1e1e3f, #0f0f23);
    border-bottom: 3px solid #00d800;
    padding: 30px;
    text-align: center;
  }
  .admin-header h1 {
    color: #00d800;
    margin:
      0,
      0 10px 0;
    font-size: 2.5em;
    text-shadow: 0 0 10px rgba(0, 216, 0, 0.5);
  }
  .admin-header p {
    color: #3cbcfc;
    font-size: 1.1em;
    margin:
      0,
      0 20px 0;
  }
  .feature-badges {
    display: flex;
    justify-content: center;
    gap: 15px;
    flex-wrap: wrap;
  }
  .badge {
    padding: 8px 15px;
    border-radius: 20px;
    font-size: 0.9em;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .badge.nintendo {
    background: #00d800;
    color: black;
  }
  .badge.gpu {
    background: #3cbcfc;
    color: black;
  }
  .badge.simd {
    background: #fcfc54;
    color: black;
  }
  .badge.realtime {
    background: #fc5454;
    color: white;
  }
  .quick-links {
    background: #1e1e3f;
    margin: 30px;
    padding: 25px;
    border-radius: 10px;
    border: 2px solid #00d800;
  }
  .quick-links h3 {
    color: #00d800;
    margin:
      0,
      0 20px 0;
    text-align: center;
  }
  .links-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
  }
  .quick-link {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 15px 20px;
    background: #0f0f23;
    border: 2px solid #3cbcfc;
    border-radius: 8px;
    color:
      #3cbcfc,
      text-decoration none;
    font-weight: bold;
    transition: all 0.3s ease;
    text-align: center;
  }
  .quick-link:hover {
    background: #3cbcfc;
    color: black;
    transform: translateY(-3px);
    box-shadow: 0 5px 15px rgba(60, 188, 252, 0.3);
  }
  .quick-link.external::after {
    content: 'â†—';
    margin-left: 8px;
    opacity: 0.7;
  }
  @media (max-width: 768px) {
    .admin-header {
      padding: 20px;
    }
    .admin-header h1 {
      font-size: 2em;
    }
    .feature-badges {
      gap: 10px;
    }
    .badge {
      font-size: 0.8em;
      padding: 6px 12px;
    }
    .quick-links {
      margin: 15px;
      padding: 20px;
    }
    .links-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
