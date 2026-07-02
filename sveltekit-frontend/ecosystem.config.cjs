// PM2 ecosystem config — CommonJS required by PM2
const config = {
  apps: [
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PHASE 7: BATCH SUMMARIES (RabbitMQ-backed with KV cache + BitFrost)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      name: 'phase7-summary-worker',
      script: '../phase7-rabbitmq-batch-worker.mjs',
      args: '--worker --id=1 --queue-batch-size=32',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        RABBITMQ_URL: 'amqp://guest:guest@127.0.0.1:5672',
        GEMMA4_URL: 'http://127.0.0.1:8090',
        DATABASE_HOST: '127.0.0.1',
        DATABASE_PORT: '5434',
        DATABASE_USER: 'legal_admin',
        DATABASE_PASSWORD: '123456',
        DATABASE_NAME: 'legal_ai_db',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'redis'
      },
      watch: false,
      max_memory_restart: '2G',
      min_uptime: '10s',
      max_restarts: 5,
      error_file: 'logs/phase7-worker-error.log',
      out_file: 'logs/phase7-worker-out.log',
      log_file: 'logs/phase7-worker-combined.log',
      time: true
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PHASE 7: INDEXED VALIDATOR (detect + log failed summaries for retry)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      name: 'phase7-indexed-validator',
      script: 'scripts/atlas/phase7-indexed-validator.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        DATABASE_HOST: '127.0.0.1',
        DATABASE_PORT: '5434',
        DATABASE_USER: 'legal_admin',
        DATABASE_PASSWORD: '123456',
        DATABASE_NAME: 'legal_ai_db',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'redis'
      },
      cron_restart: '*/15 * * * *', // Run validation every 15 minutes
      watch: false,
      max_memory_restart: '1G',
      error_file: 'logs/phase7-validator-error.log',
      out_file: 'logs/phase7-validator-out.log'
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PHASE 10: PACKET ENVELOPE CACHE (after 50% summaries complete)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      name: 'phase10-packet-cache-warmer',
      script: 'scripts/atlas/phase10-packet-cache-warmer.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        DATABASE_HOST: '127.0.0.1',
        DATABASE_PORT: '5434',
        DATABASE_USER: 'legal_admin',
        DATABASE_PASSWORD: '123456',
        DATABASE_NAME: 'legal_ai_db',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'redis',
        QDRANT_URL: 'http://127.0.0.1:6333',
        CACHE_TTL: '604800' // 7 days
      },
      cron_restart: '0 2 * * *', // Daily at 2 AM (cache warm phase)
      watch: false,
      max_memory_restart: '2G',
      error_file: 'logs/phase10-cache-warmer-error.log',
      out_file: 'logs/phase10-cache-warmer-out.log'
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DAILY: Graphify Seeds (topology refresh + Neo4j enrichment)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      name: 'daily-graphify-seeds',
      script: 'scripts/atlas/daily-graphify-seeds.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        DATABASE_HOST: '127.0.0.1',
        DATABASE_PORT: '5434',
        DATABASE_USER: 'legal_admin',
        DATABASE_PASSWORD: '123456',
        DATABASE_NAME: 'legal_ai_db',
        NEO4J_URL: 'bolt://127.0.0.1:7687',
        NEO4J_USER: 'neo4j',
        NEO4J_PASSWORD: 'password',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'redis'
      },
      cron_restart: '0 4 * * *', // Daily at 4 AM
      watch: false,
      max_memory_restart: '3G',
      error_file: 'logs/daily-graphify-seeds-error.log',
      out_file: 'logs/daily-graphify-seeds-out.log'
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ACP OBSERVABILITY: OpenTelemetry tracer + MongoDB-style retry logic
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      name: 'acp-opentelemetry-collector',
      script: 'scripts/observability/acp-otel-collector.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
        OTEL_SERVICE_NAME: 'phase102-retrieval',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'redis',
        DATABASE_HOST: '127.0.0.1',
        DATABASE_PORT: '5434',
        DATABASE_USER: 'legal_admin',
        DATABASE_PASSWORD: '123456',
        DATABASE_NAME: 'legal_ai_db'
      },
      watch: false,
      max_memory_restart: '1G',
      error_file: 'logs/acp-otel-error.log',
      out_file: 'logs/acp-otel-out.log'
    },

    {
      name: 'mongodb-retry-manager',
      script: 'scripts/observability/mongodb-retry-manager.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        MONGODB_URL: process.env.MONGODB_URL || 'mongodb://localhost:27017/phase7_retries',
        RABBITMQ_URL: 'amqp://guest:guest@127.0.0.1:5672',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'redis',
        RETRY_BACKOFF: '60000' // Start with 1 minute backoff, exponential
      },
      cron_restart: '*/5 * * * *', // Run retry check every 5 minutes
      watch: false,
      max_memory_restart: '1G',
      error_file: 'logs/retry-manager-error.log',
      out_file: 'logs/retry-manager-out.log'
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // REDIS CENTROID CLUSTERING (mirror SOM centroids + periodic refresh)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      name: 'redis-centroid-mirror',
      script: 'scripts/atlas/redis-centroid-clustering.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'redis',
        DATABASE_HOST: '127.0.0.1',
        DATABASE_PORT: '5434',
        DATABASE_USER: 'legal_admin',
        DATABASE_PASSWORD: '123456',
        DATABASE_NAME: 'legal_ai_db',
        CACHE_TTL: '604800' // 7 days
      },
      cron_restart: '0 3 * * *', // Daily at 3 AM
      watch: false,
      max_memory_restart: '1G',
      error_file: 'logs/redis-centroid-error.log',
      out_file: 'logs/redis-centroid-out.log'
    }
  ],

  deploy: {
    production: {
      user: 'node',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:semaj90/mau5law.git',
      path: '/var/www/production',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};

module.exports = config;
