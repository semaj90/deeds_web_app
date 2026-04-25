import asyncio
import httpx
import json

async def test_langextract():
    """Test langextract Docker container API."""

    test_code = '''
const x: string = "hello";
function greet(name: string): void {
    console.log("Hello, " + name);
}
class User {
    constructor(public name: string) {}
}
'''

    async with httpx.AsyncClient() as client:
        response = await client.post(
            'http://localhost:8095/extract',
            json={
                'content': test_code,
                'language': 'typescript'
            }
        )

        print(f"Status: {response.status_code}")
        print(f"Response:")
        print(json.dumps(response.json(), indent=2))

if __name__ == '__main__':
    asyncio.run(test_langextract())
