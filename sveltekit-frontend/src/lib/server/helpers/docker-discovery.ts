/**
 * Docker Container Discovery Helper
 * Dynamically discovers running Docker containers and their mapped ports.
 */
import Docker from 'dockerode';

interface DiscoveryOptions {
    containerPattern: string;    // Pattern to match container name or image (case-insensitive)
    port: number;                // Port to look for in container (e.g., 6333 for Qdrant)
    containerName?: string;      // Optional: specific container name to match exactly
    timeout?: number;            // Optional: timeout in ms
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

let dockerClient: Docker | null = null;

function getDockerClient(): Docker {
    if (!dockerClient) {
        dockerClient = new Docker();
    }
    return dockerClient;
}

function isDiscoveryEnabled(): boolean {
    return process.env.DEV_DOCKER_DISCOVERY === 'true';
}

function isDevEnvironment(): boolean {
    return process.env.NODE_ENV === 'development' || process.env.VITE_DEV === 'true';
}

function getPortMapping(container: Docker.ContainerInspectInfo, targetPort: number): { host: string; port: number } | null {
    try {
        const portKey = `${targetPort}/tcp`;
        const portBindings = container.NetworkSettings?.Ports?.[portKey];

        if (!portBindings || portBindings.length === 0) {
            return null;
        }

        const binding = portBindings[0];
        const host = binding.HostIp || 'localhost';
        const port = parseInt(binding.HostPort, 10);

        if (isNaN(port)) return null;

        return { host, port };
    } catch (error) {
        console.warn('[Docker Discovery] Error parsing port mapping:', error);
        return null;
    }
}

async function findContainer(options: DiscoveryOptions): Promise<Docker.ContainerInspectInfo | null> {
    try {
        const docker = getDockerClient();
        const containers = await docker.listContainers({ all: false }); // Running only

        if (containers.length === 0) return null;

        // If exact name provided
        if (options.containerName) {
            const exact = containers.find(c =>
                c.Names.includes(`/${options.containerName}`) ||
                c.Names.some(n => n.endsWith(`/${options.containerName}`))
            );
            if (exact) {
                return await docker.getContainer(exact.Id).inspect();
            }
        }

        // Search by pattern
        const pattern = options.containerPattern.toLowerCase();
        const matching = containers.find(c =>
            c.Names.some(n => n.toLowerCase().includes(pattern)) ||
            c.Image.toLowerCase().includes(pattern)
        );

        if (!matching) return null;

        return await docker.getContainer(matching.Id).inspect();
    } catch (error) {
        console.warn('[Docker Discovery] Error finding container:', error);
        return null;
    }
}

async function discoverContainerPort(options: DiscoveryOptions): Promise<DiscoveryResult | null> {
    const cacheKey = `${options.containerPattern}:${options.port}`;
    const cached = DISCOVERY_CACHE.get(cacheKey);

    if (cached) {
        if ((Date.now() - cached.timestamp) < CACHE_TTL_MS) {
            return cached.result;
        }
        DISCOVERY_CACHE.delete(cacheKey);
    }

    const container = await findContainer(options);
    if (!container) return null;

    const portMapping = getPortMapping(container, options.port);
    if (!portMapping) return null;

    const result: DiscoveryResult = {
        host: portMapping.host,
        port: portMapping.port,
        url: `http://${portMapping.host}:${portMapping.port}`,
        containerId: container.Id.substring(0, 12),
        containerName: container.Name
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
    if (envUrl) {
        return envUrl;
    }

    if (isDiscoveryEnabled() && isDevEnvironment()) {
        try {
            const result = await discoverContainerPort(options);
            if (result) {
                return result.url;
            }
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
        const url = await discoverServiceEndpoint(envVarName, config.fallbackUrl, config.options);
        results[envVarName] = url;
    });
    await Promise.all(promises);
    return results;
}

export async function verifyServiceEndpoint(url: string, timeout: number = 5000): Promise<boolean> {
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
