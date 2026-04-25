# Legal Taxonomy Clustering System - Implementation Plan

- [x] 1. Set up RabbitMQ clustering job queue


  - Create RabbitMQ queue `clustering.jobs` with durable settings
  - Implement `src/lib/server/services/rabbitmq-clustering-service.ts` with publish/consume methods
  - Add job status tracking in Redis with 24-hour TTL
  - Implement retry logic with exponential backoff (1s, 2s, 4s)
  - Add 1-hour timeout handling for long-running jobs
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2. Implement XState clustering orchestration machine
  - Create `src/lib/server/services/xstate-clustering-machine.ts` with state machine definition
  - Implement state transitions: waiting → queue → clustering → tagging → indexing → complete
  - Add 3-retry logic per state with automatic rollback on failure
  - Implement version tracking before and after each run
  - Add event emission for job completion, state transitions, and errors
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_


- [ ] 3. Implement SOM clustering algorithm
  - Create `src/lib/server/services/som-clustering-service.ts` with SOM grid initialization
  - Implement SOM training with 100 epochs and learning rate decay (0.5 → 0.01)
  - Add best matching unit (BMU) calculation for statute embeddings
  - Implement centroid extraction from trained SOM grid
  - Store SOM grid state and centroids in Redis for K-Means application

  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 4. Implement K-Means clustering and labeling
  - Create `src/lib/server/services/kmeans-clustering-service.ts` with K-Means algorithm
  - Implement K=8 clustering on SOM centroids (configurable)
  - Calculate confidence scores (0-1) based on distance to cluster center
  - Flag statutes with confidence < 0.7 for manual review


  - Integrate LLM to generate cluster labels based on statute content
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 5. Implement change detection and operator alerts
  - Create `src/lib/server/services/change-detection-service.ts` for comparing clustering runs
  - Calculate percentage of statutes with changed labels
  - Emit operator alerts when changes exceed 20% threshold
  - Store change history in PostgreSQL for audit trail
  - Include affected statute counts and confidence metrics in alerts
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 6. Implement echo ranking service
  - Create `src/lib/server/services/echo-ranking-service.ts` for tracking search popularity
  - Implement Redis hit counter increment on statute search
  - Apply ranking boost formula: `semantic_score + echo_hits * 0.15`
  - Implement 24-hour TTL for echo cache with automatic reset
  - Include hit counts in search response metadata
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 7. Integrate clustering metadata into Qdrant
  - Update Qdrant indexing to store cluster payloads: `som_cluster_id`, `kmeans_label`, `cluster_confidence`
  - Modify `src/lib/server/services/qdrant-indexing-service.ts` to handle cluster metadata
  - Implement payload update logic for re-clustering runs
  - Add version tracking to payloads for change detection
  - _Requirements: 4.5, 7.1, 7.2, 7.3, 7.4_

- [ ] 8. Implement cluster filtering in search
  - Create `src/lib/server/services/cluster-filter-service.ts` for filtering by cluster
  - Implement Qdrant filter queries by `som_cluster_id` or `kmeans_label`
  - Support multiple cluster selection with OR logic
  - Cache cluster filter options for 1 hour
  - Return cluster metadata (name, confidence) in search results
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 9. Create clustering health check endpoint
  - Create `src/routes/api/health/clustering/+server.ts` endpoint
  - Return clustering metrics: execution time, statute count, cluster count, average confidence
  - Track job success rate and average retry count
  - Emit warnings if metrics exceed thresholds
  - Store metrics in time-series database for historical analysis
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 10. Integrate clustering into statute indexing pipeline
  - Modify `src/lib/server/services/ingestion-service.ts` to publish NEW_DATA events
  - Trigger clustering job when new statutes are indexed
  - Handle clustering job results and update Qdrant payloads
  - Implement error handling and retry logic for failed clustering
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1_

- [ ]* 11. Write unit tests for SOM and K-Means algorithms
  - Test SOM grid initialization with various dimensions
  - Test SOM training convergence and BMU calculation
  - Test K-Means clustering and centroid calculation
  - Test confidence score computation
  - Test change detection logic
  - _Requirements: 3.1, 3.2, 4.1, 4.2, 5.1_

- [ ]* 12. Write integration tests for clustering workflow
  - Test end-to-end clustering job from RabbitMQ to Qdrant
  - Test XState machine state transitions and rollback
  - Test change detection and operator alerts
  - Test echo ranking integration with search
  - Test cluster filtering in search results
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1_

- [ ]* 13. Write performance tests for clustering
  - Measure SOM training throughput (statutes/second)
  - Measure K-Means convergence time
  - Measure change detection latency
  - Measure echo ranking query performance
  - Benchmark cluster filtering query performance
  - _Requirements: 3.1, 4.1, 6.1, 7.1, 8.1_

**Optional tasks marked with * are skipped for MVP. Core implementation (tasks 1-10, 14-17) will be completed first.**

- [ ] 14. Update Go microservice for clustering integration
  - Modify Go search service to query Qdrant with cluster filters
  - Apply echo ranking boost to search results
  - Return cluster metadata in search responses
  - Implement cluster filter options endpoint
  - _Requirements: 6.2, 7.1, 7.2, 8.1_

- [ ] 15. Create SvelteKit UI for cluster filtering
  - Create `src/lib/components/legal/ClusterFilterPanel.svelte` component
  - Display available clusters with confidence scores
  - Implement multi-select cluster filter UI
  - Show cluster statistics (statute count, average confidence)
  - Integrate with search results display
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 16. Create clustering monitoring dashboard
  - Create `src/routes/admin/clustering/+page.svelte` dashboard
  - Display clustering job history and status
  - Show cluster statistics and quality metrics
  - Display change detection alerts and history
  - Show echo ranking top statutes
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 17. Deploy and test clustering system
  - Deploy RabbitMQ, Redis, and updated services
  - Run smoke tests on all clustering endpoints
  - Verify end-to-end clustering workflow
  - Test change detection and operator alerts
  - Monitor clustering performance and metrics
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1_
