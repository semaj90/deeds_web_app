/**
 * OS Browser Shim
 * Provides browser-compatible stubs for Node.js os module.
 * Returns sensible defaults based on browser environment.
 */

export const platform = () => 'browser';
export const type = () => 'Browser';
export const arch = () => 'x64';
export const release = () => (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown');
export const hostname = () => (typeof location !== 'undefined' ? location.hostname : 'localhost');
export const tmpdir = () => '/tmp';
export const homedir = () => '/';
export const endianness = () => 'LE';
export const EOL = '\n';
export const devNull = '/dev/null';

export const cpus = () => {
	const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
	const cpuInfo = {
		model: 'Browser JavaScript Engine',
		speed: 2000,
		times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
	};
	return Array.from({ length: cores }, () => ({ ...cpuInfo }));
};

export const totalmem = () => {
	if (typeof navigator !== 'undefined' && navigator.deviceMemory) {
		return navigator.deviceMemory * 1024 * 1024 * 1024;
	}
	return 8 * 1024 * 1024 * 1024; // 8GB default
};

export const freemem = () => {
	return 4 * 1024 * 1024 * 1024; // 4GB mock
};

export const uptime = () => {
	if (typeof performance !== 'undefined') {
		return performance.now() / 1000;
	}
	return 0;
};

export const loadavg = () => [0, 0, 0];

export const networkInterfaces = () => ({});

export const userInfo = () => ({
	uid: -1,
	gid: -1,
	username: 'browser',
	homedir: '/',
	shell: null,
});

export const version = () => 'browser';

export const machine = () => 'x86_64';

export const availableParallelism = () => {
	return typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
};

export const constants = {
	signals: {
		SIGHUP: 1,
		SIGINT: 2,
		SIGQUIT: 3,
		SIGILL: 4,
		SIGTRAP: 5,
		SIGABRT: 6,
		SIGBUS: 7,
		SIGFPE: 8,
		SIGKILL: 9,
		SIGUSR1: 10,
		SIGSEGV: 11,
		SIGUSR2: 12,
		SIGPIPE: 13,
		SIGALRM: 14,
		SIGTERM: 15,
	},
	errno: {},
	priority: {
		PRIORITY_LOW: 19,
		PRIORITY_BELOW_NORMAL: 10,
		PRIORITY_NORMAL: 0,
		PRIORITY_ABOVE_NORMAL: -7,
		PRIORITY_HIGH: -14,
		PRIORITY_HIGHEST: -20,
	},
};

export const setPriority = () => {};
export const getPriority = () => 0;

export default {
	platform,
	type,
	arch,
	release,
	hostname,
	tmpdir,
	homedir,
	endianness,
	EOL,
	devNull,
	cpus,
	totalmem,
	freemem,
	uptime,
	loadavg,
	networkInterfaces,
	userInfo,
	version,
	machine,
	availableParallelism,
	constants,
	setPriority,
	getPriority,
};