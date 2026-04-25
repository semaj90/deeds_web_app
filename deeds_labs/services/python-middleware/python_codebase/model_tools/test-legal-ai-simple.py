# Test Legal AI Server
import json
import requests
import time

def test_legal_ai_server():
    base_url = "http://localhost:8100"

    print("🧪 Testing Legal AI Server...")
    print("=" * 50)

    # Test 1: Health Check
    try:
        print("1️⃣ Testing health endpoint...")
        response = requests.get(f"{base_url}/health", timeout=5)
        if response.status_code == 200:
            health_data = response.json()
            print(f"   ✅ Health: {health_data['status']}")
            print(f"   🎮 GPU: {health_data['gpu_available']}")
            print(f"   ⏱️  Uptime: {health_data['uptime']:.2f}s")
        else:
            print(f"   ❌ Health check failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Connection error: {e}")
        return

    # Test 2: Status Check
    try:
        print("\n2️⃣ Testing status endpoint...")
        response = requests.get(f"{base_url}/api/status", timeout=5)
        if response.status_code == 200:
            status_data = response.json()
            print(f"   ✅ Legal AI Ready: {status_data['legal_ai_ready']}")
            print(f"   📦 Models: {status_data['models_loaded']}")
            print(f"   🧠 Cache: {status_data['cache_size']} items")
        else:
            print(f"   ❌ Status check failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Status error: {e}")

    # Test 3: Embedding Generation
    try:
        print("\n3️⃣ Testing embedding generation...")
        test_text = "This is a legal contract for the sale of property."
        response = requests.post(
            f"{base_url}/api/embedding",
            json={"text": test_text},
            timeout=10
        )
        if response.status_code == 200:
            embedding_data = response.json()
            print(f"   ✅ Generated embedding: {embedding_data['dimensions']} dimensions")
            print(f"   📏 Text length: {embedding_data['text_length']} chars")
            print(f"   🤖 Model: {embedding_data['model']}")
            print(f"   🔢 Sample values: {embedding_data['embedding'][:5]}...")
        else:
            print(f"   ❌ Embedding failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Embedding error: {e}")

    # Test 4: Document Analysis
    try:
        print("\n4️⃣ Testing document analysis...")
        legal_text = """
        PURCHASE AGREEMENT

        This Purchase Agreement is entered into between Buyer and Seller for the sale
        of real property located at 123 Main Street. The purchase price is $500,000.
        The closing shall occur within 30 days of the effective date.
        """
        response = requests.post(
            f"{base_url}/api/analyze",
            json={"text": legal_text, "document_type": "purchase_agreement"},
            timeout=10
        )
        if response.status_code == 200:
            analysis_data = response.json()
            analysis = analysis_data['analysis']
            print(f"   ✅ Document type: {analysis['document_type']}")
            print(f"   ⚠️  Risk level: {analysis['risk_level']}")
            print(f"   📊 Compliance: {analysis['compliance_score']}")
            print(f"   🎯 Confidence: {analysis['confidence']}")
            print(f"   🔍 Key terms: {', '.join(analysis['key_terms'][:3])}...")
        else:
            print(f"   ❌ Analysis failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Analysis error: {e}")

    # Test 5: Document Search
    try:
        print("\n5️⃣ Testing document search...")
        search_query = "commercial lease agreement"
        response = requests.post(
            f"{base_url}/api/search",
            json={"query": search_query, "threshold": 0.8},
            timeout=10
        )
        if response.status_code == 200:
            search_data = response.json()
            print(f"   ✅ Query: '{search_data['query']}'")
            print(f"   📊 Results: {search_data['total_results']} documents")
            print(f"   🎯 Threshold: {search_data['threshold']}")
            if search_data['results']:
                first_result = search_data['results'][0]
                print(f"   🏆 Top match: {first_result['title']} ({first_result['similarity']:.2f})")
        else:
            print(f"   ❌ Search failed: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Search error: {e}")

    print("\n" + "=" * 50)
    print("✅ Legal AI Server testing complete!")

if __name__ == "__main__":
    test_legal_ai_server()