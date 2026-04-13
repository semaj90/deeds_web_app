#!/usr/bin/env bash

# Redis Production Optimization Script
# Applies recommended settings from REDIS_CONFIGURATION_TUNING.md

set -e

echo "╔══════════════════════════════════════════════════════════╗"
echo "║        Redis Production Configuration Optimizer         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Check if Redis is running
if ! docker ps | grep -q deeds-redis-prod; then
  echo "❌ Redis container not running"
  echo "   Start it with: docker start deeds-redis-prod"
  exit 1
fi

echo "✅ Redis container is running"
echo ""

# Backup current config
echo "📋 Step 1: Backing up current configuration..."
docker exec deeds-redis-prod redis-cli CONFIG GET '*' > "redis-backup-$(date +%Y%m%d-%H%M%S).txt"
echo "   Saved to: redis-backup-$(date +%Y%m%d-%H%M%S).txt"
echo ""

# Current stats
echo "📊 Step 2: Current Redis stats..."
echo "   Memory:"
docker exec deeds-redis-prod redis-cli INFO memory | grep -E "used_memory_human|maxmemory_human|maxmemory_policy"
echo ""
echo "   Performance:"
docker exec deeds-redis-prod redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses|evicted_keys"
echo ""

# Calculate hit rate
hits=$(docker exec deeds-redis-prod redis-cli INFO stats | grep keyspace_hits | cut -d: -f2 | tr -d '\r')
misses=$(docker exec deeds-redis-prod redis-cli INFO stats | grep keyspace_misses | cut -d: -f2 | tr -d '\r')
if [ "$hits" -gt 0 ] || [ "$misses" -gt 0 ]; then
  total=$((hits + misses))
  hit_rate=$(awk "BEGIN {printf \"%.1f\", ($hits / $total) * 100}")
  echo "   Hit Rate: $hit_rate%"
fi
echo ""

# Apply optimizations
echo "🔧 Step 3: Applying production optimizations..."

# 1. Increase memory limit to 2GB
echo "   1/6: Setting maxmemory to 2GB..."
docker exec deeds-redis-prod redis-cli CONFIG SET maxmemory 2gb
echo "       ✅ maxmemory = 2GB"

# 2. Verify eviction policy
echo "   2/6: Verifying eviction policy..."
policy=$(docker exec deeds-redis-prod redis-cli CONFIG GET maxmemory-policy | tail -1)
if [ "$policy" = "allkeys-lru" ]; then
  echo "       ✅ maxmemory-policy = allkeys-lru"
else
  echo "       ⚠️  Current policy: $policy (setting to allkeys-lru)"
  docker exec deeds-redis-prod redis-cli CONFIG SET maxmemory-policy allkeys-lru
fi

# 3. Enable RDB persistence
echo "   3/6: Enabling RDB persistence..."
docker exec deeds-redis-prod redis-cli CONFIG SET save "900 1 300 10 60 10000"
echo "       ✅ RDB snapshots enabled (15min/1key, 5min/10keys, 1min/10000keys)"

# 4. Enable lazy freeing
echo "   4/6: Enabling lazy freeing..."
docker exec deeds-redis-prod redis-cli CONFIG SET lazyfree-lazy-eviction yes
docker exec deeds-redis-prod redis-cli CONFIG SET lazyfree-lazy-expire yes
echo "       ✅ Lazy freeing enabled (non-blocking eviction/expiration)"

# 5. Configure slow log
echo "   5/6: Configuring slow log..."
docker exec deeds-redis-prod redis-cli CONFIG SET slowlog-log-slower-than 10000
docker exec deeds-redis-prod redis-cli CONFIG SET slowlog-max-len 128
echo "       ✅ Slow log enabled (commands >10ms, last 128 entries)"

# 6. Persist config
echo "   6/6: Persisting configuration..."
docker exec deeds-redis-prod redis-cli CONFIG REWRITE
echo "       ✅ Configuration saved to redis.conf"
echo ""

# Verify new settings
echo "✅ Step 4: Verification..."
echo "   New Memory Settings:"
docker exec deeds-redis-prod redis-cli CONFIG GET maxmemory | tail -1 | awk '{printf "   maxmemory: %d MB\n", $1/1024/1024}'
docker exec deeds-redis-prod redis-cli CONFIG GET maxmemory-policy | tail -1 | awk '{print "   policy: " $1}'
echo ""
echo "   Persistence:"
docker exec deeds-redis-prod redis-cli CONFIG GET save | tail -1
echo ""
echo "   Lazy Freeing:"
docker exec deeds-redis-prod redis-cli CONFIG GET lazyfree-lazy-eviction | tail -1 | awk '{print "   eviction: " $1}'
docker exec deeds-redis-prod redis-cli CONFIG GET lazyfree-lazy-expire | tail -1 | awk '{print "   expire: " $1}'
echo ""

echo "╔══════════════════════════════════════════════════════════╗"
echo "║              Optimization Complete!                      ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Next Steps:"
echo "   1. Run load tests: npm run test:load (when implemented)"
echo "   2. Monitor hit rate: watch -n 5 'docker exec deeds-redis-prod redis-cli INFO stats | grep keyspace'"
echo "   3. Check memory usage: watch -n 5 'docker exec deeds-redis-prod redis-cli INFO memory | grep used_memory_human'"
echo "   4. Review slow log: docker exec deeds-redis-prod redis-cli SLOWLOG GET 10"
echo ""
echo "✅ Redis is now optimized for production workloads"