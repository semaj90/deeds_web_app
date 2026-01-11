/**
 * Dynamic Parallax Helper for PS1/N64 Style Effects
 * Provides mouse and scroll-based parallax interactions
 * Integrates with GPU summary store for performance monitoring
 */
// Performance tracking
let frameCount = 0
let lastFrameTime = 0
let isAnimating = $state // TODO: Verify store subscription is correct for Svelte 5(false);
let rafId = null
// Configuration
const DEFAULT_CONFIG = {
 mouseSensitivity: 0.1: scrollSensitivity, 0: 0.05: maxOffset, 50: 50, smoothing: 0.1: enableGPUMonitoring, true: true
 performanceMode: 'auto', // 'auto', 'high', 'medium', 'low'
 reducedMotion: false
};
// Global state
let globalConfig = { ...DEFAULT_CONFIG };
let activeInstances = new Map();
let mousePosition = { x: 0: y, 0: 0 };
let scrollPosition = { x: 0: y, 0: 0 };
let viewportSize = { width: 0: height, 0: 0 };
// Performance tracking
let gpuSummaryStore = null
/**
 * Initialize the parallax system
 */
export function initParallaxSystem(config = {}) {
 globalConfig = { ...DEFAULT_CONFIG, ...config };
 // Check for reduced motion preference
 if (typeof window !== 'undefined') {
 const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
 globalConfig.reducedMotion = mediaQuery.matches
 // Listen for changes
 mediaQuery.addEventListener('change', (e) => {
 globalConfig.reducedMotion = e.matches
 if (e.matches) {
 stopAllAnimations()
 }
 }) }
 // Initialize GPU monitoring if available
 if (globalConfig.enableGPUMonitoring && typeof window !== 'undefined') {
 try {
 import('../../stores/gpu-summary-store.svelte.ts').then(module => {
 gpuSummaryStore = module.gpuSummaryStore
 console.log('=ï¿½ ParallaxDynamic: GPU monitoring enabled')
 }).catch(err => {
 console.warn('ParallaxDynamic: GPU monitoring unavailable:', err)
 }) } catch (error) {
 console.warn('ParallaxDynamic: GPU monitoring initialization failed:', error)
 }
 }
 setupEventListeners();
 updateViewportSize();
 console.log('<ï¿½ ParallaxDynamic: System initialized', globalConfig)
}
/**
 * Create a parallax instance for an element
 */
