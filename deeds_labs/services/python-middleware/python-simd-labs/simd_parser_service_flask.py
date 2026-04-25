"""
SIMD JSON Parser Service - Flask Version
"""

import json
import time
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def parse_json_simd(json_text: str) -> dict:
    """Parse JSON with SIMD acceleration"""
    try:
        import orjson
        return orjson.loads(json_text)
    except ImportError:
        logger.warning("orjson not available, using standard json")
        return json.loads(json_text)

# Try to use Flask if available
try:
    from flask import Flask, request, jsonify

    app = Flask(__name__)

    @app.route('/health', methods=['GET'])
    def health():
        return jsonify({
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat()
        })

    @app.route('/parse', methods=['POST'])
    def parse():
        try:
            data = request.get_json()
            json_text = data.get('text', '')
            start_time = time.time()

            # Parse with SIMD
            parsed_data = parse_json_simd(json_text)

            latency = (time.time() - start_time) * 1000

            return jsonify({
                "result": parsed_data,
                "latency_ms": round(latency, 2),
                "method": "simd-json",
                "timestamp": datetime.utcnow().isoformat(),
                "bytes_processed": len(json_text.encode('utf-8'))
            })

        except Exception as e:
            return jsonify({
                "error": str(e),
                "method": "error",
                "timestamp": datetime.utcnow().isoformat()
            }), 400

    if __name__ == "__main__":
        logger.info("🚀 Starting SIMD JSON Parser Service (Flask)...")
        logger.info("✅ SIMD JSON Parser Service listening on http://0.0.0.0:8097")
        logger.info("📡 Endpoints:")
        logger.info("  GET  /health - Health check")
        logger.info("  POST /parse  - Parse JSON with SIMD acceleration")
        app.run(host='0.0.0.0', port=8097, debug=False)

except ImportError:
    logger.error("Flask not available, falling back to simple HTTP server")

    from http.server import BaseHTTPRequestHandler, HTTPServer

    class SIMDJSONHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            try:
                logger.info("Received GET request for: %s", self.path)
                if self.path == "/health":
                    logger.info("Processing health check")
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()

                    health_data = {
                        "status": "healthy",
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    response = json.dumps(health_data).encode()
                    logger.info("Sending health response: %s", response[:100])
                    self.wfile.write(response)
                    logger.info("Health response sent")
                else:
                    logger.info("Path not found: %s", self.path)
                    self.send_response(404)
                    self.end_headers()
            except Exception as e:
                logger.error("Error in do_GET: %s", e)
                import traceback
                logger.error("Traceback: %s", traceback.format_exc())
                try:
                    self.send_response(500)
                    self.end_headers()
                except:
                    pass

        def do_POST(self):
            try:
                logger.info("Received POST request for: %s", self.path)
                if self.path == "/parse":
                    content_length = int(self.headers['Content-Length'])
                    post_data = self.rfile.read(content_length)
                    request_data = json.loads(post_data.decode())

                    json_text = request_data.get('text', '')
                    start_time = time.time()

                    # Parse with SIMD
                    parsed_data = parse_json_simd(json_text)

                    latency = (time.time() - start_time) * 1000

                    response_data = {
                        "result": parsed_data,
                        "latency_ms": round(latency, 2),
                        "method": "simd-json",
                        "timestamp": datetime.utcnow().isoformat(),
                        "bytes_processed": len(json_text.encode('utf-8'))
                    }

                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(response_data).encode())

                else:
                    self.send_response(404)
                    self.end_headers()
            except Exception as e:
                logger.error("Error in do_POST: %s", e)
                import traceback
                logger.error("Traceback: %s", traceback.format_exc())
                try:
                    self.send_response(400)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    error_response = {
                        "error": str(e),
                        "method": "error",
                        "timestamp": datetime.utcnow().isoformat()
                    }
                    self.wfile.write(json.dumps(error_response).encode())
                except:
                    pass

        def log_message(self, format, *args):
            logger.info("%s - %s" % (self.address_string(), format % args))

    if __name__ == "__main__":
        logger.info("🚀 Starting SIMD JSON Parser Service (HTTP Server)...")

        try:
            server_address = ('0.0.0.0', 8097)
            httpd = HTTPServer(server_address, SIMDJSONHandler)
            logger.info("✅ SIMD JSON Parser Service listening on http://0.0.0.0:8097")
            logger.info("📡 Endpoints:")
            logger.info("  GET  /health - Health check")
            logger.info("  POST /parse  - Parse JSON with SIMD acceleration")
            httpd.serve_forever()
        except KeyboardInterrupt:
            logger.info("🛑 Server stopped")
        except Exception as e:
            logger.error("❌ Server failed to start: %s", e)
            import traceback
            logger.error("Traceback: %s", traceback.format_exc())