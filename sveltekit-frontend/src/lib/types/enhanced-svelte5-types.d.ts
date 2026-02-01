/**
 * Enhanced Svelte 5 + Tech Stack TypeScript Definitions
 *
 * Comprehensive types for:
 * - Svelte 5 runes (official patterns from svelte.dev)
 * - Drizzle ORM 0.44+
 * - bits-ui components
 * - IndexedDB/Loki.js caching
 * - Redis caching
 * - Docker container integration
 * - SSR-safe patterns
 */

import type { Snippet } from 'svelte';

// ============================================================================
// SVELTE 5 RUNES - Official TypeScript Patterns
// ============================================================================

/**
 * $state - Reactive state with deep proxification
 * @see https://svelte.dev/docs/svelte/$state
 */
export type StateProxy<T> = T;

/**
 * $state.raw - Non-deep reactive state
 * Immutable objects that can only be reassigned, not mutated
 */
export type StateRaw<T> = T;

/**
 * $state.snapshot - Static snapshot of reactive state
 * Removes proxy wrapper for external libraries
 */
export type StateSnapshot<T> = T extends object ? { [K in keyof T]: StateSnapshot<T[K]> } : T;

/**
 * $derived - Computed/derived reactive values
 * @see https://svelte.dev/docs/svelte/$derived
 */
export type DerivedValue<T> = T;

/**
 * $derived.by - Complex derivations with function body
 */
export type DerivedBy<T> = () => T;

/**
 * $effect - Side effects with automatic dependency tracking
 * @see https://svelte.dev/docs/svelte/$effect
 */
export type EffectFn = () => void | (() => void);

/**
 * $effect.pre - Runs before DOM updates
 */
export type EffectPreFn = () => void;

/**
 * $effect.tracking - Check if running in tracking context
 */
export type EffectTracking = () => boolean;

/**
 * $props - Component props with destructuring support
 * @see https://svelte.dev/docs/svelte/$props
 */
export interface PropsRune<T extends Record<string, any>> {
  (): T;
}

/**
 * $bindable - Two-way bindable props
 * @see https://svelte.dev/docs/svelte/$bindable
 */
export type BindableValue<T> = T;

/**
 * $props.id - Generate unique component-scoped IDs (SSR-safe)
 */
export type PropsId = () => string;

// ============================================================================
// DRIZZLE ORM 0.44+ TYPES
// ============================================================================

/**
 * Drizzle ORM v0.44+ - Headless TypeScript ORM
 * @see https://orm.drizzle.team/docs/overview
 */
export namespace DrizzleTypes {
  /**
   * Database connection types
   */
  export interface DatabaseConfig {
    connection: string | {
      host: string;
      port: number;
      database: string;
      user: string;
      password: string;
      ssl?: boolean | { rejectUnauthorized?: boolean };
    };
    pool?: {
      min?: number;
      max?: number;
      idleTimeoutMillis?: number;
    };
  }

  /**
   * Query builder types
   */
  export type SelectQuery<T = any> = {
    from: <U>(table: U) => SelectQuery<U>;
    where: (condition: any) => SelectQuery<T>;
    leftJoin: <U>(table: U, on: any) => SelectQuery<T & U>;
    innerJoin: <U>(table: U, on: any) => SelectQuery<T & U>;
    orderBy: (...fields: any[]) => SelectQuery<T>;
    limit: (count: number) => SelectQuery<T>;
    offset: (count: number) => SelectQuery<T>;
  };

  /**
   * Relational query API
   */
  export type RelationalQuery<T = any> = {
    findMany: (options?: {
      where?: any;
      with?: Record<string, boolean | RelationalQuery>;
      limit?: number;
      offset?: number;
      orderBy?: any;
    }) => Promise<T[]>;
    findFirst: (options?: {
      where?: any;
      with?: Record<string, boolean | RelationalQuery>;
    }) => Promise<T | null>;
  };

