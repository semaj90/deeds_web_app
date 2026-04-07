// PM2 ecosystem (production)
// Assumptions:
// - SvelteKit built with adapter-node -> sveltekit-frontend/build/index.js
// - Go binaries already built into go-microservice/bin
// - WebSockets/SSE: enable sticky if needed

module.exports = {
  apps: [
    {
      name: 'sveltekit-api',
      cwd: './sveltekit-frontend',
      script: 'build/index.js',
      node_args: '',
      exec_mode: 'cluster',
      instances: 'max',
      // Set to true if you use WebSockets or SSE
      // sticky: true,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.SVELTEKIT_PORT || '5173',
      },
      time: true,
      max_memory_restart: '1G',
    },
    {
      name: 'cluster-http',
      script: 'go-microservice/bin/cluster-http.exe',
      exec_mode: 'fork',
      autorestart: true,
      env: {
        CLUSTER_HTTP_PORT: process.env.CLUSTER_HTTP_PORT || '8090',
        CLUSTER_MODE: process.env.CLUSTER_MODE || 'cpu',
      },
      windowsHide: true,
    },
    {
      name: 'summarizer-http',
      script: 'go-microservice/bin/summarizer-http.exe',
      exec_mode: 'fork',
      autorestart: true,
      env: {
        SUMMARIZER_HTTP_PORT: process.env.SUMMARIZER_HTTP_PORT || '8091',
        OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'gemma4-legal',
      },
      windowsHide: true,
    },
  ],
};
