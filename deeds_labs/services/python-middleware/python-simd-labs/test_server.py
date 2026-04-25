"""
Simple test server
"""

import json
import time
import logging
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            response = {"status": "ok", "timestamp": str(datetime.now())}
            self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == "__main__":
    logger.info("Starting test server...")
    server_address = ('0.0.0.0', 8099)
    httpd = HTTPServer(server_address, TestHandler)
    logger.info("Server listening on http://0.0.0.0:8099")
    httpd.serve_forever()