  /**
   * Transaction types
   */
  export type Transaction = {
    rollback: () => Promise<void>;
    commit: () => Promise<void>;
  };

  /**
   * Migration types
   */
  export interface MigrationConfig {
    migrationsFolder: string;
    migrationsTable?: string;
  }
}

// ============================================================================
// BITS-UI COMPONENT TYPES (Svelte 5 API)
// ============================================================================

/**
 * bits-ui headless component types
 * Compatible with Svelte 5 runes
 */
export namespace BitsUI {
  /**
   * Common props for all bits-ui components
   */
  export interface BaseComponentProps {
    asChild?: boolean;
    el?: HTMLElement;
  }

  /**
   * Dialog component props
   */
  export interface DialogProps extends BaseComponentProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: Snippet;
  }

  /**
   * Dropdown Menu props
   */
  export interface DropdownMenuProps extends BaseComponentProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: Snippet;
  }

  /**
   * Tooltip props
   */
  export interface TooltipProps extends BaseComponentProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    delayDuration?: number;
    children?: Snippet;
  }

  /**
   * Select props
   */
  export interface SelectProps<T = string> extends BaseComponentProps {
    value?: T;
    onValueChange?: (value: T) => void;
    multiple?: boolean;
    children?: Snippet;
  }

  /**
   * Tabs props
   */
  export interface TabsProps extends BaseComponentProps {
    value?: string;
    onValueChange?: (value: string) => void;
    children?: Snippet;
  }
}

// ============================================================================
// INDEXEDDB TYPES (SSR-Safe)
// ============================================================================

/**
 * IndexedDB wrapper with SSR detection
 */
export namespace IndexedDBTypes {
  export interface Database {
    name: string;
    version: number;
    stores: StoreConfig[];
  }

  export interface StoreConfig {
    name: string;
    keyPath?: string | string[];
    autoIncrement?: boolean;
    indexes?: IndexConfig[];
  }

  export interface IndexConfig {
    name: string;
    keyPath: string | string[];
    unique?: boolean;
    multiEntry?: boolean;
  }

  export interface Transaction<T = any> {
    store: (name: string) => ObjectStore<T>;
    complete: () => Promise<void>;
    abort: () => void;
  }

  export interface ObjectStore<T = any> {
    add: (value: T, key?: IDBValidKey) => Promise<IDBValidKey>;
    put: (value: T, key?: IDBValidKey) => Promise<IDBValidKey>;
    get: (key: IDBValidKey) => Promise<T | undefined>;
    delete: (key: IDBValidKey) => Promise<void>;
    clear: () => Promise<void>;
    getAll: (query?: IDBValidKey | IDBKeyRange, count?: number) => Promise<T[]>;
    getAllKeys: (query?: IDBValidKey | IDBKeyRange, count?: number) => Promise<IDBValidKey[]>;
    count: (query?: IDBValidKey | IDBKeyRange) => Promise<number>;
    openCursor: (query?: IDBValidKey | IDBKeyRange, direction?: IDBCursorDirection) => Promise<IDBCursorWithValue | null>;
  }

  /**
   * SSR-safe wrapper
   */
  export interface SSRSafeDB<T = any> {
    isAvailable: boolean;
    open: () => Promise<IDBDatabase | null>;
    get: (storeName: string, key: IDBValidKey) => Promise<T | undefined>;
    put: (storeName: string, value: T, key?: IDBValidKey) => Promise<IDBValidKey | null>;
    delete: (storeName: string, key: IDBValidKey) => Promise<void>;
    clear: (storeName: string) => Promise<void>;
  }
}

// ============================================================================
// LOKIJS TYPES
// ============================================================================

/**
 * LokiJS in-memory database types
 */
