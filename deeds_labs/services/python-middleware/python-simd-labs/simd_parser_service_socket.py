"""
SIMD JSON Parser Service - Socket Version
"""

import socket
import json
import time
import threading

def parse_json_simd(json_text: str):
    """Parse JSON with SIMD acceleration"""
    try:
        import orjson
        return orjson.loads(json_text)
    except ImportError:
        return json.loads(json_text)

def handle_client(client_socket):
    """Handle a single client connection"""
    try:
        # Receive request
        request = client_socket.recv(4096).decode('utf-8')
        if not request:
            return

        # Parse HTTP request
        lines = request.split('\n')
        if not lines:
            return

        # Get the first line
        first_line = lines[0].strip()
        parts = first_line.split()
        if len(parts) < 2:
            return

        method = parts[0]
        path = parts[1]

        # Find Content-Length header
        content_length = 0
        body_start = request.find('\r\n\r\n')
        if body_start != -1:
            headers = request[:body_start]
            for line in headers.split('\n'):
                if line.lower().startswith('content-length:'):
                    try:
                        content_length = int(line.split(':', 1)[1].strip())
                    except:
                        pass
                    break

        if method == 'GET' and path == '/health':
            response = 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"status": "healthy"}'
            client_socket.send(response.encode('utf-8'))

        elif method == 'POST' and path == '/parse':
            if body_start != -1 and content_length > 0:
                body = request[body_start + 4:body_start + 4 + content_length]
                try:
                    request_data = json.loads(body)
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

                    response_body = json.dumps(response_data)
                    response = f'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {len(response_body)}\r\n\r\n{response_body}'
                    client_socket.send(response.encode('utf-8'))

                except Exception as e:
                    error_response = json.dumps({"error": str(e)})
                    response = f'HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: {len(error_response)}\r\n\r\n{error_response}'
                    client_socket.send(response.encode('utf-8'))
            else:
                response = 'HTTP/1.1 400 Bad Request\r\n\r\n'
                client_socket.send(response.encode('utf-8'))
        else:
            response = 'HTTP/1.1 404 Not Found\r\n\r\n'
            client_socket.send(response.encode('utf-8'))

    except Exception as e:
        try:
            error_response = json.dumps({"error": str(e)})
            response = f'HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nContent-Length: {len(error_response)}\r\n\r\n{error_response}'
            client_socket.send(response.encode('utf-8'))
        except:
            pass
    finally:
        client_socket.close()

def run_server():
    """Run the HTTP server"""
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_socket.bind(('0.0.0.0', 8097))
    server_socket.listen(5)

    print("SIMD JSON Parser Service listening on http://0.0.0.0:8097")

    try:
        while True:
            client_socket, addr = server_socket.accept()
            print(f"Connection from {addr}")
            client_thread = threading.Thread(target=handle_client, args=(client_socket,))
            client_thread.start()
    except KeyboardInterrupt:
        print("Server stopped")
    finally:
        server_socket.close()

if __name__ == "__main__":
    run_server()