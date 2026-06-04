#!/usr/bin/env node
import 'dotenv/config';
import { ensureLlamaServer, ensureEmbedServer } from '../ensure-llama-server.mjs';

console.log('[llama-servers-wrapper] Starting both chat and embed servers...');
await Promise.all([ensureLlamaServer(), ensureEmbedServer()]);
console.log('[llama-servers-wrapper] Servers started.');