export namespace LokiTypes {
  export interface Database {
    addCollection<T = any>(name: string, options?: CollectionOptions<T>): Collection<T>;
    getCollection<T = any>(name: string): Collection<T> | null;
    removeCollection(name: string): void;
    saveDatabase(callback?: (err?: Error) => void): void;
    loadDatabase(options?: any, callback?: (err?: Error) => void): void;
  }

  export interface CollectionOptions<T = any> {
    unique?: string[];
    indices?: string[];
    disableMeta?: boolean;
    disableChangesApi?: boolean;
    disableDeltaChangesApi?: boolean;
    clone?: boolean;
    transactional?: boolean;
    ttl?: number;
    ttlInterval?: number;
  }

  export interface Collection<T = any> {
    insert(doc: T): T;
    insertMany(docs: T[]): T[];
    findOne(query?: Partial<T> | ((obj: T) => boolean)): T | null;
    find(query?: Partial<T> | ((obj: T) => boolean)): T[];
    findAndUpdate(query: Partial<T> | ((obj: T) => boolean), updateFn: (obj: T) => T): void;
    update(doc: T): T;
    remove(doc: T | T[]): void;
    clear(): void;
    count(query?: Partial<T> | ((obj: T) => boolean)): number;
    chain(): ResultSet<T>;
    addDynamicView(name: string, options?: any): DynamicView<T>;
  }

  export interface ResultSet<T = any> {
    find(query?: Partial<T> | ((obj: T) => boolean)): ResultSet<T>;
    where(fun: (obj: T) => boolean): ResultSet<T>;
    limit(qty: number): ResultSet<T>;
    offset(pos: number): ResultSet<T>;
    sort(compareFn: (a: T, b: T) => number): ResultSet<T>;
    simplesort(property: string, desc?: boolean): ResultSet<T>;
    data(): T[];
    update(updateFn: (obj: T) => T): void;
    remove(): void;
  }

  export interface DynamicView<T = any> {
    applyFind(query: Partial<T> | ((obj: T) => boolean)): DynamicView<T>;
    applyWhere(fun: (obj: T) => boolean): DynamicView<T>;
    applySimpleSort(property: string, desc?: boolean): DynamicView<T>;
    data(): T[];
    removeFilters(): void;
  }
}

// ============================================================================
// REDIS TYPES (Docker Container)
// ============================================================================

/**
 * Redis client types for Docker container
 */
export namespace RedisTypes {
  export interface ConnectionOptions {
    host: string;
    port: number;
    password?: string;
    database?: number;
    username?: string;
    retryStrategy?: (times: number) => number | void;
    reconnectOnError?: (err: Error) => boolean;
  }

  export interface RedisClient {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    isReady: boolean;
    isOpen: boolean;

    // String operations
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, options?: SetOptions) => Promise<string | null>;
    del: (key: string | string[]) => Promise<number>;
    exists: (key: string | string[]) => Promise<number>;
    expire: (key: string, seconds: number) => Promise<boolean>;
    ttl: (key: string) => Promise<number>;

    // Hash operations
    hGet: (key: string, field: string) => Promise<string | undefined>;
    hSet: (key: string, field: string, value: string) => Promise<number>;
    hGetAll: (key: string) => Promise<Record<string, string>>;
    hDel: (key: string, field: string | string[]) => Promise<number>;

    // List operations
    lPush: (key: string, ...values: string[]) => Promise<number>;
    rPush: (key: string, ...values: string[]) => Promise<number>;
    lPop: (key: string) => Promise<string | null>;
    rPop: (key: string) => Promise<string | null>;
    lRange: (key: string, start: number, stop: number) => Promise<string[]>;

    // Set operations
    sAdd: (key: string, ...members: string[]) => Promise<number>;
    sMembers: (key: string) => Promise<string[]>;
    sRem: (key: string, ...members: string[]) => Promise<number>;

    // Sorted set operations
    zAdd: (key: string, score: number, member: string) => Promise<number>;
    zRange: (key: string, start: number, stop: number) => Promise<string[]>;
    zRangeByScore: (key: string, min: number | string, max: number | string) => Promise<string[]>;

