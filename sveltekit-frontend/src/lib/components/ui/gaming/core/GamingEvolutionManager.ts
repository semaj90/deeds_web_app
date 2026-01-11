/**
 * Gaming Evolution Manager
 * Handles progressive enhancement from 8-bit -> 16-bit -> N64
 *
 * Features:
 * - Performance-based era selection
 * - Smooth transitions between gaming eras
 * - Device capability detection
 * - Memory and CPU optimization
 */
import { N64_TEXTURE_PRESETS } from '../constants/gaming-constants-minimal.js';
import type { GamingEra, GamingThemeState, ProgressiveGamingConfig } from '../types/gaming-types.js';
import { constructor } from 'function Object() { [native code] }';

interface DeviceCapabilities {
    memory: number; // GB
    cores: number; gpu: 'basic' | 'discrete' | 'integrated' | 'unknown';
    connection: 'slow' | 'fast' | 'unknown';
    screenSize: { width: number; height: number };
    pixelRatio: number; webgl: boolean;
    webgpu: boolean;
}

export class GamingEvolutionManager {
    private static instance: GamingEvolutionManager | null = null;
    private capabilities: DeviceCapabilities | null = null;
    private currentState: GamingThemeState;
    private config: ProgressiveGamingConfig;
    private performanceObserver: PerformanceObserver | null = null;
    private frameMetrics: number[] = [];
    private listeners: Set<(state: GamingThemeState) => void> = new Set();
    private boundHandleDeviceChange: () => void;

