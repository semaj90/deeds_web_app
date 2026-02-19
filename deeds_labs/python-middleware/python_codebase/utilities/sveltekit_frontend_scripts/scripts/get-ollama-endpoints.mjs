#!/usr/bin/env node
/**
 * Small helper script that resolves the active Ollama base URL
 * and prints the derived API endpoints plus currently available models.
 *
 * This allows the VS Code task runner (and developers) to quickly confirm
 * that embeddinggemma:latest is available locally before running pipelines.
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';

export function getOllamaEndpoints() {
	const baseUrl = (resolveBaseUrl() || 'http://localhost:11434').replace(/\/$/, '');
	return {
		baseUrl,
		embeddings: `${baseUrl}/api/embeddings`,
		generate: `${baseUrl}/api/generate`,
		tags: `${baseUrl}/api/tags`
	};
}

function resolveBaseUrl() {
	const env = process.env;
	return (
		env.OLLAMA_ENDPOINT ||
		env.OLLAMA_URL ||
		env.PUBLIC_OLLAMA_URL ||
		env.VITE_OLLAMA_ENDPOINT ||
		env.VITE_OLLAMA_URL ||
		''
	);
}

async function fetchModelSummary(tagsEndpoint) {
	try {
		const response = await fetch(tagsEndpoint);
		if (!response.ok) {
			throw new Error(`Request failed: ${response.status} ${response.statusText}`);
		}
		const data = await response.json();
		const models = data.models?.map((model) => ({
			name: model.name,
			modified_at: model.modified_at
		}));
		return models ?? [];
	} catch (error) {
		return { error: error.message };
	}
}

async function main() {
	const endpoints = getOllamaEndpoints();
	console.log('\n🔎 Resolved Ollama endpoints');
	console.log('-----------------------------');
	console.log(`Base URL:       ${endpoints.baseUrl}`);
	console.log(`Embeddings API: ${endpoints.embeddings}`);
	console.log(`Generate API:   ${endpoints.generate}`);
	console.log(`Tags API:       ${endpoints.tags}\n`);

	const modelSummary = await fetchModelSummary(endpoints.tags);
	if (Array.isArray(modelSummary)) {
		if (modelSummary.length === 0) {
			console.log('⚠️  No models reported by Ollama. Run `ollama list` to install models.');
		} else {
			console.log('📦 Available models:');
			for (const model of modelSummary) {
				console.log(`  • ${model.name}${model.name.includes('embeddinggemma') ? ' ✅' : ''}`);
			}
		}
	} else {
		console.log(`⚠️  Unable to query models: ${modelSummary.error}`);
	}

	console.log(
		'\nTip: ensure `embeddinggemma:latest` is present so all embedding services produce 384-d vectors.'
	);
}

const executedDirectly =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (executedDirectly) {
	main().catch((error) => {
		console.error('Failed to resolve Ollama endpoints:', error);
		process.exit(1);
	});
}
