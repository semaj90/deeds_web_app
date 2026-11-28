import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { CODES, redact, routeTemplate } from './error-fingerprint.mjs';

const MAX_LOG_BYTES = 16 * 1024 * 1024;
const MAX_RECORD_CHARS = 16_384;
const MAX_EVENTS = 250;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATED_LINE = /^(\d{4}-\d{2}-\d{2}T\S+)\s+(.*)$/;
const HTTP_ERROR = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (\/\S*) (5\d\d)(?:\s|$)/;
const VITE_ERROR = /\[vite:error\]|(?:^|\s)Internal server error:/i;
const EXCEPTION = /^(?:\[ERROR\]\s*)?(?:[\w.]*Error|[\w.]*Exception):/;

function parseTimestamp(value) {
  return typeof value === 'string' && ISO_TIMESTAMP.test(value) ? Date.parse(value) : NaN;
}

function errorRecord(text) {
  if (text.startsWith('{')) {
    let record;
    try { record = JSON.parse(text); } catch { return null; }
    const message = typeof record.message === 'string' ? record.message : '';
    const requestId = typeof record.context?.requestId === 'string' ? record.context.requestId : '';
    const request = HTTP_ERROR.exec(message);
    if (request) return { time: parseTimestamp(record.timestamp), request, requestId };
    if (record.level === 'error' && (record.error || VITE_ERROR.test(message))) {
      const endpoint = typeof record.context?.endpoint === 'string' ? record.context.endpoint : '';
      return { time: parseTimestamp(record.timestamp), message, stack: record.error?.stack, requestId, endpoint };
    }
    return null;
  }

  const dated = DATED_LINE.exec(text);
  const body = dated?.[2] ?? text;
  const time = parseTimestamp(dated?.[1]);
  const request = HTTP_ERROR.exec(body.replace(/^\[ERROR\]\s+/, ''));
  if (request) return { time, request };
  if (VITE_ERROR.test(body) || EXCEPTION.test(body)) return { time, message: body };
  return null;
}

function pathWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export async function collectServerLogEvents(report, { frontendRoot, serverManifest }) {
  const empty = (status) => ({ status, events: [], undatedErrors: 0, omittedEvents: 0 });
  if (serverManifest?.status !== 'running' || !Number.isInteger(serverManifest.pid)
      || serverManifest.pid <= 0 || typeof serverManifest.stdout_log !== 'string') {
    return empty('SERVER_MANIFEST_UNAVAILABLE');
  }
  const start = parseTimestamp(report?.stats?.startTime);
  const duration = report?.stats?.duration;
  const end = start + duration;
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration < 0 || !Number.isFinite(end)) {
    return empty('RUN_WINDOW_UNAVAILABLE');
  }
  const serverStart = parseTimestamp(serverManifest.started_at);
  if (!Number.isFinite(serverStart) || serverStart > start) return empty('SERVER_INSTANCE_OUTSIDE_RUN');

  let filename;
  let size;
  try {
    const root = await realpath(frontendRoot);
    const logRoot = await realpath(path.join(root, 'logs', 'startup'));
    const requested = path.resolve(root, serverManifest.stdout_log);
    filename = await realpath(requested);
    if (!pathWithin(root, logRoot) || !pathWithin(logRoot, filename) || !/^vite-[\w.-]+\.log$/i.test(path.basename(filename))) {
      return empty('SERVER_LOG_OUTSIDE_STARTUP_LOGS');
    }
    const metadata = await stat(filename);
    if (!metadata.isFile()) return empty('SERVER_LOG_UNAVAILABLE');
    size = metadata.size;
    if (size > MAX_LOG_BYTES) return empty('SERVER_LOG_BYTE_LIMIT_EXCEEDED');
    if (size === 0) return empty('NO_IN_WINDOW_ERRORS');

    const logRef = path.relative(root, filename).split(path.sep).join('/');
    const result = empty('NO_IN_WINDOW_ERRORS');
    // One failed request is logged by both the error handler and the request logger.
    const byRequestId = new Map();
    const stream = createReadStream(filename, { encoding: 'utf8', end: size - 1 });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    let lineNumber = 0;
    let jsonRecord = '';
    let jsonStart = 0;
    for await (const rawLine of lines) {
      lineNumber++;
      const line = rawLine.replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
      let text = line;
      let refLine = lineNumber;
      if (line === '{') {
        jsonRecord = line;
        jsonStart = lineNumber;
        continue;
      }
      if (jsonRecord) {
        jsonRecord += `\n${line}`;
        if (jsonRecord.length > MAX_RECORD_CHARS) jsonRecord = '';
        if (line !== '}' || !jsonRecord) continue;
        text = jsonRecord;
        refLine = jsonStart;
        jsonRecord = '';
      }
      if (text.length > MAX_RECORD_CHARS) continue;
      const record = errorRecord(text);
      if (!record) continue;
      if (!Number.isFinite(record.time)) {
        result.undatedErrors++;
        continue;
      }
      if (record.time < start || record.time > end) continue;
      const server_log_ref = `${logRef}#L${refLine}`;
      const [, method, url, status] = record.request ?? [];
      const target = url || record.endpoint;
      const route = target ? routeTemplate(redact(target)) : '(server)';
      const stack = typeof record.stack === 'string' ? record.stack : undefined;
      const linked = record.requestId ? byRequestId.get(record.requestId) : undefined;
      if (linked) {
        linked.evidence_refs.push(server_log_ref);
        linked.stack ??= stack;
        if (status) {
          Object.assign(linked, {
            error_code: CODES.HTTP_INTERNAL_ERROR,
            status: Number(status),
            route,
            message: `${method} ${route} ${status}`,
          });
        }
        continue;
      }
      if (result.events.length >= MAX_EVENTS) {
        result.omittedEvents++;
        continue;
      }
      const event = {
        source: 'server',
        error_code: status ? CODES.HTTP_INTERNAL_ERROR : CODES.JS_RUNTIME_EXCEPTION,
        status: status ? Number(status) : undefined,
        route,
        message: status ? `${method} ${route} ${status}` : redact(record.message),
        stack,
        server_log_ref,
        evidence_refs: [server_log_ref],
      };
      result.events.push(event);
      if (record.requestId) byRequestId.set(record.requestId, event);
    }
    result.status = result.omittedEvents > 0 ? 'SERVER_LOG_EVENT_LIMIT_REACHED'
      : result.events.length > 0 ? 'LINKED'
      : result.undatedErrors > 0 ? 'UNDATED_ERRORS_SKIPPED'
      : 'NO_IN_WINDOW_ERRORS';
    return result;
  } catch {
    return empty('SERVER_LOG_UNAVAILABLE');
  }
}
