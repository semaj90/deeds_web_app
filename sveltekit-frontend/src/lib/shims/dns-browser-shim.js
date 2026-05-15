/**
 * DNS Browser Shim
 * Provides empty stubs for Node.js dns module in browser context.
 * Used when server-side code that imports 'dns' gets bundled for client.
 */

const noopCb = (_err, _result) => {};

// Callback-style stubs (dns.lookup, dns.resolve, etc.)
export function lookup(hostname, options, callback) {
	const cb = typeof options === 'function' ? options : callback || noopCb;
	cb(null, '127.0.0.1', 4);
}

export function resolve(hostname, rrtype, callback) {
	const cb = typeof rrtype === 'function' ? rrtype : callback || noopCb;
	cb(null, []);
}

export function resolve4(hostname, options, callback) {
	const cb = typeof options === 'function' ? options : callback || noopCb;
	cb(null, []);
}

export function resolve6(hostname, options, callback) {
	const cb = typeof options === 'function' ? options : callback || noopCb;
	cb(null, []);
}

export function reverse(ip, callback) {
	(callback || noopCb)(null, []);
}

export function resolveSrv(hostname, callback) {
	(callback || noopCb)(null, []);
}

export function resolveTxt(hostname, callback) {
	(callback || noopCb)(null, []);
}

export function resolveMx(hostname, callback) {
	(callback || noopCb)(null, []);
}

export function resolveCname(hostname, callback) {
	(callback || noopCb)(null, []);
}

export function resolveNs(hostname, callback) {
	(callback || noopCb)(null, []);
}

export function resolveSoa(hostname, callback) {
	(callback || noopCb)(null, null);
}

export function resolveNaptr(hostname, callback) {
	(callback || noopCb)(null, []);
}

export function resolvePtr(hostname, callback) {
	(callback || noopCb)(null, []);
}

export function setServers(_servers) {}

export function getServers() {
	return [];
}

// Promise-based stubs (dns.promises)
export const promises = {
	lookup: () => Promise.resolve({ address: '127.0.0.1', family: 4 }),
	resolve: () => Promise.resolve([]),
	resolve4: () => Promise.resolve([]),
	resolve6: () => Promise.resolve([]),
	reverse: () => Promise.resolve([]),
	resolveSrv: () => Promise.resolve([]),
	resolveTxt: () => Promise.resolve([]),
	resolveMx: () => Promise.resolve([]),
	resolveCname: () => Promise.resolve([]),
	resolveNs: () => Promise.resolve([]),
	resolveSoa: () => Promise.resolve(null),
	resolveNaptr: () => Promise.resolve([]),
	resolvePtr: () => Promise.resolve([]),
	setServers: () => {},
	getServers: () => [],
};

// Error codes
export const NODATA = 'ENODATA';
export const FORMERR = 'EFORMERR';
export const SERVFAIL = 'ESERVFAIL';
export const NOTFOUND = 'ENOTFOUND';
export const NOTIMP = 'ENOTIMP';
export const REFUSED = 'EREFUSED';
export const BADQUERY = 'EBADQUERY';
export const BADNAME = 'EBADNAME';
export const BADFAMILY = 'EBADFAMILY';
export const BADRESP = 'EBADRESP';
export const CONNREFUSED = 'ECONNREFUSED';
export const TIMEOUT = 'ETIMEOUT';
export const EOF = 'EOF';
export const FILE = 'EFILE';
export const NOMEM = 'ENOMEM';
export const DESTRUCTION = 'EDESTRUCTION';
export const BADSTR = 'EBADSTR';
export const BADFLAGS = 'EBADFLAGS';
export const NONAME = 'ENONAME';
export const BADHINTS = 'EBADHINTS';
export const NOTINITIALIZED = 'ENOTINITIALIZED';
export const LOADIPHLPAPI = 'ELOADIPHLPAPI';
export const ADDRGETNETWORKPARAMS = 'EADDRGETNETWORKPARAMS';
export const CANCELLED = 'ECANCELLED';

// Resolver class stub
export class Resolver {
	constructor() {}
	resolve(hostname, rrtype, callback) {
		const cb = typeof rrtype === 'function' ? rrtype : callback || noopCb;
		cb(null, []);
	}
	resolve4(hostname, options, callback) {
		const cb = typeof options === 'function' ? options : callback || noopCb;
		cb(null, []);
	}
	resolve6(hostname, options, callback) {
		const cb = typeof options === 'function' ? options : callback || noopCb;
		cb(null, []);
	}
	reverse(ip, callback) { (callback || noopCb)(null, []); }
	setServers(_servers) {}
	getServers() { return []; }
	cancel() {}
}

export default {
	lookup,
	resolve,
	resolve4,
	resolve6,
	reverse,
	resolveSrv,
	resolveTxt,
	resolveMx,
	resolveCname,
	resolveNs,
	resolveSoa,
	resolveNaptr,
	resolvePtr,
	setServers,
	getServers,
	promises,
	Resolver,
	NODATA,
	FORMERR,
	SERVFAIL,
	NOTFOUND,
	NOTIMP,
	REFUSED,
};
