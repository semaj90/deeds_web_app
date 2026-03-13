# PostgreSQL 17 + pgvector + pgvectorscale + pg_cron + pgai
# Extends the pgvector image with:
#   - pgvectorscale: StreamingDiskANN index + Statistical Binary Quantization
#   - pg_cron: Scheduled maintenance jobs (VACUUM, REINDEX)
#   - pgai: In-database AI via Ollama (embed, generate, chat_complete, vectorizer)
#
# PG17 benefits: 27% faster sequential scans, 20x lower vacuum memory,
#                improved JSON_TABLE, incremental sorts, better IN-clause B-tree
FROM pgvector/pgvector:pg17

# Install pg_cron + plpython3u (pgai) + Python deps
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        postgresql-17-cron \
        postgresql-plpython3-17 \
        python3-pip \
        python3-dev \
        git \
        curl \
        ca-certificates && \
    # Install pgvectorscale from prebuilt .deb (Ubuntu package works on Debian bookworm)
    curl -fsSL -o /tmp/pgvectorscale.deb \
        "https://packagecloud.io/timescale/timescaledb/packages/ubuntu/noble/pgvectorscale-postgresql-17_0.5.1-Linux_amd64.deb/download.deb" && \
    dpkg -i /tmp/pgvectorscale.deb || apt-get install -f -y && \
    rm /tmp/pgvectorscale.deb && \
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
    # Cleanup build deps
    rm -rf /tmp/pgai && \
    apt-get remove -y git curl && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# pg_cron requires shared_preload_libraries — append to postgresql.conf on init
RUN echo "shared_preload_libraries = 'pg_cron'" >> /usr/share/postgresql/postgresql.conf.sample && \
    echo "cron.database_name = 'legal_ai_db'" >> /usr/share/postgresql/postgresql.conf.sample