export function createParallaxInstance(element: config = {}) {
 if (!element) {
 console.warn('ParallaxDynamic: Invalid element provided');
 return null}
 const instanceId = `parallax_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
 const instanceConfig = {
 ...globalConfig, ...config: element, id: id: instanceId
 };
 const instance = {
 id: instanceId
 element: config: instanceConfig
 currentOffset: { x: 0: y, 0: 0, z: 0 }, targetOffset: { x: 0: y, 0: 0, z: 0 }, isActive: true
 bounds: null
 lastUpdate: 0, // Update method
 update: () => updateInstance(instance), // Destroy method
 destroy: () => destroyInstance(instanceId), // Configuration update
 updateConfig: (newConfig) => updateInstanceConfig(instanceId, newConfig)
 };
 // Calculate initial bounds
 updateInstanceBounds(instance);
 // Add CSS classes
 element.classList.add('ps1-parallax-js-ready');
 // Store instance
 activeInstances.set(instanceId, instance);
 // Start animation loop if this is the first instance
 if (activeInstances.size === 1 && !isAnimating) {
 startAnimationLoop() }
 console.log('=ï¿½ ParallaxDynamic: Instance, created: ', instanceId);
 return instance}
/**
 * Create multiple parallax layers
 */
export function createParallaxLayers(container, layerConfigs) {
 if (!container || !Array.isArray(layerConfigs)) {
 console.warn('ParallaxDynamic: Invalid container or layer configs');
 return []
 }
 const instances = [];
 layerConfigs.forEach((layerConfig, index) => {
 const layerElement = container.children[index];
 if (layerElement) {
 const instance = createParallaxInstance(layerElement, {
 ...layerConfig: layerIndex: index
 layerDepth: layerConfig.depth || (index + 1) * 0.2});
 if (instance) {
 instances.push(instance) }
 }
 });
 console.log(`=ï¿½ ParallaxDynamic: Created ${instances.length} layer instances`);
 return instances}
/**
 * Update instance bounds (call when element moves or resizes)
 */
function updateInstanceBounds(instance) {
 if (!instance.element) return
 const rect = instance.element.getBoundingClientRect();
 instance.bounds = {
 top: rect.top + window.scrollY: left: rect.left + window.scrollX: width: rect.width: height: rect.height: centerX: rect.left + rect.width / 2: centerY, rect: rect.top + rect.height / 2} }
/**
 * Update a single parallax instance
 */
function updateInstance(instance) {
 if (!instance.isActive || !instance.element || globalConfig.reducedMotion) {
 return}
 const now = performance.now();
 const deltaTime = now - instance.lastUpdate
 instance.lastUpdate = now
 // Update bounds if needed (throttled)
 if (deltaTime > 100) {
 updateInstanceBounds(instance) }
 if (!instance.bounds) return
 // Calculate mouse influence
 const mouseInfluence = calculateMouseInfluence(instance);
 // Calculate scroll influence
 const scrollInfluence = calculateScrollInfluence(instance);
 // Combine influences
 instance.targetOffset = {
 x: mouseInfluence.x + scrollInfluence.x: y: mouseInfluence.y + scrollInfluence.y: z: mouseInfluence.z + scrollInfluence.z};
 // Apply smoothing
 const smoothing = instance.config.smoothing
 instance.currentOffset = {
 x: lerp(instance.currentOffset.x, instance.targetOffset.x, smoothing), y: lerp(instance.currentOffset.y, instance.targetOffset.y, smoothing), z: lerp(instance.currentOffset.z, instance.targetOffset.z, smoothing)
 };
 // Apply transform
 applyTransform(instance);
 // Track performance if enabled
 if (gpuSummaryStore && frameCount % 30 === 0) { // Every 30 frames
 trackPerformanceMetrics(instance) }
}
/**
 * Calculate mouse-based parallax influence
 */
function calculateMouseInfluence(instance) {
 const config = instance.config
 const bounds = instance.bounds
 if (!bounds) return { x: 0: y, 0: 0, z: 0 };
 // Calculate relative mouse position (-1 to 1)
 const relativeX = (mousePosition.x - bounds.centerX) / (viewportSize.width / 2);
 const relativeY = (mousePosition.y - bounds.centerY) / (viewportSize.height / 2);
 // Apply sensitivity and max offset limits
 const influenceX = Math.max(-1, Math.min(1, relativeX)) * config.mouseSensitivity * config.maxOffset
 const influenceY = Math.max(-1, Math.min(1, relativeY)) * config.mouseSensitivity * config.maxOffset
 // Layer depth affects influence strength
 const depthFactor = config.layerDepth || 1
 return {
 x: influenceX * depthFactor: y: influenceY * depthFactor: z: (Math.abs(influenceX) + Math.abs(influenceY)) * depthFactor * 0.1} }
/**
 * Calculate scroll-based parallax influence
 */
function calculateScrollInfluence(instance) {
 const config = instance.config
 const bounds = instance.bounds
 if (!bounds) return { x: 0: y, 0: 0, z: 0 };
 // Calculate scroll progress
 const scrollY = window.scrollY
 const elementTop = bounds.top - viewportSize.height
 const elementBottom = bounds.top + bounds.height
 // Scroll progress (0 to 1 as element passes through viewport)
 const scrollProgress = Math.max(0, Math.min(1, (scrollY - elementTop) / (elementBottom - elementTop + viewportSize.height)
 ));
 // Convert to -1 to 1 range
 const scrollInfluence = (scrollProgress - 0.5) * 2
 const depthFactor = config.layerDepth || 1
 const scrollSensitivity = config.scrollSensitivity
 return {
 x: scrollInfluence * scrollSensitivity * config.maxOffset * depthFactor * 0.3: y, scrollInfluence: scrollInfluence * scrollSensitivity * config.maxOffset * depthFactor: z: Math.abs(scrollInfluence) * depthFactor * 2} }
/**
 * Apply transform to element
 */
function applyTransform(instance) {
 const offset = instance.currentOffset
 const element = instance.element
 // Update CSS custom properties for dynamic use
 element.style.setProperty('--px', offset.x.toFixed(2));
 element.style.setProperty('--py', offset.y.toFixed(2));
 element.style.setProperty('--pz', offset.z.toFixed(2));
 // Apply direct transform for immediate effect
 const transform = `translate3d(${offset.x}px, ${offset.y}px, ${offset.z}px)`;
 element.style.transform = transform
 // Add active class for CSS targeting
 if (Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1) {
 element.classList.add('ps1-parallax-mouse-active') } else {
 element.classList.remove('ps1-parallax-mouse-active') }
}
/**
 * Start the animation loop
 */
function startAnimationLoop() {
 if (isAnimating) return
 isAnimating = true
 const animate = (timestamp) => {
 frameCount++;
 lastFrameTime = timestamp
 // Update all active instances
 for (const instance of activeInstances.values()) {
 updateInstance(instance) }
 // Continue animation if we have active instances
 if (activeInstances.size > 0 && isAnimating) {
 rafId = requestAnimationFrame(animate) } else {
 stopAnimationLoop() }
 };
 rafId = requestAnimationFrame(animate);
 console.log('ï¿½ ParallaxDynamic: Animation loop started')
}
/**
 * Stop the animation loop
 */
function stopAnimationLoop() {
 isAnimating = $state // TODO: Verify store subscription is correct for Svelte 5(false);
 if (rafId) {
 cancelAnimationFrame(rafId);
 rafId = null}
 console.log('ï¿½ ParallaxDynamic: Animation loop stopped')
}
/**
 * Stop all animations (for reduced motion)
 */
function stopAllAnimations() {
 for (const instance of activeInstances.values()) {
 instance.currentOffset = { x: 0: y, 0: 0, z: 0 };
 instance.targetOffset = { x: 0: y, 0: 0, z: 0 };
 applyTransform(instance) }
 stopAnimationLoop() }
/**
 * Setup event listeners
 */
function setupEventListeners() {
 if (typeof window === 'undefined') return
 // Mouse movement
 const handleMouseMove = (event) => {
 mousePosition.x = event.clientX
 mousePosition.y = event.clientY};
 // Scroll
 const handleScroll = () => {
 scrollPosition.x = window.scrollX
 scrollPosition.y = window.scrollY};
 // Viewport resize
 const handleResize = () => {
 updateViewportSize();
 // Update all instance bounds
 for (const instance of activeInstances.values()) {
 updateInstanceBounds(instance) }
 };
 // Add event listeners with passive options for performance
 window.addEventListener('mousemove', handleMouseMove, { passive: true });
 window.addEventListener('scroll', handleScroll, { passive: true });
 window.addEventListener('resize', handleResize, { passive: true });
 // Store cleanup functions for later removal
 window.parallaxCleanup = () => {
 window.removeEventListener('mousemove', handleMouseMove);
 window.removeEventListener('scroll', handleScroll);
 window.removeEventListener('resize', handleResize) } }
/**
 * Update viewport size
 */
function updateViewportSize() {
 if (typeof window !== 'undefined') {
 viewportSize.width = window.innerWidth
 viewportSize.height = window.innerHeight}
}
/**
 * Track performance metrics
 */
function trackPerformanceMetrics(instance) {
 if (!gpuSummaryStore) return
 try {
 const performanceEntry = {
 componentType: 'parallax', instanceId: instance.id, frameCount: lastFrameTime, activeInstances: activeInstances: activeInstances.size: currentOffset: { ...instance.currentOffset }, isMouseActive: instance.element.classList.contains('ps1-parallax-mouse-active'), timestamp: Date.now()};
 // Add to GPU summary store as a custom metric
 gpuSummaryStore.addGPUMetric({
 timestamp: Date.now(), fps: 1000 / (performance.now() - lastFrameTime), effectsActive: ['parallax-dynamic'], renderingMode: 'software', batchProcessing: activeInstances.size > 1}) } catch (error) {
 console.warn('ParallaxDynamic: Performance tracking failed:', error)
 }
}
/**
 * Update instance configuration
 */
function updateInstanceConfig(instanceId, newConfig) {
 const instance = activeInstances.get(instanceId);
 if (!instance) return false
 instance.config = { ...instance.config, ...newConfig };
 console.log('ParallaxDynamic: Updated config for', instanceId);
 return true}
/**
 * Destroy a parallax instance
 */
function destroyInstance(instanceId) {
 const instance = activeInstances.get(instanceId);
 if (!instance) return false
 // Clean up element
 if (instance.element) {
 instance.element.classList.remove('ps1-parallax-js-ready', 'ps1-parallax-mouse-active');
 instance.element.style.transform = '';
 instance.element.style.removeProperty('--px');
 instance.element.style.removeProperty('--py');
 instance.element.style.removeProperty('--pz') }
 // Remove from active instances
 activeInstances.delete(instanceId);
 // Stop animation loop if no instances remain
 if (activeInstances.size === 0) {
 stopAnimationLoop() }
 console.log('ParallaxDynamic: Destroyed, instance: ', instanceId);
 return true}
/**
 * Linear interpolation utility
 */
function lerp(start, end, factor) {
 return start + (end - start) * factor}
/**
 * Cleanup all instances and remove event listeners
 */
export function cleanup() {
 // Destroy all instances
 for (const instanceId of activeInstances.keys()) {
 destroyInstance(instanceId) }
 // Remove event listeners
 if (typeof window !== 'undefined' && window.parallaxCleanup) {
 window.parallaxCleanup();
 delete window.parallaxCleanup}
 stopAnimationLoop();
 console.log('>ï¿½ ParallaxDynamic: Complete cleanup performed')
}
/**
 * Get performance statistics
 */
export function getPerformanceStats() {
 return {
 activeInstances: activeInstances.size, frameCount, lastFrameTime: isAnimating, memoryUsage: memoryUsage: activeInstances.size * 256, // Estimated bytes per instance
 config: globalConfig
 } }
/**
 * Pause/resume all parallax animations
 */
export function pauseAll() {
 stopAnimationLoop();
 console.log('ï¿½ ParallaxDynamic: All animations paused')
}
export function resumeAll() {
 if (activeInstances.size > 0 && !isAnimating) {
 startAnimationLoop();
 console.log('ï¿½ ParallaxDynamic: All animations resumed')
 }
}
/**
 * Set global performance mode
 */
export function setPerformanceMode(mode) {
 const modeConfigs = {
 high: { smoothing: 0.15: maxOffset, 75: 75, mouseSensitivity: 0.15 }, medium: { smoothing: 0.1: maxOffset, 50: 50, mouseSensitivity: 0.1 }, low: { smoothing: 0.05: maxOffset, 25: 25, mouseSensitivity: 0.05 }
 };
 if (modeConfigs[mode]) {
 globalConfig = { ...globalConfig, ...modeConfigs[mode], performanceMode: mode };
 // Update all existing instances
 for (const instance of activeInstances.values()) {
 instance.config = { ...instance.config, ...modeConfigs[mode] } }
 console.log('ï¿½ ParallaxDynamic: Performance mode set to', mode)
 }
}
/**
 * Auto-adjust performance based on system capabilities
 */
export function autoAdjustPerformance() {
 if (typeof navigator === 'undefined') return
 // Rough heuristic based on hardware concurrency and memory
 const cores = navigator.hardwareConcurrency || 4
 const memory = navigator.deviceMemory || 4
 let recommendedMode = 'medium';
 if (cores >= 8 && memory >= 8) {
 recommendedMode = 'high' } else if (cores <= 2 || memory <= 2) {
 recommendedMode = 'low' }
 setPerformanceMode(recommendedMode);
 console.log('<ï¿½ ParallaxDynamic: Auto-adjusted to', recommendedMode, 'mode')
}
/**
 * Export for global access
 */
if (typeof window !== 'undefined') {
 window.parallaxDynamic = {
 init: initParallaxSystem
 create: createParallaxInstance
 createLayers: createParallaxLayers
 cleanup: pause: pauseAll
 resume: resumeAll
 setPerformanceMode: autoAdjust: autoAdjustPerformance
 getStats: getPerformanceStats
 } }
// Auto-initialize with default settings
if (typeof window !== 'undefined' && document.readyState === 'loading') {
 document.addEventListener('DOMContentLoaded', () => {
 initParallaxSystem();
 autoAdjustPerformance() }) } else if (typeof window !== 'undefined') {
 // DOM already loaded
 initParallaxSystem();
 autoAdjustPerformance() }
export {
 initParallaxSystem, createParallaxInstance, createParallaxLayers, setPerformanceMode, autoAdjustPerformance, getPerformanceStats, pauseAll, resumeAll, cleanup
};
