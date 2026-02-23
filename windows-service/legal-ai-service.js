// Minimal Legal AI Windows service: starts an HTTP server and exports start/stop functions.

const http = require('http');

let server = null;

/**
 * Start the service.
 * @param {number|string} [port=process.env.PORT||3000]
 * @returns {Promise<http.Server>}
 */
function start(port = process.env.PORT || 3000) {
  if (server) return Promise.resolve(server);
  return new Promise((resolve, reject) => {
	server = http.createServer((req, res) => {
	  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
	  res.end('Legal AI service running\n');
	});

	server.on('error', (err) => {
	  server = null;
	  reject(err);
	});

	server.listen(Number(port), () => {
	  console.log(`Legal AI service listening on ${port}`);
	  resolve(server);
	});
  });
}

/**
 * Stop the service.
 * @returns {Promise<void>}
 */
function stop() {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => {
	server.close((err) => {
	  if (err) return reject(err);
	  server = null;
	  resolve();
	});
  });
}

// If invoked directly, start the server and handle shutdown signals.
if (require.main === module) {
  start().catch((err) => {
	console.error('Failed to start service:', err);
	process.exit(1);
  });

  const shutdown = () => {
	console.log('Shutting down Legal AI service...');
	stop()
	  .catch((err) => {
		console.error('Error during shutdown:', err);
	  })
	  .finally(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { start, stop };
