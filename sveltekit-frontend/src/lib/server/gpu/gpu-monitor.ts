/**
 * GPU Monitor Service — Real-time VRAM tracking via nvidia-smi
 *
 * Features:
 * - Current VRAM usage + free memory
 * - GPU utilization percentage
 * - Temperature monitoring
 * - Process-level VRAM breakdown
 * - Cached readings (1-second debounce)
 *
 * Works on Windows (nvidia-smi.exe) and Linux (nvidia-smi)
 */

import { execSync } from 'child_process';
import { platform } from 'os';

// nvidia-smi path differs by OS
const NVIDIA_SMI = platform() === 'win32'
	? 'C:\\Windows\\System32\\nvidia-smi.exe'
	: 'nvidia-smi';

// Cache readings for 1 second to avoid hammering GPU
const CACHE_TTL_MS = 1000;
let cachedStats: GpuStats | null = null;
let cachedAt = 0;

export interface GpuMemory {
	totalMB: number;
	usedMB: number;
	freeMB: number;
	usedPercent: number;
}

export interface GpuProcess {
	pid: number;
	name: string;
	usedMemoryMB: number;
}

export interface GpuStats {
	available: boolean;
	name: string;
	driverVersion: string;
	memory: GpuMemory;
	utilizationPercent: number;
	temperatureCelsius: number;
	powerWatts: number;
	processes: GpuProcess[];
	timestamp: string;
}

/**
 * Parse nvidia-smi CSV output for GPU stats
 */
function parseNvidiaSmiOutput(output: string): Partial<GpuStats> {
	try {
		// Parse: name, memory.total, memory.used, memory.free, utilization.gpu, temperature.gpu, power.draw
		const lines = output.trim().split('\n');
		if (lines.length === 0) return { available: false, name: 'Unknown' };

		const values = lines[0].split(',').map(v => v.trim());
		const [name, totalMB, usedMB, freeMB, utilization, temp, power] = values;

		const total = parseInt(totalMB) || 0;
		const used = parseInt(usedMB) || 0;
		const free = parseInt(freeMB) || 0;

		return {
			available: true,
			name: name || 'GPU',
			memory: {
				totalMB: total,
				usedMB: used,
				freeMB: free,
				usedPercent: total > 0 ? Math.round((used / total) * 100) : 0
			},
			utilizationPercent: parseInt(utilization) || 0,
			temperatureCelsius: parseInt(temp) || 0,
			powerWatts: parseFloat(power) || 0
		};
	} catch (err) {
		console.warn('[gpu-monitor] Failed to parse nvidia-smi output', err);
		return { available: false, name: 'Unknown' };
	}
}

/**
 * Parse process list from nvidia-smi
 */
function parseProcesses(output: string): GpuProcess[] {
	try {
		const lines = output.trim().split('\n').filter(l => l.length > 0);
		return lines.map(line => {
			// Format: pid, process_name, used_memory [MiB]
			const [pid, name, mem] = line.split(',').map(v => v.trim());
			return {
				pid: parseInt(pid) || 0,
				name: name || 'unknown',
				usedMemoryMB: parseInt(mem) || 0
			};
		}).filter(p => p.pid > 0);
	} catch {
		return [];
	}
}

/**
 * Get current GPU statistics via nvidia-smi
 * Results are cached for 1 second to minimize overhead
 */
export async function getGpuStats(): Promise<GpuStats> {
	const now = Date.now();

	// Return cached result if fresh
	if (cachedStats && (now - cachedAt) < CACHE_TTL_MS) {
		return cachedStats;
	}

	try {
		// Query GPU stats
		const statsCmd = `${NVIDIA_SMI} --query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,power.draw --format=csv,noheader,nounits`;
		const statsOutput = execSync(statsCmd, { timeout: 5000, encoding: 'utf-8' });
		const parsed = parseNvidiaSmiOutput(statsOutput);

		// Query processes using GPU
		let processes: GpuProcess[] = [];
		try {
			const procCmd = `${NVIDIA_SMI} --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits`;
			const procOutput = execSync(procCmd, { timeout: 5000, encoding: 'utf-8' });
			processes = parseProcesses(procOutput);
		} catch {
			// Process query may fail if no processes using GPU
		}

		// Query driver version
		let driverVersion = 'unknown';
		try {
			const driverCmd = `${NVIDIA_SMI} --query-gpu=driver_version --format=csv,noheader`;
			driverVersion = execSync(driverCmd, { timeout: 2000, encoding: 'utf-8' }).trim();
		} catch {
			// Driver query may fail
		}

		const stats: GpuStats = {
			available: parsed.available ?? false,
			name: parsed.name ?? 'Unknown',
			driverVersion,
			memory: parsed.memory ?? { totalMB: 0, usedMB: 0, freeMB: 0, usedPercent: 0 },
			utilizationPercent: parsed.utilizationPercent ?? 0,
			temperatureCelsius: parsed.temperatureCelsius ?? 0,
			powerWatts: parsed.powerWatts ?? 0,
			processes,
			timestamp: new Date().toISOString()
		};

		// Cache result
		cachedStats = stats;
		cachedAt = now;

		return stats;
	} catch (err) {
		// nvidia-smi not available or failed
		const fallback: GpuStats = {
			available: false,
			name: 'Not available',
			driverVersion: 'N/A',
			memory: { totalMB: 0, usedMB: 0, freeMB: 0, usedPercent: 0 },
			utilizationPercent: 0,
			temperatureCelsius: 0,
			powerWatts: 0,
			processes: [],
			timestamp: new Date().toISOString()
		};

		console.warn('[gpu-monitor] nvidia-smi not available', err);
		cachedStats = fallback;
		cachedAt = now;
		return fallback;
	}
}

/**
 * Check if GPU has enough free VRAM for an operation
 * @param requiredMB - Required VRAM in MB
 * @returns true if enough VRAM available
 */
export async function hasEnoughVram(requiredMB: number): Promise<boolean> {
	const stats = await getGpuStats();
	return stats.available && stats.memory.freeMB >= requiredMB;
}

/**
 * Get VRAM utilization as a simple percentage
 */
export async function getVramUtilization(): Promise<number> {
	const stats = await getGpuStats();
	return stats.memory.usedPercent;
}

/**
 * Check if temperature is within safe range
 * @param maxTemp - Maximum safe temperature (default 85°C)
 */
export async function isTemperatureSafe(maxTemp = 85): Promise<boolean> {
	const stats = await getGpuStats();
	return stats.temperatureCelsius < maxTemp;
}

/**
 * Get summary for logging/monitoring
 */
export async function getGpuSummary(): Promise<string> {
	const stats = await getGpuStats();
	if (!stats.available) return 'GPU: Not available';

	return `GPU: ${stats.name} | VRAM: ${stats.memory.usedMB}/${stats.memory.totalMB}MB (${stats.memory.usedPercent}%) | Util: ${stats.utilizationPercent}% | Temp: ${stats.temperatureCelsius}°C`;
}
