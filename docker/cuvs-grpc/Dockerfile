FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

WORKDIR /app

# Install Python and build tools
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install RAPIDS cuVS and dependencies
RUN pip install --no-cache-dir \
    grpcio==1.59.2 \
    grpcio-tools==1.59.2 \
    protobuf==4.24.4 \
    numpy==1.24.3 \
    rapids-core==24.12 \
    cuvs==24.12

# Copy proto file and compile it
COPY ./protos /app/protos
RUN python3 -m grpc_tools.protoc \
    -I /app/protos \
    --python_out=/app/src \
    --grpc_python_out=/app/src \
    /app/protos/cuvs_service.proto

# Copy Python server
COPY ./src /app/src

# Expose gRPC port
EXPOSE 50051

# Run the server
CMD ["python3", "src/cuvs_grpc_server.py"]
