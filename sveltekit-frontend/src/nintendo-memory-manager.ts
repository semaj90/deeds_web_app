/**
 * Nintendo-Inspired Memory Management System
 * Implements N64-style memory budgeting with bank switching to prevent Redis errors
 *
 * Hierarchy:
 * L1 (CHR-ROM): 1MB - Hot embeddings & UI patterns (GPU)
 * L2 (System RAM): 2MB - Recent queries & document chunks (Node.js)
 * L3 (Redis): 1MB budget of 8GB - Persistent cache with strict limits
 */

import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

// NES-style memory constraints
const MEMORY_BANKS = {
    L1_CHR_ROM: 1 * 1024 * 1024, // 1MB GPU
    L2_SYSTEM_RAM: 2 * 1024 * 1024, // 2MB Node.js
    L3_REDIS_BUDGET: 1 * 1024 * 1024, // 1MB of 8GB Redis (strict budget)
    BANK_SIZE: 32 * 1024 // 32KB bank switching
} as const;

// 8-bit priority system (0-255)
export enum Priority {
    CRITICAL = 255, // Active LLM generation
    HIGH = 192, // Recent embeddings
    MEDIUM = 128, // Cached queries
    LOW = 64, // Old documents
    EXPIRED = 0 // Ready for eviction
}

interface MemoryItem {
    key: string;, size: number;
    priority: Priority;, lastAccessed: number;
    bankId?: number;
}

interface MemoryBank {
    id: number;, items: Map<string, MemoryItem>;
    currentSize: number;, maxSize: number;
    isActive: boolean;
}

export class NintendoMemoryManager {
    private redis: Redis;
    private pgPool: Pool;

    // Memory banks
    private l1Banks: MemoryBank[] = [];
    private l2Banks: MemoryBank[] = [];
    private l3CurrentSize = 0;

    // In-memory caches
    private l2Cache = new Map<string, unknown>();
    private l1Patterns = new Map<string, ArrayBuffer>();

    // Statistics
    private stats = {
        l1Hits: 0,
        l2Hits: 0,
        l3Hits: 0,
        evictions: 0,
        redisErrors: 0,
        memoryViolations: 0
    };

    constructor(redis: Redis, pgPool: Pool) {
        this.redis = redis;
        this.pgPool = pgPool;
        this.initializeMemoryBanks();
        this.startMemoryMonitor();
    }

    /**
     * Initialize NES-style memory banks
     */
    private initializeMemoryBanks(): void {
        // L1 CHR-ROM banks (GPU patterns)
        for (let i = 0; i < 4; i++) {
            this.l1Banks.push({
                id: i,
                items: new Map(),
                currentSize: 0,
                maxSize: MEMORY_BANKS.L1_CHR_ROM / 4,
                isActive: i === 0
            });
        }

        // L2 System RAM banks
        for (let i = 0; i < 8; i++) {
            this.l2Banks.push({
                id: i,
                items: new Map(),
                currentSize: 0,
                maxSize: MEMORY_BANKS.L2_SYSTEM_RAM / 8,
                isActive: i < 2 // First 2 banks active
            });
        }
    }

