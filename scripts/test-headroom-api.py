import requests
import json

try:
    r = requests.get('http://127.0.0.1:8787/openapi.json', timeout=5)
    data = r.json()
    paths = list(data.get('paths', {}).keys())
    print("Headroom endpoints:")
    for p in paths:
        print(" ", p)
except Exception as e:
    print("Error:", e)
