<!-- YoRHa Advanced Command Interface - Complete 3D System -->
<!-- Session 64: Migrated writable stores → Svelte 5 $state runes -->
<script lang="ts">
	import type {
		CommandResult,
		HolographicData,
		SystemMetrics,
		YoRHaModule
	} from '$lib/types/yorha-interface';

	// Interface for command responses
	interface CommandResponse {
		output: string;
		data?: unknown;
	}

	// Props
	const {
		systemData,
		legalSession,
		holographicMode = false
	} = $props<{
		systemData?: SystemMetrics;
		legalSession?: any;
		holographicMode?: boolean;
	}>();

	// Core system state (migrated from writable stores → $state runes)
	let systemStatus = $state<'ONLINE' | 'DEGRADED' | 'OFFLINE'>('ONLINE');
	let powerLevel = $state<number>(98.7);
	let activeModules = $state<YoRHaModule[]>([]);
	let commandHistory = $state<CommandResult[]>([]);
	let holographicData = $state<HolographicData[]>([]);

	// 3D visualization elements
	let canvas3D = $state<HTMLCanvasElement | null>(null);
	let glContext: WebGLRenderingContext | null = null;
	let animationId = $state<number | null>(null);

	// System metrics
	let metrics = $state<SystemMetrics>({
		cpu_usage: 45.2,
		memory_usage: 67.8,
		gpu_utilization: 89.3,
		network_latency: 12,
		active_processes: 847,
		security_level: 'MAXIMUM',
		quantum_state: 'COHERENT',
		neural_activity: 94.6
	});

	// Command input
	let commandInput = $state<string>('');
	let isProcessingCommand = $state<boolean>(false);

	// Visual effects
	let glitchActive = $state<boolean>(false);
	let scanlineOpacity = $state(0.3);
	let hologramFlicker = $state<boolean>(false);

	// YoRHa modules configuration
	const yorhaModules: YoRHaModule[] = [
		{
			id: 'legal-ai',
			name: 'LEGAL AI CORE',
			status: 'ACTIVE',
			power: 96.8,
			description: 'Advanced Legal Document Analysis',
			icon: 'gavel',
			color: '#00ff88'
		},
		{
			id: 'evidence-processor',
			name: 'EVIDENCE ANALYSIS',
			status: 'STANDBY',
			power: 78.2,
			description: 'Digital Evidence Processing Unit',
			icon: 'search',
			color: '#ff6b35'
		},
		{
			id: 'neural-network',
			name: 'NEURAL MATRIX',
			status: 'ACTIVE',
			power: 94.1,
			description: 'Machine Learning Core System',
			icon: 'brain',
			color: '#3b82f6'
		},
		{
			id: 'quantum-db',
			name: 'QUANTUM DATABASE',
			status: 'ACTIVE',
			power: 89.7,
			description: 'High-Speed Data Storage Matrix',
			icon: 'database',
			color: '#8b5cf6'
		},
		{
			id: 'security-grid',
			name: 'SECURITY GRID',
			status: 'MAXIMUM',
			power: 99.2,
			description: 'Perimeter Defense System',
			icon: 'shield',
			color: '#ef4444'
		},
		{
			id: 'comms-array',
			name: 'COMMUNICATIONS',
			status: 'ACTIVE',
			power: 87.4,
			description: 'Multi-Protocol Communication Hub',
			icon: 'radio',
			color: '#06b6d4'
		}
	];

	$effect(() => {
		activeModules = yorhaModules;
		initializeHolographics();
		startSystemMonitoring();
		initWebGL();

		return () => {
			if (animationId) cancelAnimationFrame(animationId);
		};
	});

	function initializeHolographics() {
		const initialData: HolographicData[] = [
			{
				id: 'central-core',
				type: 'sphere',
				position: { x: 0, y: 0, z: 0 },
				rotation: { x: 0, y: 0, z: 0 },
				scale: 1.0,
				color: '#00ff88',
				opacity: 0.8,
				animation: 'rotate'
			},
			{
				id: 'data-streams',
				type: 'lines',
				position: { x: 0, y: 0, z: 0 },
				rotation: { x: 0, y: 0, z: 0 },
				scale: 1.0,
				color: '#3b82f6',
				opacity: 0.6,
				animation: 'flow'
			},
			{
				id: 'neural-nodes',
				type: 'points',
				position: { x: 0, y: 0, z: 0 },
				rotation: { x: 0, y: 0, z: 0 },
				scale: 1.0,
				color: '#8b5cf6',
				opacity: 0.9,
				animation: 'pulse'
			}
		];
		holographicData = initialData;
	}

	function startSystemMonitoring() {
		setInterval(() => {
			metrics = {
				...metrics,
				cpu_usage: 40 + Math.random() * 20,
				memory_usage: 60 + Math.random() * 15,
				gpu_utilization: 85 + Math.random() * 10,
				network_latency: 8 + Math.random() * 8,
				neural_activity: 90 + Math.random() * 8
			};
			if (Math.random() < 0.05) {
				triggerGlitch();
			}
		}, 2000);
	}

	function initWebGL() {
		if (!canvas3D) return;
		try {
			glContext = canvas3D.getContext('webgl');
			if (!glContext) {
				console.warn('WebGL not supported, falling back to 2D rendering');
				return;
			}
			setupShaders();
			startRenderLoop();
		} catch (e) {
			console.warn('WebGL init failed', e);
		}
	}

	function setupShaders() {
		if (!glContext) return;
		console.log('YoRHa WebGL shaders initialized');
	}

	function startRenderLoop() {
		const render = (timestamp: number) => {
			if (!glContext || !canvas3D) return;
			glContext.viewport(0, 0, canvas3D.width, canvas3D.height);
			glContext.clearColor(0.02, 0.05, 0.1, 1.0);
			glContext.clear(glContext.COLOR_BUFFER_BIT | glContext.DEPTH_BUFFER_BIT);
			renderHolographics(timestamp);
			animationId = requestAnimationFrame(render);
		};
		render(0);
	}

	function renderHolographics(timestamp: number) {
		holographicData = holographicData.map((item) => ({
			...item,
			rotation: {
				x: item.rotation.x + (item.animation === 'rotate' ? 0.01 : 0),
				y: item.rotation.y + (item.animation === 'rotate' ? 0.02 : 0),
				z: item.rotation.z + (item.animation === 'rotate' ? 0.005 : 0)
			}
		}));
	}

	async function executeCommand(command: string): Promise<void> {
		if (isProcessingCommand) return;
		isProcessingCommand = true;
		const cmdText = command;
		commandInput = '';

		const result: CommandResult = {
			id: `cmd-${Date.now()}`,
			command: cmdText,
			timestamp: new Date().toISOString(),
			status: 'PROCESSING',
			output: 'Executing command...',
			module: 'YORHA-CORE'
		};

		commandHistory = [result, ...commandHistory.slice(0, 9)];

		try {
			const response: CommandResponse = await routeCommand(cmdText);
			commandHistory = commandHistory.map((cmd) => {
				if (cmd.id === result.id) {
					return {
						...cmd,
						status: 'SUCCESS',
						output: response.output || 'Command executed successfully.',
						data: response.data
					};
				}
				return cmd;
			});
		} catch (error) {
			commandHistory = commandHistory.map((cmd) => {
				if (cmd.id === result.id) {
					return {
						...cmd,
						status: 'ERROR',
						output: error instanceof Error ? error.message : 'Unknown error'
					};
				}
				return cmd;
			});
		} finally {
			isProcessingCommand = false;
		}
	}

	async function routeCommand(command: string): Promise<CommandResponse> {
		const cmd = command.toLowerCase().trim();
		if (cmd.startsWith('legal')) return await executeLegalCommand(cmd);
		if (cmd.startsWith('analyze')) return await executeAnalysisCommand(cmd);
		if (cmd.startsWith('search')) return await executeSearchCommand(cmd);
		if (cmd.startsWith('system')) return executeSystemCommand(cmd);
		if (cmd.startsWith('neural')) return await executeNeuralCommand();
		return executeHelpCommand();
	}

	async function executeLegalCommand(cmd: string): Promise<CommandResponse> {
		try {
			return { output: `Legal analysis complete. Processed query: ${cmd}`, data: {} };
		} catch (e) {
			throw new Error('Legal AI system unavailable');
		}
	}

	async function executeAnalysisCommand(cmd: string): Promise<CommandResponse> {
		return {
			output: `Analysis, initiated: ${cmd.replace('analyze ', '')}`,
			data: { analysis_id: 'ANL-' + Date.now(), status: 'queued' }
		};
	}

	async function executeSearchCommand(cmd: string): Promise<CommandResponse> {
		const query = cmd.replace('search ', '');
		return {
			output: `Searching database for: "${query}"`,
			data: { query, results_count: Math.floor(Math.random() * 50) + 1 }
		};
	}

	function executeSystemCommand(cmd: string): CommandResponse {
		if (cmd.includes('status')) {
			return {
				output: 'All systems operational. YoRHa interface running at optimal parameters.',
				data: metrics
			};
		} else if (cmd.includes('modules')) {
			return {
				output: `${activeModules.length} modules active`,
				data: activeModules
			};
		}
		return { output: 'System command processed', data: { status: 'ok' } };
	}

	async function executeNeuralCommand(): Promise<CommandResponse> {
		return {
			output: 'Neural network processing initiated',
			data: { neural_activity: metrics.neural_activity }
		};
	}

	function executeHelpCommand(): CommandResponse {
		return {
			output: `Available commands: LEGAL <query>, ANALYZE <target>, SEARCH <terms>, SYSTEM STATUS, NEURAL SCAN`,
			data: { commands: ['legal', 'analyze', 'search', 'system', 'neural'] }
		};
	}

	function triggerGlitch() {
		glitchActive = true;
		hologramFlicker = true;
		setTimeout(() => {
			glitchActive = false;
			hologramFlicker = false;
		}, 200);
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && commandInput.trim()) {
			executeCommand(commandInput.trim());
		}
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'ACTIVE':
				return '#00ff88';
			case 'STANDBY':
				return '#ffa500';
			case 'MAXIMUM':
				return '#ff0066';
			case 'OFFLINE':
				return '#666';
			default:
				return '#00ff88';
		}
	}
