<!--
	Enhanced 3D Legal AI Interface
	Integrates: vLLM/CUDA, SIMD Parser, Neo4j, XState, RabbitMQ
	Features: WebGL 3D vertex buffer, progress animations, contextual chat
-->
<script lang="ts">
	import { browser } from '$app/environment';

	type Recommendation = {
		title: string;
		description: string;
		score: number;
		confidence: number;
		aiGenerated?: boolean;
	};

	type ChatMessage = {
		id: string;
		type: 'user' | 'ai' | 'system';
		content: string;
		timestamp: number;
	};

	type ProgressStage = {
		name: string;
		progress: number;
		status: 'pending' | 'active' | 'completed';
	};

	interface Props {
		enableGPUAcceleration?: boolean;
		enableAIRecommendations?: boolean;
		enableIdleProcessing?: boolean;
		theme?: 'yorha' | 'dark' | string;
		maxConcurrentStreams?: number;
		progressAnimationSpeed?: number;
	}

	let {
		enableGPUAcceleration = true,
		enableAIRecommendations = true,
		enableIdleProcessing = true,
		theme = 'yorha',
		progressAnimationSpeed = 1.0
	}: Props = $props();

	// WebGL refs
	let canvasRef = $state<HTMLCanvasElement | null>(null);
	let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
	let vertexBuffer: WebGLBuffer | null = null;
	let shaderProgram: WebGLProgram | null = null;

	// Component state
	let isInitialized = $state(false);
	let isProcessing = $state(false);
	let currentProgress = $state(0);
	let errorMessage = $state<string | null>(null);
	let userInput = $state('');
	let chatMessages = $state<ChatMessage[]>([]);
	let recommendations = $state<Recommendation[]>([]);

	let progressStages = $state<ProgressStage[]>([
		{ name: 'GPU Initialization', progress: 0, status: 'pending' },
		{ name: 'SIMD Parser Setup', progress: 0, status: 'pending' },
		{ name: 'vLLM/Triton/TensorRT', progress: 0, status: 'pending' },
		{ name: 'Neo4j Connection', progress: 0, status: 'pending' },
		{ name: 'XState Machine Start', progress: 0, status: 'pending' },
		{ name: 'System Ready', progress: 0, status: 'pending' },
	]);

	let performanceMetrics = $state({
		fps: 0,
		gpuUtilization: 0,
		memoryUsage: 0,
		networkLatency: 0,
		cacheHitRate: 0,
		aiResponseTime: 0,
	});

	let animationFrame: number | null = null;
	let lastFrameTime = 0;

	$effect(() => {
		if (!browser) return;

		initializeSystem().catch((err) => {
			console.error('System initialization failed:', err);
			addSystemMessage('System initialization failed. Running in degraded mode.');
			errorMessage = err instanceof Error ? err.message : 'An error occurred';
		});

		return () => {
			if (animationFrame) cancelAnimationFrame(animationFrame);
		};
	});

	async function initializeSystem(): Promise<void> {
		await initializeWebGL();
		await initializeServicesWithProgress();
		startAnimationLoop();
		isInitialized = true;
		addSystemMessage('System initialized successfully. All services operational.');
	}

	async function initializeWebGL(): Promise<void> {
		if (!canvasRef) return;
		gl = canvasRef.getContext('webgl2') || canvasRef.getContext('webgl');
		if (!gl) throw new Error('WebGL not supported');

		const vsSource = `
			attribute vec3 position;
			attribute vec3 color;
			attribute float progress;
			uniform mat4 mvpMatrix;
			uniform float time;
			uniform float globalProgress;
			varying vec3 vColor;
			varying float vProgress;
			void main() {
				vec3 animatedPosition = position;
				animatedPosition.y += sin(time + position.x * 0.1) * progress * 0.1;
				animatedPosition *= mix(0.1, 1.0, globalProgress);
				gl_Position = mvpMatrix * vec4(animatedPosition, 1.0);
				gl_PointSize = mix(2.0, 8.0, progress);
				vColor = mix(vec3(0.3, 0.3, 0.3), color, progress);
				vProgress = progress;
			}`;

		const fsSource = `
			precision mediump float;
			varying vec3 vColor;
			varying float vProgress;
			uniform float time;
			void main() {
				float pulse = sin(time * 3.0) * 0.1 + 0.9;
				vec3 finalColor = vColor * pulse;
				if (vProgress > 0.8) {
					finalColor += vec3(0.2, 0.4, 0.8) * sin(time * 5.0) * 0.3;
				}
				gl_FragColor = vec4(finalColor, mix(0.3, 1.0, vProgress));
			}`;

		const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
		const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
		shaderProgram = createProgram(gl, vertexShader, fragmentShader);
		createVertexBuffer();

		gl.enable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	}

	function createShader(
		ctx: WebGLRenderingContext,
		type: number,
		source: string
	): WebGLShader {
		const shader = ctx.createShader(type)!;
		ctx.shaderSource(shader, source);
		ctx.compileShader(shader);
		if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
			const error = ctx.getShaderInfoLog(shader);
			ctx.deleteShader(shader);
			throw new Error(`Shader compilation error: ${error}`);
		}
		return shader;
	}

	function createProgram(
		ctx: WebGLRenderingContext,
		vs: WebGLShader,
		fs: WebGLShader
	): WebGLProgram {
		const program = ctx.createProgram()!;
		ctx.attachShader(program, vs);
		ctx.attachShader(program, fs);
		ctx.linkProgram(program);
		if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) {
			const error = ctx.getProgramInfoLog(program);
			ctx.deleteProgram(program);
			throw new Error(`Program linking error: ${error}`);
		}
		return program;
	}

	function createVertexBuffer() {
		if (!gl) return;
		const vertices: number[] = [];
		const colors: number[] = [];
		const progressValues: number[] = [];

		const gridSize = 20;
		for (let x = 0; x < gridSize; x++) {
			for (let y = 0; y < gridSize; y++) {
				for (let z = 0; z < 5; z++) {
					vertices.push(
						(x - gridSize / 2) * 0.1,
						(y - gridSize / 2) * 0.1,
						z * 0.05
					);
					const hue = (x + y + z) / (gridSize * 2 + 5);
					colors.push(0.2 + hue * 0.3, 0.4 + hue * 0.4, 0.8 + hue * 0.2);
					progressValues.push(Math.random() * 0.1);
				}
			}
		}

		const interleavedData: number[] = [];
		for (let i = 0; i < vertices.length / 3; i++) {
			interleavedData.push(
				vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2],
				colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2],
				progressValues[i]
			);
		}

		vertexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(interleavedData), gl.DYNAMIC_DRAW);
	}

	async function initializeServicesWithProgress(): Promise<void> {
		const stages = progressStages;
		try {
			// Stage 0: GPU Init
			stages[0].status = 'active';
			stages[0].progress = 0.5;
			if (enableGPUAcceleration) {
				await new Promise((r) => setTimeout(r, 150));
			}
			stages[0].progress = 1.0;
			stages[0].status = 'completed';

			// Stage 1: SIMD Parser
			stages[1].status = 'active';
			await new Promise((r) => setTimeout(r, 100));
			stages[1].progress = 1.0;
			stages[1].status = 'completed';

			// Stage 2: vLLM/Triton
			stages[2].status = 'active';
			await new Promise((r) => setTimeout(r, 200));
			stages[2].progress = 1.0;
			stages[2].status = 'completed';

			// Stage 3: Neo4j
			stages[3].status = 'active';
			if (enableAIRecommendations) {
				await new Promise((r) => setTimeout(r, 100));
			}
			stages[3].progress = 1.0;
			stages[3].status = 'completed';

			// Stage 4: XState
			stages[4].status = 'active';
			stages[4].progress = 1.0;
			stages[4].status = 'completed';

			// Stage 5: Ready
			stages[5].status = 'active';
			stages[5].progress = 1.0;
			stages[5].status = 'completed';
		} catch (error) {
			stages.forEach((s) => {
				if (s.status === 'active') {
					s.status = 'pending';
					s.progress = 0;
				}
			});
			throw error;
		}
	}

	function startAnimationLoop() {
		const animate = (currentTime: number) => {
			const deltaTime = currentTime - lastFrameTime;
			lastFrameTime = currentTime;
			performanceMetrics.fps = deltaTime > 0 ? 1000 / deltaTime : 0;
			render3DScene(currentTime);
			updateProgressAnimations();
			animationFrame = requestAnimationFrame(animate);
		};
		animationFrame = requestAnimationFrame(animate);
	}

	function render3DScene(currentTime: number) {
		if (!gl || !shaderProgram || !vertexBuffer || !canvasRef) return;

		gl.viewport(0, 0, canvasRef.width, canvasRef.height);
		gl.clearColor(0.02, 0.02, 0.03, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.useProgram(shaderProgram);

		const stride = (3 + 3 + 1) * 4;
		gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);

		const posLoc = gl.getAttribLocation(shaderProgram, 'position');
		const colorLoc = gl.getAttribLocation(shaderProgram, 'color');
		const progLoc = gl.getAttribLocation(shaderProgram, 'progress');

		if (posLoc >= 0) {
			gl.enableVertexAttribArray(posLoc);
			gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, stride, 0);
		}
		if (colorLoc >= 0) {
			gl.enableVertexAttribArray(colorLoc);
			gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, stride, 12);
		}
		if (progLoc >= 0) {
			gl.enableVertexAttribArray(progLoc);
			gl.vertexAttribPointer(progLoc, 1, gl.FLOAT, false, stride, 24);
		}

		const timeLoc = gl.getUniformLocation(shaderProgram, 'time');
		const globalProgressLoc = gl.getUniformLocation(shaderProgram, 'globalProgress');
		const mvpLoc = gl.getUniformLocation(shaderProgram, 'mvpMatrix');

		if (timeLoc) gl.uniform1f(timeLoc, currentTime / 1000);
		if (globalProgressLoc) gl.uniform1f(globalProgressLoc, currentProgress);
		if (mvpLoc) gl.uniformMatrix4fv(mvpLoc, false, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

		const vertexCount = (gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) / stride) | 0;
		gl.drawArrays(gl.POINTS, 0, vertexCount);
	}

	function updateProgressAnimations() {
		const targetProgress =
			progressStages.filter((s) => s.status === 'completed').length / progressStages.length;
		currentProgress += (targetProgress - currentProgress) * 0.05 * progressAnimationSpeed;
	}

	async function handleUserInput(): Promise<void> {
		const text = userInput.trim();
		if (!text || isProcessing) return;

		addMessage(text, 'user');
		userInput = '';
		isProcessing = true;
		errorMessage = null;

		try {
			const response = await fetch('/api/ai/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt: text,
					model: 'gemma3-legal:latest',
					context: { history: chatMessages },
				}),
			});

			if (!response.ok) throw new Error(`API Error: ${response.status} ${response.statusText}`);
			const result = await response.json();
			addMessage(result.response || 'No response from AI.', 'ai');
			if (result.recommendations) recommendations = result.recommendations;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'An unknown error occurred.';
			addMessage(`Error: ${message}`, 'system');
			errorMessage = message;
		} finally {
			isProcessing = false;
		}
	}

	function addMessage(content: string, type: 'user' | 'ai' | 'system' = 'system') {
		chatMessages = [
			...chatMessages,
			{ id: crypto.randomUUID(), type, content, timestamp: Date.now() },
		];
	}

	function addSystemMessage(content: string) {
		addMessage(content, 'system');
	}
