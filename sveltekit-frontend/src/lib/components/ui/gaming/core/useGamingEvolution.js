/**
 * useGamingEvolution Hook
 * Rewritten Session 63: Removed svelte/store derived — plain context access
 */
import { getContext } from 'svelte';

/**
 * @typedef {Object} GamingState
 * @property {string} currentEra
 * @property {boolean} isTransitioning
 * @property {string} performanceLevel
 * @property {Array<string>} availableEras
 */

/**
 * @typedef {Object} GamingConfig
 * @property {boolean} enableAutoEvolution
 * @property {boolean} yorhaIntegration
 * @property {boolean} bitsUICompatibility
 * @property {{ enableScanlines?: boolean }} nesSettings
 * @property {{ enableGradients?: boolean }} snesSettings
 * @property {{ enableAntiAliasing?: boolean }} n64Settings
 */

export function useGamingEvolution() {
	const gamingState = /** @type {any} */ (getContext('gaming-state'));
	const gamingConfig = /** @type {any} */ (getContext('gaming-config'));
	const gamingFunctions =
		/** @type {{ setEra: Function, upgradeEra: Function, downgradeEra: Function, updateConfig: Function }} */ (
			getContext('gaming-functions')
		);
	const getManager = /** @type {(() => any) | null} */ (getContext('gaming-manager'));

	if (!gamingState || !gamingConfig || !gamingFunctions) {
		throw new Error('useGamingEvolution must be used within a ProgressiveGamingProvider');
	}

	/** @param {string} era */
	function getEraCapabilities(era) {
		switch (era) {
			case '8bit':
				return {
					maxColors: 25,
					totalColors: 64,
					resolution: { width: 256, height: 240 },
					audioChannels: 4,
					supportsGradients: false,
					supports3D: false,
					supportsAntiAliasing: false
				};
			case '16bit':
				return {
					maxColors: 256,
					totalColors: 32768,
					resolution: { width: 512, height: 448 },
					audioChannels: 8,
					supportsGradients: true,
					supports3D: false,
					supportsAntiAliasing: false
				};
			case 'n64':
				return {
					maxColors: 16777216,
					totalColors: 16777216,
					resolution: { width: 640, height: 480 },
					audioChannels: 64,
					supportsGradients: true,
					supports3D: true,
					supportsAntiAliasing: true
				};
			default:
				return null;
		}
	}

	/** @param {string} feature */
	function canUseFeature(feature) {
		const manager = getManager?.();
		if (!manager) return false;
		const capabilities = manager.getCapabilities();
		const state = manager.getCurrentState();
		switch (feature) {
			case 'webgl':
				return capabilities?.webgl || false;
			case 'webgpu':
				return capabilities?.webgpu || false;
			case '3d':
				return state.currentEra === 'n64' && (capabilities?.webgl || capabilities?.webgpu);
			case 'gradients':
				return ['16bit', 'n64'].includes(state.currentEra);
			case 'antialiasing':
				return state.currentEra === 'n64' && state.performanceLevel !== 'low';
			case 'particles':
				return state.currentEra === 'n64' && state.performanceLevel === 'high';
			default:
				return false;
		}
	}

	function getOptimalSettings() {
		const manager = getManager?.();
		if (!manager) return null;
		const state = manager.getCurrentState();
		const capabilities = manager.getCapabilities();
		return {
			era: state.currentEra,
			enableEffects: state.performanceLevel !== 'low',
			enableAnimations: state.performanceLevel === 'high',
			enableSounds: capabilities?.gpu !== 'basic',
			pixelPerfect: state.currentEra === '8bit',
			enableScanlines: state.currentEra === '8bit' && state.performanceLevel !== 'low',
			enableGradients: ['16bit', 'n64'].includes(state.currentEra),
			enable3D:
				state.currentEra === 'n64' && (capabilities?.webgl || capabilities?.webgpu),
			enableParticles: state.currentEra === 'n64' && state.performanceLevel === 'high'
		};
	}

	/** @param {Record<string, any>} baseProps */
	function getComponentProps(baseProps = {}) {
		const settings = getOptimalSettings();
		if (!settings) return baseProps;
		return {
			...baseProps,
			era: settings.era,
			pixelPerfect: settings.pixelPerfect,
			enableScanlines: settings.enableScanlines && baseProps.enableScanlines !== false,
			enableCRTEffect: settings.enableEffects && baseProps.enableCRTEffect,
			enableGlitchEffect: settings.enableEffects && baseProps.enableGlitchEffect,
			animationStyle: settings.enableAnimations ? 'smooth' : 'instant',
			enableSound: settings.enableSounds && baseProps.enableSound !== false,
			enableParticles: settings.enableParticles && baseProps.enableParticles
		};
	}

	function getPerformanceMetrics() {
		const manager = getManager?.();
		if (!manager) return null;
		const capabilities = manager.getCapabilities();
		const state = manager.getCurrentState();
		return {
			currentLevel: state.performanceLevel,
			memoryUsage: capabilities?.memory || 0,
			gpuType: capabilities?.gpu || 'unknown',
			webglSupport: capabilities?.webgl || false,
			webgpuSupport: capabilities?.webgpu || false,
			screenSize: capabilities?.screenSize || { width: 0, height: 0 },
			pixelRatio: capabilities?.pixelRatio || 1
		};
	}

	return {
		state: gamingState,
		config: gamingConfig,
		// Functions from provider
		setEra: gamingFunctions.setEra,
		upgradeEra: gamingFunctions.upgradeEra,
		downgradeEra: gamingFunctions.downgradeEra,
		updateConfig: gamingFunctions.updateConfig,
		// Utilities
		getEraCapabilities,
		canUseFeature,
		getOptimalSettings,
		getComponentProps,
		getPerformanceMetrics,
		getManager
	};
}
