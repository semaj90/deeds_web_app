import requests
import json

url = 'http://localhost:9002/extract'
data = {
    'code': 'function hello(name: string) { return "Hello " + name; }',
    'language': 'typescript'
}

print(f"Testing {url} with data: {data}")

try:
    response = requests.post(url, json=data, timeout=10)
    print(f'Status: {response.status_code}')
    print(f'Response: {response.text}')
    if response.status_code == 200:
        print(f'JSON: {response.json()}')
except Exception as e:
    print(f'Error: {e}')