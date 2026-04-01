/**
 * Docker Container Discovery Helper
 * Dynamically discovers running Docker containers and their mapped ports.
 * Uses `docker` CLI (child_process.execSync) instead of dockerode to avoid
 * ssh2 native .node addon that breaks Rollup/adapter-node bundling.
 */
import { execSync } from 'child_process';

interface DiscoveryOptions {
	containerPattern: string;
	port: number;
	containerName?: string;
	timeout?: number;
}

interface DiscoveryResult {
	host: string;
	port: number;
	url: string;
	containerId: string;
	containerName: string;
}

const DISCOVERY_CACHE = new Map<string, { result: DiscoveryResult; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isDiscoveryEnabled(): boolean {
	return process.env.DEV_DOCKER_DISCOVERY === 'true';
}

function isDevEnvironment(): boolean {
	return process.env.NODE_ENV === 'development' || process.env.VITE_DEV === 'true';
}

interface DockerContainer {
	Id: string;
	Names: string;
	Image: string;
	Ports: string;
}

function listContainers(): DockerContainer[] {
	try {
		const output = execSync(
			'docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Ports}}" --no-trunc',
			{ encoding: 'utf-8', timeout: 5000 }
		);
		return output
			.trim()
			.split('\n')
			.filter(Boolean)
			.map((line) => {
				const [Id, Names, Image, Ports] = line.split('|');
				return { Id, Names, Image, Ports };
			});
	} catch {
		return [];
	}
}

function inspectContainer(
	containerId: string
): { Id: string; Name: string; ports: Map<string, { host: string; port: number }> } | null {
	try {
		const output = execSync(
			`docker inspect --format "{{.Id}}|{{.Name}}|{{json .NetworkSettings.Ports}}" ${containerId}`,
			{ encoding: 'utf-8', timeout: 5000 }
		);
		const [id, name, portsJson] = output.trim().split('|');
		const ports = new Map<string, { host: string; port: number }>();

		try {
			const parsed = JSON.parse(portsJson);
			for (const [key, bindings] of Object.entries(parsed)) {
				if (Array.isArray(bindings) && bindings.length > 0) {
					const b = bindings[0] as { HostIp: string; HostPort: string };
					ports.set(key, {
						host: b.HostIp || 'localhost',
						port: parseInt(b.HostPort, 10)
					});
				}
			}
		} catch {
			/* ignore parse errors */
		}

		return { Id: id, Name: name, ports };
	} catch {
		return null;
	}
}

async function discoverContainerPort(options: DiscoveryOptions): Promise<DiscoveryResult | null> {
	const cacheKey = `${options.containerPattern}:${options.port}`;
	const cached = DISCOVERY_CACHE.get(cacheKey);

	if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
		return cached.result;
	}
	DISCOVERY_CACHE.delete(cacheKey);

	const containers = listContainers();
	if (containers.length === 0) return null;

	// Find matching container
	const pattern = options.containerPattern.toLowerCase();
	const match = options.containerName
		? containers.find(
				(c) =>
					c.Names === options.containerName || c.Names.includes(options.containerName!)
			)
		: containers.find(
				(c) =>
					c.Names.toLowerCase().includes(pattern) ||
					c.Image.toLowerCase().includes(pattern)
			);

	if (!match) return null;

	const info = inspectContainer(match.Id);
	if (!info) return null;

	const portKey = `${options.port}/tcp`;
	const portMapping = info.ports.get(portKey);
	if (!portMapping || isNaN(portMapping.port)) return null;

	const result: DiscoveryResult = {
		host: portMapping.host,
		port: portMapping.port,
		url: `http://${portMapping.host}:${portMapping.port}`,
		containerId: info.Id.substring(0, 12),
		containerName: info.Name
	};

	DISCOVERY_CACHE.set(cacheKey, { result, timestamp: Date.now() });
	return result;
}

export async function discoverServiceEndpoint(
	envVarName: string,
	fallbackUrl: string,
	options: DiscoveryOptions
): Promise<string> {
	const envUrl = process.env[envVarName];
	if (envUrl) return envUrl;

	if (isDiscoveryEnabled() && isDevEnvironment()) {
		try {
			const result = await discoverContainerPort(options);
			if (result) return result.url;
		} catch (error) {
			console.warn('[Docker Discovery] Discovery fallback:', error);
		}
	}

	return fallbackUrl;
}

export async function discoverMultipleServices(
	services: Record<string, { fallbackUrl: string; options: DiscoveryOptions }>
): Promise<Record<string, string>> {
	const results: Record<string, string> = {};
	const promises = Object.entries(services).map(async ([envVarName, config]) => {
		results[envVarName] = await discoverServiceEndpoint(
			envVarName,
			config.fallbackUrl,
			config.options
		);
	});
	await Promise.all(promises);
	return results;
}

export async function verifyServiceEndpoint(
	url: string,
	timeout: number = 5000
): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);
		const response = await fetch(url, { method: 'GET', signal: controller.signal });
		clearTimeout(timeoutId);
		return response.ok;
	} catch {
		return false;
	}
}

export { DISCOVERY_CACHE };