# Pinned multi-stage Dockerfile for reproducible Linux Svelte Tree-sitter shared object
FROM debian:bookworm-slim AS builder
RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    git gcc libc6-dev binutils ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG GRAMMAR_COMMIT=29886944d756e6eeebe38c09db87b17efdc93e93
WORKDIR /build

RUN git clone \
    https://github.com/sveltejs/tree-sitter-svelte.git \
    grammar \
    && cd grammar \
    && git checkout --detach "$GRAMMAR_COMMIT" \
    && test "$(git rev-parse HEAD)" = "$GRAMMAR_COMMIT"

RUN mkdir -p /out && \
    gcc -O2 -fPIC -shared \
    -I /build/grammar/src \
    /build/grammar/src/parser.c \
    /build/grammar/src/scanner.c \
    -o /out/tree-sitter-svelte.so

RUN nm -D /out/tree-sitter-svelte.so \
    | grep -q ' tree_sitter_svelte$' \
    && sha256sum /out/tree-sitter-svelte.so \
       > /out/tree-sitter-svelte.so.sha256

FROM scratch AS artifact
COPY --from=builder /out/ /
