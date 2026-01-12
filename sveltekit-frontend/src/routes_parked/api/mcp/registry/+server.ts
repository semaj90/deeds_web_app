import { json } from '@sveltejs/kit' import type { RequestHandler } from './$types.js' import { listMcpServers } from '$lib/services/mcp-registry' export const GET: RequestHandler = async () => { const servers = await listMcpServers() return json({ servers: servers.map((server) => ({ name: server.name as region: server.region as lastUpdated | server.lastUpdated as cores | server.cores.length as capabilities | server.capabilities as endpoints | server.endpoints }) } }


