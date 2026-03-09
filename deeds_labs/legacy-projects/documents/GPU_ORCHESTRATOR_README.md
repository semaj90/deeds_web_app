# GPU Orchestrator (AlphaGo/UCB + Tensor Cache)

Endpoints:
- GET /health – health & gpu stats
- GET /gpu/stats – raw GPU stats snapshot
- POST /gpu/task – submit task {type, priority, input}
- GET /gpu/task/status?id= – task details
- GET /gpu/tasks – active tasks list
- POST /gpu/task/cancel?id= – cancel
- GET /cuda/kernels – mock kernel catalog
- POST /cuda/execute – schedule CUDA kernel task
- POST /tensor/cache/put – store 4D tensor
- GET /tensor/cache/get?key= – fetch tensor meta
- GET /ws – websocket stream (task_started, task_completed, gpu_stats_update)
- GET /metrics – legacy plain text metrics
- GET /metrics/prom – Prometheus exposition (client_golang)

Prometheus Metrics:
- orchestrator_tasks_total{type,status}
- orchestrator_task_latency_ms_bucket|sum|count
- (legacy gauges) gpu_active_tasks, gpu_queue_depth, gpu_completed_tasks, gpu_avg_task_latency_ms, gpu_utilization_percent, gpu_temperature_celsius

Scheduling:
UCB score = value/visits + C*sqrt(log(totalSelections)/visits) + priorityBoost + ageBoost.

Tensor Cache:
In-memory 4D flattened storage with naive LRU (order slice) + access counter.

Build:
  go build ./...