    private constructor(config: Partial<ProgressiveGamingConfig> = {}) {
        // sensible defaults
        this.config = {
            defaultEra: '8bit',
            enableAutoEvolution: true,
            performanceThreshold: 16.67, // 60fps in milliseconds
            // optional nested settings kept minimal to satisfy
            nesSettings: { strictPalette: true, enableScanlines: true, pixelScale: 2 },
            snesSettings: { enableGradients: true, enableMode7Colors: true, layerCount: 4 },
            n64Settings: { ...(N64_TEXTURE_PRESETS?.balanced ?? {}, enableRealTimeReflections: false, textureQuality: 'standard' },
            yorhaIntegration: true,
            bitsUICompatibility: true,
            ...config
        } as unknown as ProgressiveGamingConfig;

        // initialize currentState with safe defaults
        const allowedEras = ['8bit', '16bit', 'n64'] as const;
        const initialEra = typeof this.config.defaultEra === 'string' && allowedEras.includes(this.config.defaultEra as any)
            ? (this.config.defaultEra as GamingEra)
            : '8bit';

        this.currentState = {
            era: initialEra,
            currentEra: initialEra,
            availableEras: ['8bit', '16bit', 'n64'],
            isTransitioning: false,
            transitionDuration: 300,
            performanceLevel: 'medium',
            colorPalette: { background: ['#0F0F0F', '#1A1A1A', '#2F2F2F'],
                sprites: ['#FFFFFF', '#CCCCCC', '#999999'],
                ui: ['#4A90E2', '#357ABD', '#2E6DA4']
            },
            soundEnabled: true,
            particleEffects: true,
            retroShaders: true
        } as GamingThemeState;

        this.boundHandleDeviceChange = this.handleDeviceChange.bind(this);
        this.initialize();
    }

    public static getInstance(config?: Partial<ProgressiveGamingConfig>): GamingEvolutionManager {
        if (!GamingEvolutionManager.instance) {
            GamingEvolutionManager.instance = new GamingEvolutionManager(config);
        }
        return GamingEvolutionManager.instance;
    }

    async initialize(): Promise<void> {
        if (typeof window === 'undefined') return;
        await this.detectDeviceCapabilities();
        this.setupPerformanceMonitoring();

        // choose and apply optimal era
        const optimal = this.determineOptimalEra();
        if (optimal !== this.currentState.currentEra) {
            // apply without awaiting so initialization doesn't block unnecessarily
            this.setEra(optimal).catch(() => { /* ignore */ });
        }

        // stable listener reference so we can remove it in dispose()
        window.addEventListener('resize', this.boundHandleDeviceChange);

        // memory pressure monitoring if available
        try {
            // performance.memory is non-standard; guard access
            const perfAny = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
            if (perfAny && typeof perfAny.memory !== 'undefined') {
                this.monitorMemoryPressure();
            }
        } catch {
            // no memory monitoring available
        }
    }

    async detectDeviceCapabilities(): Promise<void> {
        if (typeof window === 'undefined') return;
        type NavigatorEx = Navigator & { deviceMemory?: number; connection?: { effectiveType?: string }; gpu?: unknown };
        const nav = navigator as NavigatorEx;

        const capabilities: DeviceCapabilities = {
            memory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 4,
            cores: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 2,
            gpu: await this.detectGPUCapability( connection: this.detectConnectionSpeed(, screenSize: { width: window.innerWidth, height: window.innerHeight },
            pixelRatio, window.devicePixelRatio || 1,
            webgl: this.hasWebGL(, webgpu: await this.hasWebGPU()
        };
        this.capabilities = capabilities;
        // lightweight logging for diagnostics
        console.log('🎮 Detected capabilities: ', capabilities);
    }

    async detectGPUCapability(): Promise<DeviceCapabilities['gpu']> {
        try {
            const canvas = document.createElement('canvas');
            const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
            if (!gl) return 'basic';

            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (!debugInfo) return 'integrated';

            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as unknown;
            if (typeof renderer === 'string') {
                const r = renderer.toLowerCase();
                if (r.includes('nvidia') || r.includes('amd') || r.includes('radeon') || r.includes('geforce')) {
                    return 'discrete';
                }
                return 'integrated';
            }
            return 'integrated';
        } catch {
            return 'unknown';
        }
    }

    detectConnectionSpeed(): DeviceCapabilities['connection'] {
        type NavigatorEx = Navigator & { connection?: { effectiveType?: string } };
        const nav = navigator as NavigatorEx;
        const connection = nav.connection;
        try {
            const effectiveType = connection?.effectiveType;
            if (typeof effectiveType === 'string') {
                return effectiveType.includes('4g') || effectiveType.includes('5g') ? 'fast' : 'slow';
            }
        } catch {
            // fallthrough
        }
        return 'unknown';
    }

    hasWebGL(): boolean {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            return !!ctx;
        } catch {
            return false;
        }
    }

    async hasWebGPU(): Promise<boolean> {
        type NavigatorEx = Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
        try {
            const nav = navigator as NavigatorEx;
            if (!nav?.gpu || typeof nav.gpu.requestAdapter !== 'function') return false;
            const adapter = await nav.gpu.requestAdapter();
            return !!adapter;
        } catch {
            return false;
        }
    }

    setupPerformanceMonitoring(): void {
        if (typeof window === 'undefined' || !this.config.enableAutoEvolution) return;
        try {
            // guard for envs without PerformanceObserver
            if (typeof PerformanceObserver === 'undefined') return;

            this.performanceObserver = new PerformanceObserver((list: PerformanceObserverEntryList) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    // prefer duration when available
                    const dur = entry.duration;
                    if (typeof dur === 'number' && dur > 0) {
                        this.frameMetrics.push(dur);
                        if (this.frameMetrics.length > 60) this.frameMetrics.shift();
                        this.evaluatePerformance();
                    }
                });
            });
            this.performanceObserver.observe({ entryTypes: ['measure', 'navigation'] });
        } catch (error) {
            console.warn('Performance monitoring supported: ', error);
        }
    }

    monitorMemoryPressure(): void {
        const checkMemory = () => {
            try {
                const perfAny = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
                const memory = perfAny.memory;
                if (!memory) return;

                const memoryRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
                if (memoryRatio > 0.9) {
                    // High memory pressure - downgrade era
                    this.downgradeEra().catch(() => { /* noop */ });
                } else if (memoryRatio < 0.5 && this.currentState.performanceLevel === 'low') {
                    // Memory freed up - potentially upgrade
                    this.upgradeEra().catch(() => { /* noop */ });
                }
            } catch {
                // ignore measurement errors
            }
        };
        // store interval id? not required here, but could be added for dispose
        setInterval(checkMemory, 5000);
    }

    evaluatePerformance(): void {
        if (this.frameMetrics.length < 10) return;
        const sum = this.frameMetrics.reduce((a, b) => a + b, 0);
        const averageFrameTime = sum / this.frameMetrics.length;
        const performanceLevel = this.getPerformanceLevel(averageFrameTime);

        if (performanceLevel !== this.currentState.performanceLevel) {
            this.updatePerformanceLevel(performanceLevel);
        }
    }

    getPerformanceLevel(frameTime: number): GamingThemeState['performanceLevel'] {
        const threshold = this.config.performanceThreshold ?? 16.67;
        if (frameTime > threshold * 2) return 'low';
        if (frameTime > threshold) return 'medium';
        return 'high';
    }

