// PM2 ecosystem (development supervision)
// Runs SvelteKit dev (fork), supervises Go services, optional utilities

module.exports = {
  apps: [
    {
      name: 'sveltekit-dev',
      cwd: './sveltekit-frontend',
      script: 'npm',
      args: 'run dev',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: process.env.SVELTEKIT_PORT || '5173',
      },
      max_restarts: 10,
      time: true,
    },
    {
      name: 'cluster-http-dev',
      script: 'go-microservice/bin/cluster-http.exe',
      exec_mode: 'fork',
      env: {
        CLUSTER_HTTP_PORT: process.env.CLUSTER_HTTP_PORT || '8090',
        CLUSTER_MODE: process.env.CLUSTER_MODE || 'cpu',
      },
      watch: false,
      windowsHide: true,
    },
    {
      name: 'summarizer-http-dev',
      script: 'go-microservice/bin/summarizer-http.exe',
      exec_mode: 'fork',
      env: {
        SUMMARIZER_HTTP_PORT: process.env.SUMMARIZER_HTTP_PORT || '8091',
        OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'gemma4-legal',
      },
      watch: false,
      windowsHide: true,
    },
  ],
};
