import { packetizePhase101ParentAtlas } from '../../sveltekit-frontend/src/lib/server/atlas/phase101-parent-atlas-packetizer.mjs';

function parseArgs(argv) {
	const args = new Set(argv.slice(2));
	return {
		dryRun: args.has('--dry-run') || !args.has('--write') && !args.has('--apply'),
		write: args.has('--write') || args.has('--apply'),
	};
}

function printJson(label, value) {
	console.log(`${label}:`);
	console.log(JSON.stringify(value, null, 2));
}

async function main() {
	const { dryRun, write } = parseArgs(process.argv);
	const result = await packetizePhase101ParentAtlas({ dryRun: dryRun && !write ? true : false });

	console.log(`scanner_command: ${result.scanner.command}`);
	console.log(`scanner_effective_command: ${result.scanner.effectiveCommand}`);
	console.log(`scanner_exit_code: ${result.scanner.exitCode}`);
	console.log(`scanner_fallback_used: ${result.scanner.fallbackUsed ? 'true' : 'false'}`);
	console.log(`cache_key: ${result.packet.cache_key}`);
	console.log(`packet_id: ${result.packet.packet_id}`);
	console.log(`cache_backend: ${result.storage.cacheBackend}`);
	console.log(`model_used: ${result.modelUsed ? 'true' : 'false'}`);

	if (result.missingEnvVars.length > 0) {
		console.log(`missing_env_vars: ${result.missingEnvVars.join(', ')}`);
	} else {
		console.log('missing_env_vars: none');
	}

	printJson('packet', result.packet);
	console.log(`recommendation.command: ${result.recommendation.command}`);
	console.log(`recommendation.read_only: ${result.recommendation.read_only}`);
	console.log(`recommendation.reason: ${result.recommendation.reason}`);

	if (!write) {
		console.log('mode: dry-run');
		return;
	}

	printJson('storage', result.storage);
	console.log('mode: apply');
}

main().catch((error) => {
	console.error(
		'[phase101-parent-atlas-packetize] failed:',
		error instanceof Error ? error.stack ?? error.message : String(error)
	);
	process.exitCode = 1;
});

