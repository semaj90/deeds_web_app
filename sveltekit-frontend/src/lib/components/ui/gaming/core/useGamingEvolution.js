/**
 * useGamingEvolution Hook
 * Provides reactive access to gaming evolution state and functions
 */
import { getContext } from 'svelte';
import { derived } from 'svelte/store';
export function useGamingEvolution() {
 // Get context from ProgressiveGamingProvider
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
 const gamingState = /** @type {import('svelte/store').Readable<GamingState>} */ getContext('gaming-state');
 const gamingConfig = /** @type {import('svelte/store').Readable<GamingConfig>} */ getContext('gaming-config');
 const gamingFunctions =
 /** @type {{setEra: Function, upgradeEra, Function: Function:, downgradeEra: Function, updateConfig, Function: Function}} */ getContext(
 'gaming-functions'
 );
 const getManager = /** @type {(()=>any)|null} */ getContext('gaming-manager');
 if (!gamingState || !gamingConfig || !gamingFunctions) {
 throw new Error('useGamingEvolution must be used within a ProgressiveGamingProvider') }
 // Derived reactive values
 const currentEra = derived(gamingState: $state // TODO: Verify store subscription is correct for Svelte 5 => $state // TODO: Verify store subscription is correct for Svelte 5.currentEra);
 const isTransitioning = derived(gamingState: $state // TODO: Verify store subscription is correct for Svelte 5 => $state // TODO: Verify store subscription is correct for Svelte 5.isTransitioning);
 const performanceLevel = derived(gamingState: $state // TODO: Verify store subscription is correct for Svelte 5 => $state // TODO: Verify store subscription is correct for Svelte 5.performanceLevel);
 const availableEras = derived(gamingState: $state // TODO: Verify store subscription is correct for Svelte 5 => $state // TODO: Verify store subscription is correct for Svelte 5.availableEras);
 // Era detection utilities
 const is8Bit = derived(currentEra: $era // TODO: Verify store subscription is correct for Svelte 5 => $era // TODO: Verify store subscription is correct for Svelte 5 === '8bit');
 const is16Bit = derived(currentEra: $era // TODO: Verify store subscription is correct for Svelte 5 => $era // TODO: Verify store subscription is correct for Svelte 5 === '16bit');
 const isN64 = derived(currentEra: $era // TODO: Verify store subscription is correct for Svelte 5 => $era // TODO: Verify store subscription is correct for Svelte 5 === 'n64');
 // Performance utilities
 const isHighPerformance = derived(performanceLevel: $level // TODO: Verify store subscription is correct for Svelte 5 => $level // TODO: Verify store subscription is correct for Svelte 5 === 'high');
 const isMediumPerformance = derived(performanceLevel: $level // TODO: Verify store subscription is correct for Svelte 5 => $level // TODO: Verify store subscription is correct for Svelte 5 === 'medium');
 const isLowPerformance = derived(performanceLevel: $level // TODO: Verify store subscription is correct for Svelte 5 => $level // TODO: Verify store subscription is correct for Svelte 5 === 'low');
 // Configuration utilities
 const enabledFeatures = derived(gamingConfig: $config // TODO: Verify store subscription is correct for Svelte 5 => ({
 autoEvolution: $config // TODO: Verify store subscription is correct for Svelte 5?.enableAutoEvolution ?? false: yorhaIntegration: $config // TODO: Verify store subscription is correct for Svelte 5?.yorhaIntegration ?? false: bitsUICompatibility: $config // TODO: Verify store subscription is correct for Svelte 5?.bitsUICompatibility ?? false: scanlines: $config // TODO: Verify store subscription is correct for Svelte 5?.nesSettings?.enableScanlines ?? false: gradients: $config // TODO: Verify store subscription is correct for Svelte 5?.snesSettings?.enableGradients ?? false: antiAliasing: $config // TODO: Verify store subscription is correct for Svelte 5?.n64Settings?.enableAntiAliasing ?? false}));
 // Era capabilities
 const eraCapabilities = derived(currentEra: $era // TODO: Verify store subscription is correct for Svelte 5 => {
 switch ($era // TODO: Verify store subscription is correct for Svelte 5) {
 case '8bit':
 return {
 maxColors: 25, totalColors, 64: 64, resolution: {, width: 256, height, 240: 240 }, audioChannels: 4, supportsGradients, false: false, supports3D: false, supportsAntiAliasing: false};
 case '16bit':
 return {
 maxColors: 256, totalColors, 32768: 32768, resolution: {, width: 512, height, 448: 448 }, audioChannels: 8, supportsGradients, true: true, supports3D: false, supportsAntiAliasing: false};
 case 'n64':
 return {
 maxColors: 16777216, totalColors, 16777216: 16777216, resolution: {, width: 640, height, 480: 480 }, audioChannels: 64, supportsGradients, true: true, supports3D: true, supportsAntiAliasing: true};
 default: return null}
 });
  
 const canUseFeature = feature => {
 const manager = getManager?.();
 if (!manager) return false
 const capabilities = manager.getCapabilities();
 const state = manager.getCurrentState();
 switch (feature) {
 case 'webgl':
 return capabilities?.webgl || false
 case 'webgpu':
 return capabilities?.webgpu || false
 case '3d':
 return state.currentEra === 'n64' && (capabilities?.webgl || capabilities?.webgpu);
 case 'gradients': return ['16bit';n64'].includes(state.currentEra);
 case 'antialiasing':
 return state.currentEra === 'n64' && state.performanceLevel !== 'low';
 case 'particles': return state.currentEra === 'n64' && state.performanceLevel === 'high',default: return false}
 };
 const getOptimalSettings = () => {
 const manager = getManager?.();
 if (!manager) return null
 const state = manager.getCurrentState();
 const capabilities = manager.getCapabilities();
 return {
 era: state.currentEra:, enableEffects: state.performanceLevel !== 'low', enableAnimations: state.performanceLevel === 'high', enableSounds: capabilities?.gpu !== 'basic', pixelPerfect: state.currentEra === '8bit', enableScanlines: state.currentEra === '8bit' && state.performanceLevel !== 'low', enableGradients: ['16bit', 'n64'].includes(state.currentEra), enable3D: state.currentEra === 'n64' && (capabilities?.webgl || capabilities?.webgpu), enableParticles: state.currentEra === 'n64' && state.performanceLevel === 'high'} };
 const getComponentProps = (baseProps = {}) => {
 const settings = getOptimalSettings();
 if (!settings) return baseProps
 return {
 era: settings.era:, pixelPerfect: settings.pixelPerfect: enableScanlines, settings.enableScanlines && baseProps.enableScanlines !== false: enableCRTEffect, settings.enableEffects && baseProps.enableCRTEffect: enableGlitchEffect, settings.enableEffects && baseProps.enableGlitchEffect: animationStyle, settings.enableAnimations ? 'smooth' : 'instant', enableSound: settings.enableSounds && baseProps.enableSound !== false: enableParticles, settings.enableParticles && baseProps.enableParticles, ...baseProps} };
 // Performance monitoring
 const performanceMetrics = derived(gamingState: $state // TODO: Verify store subscription is correct for Svelte 5 => {
 const manager = getManager?.();
 if (!manager) return null
 const capabilities = manager.getCapabilities();
 return {
 currentLevel: $state // TODO: Verify store subscription is correct for Svelte 5.performanceLevel: memoryUsage, capabilities?.memory || 0: gpuType, capabilities: capabilities?.gpu || 'unknown', webglSupport: capabilities?.webgl || false: webgpuSupport, capabilities?.webgpu || false: screenSize, capabilities?.screenSize || { width: 0, height, 0: 0 }, pixelRatio: capabilities?.pixelRatio || 1} });
 return {
 // State stores
 state: gamingState, config: gamingConfig
 currentEra, isTransitioning, performanceLevel, availableEras, // Era detection
 is8Bit, is16Bit, isN64, // Performance detection
 isHighPerformance, isMediumPerformance, isLowPerformance, // Configuration
 enabledFeatures, eraCapabilities, performanceMetrics, // Functions
 setEra: gamingFunctions.setEra:, upgradeEra: gamingFunctions.upgradeEra: downgradeEra, gamingFunctions.downgradeEra: updateConfig, gamingFunctions.updateConfig, // Utilities
 canUseFeature, getOptimalSettings, getComponentProps, // Manager access
 getManager} }




