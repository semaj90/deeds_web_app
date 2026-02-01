export interface GraphNode {
    id: string;
    x: number;
    y: number;
    z: number;
    type: 'evidence' | 'entity' | 'event' | 'correlation' | 'person' | 'organization' | 'location' | 'object' | 'date' | 'amount';
    label: string;
    weight: number;
    color: [number, number, number, number];
    connections: string[];
}

export interface GraphEdge {
    source: string;
    target: string;
    weight: number;
    type: 'temporal' | 'causal' | 'semantic' | 'entity' | 'spatial';
    color: [number, number, number, number];
}

export class WebGPUEvidenceGraph {
    device: GPUDevice | null = null;
    private context: GPUCanvasContext | null = null;
    pipeline: GPURenderPipeline | null = null;
    nodes: GraphNode[] = [];
    edges: GraphEdge[] = [];
    nodeBuffer: GPUBuffer | null = null;
    edgeBuffer: GPUBuffer | null = null;
    uniformBuffer: GPUBuffer | null = null;
    bindGroup: GPUBindGroup | null = null;
    canvas: HTMLCanvasElement | null = null;
    frameId: number | null = null;

    private vertexShader = `
        struct Uniforms {
            viewMatrix: mat4x4<f32>,
            projectionMatrix: mat4x4<f32>,
            time: f32,
            padding: vec3<f32>,
        };

        struct VertexInput {
            @location(0) position: vec3<f32>,
            @location(1) color: vec4<f32>,
            @location(2) size: f32,
        };

        struct VertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) color: vec4<f32>,
            @location(1) pointSize: f32,
        };

        @group(0) @binding(0) var<uniform> uniforms: Uniforms;

        @vertex
        fn main(input: VertexInput) -> VertexOutput {
            var output: VertexOutput;
            let worldPos = vec4<f32>(input.position, 1.0);
            let viewPos = uniforms.viewMatrix * worldPos;
            output.position = uniforms.projectionMatrix * viewPos;

            let pulse = sin(uniforms.time * 2.0 + input.position.x) * 0.1 + 0.9;
            output.color = vec4<f32>(input.color.xyz * pulse, input.color.w);
            output.pointSize = input.size * (1.0 / max(0.0001, -viewPos.z));

            return output;
        }
    `;

    private fragmentShader = `
        struct FragmentInput {
            @location(0) color: vec4<f32>,
            @location(1) pointSize: f32,
        };

        @fragment
        fn main(input: FragmentInput) -> @location(0) vec4<f32> {
            return input.color;
        }
    `;

