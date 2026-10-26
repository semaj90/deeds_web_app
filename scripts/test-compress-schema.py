import requests
import json

r = requests.get('http://127.0.0.1:8787/openapi.json', timeout=5)
data = r.json()
compress_path = data.get('paths', {}).get('/v1/compress', {}).get('post', {})
print("requestBody:", json.dumps(compress_path.get('requestBody'), indent=2))
