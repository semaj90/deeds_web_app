export interface RedisService {
    isHealthy(): boolean;
    set(key: string, value: string, ttl?: number): Promise<void>;
    get(key: string): Promise<string | null>;
    keys(pattern: string): Promise<string[]>;
    del(key: string): Promise<void>;
    hgetall(key: string): Promise<Record<string, string>>;
    hincrby(key: string, field: string, increment: number): Promise<void>;
}
