/**
 * Dynamic Parallax Helper - WebGPU Enhanced
 * Handles mouse, gyroscope, and pointer input for multi-layer parallax effects
 * with optional WebGPU acceleration for complex transformations.
 */
class ParallaxDynamic {
	constructor(options = {}) {
		this.config = {
			mouseSensitivity: options.mouseSensitivity || 0.02,
			gyroSensitivity: options.gyroSensitivity || 0.5,
			pointerSensitivity: options.pointerSensitivity || 0.03,
			maxOffset: options.maxOffset || 100,
			smoothing: options.smoothing || 0.1,
			enableAutoRotate: options.enableAutoRotate || false,
			autoRotateSpeed: options.autoRotateSpeed || 0.001,
			enableWebGPU: options.enableWebGPU || false,
			performanceMode: options.performanceMode || 'auto', // 'high', 'medium', 'low', 'auto'
			...options,
		};
		this.layers = [];
		this.input = { x: 0, y: 0 };
		this.gyroscope = { x: 0, y: 0, z: 0 };
		this.pointer = { x: 0, y: 0, pressed: false };
		this.isActive = false;
		this.isGyroscopeAvailable = false;
		this.isMobile = false;
		this.webgpuDevice = null;
		this.transformPipeline = null;
		this.performance = {
			fps: 0,
			frameTime: 0,
			lastFrameTime: 0,
			transformsPerSecond: 0,
		};
		this.callbacks = {
			onUpdate: null,
			onPerformanceChange: null,
			onDeviceOrientationChange: null,
		};
		// store bound handlers so removeEventListener works
		this._boundHandlers = {
			mousemove: this.handleMouseMove.bind(this),
			touchmove: this.handleTouchMove.bind(this),
			touchstart: this.handleTouchStart.bind(this),
			touchend: this.handleTouchEnd.bind(this),
			deviceorientation: this.handleGyroscope.bind(this),
			pointermove: this.handlePointerMove.bind(this),
			pointerdown: this.handlePointerDown.bind(this),
			pointerup: this.handlePointerUp.bind(this),
			resize: this.handleResize.bind(this),
			visibilitychange: this.handleVisibilityChange.bind(this),
		};
		this.animationId = null;
		this.startTime = performance.now();
		this.init();
	}

	async init() {
		this.detectDeviceCapabilities();
		await this.initWebGPU();
		this.setupEventListeners();
		this.autoDetectPerformanceMode();
		console.log('[ParallaxDynamic] Initialized:', {
			mobile: this.isMobile,
			gyroscope: this.isGyroscopeAvailable,
			webgpu: !!this.webgpuDevice,
			performanceMode: this.config.performanceMode,
		});
	}