</script>

<!-- YoRHa Command Interface -->
<div
	class="yorha-container min-h-screen bg-panel text-info p-4 relative overflow-hidden"
	class:glitch-effect={glitchActive}
>
	<!-- Scanline Overlay -->
	<div
		class="scanlines pointer-events-none absolute inset-0 z-20"
		style="opacity: {scanlineOpacity}"
	></div>

	<!-- Background Holographic Canvas -->
	<canvas
		bind:this={canvas3D}
		class="holographic-canvas absolute inset-0 w-full h-full z-0 opacity-30 pointer-events-none"
		width="800"
		height="600"
		style="filter: {hologramFlicker ? 'brightness(1.5) hue-rotate(180deg)' : 'brightness(1)'}"
	></canvas>

	<!-- Animated Data Streams -->
	{#each Array(12) as _, i}
		<div
			class="data-stream absolute w-0.5 bg-gradient-to-b from-transparent via-info to-transparent h-24 z-10"
			style="left: {5 + i * 8}%; top: -100px; animation: dataFlow 3s linear infinite; animation-delay: {i *
				0.3}s"
		></div>
	{/each}

	<!-- Main Interface Content -->
	<div class="relative z-30 flex flex-col h-full max-w-7xl mx-auto">
		<!-- Header -->
		<header class="flex justify-between items-center mb-8 border-b border-info/30 pb-4">
			<div>
				<h1 class="hologram-text text-4xl font-bold tracking-widest">
					YoRHa COMMAND INTERFACE
				</h1>
				<p class="text-info/70 text-sm tracking-wider">
					BUNKER UNIT 001 &bull; LEGAL AI OPERATIONS CENTER
				</p>
			</div>
			<div class="flex items-center gap-6">
				<div class="text-right">
					<div class="hologram-text text-2xl font-mono">{powerLevel.toFixed(1)}%</div>
					<div class="text-xs text-info">POWER LEVEL</div>
				</div>
				<div class="flex items-center gap-2">
					<div
						class="w-3 h-3 rounded-full animate-pulse shadow-[0_0_10px_currentColor]"
						style="background-color: {getStatusColor(systemStatus)}"
					></div>
					<span class="hologram-text tracking-wider">{systemStatus}</span>
				</div>
			</div>
		</header>

		<div class="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
			<!-- Left Column: Modules & Metrics -->
			<div class="lg:col-span-1 space-y-6">
				<div class="space-y-4">
					<h3 class="text-sm font-bold border-l-2 border-info pl-2">ACTIVE MODULES</h3>
					{#each activeModules as module}
						<div
							class="module-panel p-3 bg-black/40 border border-info/30 rounded hover:border-info/80 transition-all group"
						>
							<div class="flex justify-between items-center mb-1">
								<span
									class="font-bold text-sm text-info/80 group-hover:text-white transition-colors"
									>{module.name}</span
								>
								<div
									class="w-2 h-2 rounded-full"
									style="background-color: {getStatusColor(module.status)}"
								></div>
							</div>
							<div class="flex justify-between items-end text-xs">
								<span class="text-info/70">{module.status}</span>
								<span class="font-mono">{module.power.toFixed(1)}%</span>
							</div>
							<div class="w-full bg-panelSoft h-0.5 mt-1">
								<div
									class="h-full transition-all duration-1000"
									style="width: {module.power}%; background-color: {module.color}"
								></div>
							</div>
						</div>
					{/each}
				</div>

				<!-- System Metrics -->
				<div class="grid grid-cols-2 gap-2">
					<div class="p-2 border border-info/20 bg-black/60 text-center">
						<div class="font-mono text-lg text-info/80">
							{metrics.cpu_usage.toFixed(1)}%
						</div>
						<div class="text-[10px] text-info">CPU</div>
					</div>
					<div class="p-2 border border-info/20 bg-black/60 text-center">
						<div class="font-mono text-lg text-info/80">
							{metrics.memory_usage.toFixed(1)}%
						</div>
						<div class="text-[10px] text-info">MEM</div>
					</div>
					<div class="p-2 border border-info/20 bg-black/60 text-center">
						<div class="font-mono text-lg text-info/80">{metrics.security_level}</div>
						<div class="text-[10px] text-info">SEC</div>
					</div>
					<div class="p-2 border border-info/20 bg-black/60 text-center">
						<div class="font-mono text-lg text-info/80">
							{metrics.neural_activity.toFixed(0)}
						</div>
						<div class="text-[10px] text-info">NEURAL</div>
					</div>
				</div>
			</div>

			<!-- Center/Right: Terminal -->
			<div
				class="lg:col-span-3 flex flex-col bg-black/80 border border-info/50 rounded-lg overflow-hidden"
			>
				<!-- Terminal Output -->
				<div
					class="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-2 min-h-[400px]"
					id="terminal-output"
				>
					{#each commandHistory as result (result.id)}
						<div class="border-b border-info/20 pb-2 mb-2">
							<div class="flex items-center gap-2 mb-1">
								<span class="text-info">$</span>
								<span class="text-info/60 font-bold">{result.command}</span>
								<span
									class="ml-auto text-[10px] px-1.5 py-0.5 rounded
                            {result.status === 'SUCCESS' ? 'text-accent bg-accent/20' : ''}
                            {result.status === 'ERROR' ? 'text-danger bg-danger/10' : ''}
                            {result.status === 'PROCESSING' ? 'text-warning bg-warning/20' : ''}"
								>
									{result.status}
								</span>
							</div>
							<div class="pl-4 text-info/80 whitespace-pre-wrap">{result.output}</div>
							<div class="text-right text-[10px] text-info mt-1">
								[{result.module}]
							</div>
						</div>
					{/each}
				</div>

				<!-- Command Input -->
				<div class="p-4 bg-info/10 border-t border-info/30 flex items-center gap-3">
					<span class="text-info font-bold animate-pulse">></span>
					<input
						type="text"
						bind:value={commandInput}
						onkeydown={handleKeyPress}
						disabled={isProcessingCommand}
						class="flex-1 bg-transparent border-none outline-none text-info font-mono placeholder-info/40 disabled:opacity-50"
						placeholder="Enter system command..."
						autocomplete="off"
					/>
					{#if isProcessingCommand}
						<span class="text-xs text-warning animate-pulse">PROCESSING...</span>
					{/if}
				</div>
			</div>
		</div>

		<footer class="mt-8 text-center text-xs text-info/50 font-mono">
			<div>YoRHa Legal AI Interface v2.0 &bull; Bunker Operations &bull; Quantum Security Enabled</div>
		</footer>
	</div>
</div>

<style>
	.yorha-container {
		font-family: 'Share Tech Mono', monospace;
	}

	.hologram-text {
		text-shadow: 0 0 5px rgba(6, 182, 212, 0.5);
	}

	.scanlines {
		background: repeating-linear-gradient(
			0deg,
			rgba(0, 0, 0, 0.5),
			rgba(0, 0, 0, 0.5) 1px,
			transparent 1px,
			transparent 2px
		);
		background-size: 100% 4px;
	}

	@keyframes dataFlow {
		0% {
			transform: translateY(-100%);
			opacity: 0;
		}
		20% {
			opacity: 0.5;
		}
		80% {
			opacity: 0.5;
		}
		100% {
			transform: translateY(100vh);
			opacity: 0;
		}
	}

	.glitch-effect {
		animation: glitch 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) both infinite;
	}

	@keyframes glitch {
		0% {
			transform: translate(0);
		}
		20% {
			transform: translate(-2px, 2px);
		}
		40% {
			transform: translate(-2px, -2px);
		}
		60% {
			transform: translate(2px, 2px);
		}
		80% {
			transform: translate(2px, -2px);
		}
		100% {
			transform: translate(0);
		}
	}
</style>
