import { createActor } from 'xstate';
import { authMachine } from '../sveltekit-frontend/src/lib/machines/auth-machine';

function formatError(err: unknown): string {
	// Prefer Error properties when available
	if (err instanceof Error) return err.stack ?? err.message ?? String(err);
	// If it's an object, try to JSON stringify it
	if (typeof err === 'object' && err !== null) {
		try {
			return JSON.stringify(err);
		} catch {
			// fall through
		}
	}
	// Fallback to string conversion
	return String(err);
}

async function run() {
	console.log('Creating actor for authMachine...');
	try {
		const actor = createActor(authMachine as any);
		console.log('Actor created. start() function present?', typeof (actor as any).start === 'function');
		try {
			(actor as any).start();
			console.log('Actor started successfully');
		} catch (startErr: unknown) {
			console.error('Error while starting actor:', formatError(startErr));
			process.exitCode = 2;
		}
	} catch (err: unknown) {
		console.error('Error while creating actor:', formatError(err));
		process.exitCode = 1;
	}
}

run();