	detectDeviceCapabilities() {
		this.isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
			navigator.userAgent
		);
		this.isGyroscopeAvailable = 'DeviceOrientationEvent' in window;
		this.deviceMemory = navigator.deviceMemory || 4;
		this.deviceCores = navigator.hardwareConcurrency || 4;
	}

	async initWebGPU() {
		if (!this.config.enableWebGPU || !navigator.gpu) return;
		try {
			const adapter = await navigator.gpu.requestAdapter({
				powerPreference: 'high-performance',
			});
			if (!adapter) return;
			this.webgpuDevice = await adapter.requestDevice();
			await this.createTransformPipeline();
			console.log('[ParallaxDynamic] WebGPU acceleration enabled');
		} catch (error) {
			console.warn('[ParallaxDynamic] WebGPU initialization failed:', error);
			this.config.enableWebGPU = false;
		}
	}

	async createTransformPipeline() {
		if (!this.webgpuDevice) return;
		const shaderCode = `
			struct Transform {
				translateX: f32,
				translateY: f32,
				translateZ: f32,
				rotateX: f32,
				rotateY: f32,
				rotateZ: f32,
				scaleX: f32,
				scaleY: f32,
			};

			struct LayerData {
				depth: f32,
				inputX: f32,
				inputY: f32,
				smoothing: f32,
				currentOffsetX: f32,
				currentOffsetY: f32,
				targetOffsetX: f32,
				targetOffsetY: f32,
			};

			@group(0) @binding(0) var<storage, read_write> layers: array<LayerData>;
			@group(0) @binding(1) var<storage, read_write> transforms: array<Transform>;
			@group(0) @binding(2) var<uniform> params: vec4<f32>; // time, deltaTime, maxOffset, autoRotateSpeed

			@compute @workgroup_size(64)
			fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
				let index = global_id.x;
				if (index >= arrayLength(&layers)) { return; }

				let time = params.x;
				let deltaTime = params.y;
				let maxOffset = params.z;
				let autoRotateSpeed = params.w;

				var layer = layers[index];

				// Calculate target offsets
				var inputX = layer.inputX;
				var inputY = layer.inputY;

				// Add auto-rotation if enabled
				if (autoRotateSpeed > 0.0) {
					inputX += sin(time * autoRotateSpeed) * 20.0;
					inputY += cos(time * autoRotateSpeed * 0.7) * 15.0;
				}

				// Clamp to max offset
				inputX = clamp(inputX, -maxOffset, maxOffset);
				inputY = clamp(inputY, -maxOffset, maxOffset);

				// Apply depth scaling
				layer.targetOffsetX = inputX * layer.depth;
				layer.targetOffsetY = inputY * layer.depth;

				// Smooth interpolation
				layer.currentOffsetX += (layer.targetOffsetX - layer.currentOffsetX) * layer.smoothing;
				layer.currentOffsetY += (layer.targetOffsetY - layer.currentOffsetY) * layer.smoothing;

				// Create transform
				var transform: Transform;
				transform.translateX = layer.currentOffsetX;
				transform.translateY = layer.currentOffsetY;
				transform.translateZ = layer.depth * 10.0;
				transform.rotateX = layer.currentOffsetY * 0.02;
				transform.rotateY = layer.currentOffsetX * 0.02;
				transform.rotateZ = 0.0;
				transform.scaleX = 1.0 + (layer.depth * 0.01);
				transform.scaleY = 1.0 + (layer.depth * 0.01);

				// Store results
				layers[index] = layer;
				transforms[index] = transform;
			}
		`;
		const shaderModule = this.webgpuDevice.createShaderModule({ code: shaderCode });
		this.transformPipeline = this.webgpuDevice.createComputePipeline({
			layout: 'auto',
			compute: {
				module: shaderModule,
				entryPoint: 'main',
			},
		});
	}

	autoDetectPerformanceMode() {
		if (this.config.performanceMode !== 'auto') return;
		const memory = this.deviceMemory;
		const cores = this.deviceCores;

		if (this.isMobile) {
			if (memory >= 6 && cores >= 8) {
				this.config.performanceMode = 'high';
			} else if (memory >= 4 && cores >= 6) {
				this.config.performanceMode = 'medium';
			} else {
				this.config.performanceMode = 'low';
			}
		} else {
			if (memory >= 8 && cores >= 8) {
				this.config.performanceMode = 'high';
			} else if (memory >= 4 && cores >= 4) {
				this.config.performanceMode = 'medium';
			} else {
				this.config.performanceMode = 'low';
			}
		}
		this.applyPerformanceSettings();
	}

	applyPerformanceSettings() {
		switch (this.config.performanceMode) {
			case 'high':
				this.config.smoothing = 0.1;
				this.config.enableWebGPU = this.webgpuDevice !== null;
				break;
			case 'medium':
				this.config.smoothing = 0.15;
				this.config.enableWebGPU = false;
				break;
			case 'low':
				this.config.smoothing = 0.2;
				this.config.enableWebGPU = false;
				this.config.enableAutoRotate = false;
				break;
		}
	}

	setupEventListeners() {
		window.addEventListener('mousemove', this._boundHandlers.mousemove);
		window.addEventListener('touchmove', this._boundHandlers.touchmove, { passive: false });
		window.addEventListener('touchstart', this._boundHandlers.touchstart);
		window.addEventListener('touchend', this._boundHandlers.touchend);
		if (this.isGyroscopeAvailable) {
			window.addEventListener('deviceorientation', this._boundHandlers.deviceorientation);
		}
		window.addEventListener('pointermove', this._boundHandlers.pointermove);
		window.addEventListener('pointerdown', this._boundHandlers.pointerdown);
		window.addEventListener('pointerup', this._boundHandlers.pointerup);
		window.addEventListener('resize', this._boundHandlers.resize);
		document.addEventListener('visibilitychange', this._boundHandlers.visibilitychange);
	}

	handleMouseMove(event) {
		if (this.isMobile && this.isGyroscopeAvailable) return;
		const centerX = window.innerWidth / 2;
		const centerY = window.innerHeight / 2;
		this.input.x = (event.clientX - centerX) * this.config.mouseSensitivity;
		this.input.y = (event.clientY - centerY) * this.config.mouseSensitivity;
	}

	handleTouchMove(event) {
		if (event.touches.length === 0) return;
		const touch = event.touches[0];
		const centerX = window.innerWidth / 2;
		const centerY = window.innerHeight / 2;
		this.input.x = (touch.clientX - centerX) * this.config.pointerSensitivity;
		this.input.y = (touch.clientY - centerY) * this.config.pointerSensitivity;
		event.preventDefault();
	}

	handleTouchStart(_event) {
		this.pointer.pressed = true;
	}

	handleTouchEnd(_event) {
		this.pointer.pressed = false;
	}

	handleGyroscope(event) {
		if (!this.isGyroscopeAvailable || !this.isMobile) return;
		const beta = event.beta || 0;
		const gamma = event.gamma || 0;
		this.gyroscope.x = (gamma / 90) * this.config.gyroSensitivity * this.config.maxOffset;
		this.gyroscope.y = (beta / 180) * this.config.gyroSensitivity * this.config.maxOffset;
		if (this.isMobile) {
			this.input.x = this.gyroscope.x;
			this.input.y = this.gyroscope.y;
		}
		if (this.callbacks.onDeviceOrientationChange) {
			this.callbacks.onDeviceOrientationChange(this.gyroscope);
		}
	}

	handlePointerMove(event) {
		const centerX = window.innerWidth / 2;
		const centerY = window.innerHeight / 2;
		this.pointer.x = (event.clientX - centerX) * this.config.pointerSensitivity;
		this.pointer.y = (event.clientY - centerY) * this.config.pointerSensitivity;
	}

	handlePointerDown(_event) {
		this.pointer.pressed = true;
	}

	handlePointerUp(_event) {
		this.pointer.pressed = false;
	}

	handleResize() {
		this.updateAllLayers();
	}

	handleVisibilityChange() {
		if (document.hidden) {
			this.pause();
		} else {
			this.resume();
		}
	}

	addLayer(element, options = {}) {
		const layer = {
			id: options.id || `layer-${this.layers.length}`,
			element: typeof element === 'string' ? document.querySelector(element) : element,
			depth: options.depth || 0.1,
			currentOffset: { x: 0, y: 0 },
			targetOffset: { x: 0, y: 0 },
			smoothing: options.smoothing || this.config.smoothing,
			enabled: options.enabled !== false,
			transformStyle: options.transformStyle || '3d',
			...options,
		};
		if (!layer.element) {
			console.warn(`[ParallaxDynamic] Element not found for layer ${layer.id}`);
			return null;
		}
		this.layers.push(layer);
		return layer;
	}

	removeLayer(id) {
		const index = this.layers.findIndex((layer) => layer.id === id);
		if (index !== -1) {
			this.layers.splice(index, 1);
		}
	}

	async updateWebGPUTransforms() {
		if (!this.webgpuDevice || !this.transformPipeline || this.layers.length === 0) return false;

		// Prepare data buffers
		const layerData = new Float32Array(this.layers.length * 8);
		const transformData = new Float32Array(this.layers.length * 8);

		this.layers.forEach((layer, i) => {
			const offset = i * 8;
			layerData[offset + 0] = layer.depth;
			layerData[offset + 1] = this.input.x;
			layerData[offset + 2] = this.input.y;
			layerData[offset + 3] = layer.smoothing;
			layerData[offset + 4] = layer.currentOffset.x;
			layerData[offset + 5] = layer.currentOffset.y;
			layerData[offset + 6] = layer.targetOffset.x;
			layerData[offset + 7] = layer.targetOffset.y;
		});

		const layerBuffer = this.webgpuDevice.createBuffer({
			size: layerData.byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
			mappedAtCreation: true,
		});
		new Float32Array(layerBuffer.getMappedRange()).set(layerData);
		layerBuffer.unmap();

		const transformBuffer = this.webgpuDevice.createBuffer({
			size: transformData.byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
			mappedAtCreation: true,
		});
		new Float32Array(transformBuffer.getMappedRange()).set(transformData);
		transformBuffer.unmap();

		// Parameters buffer
		const currentTime = (performance.now() - this.startTime) / 1000;
		const paramsData = new Float32Array([
			currentTime,
			this.performance.frameTime / 1000,
			this.config.maxOffset,
			this.config.enableAutoRotate ? this.config.autoRotateSpeed : 0,
		]);
		const paramsBuffer = this.webgpuDevice.createBuffer({
			size: paramsData.byteLength,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
			mappedAtCreation: true,
		});
		new Float32Array(paramsBuffer.getMappedRange()).set(paramsData);
		paramsBuffer.unmap();

		// Execute compute shader
		const bindGroup = this.webgpuDevice.createBindGroup({
			layout: this.transformPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: layerBuffer } },
				{ binding: 1, resource: { buffer: transformBuffer } },
				{ binding: 2, resource: { buffer: paramsBuffer } },
			],
		});

		const commandEncoder = this.webgpuDevice.createCommandEncoder();
		const computePass = commandEncoder.beginComputePass();
		computePass.setPipeline(this.transformPipeline);
		computePass.setBindGroup(0, bindGroup);
		computePass.dispatchWorkgroups(Math.ceil(this.layers.length / 64));
		computePass.end();
		this.webgpuDevice.queue.submit([commandEncoder.finish()]);

		// Read back results
		const readBuffer = this.webgpuDevice.createBuffer({
			size: transformData.byteLength,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
		});
		const copyEncoder = this.webgpuDevice.createCommandEncoder();
		copyEncoder.copyBufferToBuffer(transformBuffer, 0, readBuffer, 0, transformData.byteLength);
		this.webgpuDevice.queue.submit([copyEncoder.finish()]);

		await readBuffer.mapAsync(GPUMapMode.READ);
		const resultData = new Float32Array(readBuffer.getMappedRange());

		// Apply transforms to DOM elements
		this.layers.forEach((layer, i) => {
			if (!layer.enabled || !layer.element) return;
			const offset = i * 8;
			const transform = {
				translateX: resultData[offset + 0],
				translateY: resultData[offset + 1],
				translateZ: resultData[offset + 2],
				rotateX: resultData[offset + 3],
				rotateY: resultData[offset + 4],
				rotateZ: resultData[offset + 5],
				scaleX: resultData[offset + 6],
				scaleY: resultData[offset + 7],
			};
			this.applyTransformToElement(layer, transform);
		});

		readBuffer.unmap();

		// Cleanup
		layerBuffer.destroy();
		transformBuffer.destroy();
		paramsBuffer.destroy();
		readBuffer.destroy();

		return true;
	}

	updateCPUTransforms() {
		const currentTime = (performance.now() - this.startTime) / 1000;
		let inputX = this.input.x;
		let inputY = this.input.y;

		if (this.config.enableAutoRotate) {
			inputX += Math.sin(currentTime * this.config.autoRotateSpeed) * 20;
			inputY += Math.cos(currentTime * this.config.autoRotateSpeed * 0.7) * 15;
		}

		inputX = Math.max(-this.config.maxOffset, Math.min(this.config.maxOffset, inputX));
		inputY = Math.max(-this.config.maxOffset, Math.min(this.config.maxOffset, inputY));

		this.layers.forEach((layer) => {
			if (!layer.enabled || !layer.element) return;

			layer.targetOffset.x = inputX * layer.depth;
			layer.targetOffset.y = inputY * layer.depth;

			layer.currentOffset.x +=
				(layer.targetOffset.x - layer.currentOffset.x) * layer.smoothing;
			layer.currentOffset.y +=
				(layer.targetOffset.y - layer.currentOffset.y) * layer.smoothing;

			const transform = {
				translateX: layer.currentOffset.x,
				translateY: layer.currentOffset.y,
				translateZ: layer.depth * 10,
				rotateX: layer.currentOffset.y * 0.02,
				rotateY: layer.currentOffset.x * 0.02,
				rotateZ: 0,
				scaleX: 1 + layer.depth * 0.01,
				scaleY: 1 + layer.depth * 0.01,
			};
			this.applyTransformToElement(layer, transform);
		});
	}

	applyTransformToElement(layer, transform) {
		if (!layer.element) return;
		let transformString;
		if (layer.transformStyle === '3d') {
			transformString =
				`translate3d(${transform.translateX}px, ${transform.translateY}px, ${transform.translateZ}px) ` +
				`rotateX(${transform.rotateX}deg) ` +
				`rotateY(${transform.rotateY}deg) ` +
				`rotateZ(${transform.rotateZ}deg) ` +
				`scale3d(${transform.scaleX}, ${transform.scaleY}, 1)`;
		} else {
			transformString =
				`translate(${transform.translateX}px, ${transform.translateY}px) ` +
				`rotate(${transform.rotateZ}deg) ` +
				`scale(${transform.scaleX}, ${transform.scaleY})`;
		}
		layer.element.style.transform = transformString;
	}

	updatePerformanceStats() {
		const currentTime = performance.now();
		this.performance.frameTime = currentTime - this.performance.lastFrameTime;
		this.performance.fps = Math.round(1000 / this.performance.frameTime);
		this.performance.lastFrameTime = currentTime;
		this.performance.transformsPerSecond = this.layers.length * this.performance.fps;

		if (this.performance.fps < 30 && this.config.performanceMode === 'high') {
			console.warn('[ParallaxDynamic] Low FPS detected, switching to medium performance mode');
			this.setPerformanceMode('medium');
		}
	}

	async updateAllLayers() {
		this.updatePerformanceStats();
		let success = false;
		if (this.config.enableWebGPU && this.webgpuDevice) {
			success = await this.updateWebGPUTransforms();
		}
		if (!success) {
			this.updateCPUTransforms();
		}
		if (this.callbacks.onUpdate) {
			this.callbacks.onUpdate(this.layers, this.performance);
		}
		if (this.callbacks.onPerformanceChange && this.performance.fps % 60 === 0) {
			this.callbacks.onPerformanceChange(this.performance);
		}
	}

	start() {
		if (this.isActive) return;
		this.isActive = true;
		const animate = () => {
			if (!this.isActive) return;
			this.updateAllLayers();
			this.animationId = requestAnimationFrame(animate);
		};
		animate();
	}

	pause() {
		this.isActive = false;
		if (this.animationId) {
			cancelAnimationFrame(this.animationId);
			this.animationId = null;
		}
	}

	resume() {
		if (!this.isActive) {
			this.start();
		}
	}

	stop() {
		this.pause();
		this.layers.forEach((layer) => {
			if (layer.element) {
				layer.element.style.transform = '';
			}
		});
	}

	setPerformanceMode(mode) {
		this.config.performanceMode = mode;
		this.applyPerformanceSettings();
	}

	setConfig(newConfig) {
		Object.assign(this.config, newConfig);
		this.applyPerformanceSettings();
	}

	onUpdate(callback) {
		this.callbacks.onUpdate = callback;
	}

	onPerformanceChange(callback) {
		this.callbacks.onPerformanceChange = callback;
	}

	onDeviceOrientationChange(callback) {
		this.callbacks.onDeviceOrientationChange = callback;
	}

	reset() {
		this.input = { x: 0, y: 0 };
		this.gyroscope = { x: 0, y: 0, z: 0 };
		this.pointer = { x: 0, y: 0, pressed: false };
		this.layers.forEach((layer) => {
			layer.currentOffset = { x: 0, y: 0 };
			layer.targetOffset = { x: 0, y: 0 };
		});
	}

	destroy() {
		this.stop();
		window.removeEventListener('mousemove', this._boundHandlers.mousemove);
		window.removeEventListener('touchmove', this._boundHandlers.touchmove);
		window.removeEventListener('touchstart', this._boundHandlers.touchstart);
		window.removeEventListener('touchend', this._boundHandlers.touchend);
		window.removeEventListener('deviceorientation', this._boundHandlers.deviceorientation);
		window.removeEventListener('pointermove', this._boundHandlers.pointermove);
		window.removeEventListener('pointerdown', this._boundHandlers.pointerdown);
		window.removeEventListener('pointerup', this._boundHandlers.pointerup);
		window.removeEventListener('resize', this._boundHandlers.resize);
		document.removeEventListener('visibilitychange', this._boundHandlers.visibilitychange);
		if (this.webgpuDevice && typeof this.webgpuDevice.destroy === 'function') {
			this.webgpuDevice.destroy();
		}
		this.layers = [];
		this.callbacks = {};
	}

	static async requestGyroscopePermission() {
		if (!('DeviceOrientationEvent' in window)) {
			throw new Error('DeviceOrientation not supported');
		}
		if (typeof DeviceOrientationEvent.requestPermission === 'function') {
			const permission = await DeviceOrientationEvent.requestPermission();
			if (permission !== 'granted') {
				throw new Error('DeviceOrientation permission denied');
			}
		}
		return true;
	}

	static detectCapabilities() {
		return {
			mobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
				navigator.userAgent
			),
			gyroscope: 'DeviceOrientationEvent' in window,
			webgpu: !!navigator.gpu,
			memory: navigator.deviceMemory || 4,
			cores: navigator.hardwareConcurrency || 4,
			pointerEvents: 'PointerEvent' in window,
		};
	}
}

export default ParallaxDynamic;
