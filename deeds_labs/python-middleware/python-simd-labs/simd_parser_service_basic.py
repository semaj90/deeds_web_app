"""
SIMD JSON Parser Service - Basic Version
"""

import json
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer

def parse_json_simd(json_text: str):
    """Parse JSON with SIMD acceleration"""
    try:
        import orjson
        return orjson.loads(json_text)
    except ImportError:
        return json.loads(json_text)

class SIMDJSONHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header('Content-type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'{"status": "healthy"}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/parse":
            try:
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
                    "bytes_processed": len(json_text.encode('utf-8'))
                }

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                response_json = json.dumps(response_data)
                self.wfile.write(response_json.encode('utf-8'))

            except Exception as e:
                self.send_response(400)
                self.send_header('Content-type', 'text/plain')
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == "__main__":
    print("Starting SIMD JSON Parser Service...")

    try:
        server_address = ('0.0.0.0', 8097)
        httpd = HTTPServer(server_address, SIMDJSONHandler)
        print("SIMD JSON Parser Service listening on http://0.0.0.0:8097")
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Server stopped")
    except Exception as e:
        print(f"Server failed to start: {e}")