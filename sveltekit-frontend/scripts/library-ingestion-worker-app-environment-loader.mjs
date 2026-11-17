const appEnvironmentModule = `data:text/javascript,${encodeURIComponent(`
  export const browser = false;
  export const building = false;
  export const dev = process.env.NODE_ENV !== 'production';
  export const version = 'standalone-worker';
`)}`;
const privateEnvironmentModule = `data:text/javascript,${encodeURIComponent(`
  export const env = process.env;
  export default env;
`)}`;

export async function resolve(specifier, context, nextResolve) {
	if (specifier === '$app/environment') {
		return { url: appEnvironmentModule, shortCircuit: true };
	}
	if (specifier === '$env/dynamic/private') {
		return { url: privateEnvironmentModule, shortCircuit: true };
	}
	return nextResolve(specifier, context);
}