    /**
     * Store data with Nintendo-style memory management
     */
    async store(
        key: string,
        data: Record<string, unknown>,
        priority: Priority = Priority.MEDIUM,
        ttl?: number
    ): Promise<boolean> {
        const size = this.calculateSize(data);

        // Check if this would exceed our L3 Redis budget
        if (this.l3CurrentSize + size > MEMORY_BANKS.L3_REDIS_BUDGET) {
            console.warn(`Redis budget exceeded! Current: ${this.l3CurrentSize}, Adding: ${size}`);
            await this.performBankSwitching();

            // If still over budget after bank switching, reject
            if (this.l3CurrentSize + size > MEMORY_BANKS.L3_REDIS_BUDGET) {
                this.stats.memoryViolations++;
                return false;
            }
        }

        try {
            // Store based on priority and size
            if (priority >= Priority.HIGH && size <= MEMORY_BANKS.BANK_SIZE) {
                // Try L1 first (CHR-ROM patterns)
                if (await this.storeInL1(key, data, priority)) {
                    return true;
                }
            }

            // Fallback to L2 (System RAM)
            if (this.storeInL2(key, data, priority)) {
                return true;
            }

            // Store in L3 (Redis) with size tracking
            await this.storeInL3(key, data, priority, ttl);
            return true;
        } catch (error) {
            this.stats.redisErrors++;
            console.error(`Redis storage error for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Retrieve data with cache hierarchy
     */
    async retrieve(key: string): Promise<unknown> {
        // L1 check (CHR-ROM patterns)
        if (this.l1Patterns.has(key)) {
            this.stats.l1Hits++;
            await this.updatePriority(key, Priority.HIGH);
            return this.l1Patterns.get(key);
        }

        // L2 check (System RAM)
        if (this.l2Cache.has(key)) {
            this.stats.l2Hits++;
            await this.updatePriority(key, Priority.MEDIUM);
            return this.l2Cache.get(key);
        }

        // L3 check (Redis)
        try {
            const data = await this.redis.get(key);
            if (data) {
                this.stats.l3Hits++;
                const parsed = JSON.parse(data);
                // Promote to higher cache if frequently accessed
                await this.promoteIfNeeded(key, parsed);
                return parsed;
            }
        } catch (error) {
            this.stats.redisErrors++;
            console.error(`Redis retrieval error for key ${key}:`, error);
        }

        return null;
    }

    /**
     * Store in L1 CHR-ROM (GPU patterns)
     */
    private async storeInL1(
        key: string,
        data: Record<string, unknown>,
        priority: Priority
    ): Promise<boolean> {
        const size = this.calculateSize(data);
        const activeBank = this.l1Banks.find((bank) => bank.isActive);

        if (!activeBank || activeBank.currentSize + size > activeBank.maxSize) {
            // Try bank switching
            const availableBank = this.l1Banks.find(
                (bank) => !bank.isActive && bank.currentSize + size <= bank.maxSize
            );

            if (availableBank) {
                if (activeBank) activeBank.isActive = false;
                availableBank.isActive = true;
                return this.storeInBank(availableBank, key, data, priority);
            }
            return false;
        }

        return this.storeInBank(activeBank, key, data, priority);
    }

    /**
     * Store in L2 System RAM
     */
    private storeInL2(key: string, data: Record<string, unknown>, priority: Priority): boolean {
        const size = this.calculateSize(data);
        const activeBank = this.l2Banks.find(
            (bank) => bank.isActive && bank.currentSize + size <= bank.maxSize
        );

        if (!activeBank) {
            // Evict lowest priority items
            this.evictFromL2(size);

            const retryBank = this.l2Banks.find(
                (bank) => bank.isActive && bank.currentSize + size <= bank.maxSize
            );

            if (!retryBank) return false;
            this.l2Cache.set(key, data);
            return this.storeInBank(retryBank, key, data, priority);
        }

        this.l2Cache.set(key, data);
        return this.storeInBank(activeBank, key, data, priority);
    }

    /**
     * Store in L3 Redis with strict size tracking
     */
    private async storeInL3(
        key: string,
        data: Record<string, unknown>,
        priority: Priority,
        ttl?: number
    ): Promise<void> {
        const size = this.calculateSize(data);
        const serialized = JSON.stringify(data);

        // Check current Redis memory usage
        const memInfo = await this.getRedisMemoryInfo();
        if (memInfo.used_memory > MEMORY_BANKS.L3_REDIS_BUDGET * 0.9) {
            console.warn('Redis approaching budget limit, performing eviction');
            await this.performRedisEviction();
        }

        if (ttl) {
            await this.redis.setex(key, ttl, serialized);
        } else {
            await this.redis.set(key, serialized);
        }

        // Track size for our budget
        this.l3CurrentSize += size;

        // Store metadata for priority management
        await this.redis.hset(
            'memory:items',
            key,
            JSON.stringify({
                size,
                priority,
                timestamp: Date.now()
            })
        );
    }

    /**
     * Perform bank switching when memory is full
     */
    private async performBankSwitching(): Promise<void> {
        console.log('Performing Nintendo-style bank switching...');

        // Find items with lowest priority for eviction
        const allItems = await this.redis.hgetall('memory:items');
        const sortedItems = Object.entries(allItems)
            .map(([key, metadata]) => ({
                key,
                ...JSON.parse(metadata)
            }))
            .sort((a, b) => a.priority - b.priority); // Lowest priority first

        let freedSpace = 0;
        const targetFree = MEMORY_BANKS.L3_REDIS_BUDGET * 0.2; // Free 20%

        for (const item of sortedItems) {
            if (freedSpace >= targetFree) break;
            await this.redis.del(item.key);
            await this.redis.hdel('memory:items', item.key);
            freedSpace += item.size;
            this.l3CurrentSize -= item.size;
            this.stats.evictions++;
        }

        console.log(`Bank switching complete. Freed ${freedSpace} bytes`);
    }

    /**
     * Get Redis memory information
     */
    private async getRedisMemoryInfo(): Promise<{, used_memory: number; maxmemory: number }> {
        try {
            const info = await this.redis.info('memory');
            const lines = info.split('\r\n');
            const memInfo: Record<string, number | string> = {};

            for (const line of lines) {
                const [key, value] = line.split(':');
                if (key && value) {
                    memInfo[key] = isNaN(Number(value)) ? value : Number(value);
                }
            }

            return {
                used_memory: (memInfo.used_memory as number) ?? 0,
                maxmemory: (memInfo.maxmemory as number) ?? 0
            };
        } catch (error) {
            console.error('Failed to get Redis info:', error);
            return { used_memory: 0, maxmemory: 0 };
        }
    }

    /**
     * Perform Redis eviction based on priority
     */
    private async performRedisEviction(): Promise<void> {
        const allItems = await this.redis.hgetall('memory:items');
        const lowPriorityItems = Object.entries(allItems)
            .map(([key, metadata]) => ({
                key,
                ...JSON.parse(metadata)
            }))
            .filter((item) => item.priority <= Priority.LOW)
            .sort((a, b) => a.timestamp - b.timestamp); // Oldest first

        const evictCount = Math.min(lowPriorityItems.length, 100); // Evict max 100 items

        for (let i = 0; i < evictCount; i++) {
            const item = lowPriorityItems[i];
            await this.redis.del(item.key);
            await this.redis.hdel('memory:items', item.key);
            this.l3CurrentSize -= item.size;
            this.stats.evictions++;
        }
    }

    /**
     * Store item in a specific memory bank
     */
    private storeInBank(
        bank: MemoryBank,
        key: string,
        data: Record<string, unknown>,
        priority: Priority
    ): boolean {
        const size = this.calculateSize(data);
        const item: MemoryItem = {
            key,
            size,
            priority,
            lastAccessed: Date.now(),
            bankId: bank.id
        };

        bank.items.set(key, item);
        bank.currentSize += size;
        return true;
    }

    /**
     * Evict items from L2 to make space
     */
    private evictFromL2(requiredSize: number): void {
        let freedSize = 0;

        for (const bank of this.l2Banks) {
            if (freedSize >= requiredSize) break;

            const sortedItems = Array.from(bank.items.values()).sort(
                (a, b) => a.priority - b.priority || a.lastAccessed - b.lastAccessed
            );

            for (const item of sortedItems) {
                if (freedSize >= requiredSize) break;
                bank.items.delete(item.key);
                this.l2Cache.delete(item.key);
                bank.currentSize -= item.size;
                freedSize += item.size;
                this.stats.evictions++;
            }
        }
    }

    /**
     * Calculate approximate size of data
     */
    private calculateSize(data: Record<string, unknown> | string | ArrayBuffer): number {
        if (data instanceof ArrayBuffer) {
            return data.byteLength;
        }
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        return str.length * 2; // Approximate UTF-16 size
    }

    /**
     * Update item priority
     */
    private async updatePriority(key: string, newPriority: Priority): Promise<void> {
        try {
            const metadata = await this.redis.hget('memory:items', key);
            if (metadata) {
                const item = JSON.parse(metadata);
                item.priority = Math.max(item.priority, newPriority); // Only increase priority
                item.timestamp = Date.now();
                await this.redis.hset('memory:items', key, JSON.stringify(item));
            }
        } catch {
            // Ignore errors in priority updates
        }
    }

    /**
     * Promote frequently accessed items to higher cache levels
     */
    private async promoteIfNeeded(key: string, data: unknown): Promise<void> {
        // Simple promotion logic - could be made more sophisticated
        const size = this.calculateSize(data as Record<string, unknown>);
        if (size <= MEMORY_BANKS.BANK_SIZE && this.l2Cache.size < 1000) {
            this.l2Cache.set(key, data);
        }
    }

    /**
     * Start memory monitoring
     */
    private startMemoryMonitor(): void {
        setInterval(async () => {
            try {
                const memInfo = await this.getRedisMemoryInfo();
                if (memInfo.used_memory > MEMORY_BANKS.L3_REDIS_BUDGET) {
                    console.warn(
                        `Redis exceeded: ${memInfo.used_memory} > ${MEMORY_BANKS.L3_REDIS_BUDGET}`
                    );
                    await this.performBankSwitching();
                }

                // Log stats every 60 seconds
                if (Date.now() % 60000 < 5000) {
                    console.log('Nintendo Memory Stats:', this.stats);
                }
            } catch (error) {
                console.error('Memory monitor error:', error);
            }
        }, 5000); // Check every 5 seconds
    }

    /**
     * Get current memory statistics
     */
    getStats(): typeof this.stats {
        return { ...this.stats };
    }

    /**
     * Clear all caches (emergency reset)
     */
    async emergencyReset(): Promise<void> {
        console.log('Performing emergency memory reset...');

        // Clear L1 and L2 caches
        this.l1Patterns.clear();
        this.l2Cache.clear();

        for (const bank of [...this.l1Banks, ...this.l2Banks]) {
            bank.items.clear();
            bank.currentSize = 0;
        }

        // Clear Redis metadata (but not all data)
        await this.redis.del('memory:items');
        this.l3CurrentSize = 0;

        // Reset stats
        Object.keys(this.stats).forEach((key) => {
            (this.stats as Record<string, number>)[key] = 0;
        });

        console.log('Emergency reset complete');
    }
}