    // Pub/Sub
    subscribe: (channel: string, listener: (message: string, channel: string) => void) => Promise<void>;
    unsubscribe: (channel?: string) => Promise<void>;
    publish: (channel: string, message: string) => Promise<number>;
  }

  export interface SetOptions {
    EX?: number; // Expire in seconds
    PX?: number; // Expire in milliseconds
    EXAT?: number; // Expire at Unix timestamp (seconds)
    PXAT?: number; // Expire at Unix timestamp (milliseconds)
    NX?: boolean; // Only set if key doesn't exist
    XX?: boolean; // Only set if key exists
    KEEPTTL?: boolean; // Retain TTL
    GET?: boolean; // Return old value
  }

  /**
   * Cache wrapper with automatic serialization
   */
  export interface CacheWrapper<T = any> {
    get: (key: string) => Promise<T | null>;
    set: (key: string, value: T, ttlSeconds?: number) => Promise<void>;
    delete: (key: string) => Promise<void>;
    exists: (key: string) => Promise<boolean>;
    clear: (pattern?: string) => Promise<void>;
  }
}

// ============================================================================
// DOCKER CONTAINER TYPES
// ============================================================================

/**
 * Docker container management types
 */
export namespace DockerTypes {
  export interface ContainerConfig {
    name: string;
    image: string;
    ports?: Record<string, string | number>; // host:container
    volumes?: string[]; // host:container:mode
    environment?: Record<string, string>;
    command?: string[];
    restart?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
    networks?: string[];
    labels?: Record<string, string>;
  }

  export interface ContainerStatus {
    id: string;
    name: string;
    state: 'running' | 'exited' | 'paused' | 'restarting' | 'dead';
    status: string;
    ports: PortMapping[];
    created: Date;
  }

  export interface PortMapping {
    containerPort: number;
    hostPort: number;
    protocol: 'tcp' | 'udp';
  }

  export interface ServiceHealth {
    healthy: boolean;
    service: string;
    container: string;
    status: ContainerStatus;
    lastCheck: Date;
    error?: string;
  }
}

// ============================================================================
// SSR-SAFE UTILITIES
// ============================================================================

/**
 * SSR-safe browser detection
 */
export const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * SSR-safe environment detection
 */
export interface EnvironmentInfo {
  isBrowser: boolean;
  isServer: boolean;
  hasWebGPU: boolean;
  hasIndexedDB: boolean;
  hasWebWorker: boolean;
  hasServiceWorker: boolean;
}

/**
 * SSR-safe feature detection
 */
export function detectEnvironment(): EnvironmentInfo {
  const isBrowser = typeof window !== 'undefined';

  return {
    isBrowser,
    isServer: !isBrowser,
    hasWebGPU: isBrowser && 'gpu' in navigator,
    hasIndexedDB: isBrowser && 'indexedDB' in window,
    hasWebWorker: isBrowser && 'Worker' in window,
    hasServiceWorker: isBrowser && 'serviceWorker' in navigator,
  };
}

// ============================================================================
// CACHING LAYER TYPES
// ============================================================================

/**
 * Multi-layer caching strategy
 */
export namespace CachingTypes {
  /**
   * Cache layer priorities
   */
  export enum CacheLayer {
    Memory = 'memory',      // In-memory (Loki.js)
    Browser = 'browser',    // IndexedDB
    Server = 'server',      // Redis
    CDN = 'cdn'            // Edge cache
  }

  /**
   * Cache entry metadata
   */
  export interface CacheEntry<T = any> {
    key: string;
    value: T;
    timestamp: number;
    ttl: number;
    layer: CacheLayer;
    hits: number;
    sizeBytes?: number;
  }

  /**
   * Cache strategy configuration
   */
  export interface CacheStrategy {
    layers: CacheLayer[];
    ttl: Partial<Record<CacheLayer, number>>;
    fallback: boolean;
    prefetch: boolean;
    invalidateOnMutation: boolean;
  }