    async initialize(canvas: HTMLCanvasElement): Promise<void> {
        this.canvas = canvas;

        if (!navigator.gpu) {
            throw new Error('WebGPU not supported on this browser');
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error('Failed to get GPU adapter');
        }

        this.device = await adapter.requestDevice();
        this.context = canvas.getContext('webgpu') as GPUCanvasContext;

        if (!this.context) {
            throw new Error('Failed to get WebGPU context');
        }

        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: presentationFormat,
            alphaMode: 'premultiplied',
        });

        await this.createPipeline(presentationFormat);
        this.createBuffers();
    }

    private async createPipeline(format: GPUTextureFormat): Promise<void> {
        if (!this.device) return;

        const vertexModule = this.device.createShaderModule({ code: this.vertexShader });
        const fragmentModule = this.device.createShaderModule({ code: this.fragmentShader });

        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: vertexModule,
                entryPoint: 'main',
                buffers: [
                    {
                        arrayStride: 32, // 3 floats pos + 4 floats color + 1 float size = 8 floats * 4 bytes
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: 'float32x3' },  // position
                            { shaderLocation: 1, offset: 12, format: 'float32x4' }, // color
                            { shaderLocation: 2, offset: 28, format: 'float32' }    // size
                        ]
                    }
                ]
            },
            fragment: {
                module: fragmentModule,
                entryPoint: 'main',
                targets: [{ format }]
            },
            primitive: {
                topology: 'point-list',
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus',
            }
        });
    }

    private createBuffers(): void {
        if (!this.device || !this.pipeline) return;

        this.uniformBuffer = this.device.createBuffer({
            size: 144, // Mat4x2 + time
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer,
                    },
                },
            ],
        });
    }

    public updateGraph(nodes: GraphNode[], edges: GraphEdge[]): void {
        this.nodes = nodes;
        this.edges = edges;
        this.updateNodeBuffer();
        this.updateEdgeBuffer();
    }

    private updateNodeBuffer(): void {
        if (!this.device || this.nodes.length === 0) return;

        const data = new Float32Array(this.nodes.length * 8);

        this.nodes.forEach((node, i) => {
            const offset = i * 8;
            data[offset] = node.x;
            data[offset + 1] = node.y;
            data[offset + 2] = node.z;
            data[offset + 3] = node.color[0];
            data[offset + 4] = node.color[1];
            data[offset + 5] = node.color[2];
            data[offset + 6] = node.color[3];
            data[offset + 7] = node.weight * 10;
        });

        this.nodeBuffer = this.device.createBuffer({
            size: data.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });

        new Float32Array(this.nodeBuffer.getMappedRange()).set(data);
        this.nodeBuffer.unmap();
    }

    private updateEdgeBuffer(): void {
       // Placeholder
    }

    public startAnimation(): void {
        if (!this.device || !this.context || !this.pipeline) return;

        const render = (time: number) => {
            this.renderFrame(time);
            this.frameId = requestAnimationFrame(render);
        };
        render(0);
    }

    public stopAnimation(): void {
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }

    private renderFrame(time: number): void {
        if (!this.device || !this.context || !this.pipeline || !this.canvas || !this.bindGroup) return;

        const viewMatrix = this.createViewMatrix(time);
        const projectionMatrix = this.createProjectionMatrix();
        const uniformData = new Float32Array([...viewMatrix, ...projectionMatrix, time / 1000, 0, 0, 0]);

        this.device.queue.writeBuffer(this.uniformBuffer!, 0, uniformData);

        const commandEncoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const depthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: textureView,
                    clearValue: { r: 0.05, g: 0.05, b: 0.1, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, this.bindGroup);

        if (this.nodeBuffer) {
            passEncoder.setVertexBuffer(0, this.nodeBuffer);
            passEncoder.draw(this.nodes.length);
        }

        passEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    private createViewMatrix(time: number): Float32Array {
        const angle = time * 0.0001;
        const distance = 5;
        const eye = [Math.cos(angle) * distance, 2, Math.sin(angle) * distance];
        const center = [0, 0, 0];
        const up = [0, 1, 0];
        return this.lookAt(eye, center, up);
    }

    private createProjectionMatrix(): Float32Array {
        if (!this.canvas) return new Float32Array(16);
        const aspect = this.canvas.width / this.canvas.height;
        const fov = Math.PI / 4;
        const near = 0.1;
        const far = 100;
        return this.perspective(fov, aspect, near, far);
    }

    private lookAt(eye: number[], center: number[], up: number[]): Float32Array {
        const z = this.normalize(this.subtract(eye, center));
        const x = this.normalize(this.cross(up, z));
        const y = this.cross(z, x);

        return new Float32Array([
            x[0], y[0], z[0], 0,
            x[1], y[1], z[1], 0,
            x[2], y[2], z[2], 0,
            -this.dot(x, eye), -this.dot(y, eye), -this.dot(z, eye), 1
        ]);
    }

    private perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
        const f = 1.0 / Math.tan(fov / 2);
        const rangeInv = 1 / (near - far);

        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (near + far) * rangeInv, -1,
            0, 0, near * far * rangeInv * 2, 0
        ]);
    }

    private normalize(v: number[]): number[] {
        const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        return [v[0] / len, v[1] / len, v[2] / len];
    }

    private cross(a: number[], b: number[]): number[] {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }

    private subtract(a: number[], b: number[]): number[] {
        return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }

    private dot(a: number[], b: number[]): number {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    public destroy(): void {
        this.stopAnimation();
        if (this.nodeBuffer) this.nodeBuffer.destroy();
        if (this.edgeBuffer) this.edgeBuffer.destroy();
        if (this.uniformBuffer) this.uniformBuffer.destroy();
        this.device = null;
        this.context = null;
    }
}






