#!/usr/bin/env python3
"""
Simple CUDA Service Mock for Integration Testing
"""

import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

class CUDAServiceHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path)

        if parsed_path.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self._send_cors_headers()
            self.end_headers()

            response = {
                "status": "healthy",
                "service": "python-cuda-mock",
                "timestamp": int(time.time()),
                "database": False
            }
            self.wfile.write(json.dumps(response).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed_path = urlparse(self.path)

        if parsed_path.path == '/search':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length).decode('utf-8')

            try:
                request_data = json.loads(post_data)
                query = request_data.get('query', '')

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self._send_cors_headers()
                self.end_headers()

                response = {
                    "results": [
                        {
                            "id": "mock-1",
                            "content": f"Mock search result for: {query}",
                            "score": 0.95,
                            "metadata": "source:mock,type:legal_document"
                        },
                        {
                            "id": "mock-2",
                            "content": f"Secondary result for: {query}",
                            "score": 0.87,
                            "metadata": "source:mock,type:case_law"
                        }
                    ],
                    "total": 2
                }

                self.wfile.write(json.dumps(response).encode())
                print(f"✅ Processed search query: {query}")

            except json.JSONDecodeError:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "Invalid JSON"}')
        else:
            self.send_response(404)
            self.end_headers()

def run_server(port=8081):
    server_address = ('', port)
    httpd = HTTPServer(server_address, CUDAServiceHandler)

    print(f"🎯 Starting Python CUDA Mock Service on port {port}")
    print(f"🚀 Service available at http://localhost:{port}")
    print("📋 Endpoints:")
    print("   GET  /health  - Health check")
    print("   POST /search  - Search endpoint")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Service stopped")
        httpd.server_close()

if __name__ == '__main__':
    run_server()