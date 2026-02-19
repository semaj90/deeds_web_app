/**
 * PM2 Configuration for Legal AI Indexing System
 * High-performance cluster management with auto-scaling
 */

const os = require('os')
const path = require('path')

const cpuCount = os.cpus().length

module.exports = {
  apps: [
    {
      // Go Indexing Service - Main API
      name: 'legal-ai-indexer-go',
      script: 'go',
      args: ['run', 'async-indexer.go'],
      cwd: path.join(__dirname),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        PORT: 8081,
        OLLAMA_URL: 'http://localhost:11434',
        EMBEDDING_MODEL: 'nomic-embed-text',
        MAX_WORKERS: Math.max(4, cpuCount / 2),
        NODE_ENV: 'production'
      },
      env_development: {
        NODE_ENV: 'development',
        MAX_WORKERS: 2
      },
      log_file: './logs/indexer-go.log',
      error_file: './logs/indexer-go-error.log',
      out_file: './logs/indexer-go-out.log',
      time: true
    },
    
    {
      // AutoGen Python Orchestrator
      name: 'legal-ai-autogen',
      script: 'python',
      args: ['autogen-orchestrator.py', process.cwd()],
      cwd: path.join(__dirname),
      instances: 1,
      exec_mode: 'fork',
      interpreter: 'python3',
      autorestart: true,
      watch: false,
      max_memory_restart: '4G',
      env: {
        PYTHONPATH: '.',
        OLLAMA_URL: 'http://localhost:11434',
        MAX_WORKERS: Math.max(4, cpuCount),
        WEBSOCKET_PORT: 8083
      },
      log_file: './logs/autogen.log',
      error_file: './logs/autogen-error.log',
      out_file: './logs/autogen-out.log',
      time: true
    },
    
    {
      // Node.js Concurrent Processor (zx-based)
      name: 'legal-ai-concurrent',
      script: 'node',
      args: ['--loader', '@zx/loader', 'concurrent-indexer.mjs', process.cwd()],
      cwd: path.join(__dirname),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '3G',
      env: {
        NODE_ENV: 'production',
        MAX_WORKERS: cpuCount,
        BATCH_SIZE: 100
      },
      log_file: './logs/concurrent.log',
      error_file: './logs/concurrent-error.log', 
      out_file: './logs/concurrent-out.log',
      time: true
    },
    
    {
      // Monitoring Dashboard (Express.js)
      name: 'legal-ai-monitor',
      script: 'monitor-dashboard.js',
      cwd: path.join(__dirname),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        PORT: 8084,
        NODE_ENV: 'production'
      },
      log_file: './logs/monitor.log',
      error_file: './logs/monitor-error.log',
      out_file: './logs/monitor-out.log',
      time: true
    },
    
    {
      // Modular GPU-Accelerated Clustering Service
      name: 'legal-ai-cluster-gpu',
      script: 'go',
      args: ['run', 'modular-cluster-service.go'],
      cwd: path.join(__dirname),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '4G',
      env: {
        CLUSTER_SERVICE_PORT: 8085,
        GRPC_PORT: 50051,
        MAX_GPU_MEMORY: 8 * 1024 * 1024 * 1024, // 8GB
        MAX_CONCURRENT_JOBS: 4,
        CUDA_DEVICE: 0,
        NODE_ENV: 'production'
      },
      env_development: {
        NODE_ENV: 'development',
        MAX_CONCURRENT_JOBS: 2,
        MAX_GPU_MEMORY: 4 * 1024 * 1024 * 1024 // 4GB for dev
      },
      log_file: './logs/cluster-gpu.log',
      error_file: './logs/cluster-gpu-error.log',
      out_file: './logs/cluster-gpu-out.log',
      time: true
    },
    
    {
      // GRPC Legal AI Server
      name: 'legal-ai-grpc',
      script: '../go-microservice/bin/grpc-server.exe',
      cwd: path.join(__dirname),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        GO_GRPC_PORT: '50052',
        NODE_ENV: 'production'
      },
      env_development: {
        NODE_ENV: 'development',
        GO_GRPC_PORT: '50052'
      },
      log_file: './logs/grpc.log',
      error_file: './logs/grpc-error.log',
      out_file: './logs/grpc-out.log',
      time: true
    },
    
    {
      // Load Balancer (Nginx-like proxy)
      name: 'legal-ai-proxy',
      script: 'load-balancer.js',
      cwd: path.join(__dirname),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        PORT: 8080,
        UPSTREAM_SERVERS: 'http://localhost:8081,http://localhost:8083,http://localhost:8085',
        NODE_ENV: 'production'
      },
      log_file: './logs/proxy.log',
      error_file: './logs/proxy-error.log',
      out_file: './logs/proxy-out.log',
      time: true
    },
    
    {
      // File System Watcher (Real-time updates)
      name: 'legal-ai-watcher',
      script: 'fs-watcher.js',
      cwd: path.join(__dirname),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        WATCH_PATH: process.cwd(),
        DEBOUNCE_MS: 1000,
        BATCH_SIZE: 50
      },
      log_file: './logs/watcher.log',
      error_file: './logs/watcher-error.log',
      out_file: './logs/watcher-out.log',
      time: true
    }
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['localhost'],
      ref: 'origin/main',
      repo: 'git@github.com:user/legal-ai-indexing.git',
      path: '/var/www/legal-ai-indexing',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
}