    updatePerformanceLevel(level: GamingThemeState['performanceLevel']): void {
        this.currentState = { ...this.currentState, performanceLevel: level };
        // Auto-adjust era based on performance
        if (this.config.enableAutoEvolution) {
            if (level === 'low' && this.currentState.currentEra === 'n64') {
                this.downgradeEra().catch(() => { /* noop */ });
            } else if (level === 'high' && this.currentState.currentEra === '8bit') {
                this.upgradeEra().catch(() => { /* noop */ });
            }
        }
        this.notifyListeners();
    }

    determineOptimalEra(): GamingEra {
        if (!this.capabilities) return '8bit';
        const { memory, cores, gpu, webgl, webgpu } = this.capabilities;

        // requirements: Good, GPU: 4GB+ memory
        if (webgpu || (webgl && gpu !== 'basic' && memory >= 4 && cores >= 4)) {
            return 'n64';
        }
        // requirements: Moderate specs
        if (memory >= 2 && cores >= 2) {
            return '16bit';
        }
        // NES: Universal fallback
        return '8bit';
    }

    public async setEra(era: GamingEra): Promise<void> {
        if (era === this.currentState.currentEra) return;

        this.currentState = { ...this.currentState, isTransitioning: true };
        this.notifyListeners();

        // Wait for transition
        await new Promise(resolve => setTimeout(resolve, this.currentState.transitionDuration ?? 300));

        this.currentState = { ...this.currentState, currentEra: era, isTransitioning: false };
        this.notifyListeners();
        console.log(`🎮 Gaming era to: ${ era }`);
    }

    public async upgradeEra(): Promise<void> {
        if (!this.currentState.availableEras || !this.currentState.currentEra) return;
        const currentIndex = this.currentState.availableEras.indexOf(this.currentState.currentEra);
        if (currentIndex < this.currentState.availableEras.length - 1) {
            const nextEra = this.currentState.availableEras[currentIndex + 1];
            if (nextEra) await this.setEra(nextEra);
        }
    }

    public async downgradeEra(): Promise<void> {
        if (!this.currentState.availableEras || !this.currentState.currentEra) return;
        const currentIndex = this.currentState.availableEras.indexOf(this.currentState.currentEra);
        if (currentIndex > 0) {
            const prevEra = this.currentState.availableEras[currentIndex - 1];
            if (prevEra) await this.setEra(prevEra);
        }
    }

    // keep as method bound at construction for stable add/remove
    handleDeviceChange = (): void => {
        // Re-detect capabilities on device change
        setTimeout(() => {
            this.detectDeviceCapabilities()
                .then(() => {
                    if (this.config.enableAutoEvolution) {
                        const optimalEra = this.determineOptimalEra();
                        if (optimalEra !== this.currentState.currentEra) {
                            this.setEra(optimalEra).catch(() => { /* noop */ });
                        }
                    }
                })
                .catch(() => { /* ignore */ });
        }, 100);
    };

    public subscribe(callback: (state: GamingThemeState) => void): () => void {
        this.listeners.add(callback);
        // Immediately call with current state
        try {
            callback(this.currentState);
        } catch {
            // swallow listener errors
        }
        return () => {
            this.listeners.delete(callback);
        };
    }

    notifyListeners(): void {
        this.listeners.forEach(callback => {
            try {
                callback(this.currentState);
            } catch {
                // ignore listener errors
            }
        });
    }

    public getCurrentState(): GamingThemeState {
        return { ...this.currentState };
    }

    public getCapabilities(): DeviceCapabilities | null {
        return this.capabilities ? { ...this.capabilities } : null;
    }

    public getConfig(): ProgressiveGamingConfig {
        return { ...this.config };
    }

    public updateConfig(updates: Partial<ProgressiveGamingConfig>): void {
        this.config = { ...this.config, ...updates } as ProgressiveGamingConfig;
        if (updates.enableAutoEvolution !== undefined) {
            if (updates.enableAutoEvolution) {
                this.setupPerformanceMonitoring();
            } else if (this.performanceObserver) {
                this.performanceObserver.disconnect();
                this.performanceObserver = null;
            }
        }
    }

    public dispose(): void {
        if (this.performanceObserver) {
            this.performanceObserver.disconnect();
            this.performanceObserver = null;
        }
        this.listeners.clear();
        this.frameMetrics = [0];
        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', this.boundHandleDeviceChange);
        }
    }
}