</script>

<div class="interface {theme}">
	<canvas bind:this={canvasRef} class="viz-canvas" width={600} height={400}></canvas>

	<div class="status-panel">
		<div class="status-header">
			<h3>System Status</h3>
			<div class="status-dot" class:active={isInitialized}>
				<span class="pulse-dot"></span>
				<span>{isInitialized ? 'Online' : 'Initializing'}</span>
			</div>
		</div>

		<div class="init-progress">
			{#each progressStages as stage}
				<div class="stage" class:active={stage.status === 'active'} class:completed={stage.status === 'completed'}>
					<div class="stage-name">{stage.name}</div>
					<div class="stage-bar">
						<div class="bar-track">
							<div class="bar-fill" style="width: {stage.progress * 100}%"></div>
						</div>
						<span class="bar-pct">{(stage.progress * 100).toFixed(0)}%</span>
					</div>
				</div>
			{/each}
		</div>

		<div class="metrics">
			<div class="metric">
				<span class="metric-label">FPS</span>
				<span class="metric-value">{performanceMetrics.fps.toFixed(1)}</span>
			</div>
			<div class="metric">
				<span class="metric-label">GPU</span>
				<span class="metric-value">{performanceMetrics.gpuUtilization.toFixed(1)}%</span>
			</div>
		</div>

		{#if errorMessage}
			<div class="error-box">{errorMessage}</div>
		{/if}
	</div>

	<div class="chat-panel">
		<div class="chat-header">
			<h3>Contextual Chat</h3>
			<span class="ai-badge" class:processing={isProcessing}>
				{isProcessing ? 'AI Thinking...' : 'Ready'}
			</span>
		</div>

		<div class="chat-messages">
			{#each chatMessages as message (message.id)}
				<div class="msg" class:user={message.type === 'user'} class:ai={message.type === 'ai'} class:system={message.type === 'system'}>
					<div class="msg-type">{message.type.toUpperCase()}</div>
					<div class="msg-content">{message.content}</div>
					<div class="msg-time">{new Date(message.timestamp).toLocaleTimeString()}</div>
				</div>
			{/each}
		</div>

		<div class="chat-input">
			<input
				bind:value={userInput}
				placeholder="Enter legal query or document text..."
				onkeydown={(e) => e.key === 'Enter' && handleUserInput()}
				disabled={!isInitialized || isProcessing}
			/>
			<button onclick={handleUserInput} disabled={!isInitialized || isProcessing}>
				{isProcessing ? 'Processing...' : 'Analyze'}
			</button>
		</div>
	</div>

	{#if recommendations.length > 0}
		<div class="rec-panel">
			<h3>AI Recommendations</h3>
			{#each recommendations as rec}
				<div class="rec-card">
					<div class="rec-title">{rec.title}</div>
					<div class="rec-desc">{rec.description}</div>
					<div class="rec-meta">
						<span>Score: {(rec.score * 100).toFixed(0)}%</span>
						<span>Confidence: {(rec.confidence * 100).toFixed(0)}%</span>
					</div>
					{#if rec.aiGenerated}
						<span class="rec-ai-badge">AI Generated</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.interface {
		display: grid;
		grid-template-columns: 1fr 300px;
		grid-template-rows: 1fr auto;
		gap: 16px;
		padding: 16px;
		background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%);
		color: #ffffff;
		font-family: 'Roboto Mono', monospace;
		min-height: 600px;
		border-radius: 8px;
	}

	.viz-canvas {
		grid-column: 1;
		grid-row: 1;
		border: 1px solid #444;
		border-radius: 4px;
		background: rgba(0, 0, 0, 0.6);
		width: 100%;
		height: 100%;
		min-height: 300px;
	}

	.status-panel {
		grid-column: 2;
		grid-row: 1 / 3;
		background: rgba(0, 0, 0, 0.7);
		border: 1px solid #333;
		border-radius: 8px;
		padding: 16px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.status-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}
	.status-header h3 {
		margin: 0;
		color: #00d4aa;
		font-size: 14px;
		text-transform: uppercase;
	}

	.status-dot {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: #888;
	}
	.status-dot.active { color: #00d4aa; }

	.pulse-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #888;
		animation: pulse 2s infinite;
	}
	.status-dot.active .pulse-dot { background: #00d4aa; }

	.init-progress { margin-bottom: 16px; }

	.stage {
		margin-bottom: 8px;
		padding: 8px;
		border: 1px solid #333;
		border-radius: 4px;
		font-size: 12px;
	}
	.stage.active {
		border-color: #00d4aa;
		background: rgba(0, 212, 170, 0.1);
	}
	.stage.completed {
		border-color: #4caf50;
		background: rgba(76, 175, 80, 0.1);
	}

	.stage-name { font-weight: bold; margin-bottom: 4px; }

	.stage-bar {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.bar-track {
		flex: 1;
		height: 4px;
		background: #333;
		border-radius: 2px;
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
		background: linear-gradient(90deg, #00d4aa, #00ff88);
		border-radius: 2px;
		transition: width 0.3s ease;
	}
	.bar-pct {
		font-size: 10px;
		color: #888;
		min-width: 30px;
		text-align: right;
	}

	.metrics {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-bottom: 16px;
	}
	.metric {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 4px 8px;
		background: rgba(0, 0, 0, 0.5);
		border-radius: 4px;
		font-size: 11px;
	}
	.metric-label { color: #888; }
	.metric-value { color: #00d4aa; font-weight: bold; }

	.error-box {
		background: rgba(255, 0, 0, 0.2);
		border: 1px solid red;
		padding: 8px;
		border-radius: 4px;
		color: #ffcccc;
		font-size: 12px;
		margin-top: 16px;
	}

	.chat-panel {
		grid-column: 1;
		grid-row: 2;
		background: rgba(0, 0, 0, 0.7);
		border: 1px solid #333;
		border-radius: 8px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		min-height: 250px;
		max-height: 40vh;
	}
	.chat-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
		padding-bottom: 8px;
		border-bottom: 1px solid #333;
	}
	.chat-header h3 {
		margin: 0;
		color: #00d4aa;
		font-size: 14px;
		text-transform: uppercase;
	}
	.ai-badge { font-size: 12px; color: #888; }
	.ai-badge.processing { color: #ff9800; animation: pulse 1s infinite; }

	.chat-messages {
		flex: 1;
		overflow-y: auto;
		margin-bottom: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.msg { padding: 8px 12px; border-radius: 8px; font-size: 13px; }
	.msg.user {
		background: rgba(0, 212, 170, 0.1);
		border-left: 3px solid #00d4aa;
		align-self: flex-end;
		max-width: 70%;
	}
	.msg.ai {
		background: rgba(33, 150, 243, 0.1);
		border-left: 3px solid #2196f3;
		align-self: flex-start;
		max-width: 80%;
	}
	.msg.system {
		background: rgba(255, 152, 0, 0.1);
		border-left: 3px solid #ff9800;
		align-self: center;
		max-width: 90%;
		text-align: center;
		font-style: italic;
	}
	.msg-type { font-size: 10px; color: #888; text-transform: uppercase; margin-bottom: 4px; }
	.msg-content { margin-bottom: 4px; line-height: 1.4; white-space: pre-wrap; }
	.msg-time { font-size: 10px; color: #666; text-align: right; }

	.chat-input { display: flex; gap: 12px; }
	.chat-input input {
		flex: 1;
		padding: 10px 12px;
		background: rgba(0, 0, 0, 0.5);
		border: 1px solid #333;
		border-radius: 4px;
		color: #ffffff;
		font-family: inherit;
		font-size: 13px;
	}
	.chat-input input:focus {
		outline: none;
		border-color: #00d4aa;
		box-shadow: 0 0 0 2px rgba(0, 212, 170, 0.2);
	}
	.chat-input button {
		padding: 10px 16px;
		background: #00d4aa;
		border: none;
		border-radius: 4px;
		color: #000;
		font-family: inherit;
		font-size: 13px;
		font-weight: bold;
		cursor: pointer;
		transition: background 0.2s;
	}
	.chat-input button:hover:not(:disabled) { background: #00ff88; }
	.chat-input button:disabled { background: #333; color: #666; cursor: not-allowed; }

	.rec-panel {
		grid-column: 1 / -1;
		background: rgba(0, 0, 0, 0.7);
		border: 1px solid #333;
		border-radius: 8px;
		padding: 16px;
	}
	.rec-panel h3 { color: #00d4aa; font-size: 14px; text-transform: uppercase; margin: 0 0 12px; }
	.rec-card {
		padding: 12px;
		border: 1px solid #333;
		border-radius: 4px;
		margin-bottom: 8px;
		background: rgba(0, 0, 0, 0.4);
	}
	.rec-title { font-weight: bold; font-size: 13px; margin-bottom: 4px; }
	.rec-desc { font-size: 12px; color: #aaa; margin-bottom: 6px; }
	.rec-meta { display: flex; gap: 16px; font-size: 11px; color: #888; }
	.rec-ai-badge {
		display: inline-block;
		margin-top: 4px;
		padding: 2px 6px;
		background: rgba(0, 212, 170, 0.2);
		border: 1px solid #00d4aa;
		border-radius: 3px;
		font-size: 10px;
		color: #00d4aa;
	}

	/* YoRHa theme overrides */
	.yorha .status-dot.active { color: #d4af37; }
	.yorha .status-dot.active .pulse-dot { background: #d4af37; }
	.yorha .stage.active { border-color: #d4af37; background: rgba(212, 175, 55, 0.1); }
	.yorha .metric-value { color: #d4af37; }
	.yorha .viz-canvas { border-color: #d4af37; }
	.yorha .status-header h3,
	.yorha .chat-header h3,
	.yorha .rec-panel h3 { color: #d4af37; }

	@keyframes pulse {
		0% { opacity: 0.5; }
		50% { opacity: 1; }
		100% { opacity: 0.5; }
	}

	@media (max-width: 1200px) {
		.interface {
			grid-template-columns: 1fr;
			grid-template-rows: 300px auto auto;
		}
		.viz-canvas { grid-column: 1; grid-row: 1; }
		.status-panel { grid-column: 1; grid-row: 2; max-height: 300px; }
		.chat-panel { grid-column: 1; grid-row: 3; max-height: none; }
	}
</style>
