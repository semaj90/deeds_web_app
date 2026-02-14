/**
 * Gaming Evolution Manager
 * Handles progressive enhancement
 */
import { N64_TEXTURE_PRESETS } from '../constants/gaming-constants';
import type { GamingEra, GamingThemeState, ProgressiveGamingConfig } from '../types/gaming-types';

export class GamingEvolutionManager {
    private static instance: GamingEvolutionManager | null = null;
    private currentState: GamingThemeState;
    private config: ProgressiveGamingConfig;
    private listeners: Set<(state: GamingThemeState) => void> = new Set();
    private boundHandleDeviceChange: () => void;

    private constructor(config: Partial<ProgressiveGamingConfig> = {}) {
        this.config = {
            defaultEra: '8bit',
            enableAutoEvolution: true,
            performanceThreshold: 16.67,
            retroShaders: true,
            ...config
        } as ProgressiveGamingConfig;

        const initialEra = this.config.defaultEra || '8bit';

        this.currentState = {
            era: initialEra,
            currentEra: initialEra,
            availableEras: ['8bit', '16bit', 'n64'],
            isTransitioning: false,
            transitionDuration: 300,
            performanceLevel: 'medium',
            soundEnabled: true,
            particleEffects: true,
            retroShaders: true
        } as unknown as GamingThemeState;

        this.boundHandleDeviceChange = this.handleDeviceChange.bind(this);
        if (typeof window !== 'undefined') {
            this.initialize();
        }
    }

    public static getInstance(config?: Partial<ProgressiveGamingConfig>): GamingEvolutionManager {
        if (!GamingEvolutionManager.instance) {
            GamingEvolutionManager.instance = new GamingEvolutionManager(config);
        }
        return GamingEvolutionManager.instance;
    }

    private initialize() {
        if (typeof window === 'undefined') return;
        window.addEventListener('resize', this.boundHandleDeviceChange);
    }

    private handleDeviceChange() {
        // checks
    }

    public subscribe(callback: (state: GamingThemeState) => void): () => void {
        this.listeners.add(callback);
        callback(this.currentState);
        return () => {
            this.listeners.delete(callback);
        };
    }

    private notifyListeners() {
        this.listeners.forEach(cb => cb(this.currentState));
    }

    public dispose() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', this.boundHandleDeviceChange);
        }
        this.listeners.clear();
    }
}
