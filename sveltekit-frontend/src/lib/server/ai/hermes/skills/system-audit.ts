import type { SkillRecipe } from './registry.js';

export const SYSTEM_AUDIT_SKILLS: Record<string, SkillRecipe> = {
  check_redis_memory_fragmentation: {
    id: 'check_redis_memory_fragmentation',
    family: 'SystemAudit',
    description: 'Audit Redis memory usage and fragmentation ratio',
    tools: [{ name: 'shell:run', args: { command: 'redis-cli info memory' } }]
  },
  qdrant_collection_integrity_check: {
    id: 'qdrant_collection_integrity_check',
    family: 'SystemAudit',
    description: 'Verify status and payload integrity of Qdrant vector collections',
    tools: [{ name: 'diagnostics:health' }]
  },
  audit_api_route_auth_guards: {
    id: 'audit_api_route_auth_guards',
    family: 'SystemAudit',
    description: 'Scan all server API routes to ensure locals.user authentication is enforced (Gate G4)',
    tools: [{ name: 'shell:run', args: { command: 'npm run audit:auth' } }]
  },
  audit_zod_request_validation: {
    id: 'audit_zod_request_validation',
    family: 'SystemAudit',
    description: 'Verify that all POST/PUT routes use Zod for request body validation (Gate G5)',
    tools: [{ name: 'shell:run', args: { command: 'npm run audit:zod' } }]
  },
  measure_cold_start_latency: {
    id: 'measure_cold_start_latency',
    family: 'SystemAudit',
    description: 'Measure the time taken for the first request to hit the 5-tier stack after an idle period',
    tools: [{ name: 'diagnostics:health' }]
  },
  monitor_worker_thread_pool_saturation: {
    id: 'monitor_worker_thread_pool_saturation',
    family: 'SystemAudit',
    description: 'Audit the saturation and event loop lag of the background worker pool',
    tools: [{ name: 'diagnostics:health' }]
  },
  verify_simdjson_hotpath_dispatch: {
    id: 'verify_simdjson_hotpath_dispatch',
    family: 'SystemAudit',
    description: 'Ensure that high-volume JSON ingestion is correctly routed to simdjson AVX2 kernels',
    tools: [{ name: 'shell:run', args: { command: 'npm run test:simdjson' } }]
  },
  check_dangling_gpu_leases: {
    id: 'check_dangling_gpu_leases',
    family: 'SystemAudit',
    description: 'Identify and reclaim GPU leases that were not properly closed by subagents',
    tools: [{ name: 'shell:run' }]
  },
  audit_env_secret_exposure: {
    id: 'audit_env_secret_exposure',
    family: 'SystemAudit',
    description: 'Scan the codebase for hardcoded secrets or accidentally exposed .env variables',
    tools: [{ name: 'shell:run', args: { command: 'npx gitleaks detect --source .' } }]
  },
  validate_legal_corpus_freshness: {
    id: 'validate_legal_corpus_freshness',
    family: 'SystemAudit',
    description: 'Check the last update timestamps of the legal vector store and local law stubs',
    tools: [{ name: 'search:sql', args: { query: 'SELECT MAX(updated_at) FROM legal_corpus' } }]
  },
  audit_error_brain_correlation_accuracy: {
    id: 'audit_error_brain_correlation_accuracy',
    family: 'SystemAudit',
    description: 'Measure the accuracy of ErrorBrain in correctly correlating logs to root causes',
    tools: [{ name: 'llm:generate' }]
  },
  check_disk_pressure_seaweedfs: {
    id: 'check_disk_pressure_seaweedfs',
    family: 'SystemAudit',
    description: 'Monitor disk usage across the SeaweedFS volume servers',
    tools: [{ name: 'shell:run', args: { command: 'weed shell volume.list' } }]
  },
  verify_grpc_port_mapping_consistency: {
    id: 'verify_grpc_port_mapping_consistency',
    family: 'SystemAudit',
    description: 'Ensure all Go microservices are reachable on their canonical gRPC ports (50051-50057)',
    tools: [{ name: 'diagnostics:health' }]
  },
  audit_cross_origin_resource_sharing: {
    id: 'audit_cross_origin_resource_sharing',
    family: 'SystemAudit',
    description: 'Verify CORS policies across all API endpoints to prevent unauthorized external access',
    tools: [{ name: 'shell:run' }]
  },
  monitor_database_connection_pool_leak: {
    id: 'monitor_database_connection_pool_leak',
    family: 'SystemAudit',
    description: 'Detect leaking Postgres connections that are not being returned to the Pool',
    tools: [{ name: 'search:sql', args: { query: 'SELECT count(*) FROM pg_stat_activity' } }]
  }
};
