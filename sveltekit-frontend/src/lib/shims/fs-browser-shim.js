/**
 * Filesystem Browser Shim
 * Provides empty stubs for Node.js fs module in browser context.
 * Used when server-side code that imports 'fs' gets bundled for client.
 */

const noop = () => {};
const noopAsync = () => Promise.resolve();
const noopAsyncNull = () => Promise.resolve(null);
const noopAsyncEmpty = () => Promise.resolve([]);
const noopAsyncBuffer = () => Promise.resolve(new Uint8Array(0));

// Sync stubs
export const existsSync = () => false;
export const statSync = () => ({ isFile: () => false, isDirectory: () => false, size: 0, mtime: new Date(0) });
export const readFileSync = () => '';
export const writeFileSync = noop;
export const mkdirSync = noop;
export const readdirSync = () => [];
export const unlinkSync = noop;
export const rmdirSync = noop;
export const renameSync = noop;
export const copyFileSync = noop;
export const accessSync = noop;
export const chmodSync = noop;
export const lstatSync = () => ({ isFile: () => false, isDirectory: () => false, isSymbolicLink: () => false });
export const realpathSync = (p) => p;
export const createReadStream = () => ({ on: noop, pipe: noop, destroy: noop });
export const createWriteStream = () => ({ on: noop, write: noop, end: noop, destroy: noop });
export const watchFile = noop;
export const unwatchFile = noop;

// Async callback stubs
export const stat = (path, cb) => { if (cb) cb(null, statSync()); };
export const readFile = (path, opts, cb) => { if (typeof opts === 'function') opts(null, ''); else if (cb) cb(null, ''); };
export const writeFile = (path, data, opts, cb) => { const fn = typeof opts === 'function' ? opts : cb; if (fn) fn(null); };
export const access = (path, mode, cb) => { const fn = typeof mode === 'function' ? mode : cb; if (fn) fn(null); };
export const mkdir = (path, opts, cb) => { const fn = typeof opts === 'function' ? opts : cb; if (fn) fn(null); };
export const readdir = (path, opts, cb) => { const fn = typeof opts === 'function' ? opts : cb; if (fn) fn(null, []); };
export const unlink = (path, cb) => { if (cb) cb(null); };
export const rmdir = (path, cb) => { if (cb) cb(null); };
export const rename = (oldPath, newPath, cb) => { if (cb) cb(null); };
export const copyFile = (src, dest, flags, cb) => { const fn = typeof flags === 'function' ? flags : cb; if (fn) fn(null); };
export const chmod = (path, mode, cb) => { if (cb) cb(null); };
export const lstat = (path, cb) => { if (cb) cb(null, lstatSync()); };
export const realpath = (path, opts, cb) => { const fn = typeof opts === 'function' ? opts : cb; if (fn) fn(null, path); };

// Promise-based stubs (fs.promises)
export const promises = {
	stat: noopAsyncNull,
	readFile: () => Promise.resolve(''),
	writeFile: noopAsync,
	access: noopAsync,
	mkdir: noopAsync,
	readdir: noopAsyncEmpty,
	unlink: noopAsync,
	rmdir: noopAsync,
	rename: noopAsync,
	copyFile: noopAsync,
	chmod: noopAsync,
	lstat: noopAsyncNull,
	realpath: (p) => Promise.resolve(p),
	open: noopAsyncNull,
};

// Constants
export const constants = {
	F_OK: 0,
	R_OK: 4,
	W_OK: 2,
	X_OK: 1,
	COPYFILE_EXCL: 1,
	COPYFILE_FICLONE: 2,
	COPYFILE_FICLONE_FORCE: 4,
	O_RDONLY: 0,
	O_WRONLY: 1,
	O_RDWR: 2,
	O_CREAT: 64,
	O_EXCL: 128,
	O_TRUNC: 512,
	O_APPEND: 1024,
};

// Default export matches Node.js fs module shape
export default {
	existsSync,
	statSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
	readdirSync,
	unlinkSync,
	rmdirSync,
	renameSync,
	copyFileSync,
	accessSync,
	chmodSync,
	lstatSync,
	realpathSync,
	createReadStream,
	createWriteStream,
	watchFile,
	unwatchFile,
	stat,
	readFile,
	writeFile,
	access,
	mkdir,
	readdir,
	unlink,
	rmdir,
	rename,
	copyFile,
	chmod,
	lstat,
	realpath,
	promises,
	constants,
};
