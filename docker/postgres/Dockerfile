# PostgreSQL 16 + pgvector + pgai
# Extends the pgvector image with plpython3u and pgai for in-database AI
# Provides: ai.ollama_embed(), ai.ollama_generate(), ai.ollama_chat_complete(),
#           ai.create_vectorizer(), ai.vectorizer_embed() + auto-embedding triggers
FROM pgvector/pgvector:pg16

# Install plpython3u (required by pgai) + Python dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        postgresql-plpython3-16 \
        python3-pip \
        python3-dev \
        git && \
    # Install pgai vectorizer infrastructure
    pip3 install --break-system-packages pgai ollama && \
    # Clone pgai repo for extension SQL functions (ollama_embed, ollama_generate, etc.)
    cd /tmp && git clone --depth 1 https://github.com/timescale/pgai.git && \
    # Install extension Python modules (ai.ollama, ai.utils, etc.)
    cp -r /tmp/pgai/projects/extension/ai /usr/local/lib/python3.11/dist-packages/ && \
    # Prepare Ollama SQL functions (patch placeholders for non-extension install)
    mkdir -p /docker-entrypoint-initdb.d && \
    sed 's/    #ADD-PYTHON-LIB-DIR/    pass  # ai module on default path/' \
        /tmp/pgai/projects/extension/sql/idempotent/002-ollama.sql | \
    sed 's/@extversion@/0.12.1/g' | \
    sed 's/@extschema:vector@/public/g' > /pgai-ollama-functions.sql && \
    # Cleanup
    rm -rf /tmp/pgai && \
    apt-get remove -y git && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
