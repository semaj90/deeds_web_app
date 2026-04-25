"""
SIMD JSON Parser Service - Working Version
"""

import json
import time
import logging
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def parse_json_simd(json_text: str):
    """Parse JSON with SIMD acceleration"""
    try:
        import orjson
        return orjson.loads(json_text)
    except ImportError:
        logger.warning("orjson not available, using standard json")
        return json.loads(json_text)

class SIMDJSONHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            if self.path == "/health":
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()

                health_data = {
                    "status": "healthy",
                    "timestamp": str(datetime.now())
                }
                response_json = json.dumps(health_data)
                self.wfile.write(response_json.encode('utf-8'))
            else:
                self.send_response(404)
                self.end_headers()
        except Exception as e:
            try:
                self.send_response(500)
                self.end_headers()
            except:
                pass

    def do_POST(self):
        try:
            if self.path == "/parse":
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                request_data = json.loads(post_data.decode('utf-8'))

                json_text = request_data.get('text', '')
                start_time = time.time()

                # Parse with SIMD
                parsed_data = parse_json_simd(json_text)

                latency = (time.time() - start_time) * 1000

                response_data = {
                    "result": parsed_data,
                    "latency_ms": round(latency, 2),
                    "method": "simd-json",
                    "timestamp": str(datetime.now()),
                    "bytes_processed": len(json_text.encode('utf-8'))
                }

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response_json = json.dumps(response_data)
                self.wfile.write(response_json.encode('utf-8'))

            else:
                self.send_response(404)
                self.end_headers()
        except Exception as e:
            try:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                error_response = {
                    "error": str(e),
                    "method": "error",
                    "timestamp": str(datetime.now())
                }
                error_json = json.dumps(error_response)
                self.wfile.write(error_json.encode('utf-8'))
            except:
                pass

    def log_message(self, format, *args):
        logger.info("%s - %s" % (self.address_string(), format % args))

if __name__ == "__main__":
    logger.info("🚀 Starting SIMD JSON Parser Service...")

    try:
        # Test imports first
        import orjson
        logger.info("✅ orjson imported successfully")

        server_address = ('0.0.0.0', 8098)
        httpd = HTTPServer(server_address, SIMDJSONHandler)
        logger.info("✅ SIMD JSON Parser Service listening on http://0.0.0.0:8098")
        httpd.serve_forever()
    except ImportError as e:
        logger.error("❌ Import error: %s", e)
    except Exception as e:
        logger.error("❌ Server failed to start: %s", e)
        import traceback
        logger.error("Traceback: %s", traceback.format_exc())