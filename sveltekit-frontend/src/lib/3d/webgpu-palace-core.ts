/**
 * WebGPU Memory Palace - Core Module
 * Device initialization, context setup, and basic rendering pipeline
 */

import { browser } from '$app/environment';

export type ComputeBackend = 'webgpu' | 'webgl' | 'cpu';

export interface PalaceSettings {
	renderDistance: number;
	powerPreference?: 'low-power' | 'high-performance';
	forceLayoutEnabled: boolean;
}

export interface MemoryRoom {
	id: string;
	name: string;
	theme: 'evidence' | 'contracts' | 'cases' | 'research';
	position: [number, number, number];
	velocity: [number, number, number];
	size: [number, number, number];
	color: [number, number, number, number]; // RGBA
	documents: string[];
	cognitiveLoad: number;
	accessFrequency: number;
}

export class WebGPUPalaceCore {
	private canvas: HTMLCanvasElement;
	private context: GPUCanvasContext | null = null;
	private device: GPUDevice | null = null;
	private queue: GPUQueue | null = null;
	private settings: PalaceSettings;
	private backend: ComputeBackend = 'cpu';

	// Resources
	private renderPipeline: GPURenderPipeline | null = null;
	private depthTexture: GPUTexture | null = null;
	private uniformBuffer: GPUBuffer | null = null;
	private vertexBuffer: GPUBuffer | null = null;

	// Camera state
	private viewProjectionMatrix = new Float32Array(16);
	private cameraPosition = new Float32Array([0, 10, 20]);
	private cameraRotation = 0;

	// Rooms data
	public rooms: MemoryRoom[] = [];

	constructor(canvas: HTMLCanvasElement, settings?: Partial<PalaceSettings>) {
		this.canvas = canvas;
		this.settings = {
			renderDistance: 100,
			powerPreference: 'high-performance',
			forceLayoutEnabled: true,
			...settings
		};
	}

	// ─── Initialization ──────────────────────────────────────────────────

	async initialize(): Promise<ComputeBackend> {
		if (!browser) {
			this.backend = 'cpu';
			return 'cpu';
		}

		try {
			// Check WebGPU availability
			if (!navigator.gpu) throw new Error('WebGPU not supported');

			// Request WebGPU adapter
			const adapter = await (navigator as any).gpu.requestAdapter({
				powerPreference: this.settings.powerPreference
			});

			if (!adapter) throw new Error('No GPU adapter');

			// Request device
			this.device = await adapter.requestDevice({
				label: 'memory-palace-device'
			});

			this.queue = this.device.queue;
			this.backend = 'webgpu';

			// Configure canvas context
			this.context = this.canvas.getContext('webgpu');
			if (!this.context) throw new Error('Failed to get WebGPU context');

			const canvasFormat = (navigator as any).gpu.getPreferredCanvasFormat();
			this.context.configure({
				device: this.device,
				format: canvasFormat,
				alphaMode: 'premultiplied'
			});

			// Create depth texture
			this.createDepthTexture();

			// Create render pipeline (shaders will be imported)
			await this.createRenderPipeline(canvasFormat);

			// Initialize default rooms
			this.initializeDefaultRooms();

			console.log('[WebGPUPalaceCore] Initialized with WebGPU backend');
			return 'webgpu';

		} catch (e) {
			console.warn('[WebGPUPalaceCore] WebGPU init failed:', e);
			this.backend = 'cpu';
			return 'cpu';
		}
	}

	private createDepthTexture(): void {
		if (!this.device) return;

		this.depthTexture = this.device.createTexture({
			size: [this.canvas.width, this.canvas.height],
			format: 'depth24plus',
			usage: GPUTextureUsage.RENDER_ATTACHMENT
		});
	}