  /**
   * Unified cache interface
   */
  export interface UnifiedCache<T = any> {
    get: (key: string, strategy?: CacheStrategy) => Promise<T | null>;
    set: (key: string, value: T, strategy?: CacheStrategy) => Promise<void>;
    delete: (key: string) => Promise<void>;
    clear: (layer?: CacheLayer) => Promise<void>;
    getStats: () => Promise<CacheStats>;
  }

  export interface CacheStats {
    hits: number;
    misses: number;
    hitRate: number;
    totalEntries: number;
    totalSizeBytes: number;
    layerStats: Partial<Record<CacheLayer, LayerStats>>;
  }

  export interface LayerStats {
    entries: number;
    sizeBytes: number;
    hits: number;
    misses: number;
  }
}

// ============================================================================
// UNO.CSS / UTILITY-FIRST STYLING TYPES
// ============================================================================

/**
 * UnoCSS utility classes and theming
 */
export namespace UnoTypes {
  /**
   * Theme configuration
   */
  export interface ThemeConfig {
    colors?: Record<string, string | Record<string, string>>;
    fontFamily?: Record<string, string | string[]>;
    fontSize?: Record<string, string | [string, { lineHeight?: string; letterSpacing?: string }]>;
    breakpoints?: Record<string, string>;
    spacing?: Record<string, string>;
    borderRadius?: Record<string, string>;
    zIndex?: Record<string, number>;
  }

  /**
   * Dark mode configuration
   */
  export interface DarkModeConfig {
    selector?: string;
    attribute?: string;
    class?: string;
  }

  /**
   * Preflights (CSS resets)
   */
  export type Preflight = {
    getCSS: () => string;
    layer?: string;
  };
}

// ============================================================================
// HIGH-QUALITY UI/UX PATTERNS
// ============================================================================

/**
 * Accessibility props for all interactive components
 */
export interface A11yProps {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-expanded'?: boolean;
  'aria-hidden'?: boolean;
  'aria-disabled'?: boolean;
  'aria-live'?: 'polite' | 'assertive' | 'off';
  'aria-atomic'?: boolean;
  'aria-busy'?: boolean;
  role?: string;
  tabindex?: number;
}

/**
 * Animation/transition props
 */
export interface AnimationProps {
  transition?: string;
  duration?: number;
  delay?: number;
  easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | string;
  animate?: boolean;
}

/**
 * Responsive design breakpoints
 */
export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/**
 * Responsive value type
 */
export type ResponsiveValue<T> = T | Partial<Record<Breakpoint, T>>;

/**
 * Component variant system
 */
export interface VariantProps<V extends Record<string, any> = {}> {
  variant?: keyof V;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
}

// ============================================================================
// GLOBAL AUGMENTATIONS
// ============================================================================

declare global {
  /**
   * Svelte 5 runes available in .svelte files
   */
  function $state<T>(initial: T): T;
  function $state<T>(): T | undefined;

  namespace $state {
    function raw<T>(initial: T): T;
    function snapshot<T>(value: T): StateSnapshot<T>;
    function eager<T>(value: T): T;
  }

  function $derived<T>(expression: T): T;

  namespace $derived {
    function by<T>(fn: () => T): T;
  }

  function $effect(fn: EffectFn): void;

  namespace $effect {
    function pre(fn: () => void): void;
    function tracking(): boolean;
    function root(fn: () => void | (() => void)): () => void;
  }

  function $props<T = any>(): T;

  namespace $props {
    function id(): string;
  }

  function $bindable<T>(value?: T): T;

  function $inspect(...values: any[]): void;

  namespace $inspect {
    function with(fn: (type: 'init' | 'update', ...values: any[]) => void): (...values: any[]) => void;
  }

  function $host(): HTMLElement;
}

export {};
