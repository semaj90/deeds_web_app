import networkx as nx
from ml_services.embedding_worker.gpu_metrics import cosine_similarity_gpu

def build_graph(documents):
    G = nx.Graph()
    for doc in documents:
        G.add_node(doc['id'], embedding=doc['embedding'])
    for i, a in enumerate(documents):
        for j, b in enumerate(documents):
            if i >= j: continue
            sim = cosine_similarity_gpu(a['embedding'], b['embedding'])
            if sim > 0.85: G.add_edge(a['id'], b['id'], weight=sim)
    return G