	private async createRenderPipeline(format: GPUTextureFormat): Promise<void> {
		if (!this.device) return;

		// Import shaders from separate module
		const { ROOM_VERTEX_WGSL, ROOM_FRAGMENT_WGSL } = await import('./webgpu-palace-shaders.js');

		const vertexModule = this.device.createShaderModule({
			label: 'room_vertex',
			code: ROOM_VERTEX_WGSL
		});

		const fragmentModule = this.device.createShaderModule({
			label: 'room_fragment',
			code: ROOM_FRAGMENT_WGSL
		});

		this.renderPipeline = this.device.createRenderPipeline({
			label: 'room_render_pipeline',
			layout: 'auto',
			vertex: {
				module: vertexModule,
				entryPoint: 'vertex_main',
				buffers: [
					{
						// Cube vertices
						arrayStride: 12,
						attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }]
					},
					{
						// Instance data (position, size, color)
						arrayStride: 40,
						stepMode: 'instance',
						attributes: [
							{ shaderLocation: 1, offset: 0, format: 'float32x3' },
							{ shaderLocation: 2, offset: 12, format: 'float32x3' },
							{ shaderLocation: 3, offset: 24, format: 'float32x4' }
						]
					}
				]
			},
			fragment: {
				module: fragmentModule,
				entryPoint: 'fragment_main',
				targets: [{ format }]
			},
			primitive: {
				topology: 'triangle-list',
				cullMode: 'back'
			},
			depthStencil: {
				format: 'depth24plus',
				depthWriteEnabled: true,
				depthCompare: 'less'
			}
		});

		// Create cube vertices
		this.createCubeVertices();
	}

	private createCubeVertices(): void {
		if (!this.device) return;

		// Cube vertices (24 vertices for 6 faces, 4 vertices each)
		const vertices = new Float32Array([
			// Front
			-0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5,
			-0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
			// Back
			0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5,
			0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
			// Top
			-0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5,
			-0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
			// Bottom
			-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5,
			-0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
			// Right
			0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5,
			0.5, -0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5,
			// Left
			-0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5,
			-0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
		]);

		this.vertexBuffer = this.device.createBuffer({
			label: 'cube_vertices',
			size: vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
		});

		this.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);
	}

	// ─── Room Management ─────────────────────────────────────────────────

	private initializeDefaultRooms(): void {
		const practiceAreas = [
			{ id: 'contracts', name: 'Contracts', theme: 'contracts', color: [0.2, 0.6, 0.8, 1.0] },
			{ id: 'litigation', name: 'Litigation', theme: 'cases', color: [0.8, 0.2, 0.2, 1.0] },
			{ id: 'corporate', name: 'Corporate', theme: 'contracts', color: [0.3, 0.7, 0.3, 1.0] },
			{ id: 'evidence', name: 'Evidence', theme: 'evidence', color: [0.6, 0.6, 0.6, 1.0] },
			{ id: 'research', name: 'Research', theme: 'research', color: [0.4, 0.4, 0.6, 1.0] }
		];

		this.rooms = practiceAreas.map((area, i) => ({
			id: area.id,
			name: area.name,
			theme: area.theme as any,
			position: [i * 6 - 12, 0, 0],
			velocity: [0, 0, 0],
			size: [2, 2, 2],
			color: area.color as [number, number, number, number],
			documents: [],
			cognitiveLoad: 0.1,
			accessFrequency: 0
		}));
	}

	// ─── Rendering ───────────────────────────────────────────────────────

	async render(): Promise<void> {
		if (!this.device || !this.context || !this.renderPipeline || !this.depthTexture) return;

		const encoder = this.device.createCommandEncoder({ label: 'render_encoder' });
		const textureView = this.context.getCurrentTexture().createView();

		const renderPass = encoder.beginRenderPass({
			label: 'render_pass',
			colorAttachments: [{
				view: textureView,
				clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1.0 },
				loadOp: 'clear',
				storeOp: 'store'
			}],
			depthStencilAttachment: {
				view: this.depthTexture.createView(),
				depthClearValue: 1.0,
				depthLoadOp: 'clear',
				depthStoreOp: 'store'
			}
		});

		renderPass.setPipeline(this.renderPipeline);
		renderPass.setVertexBuffer(0, this.vertexBuffer);

		// Update instance buffer with room data
		const instanceData = new Float32Array(this.rooms.length * 10);
		this.rooms.forEach((room, i) => {
			const offset = i * 10;
			instanceData.set(room.position, offset);
			instanceData.set(room.size, offset + 3);
			instanceData.set(room.color, offset + 6);
		});

		const instanceBuffer = this.device.createBuffer({
			label: 'instance_buffer',
			size: instanceData.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
		});
		this.device.queue.writeBuffer(instanceBuffer, 0, instanceData);
		renderPass.setVertexBuffer(1, instanceBuffer);

		// Update uniforms
		this.updateViewProjection();
		if (!this.uniformBuffer) {
			this.uniformBuffer = this.device.createBuffer({
				label: 'uniforms',
				size: 80,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
			});
		}

		const uniformData = new Float32Array(20);
		uniformData.set(this.viewProjectionMatrix, 0);
		uniformData.set(this.cameraPosition, 16);
		this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

		const bindGroup = this.device.createBindGroup({
			layout: this.renderPipeline.getBindGroupLayout(0),
			entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]
		});
		renderPass.setBindGroup(0, bindGroup);

		// Draw (36 vertices per cube × room count)
		renderPass.draw(36, this.rooms.length);

		renderPass.end();
		this.device.queue.submit([encoder.finish()]);

		instanceBuffer.destroy();
	}

	private updateViewProjection(): void {
		// Rotating camera
		this.cameraRotation += 0.005;
		const radius = 20;
		this.cameraPosition[0] = Math.sin(this.cameraRotation) * radius;
		this.cameraPosition[2] = Math.cos(this.cameraRotation) * radius;

		// Simple perspective matrix
		const aspect = this.canvas.width / this.canvas.height;
		const fov = Math.PI / 4;
		const near = 0.1;
		const far = 100;
		const f = 1 / Math.tan(fov / 2);

		// Perspective
		this.viewProjectionMatrix.fill(0);
		this.viewProjectionMatrix[0] = f / aspect;
		this.viewProjectionMatrix[5] = f;
		this.viewProjectionMatrix[10] = (far + near) / (near - far);
		this.viewProjectionMatrix[11] = -1;
		this.viewProjectionMatrix[14] = (2 * far * near) / (near - far);

		// View (simplified lookAt)
		this.viewProjectionMatrix[12] -= this.cameraPosition[0] * 0.1;
		this.viewProjectionMatrix[13] -= this.cameraPosition[1] * 0.1;
		this.viewProjectionMatrix[14] -= this.cameraPosition[2] * 0.1;
	}

	// ─── Public API ──────────────────────────────────────────────────────

	get isGPUReady(): boolean {
		return this.device !== null && this.context !== null;
	}

	get currentBackend(): ComputeBackend {
		return this.backend;
	}

	dispose(): void {
		if (this.uniformBuffer) this.uniformBuffer.destroy();
		if (this.vertexBuffer) this.vertexBuffer.destroy();
		if (this.depthTexture) this.depthTexture.destroy();
		console.log('[WebGPUPalaceCore] Disposed');
	}
}
