#!/usr/bin/env python
import grpc
import numpy as np
import cuvs
from concurrent import futures
import cuvs_service_pb2 as pb2
import cuvs_service_pb2_grpc as grpc_pb2

class CuVSServicer(grpc_pb2.CuVSServiceServicer):
    def __init__(self):
        self.indices = {}  # {index_id: cuvs_index}
        self.index_counter = 0

    def BuildIndex(self, request, context):
        try:
            # Reshape embeddings to (n_rows, n_cols)
            data = np.array(request.embeddings, dtype=np.float32).reshape(
                request.n_rows, request.n_cols
            )

            # Build IVF-PQ index (default) — good balance for 768-dim
            resources = cuvs.Resources()
            index = cuvs.ivf_pq.Index(
                n_lists=256,
                metric="cosine",
                n_probes=20
            )
            index.build(resources, data)

            index_id = f"idx_{self.index_counter}"
            self.index_counter += 1
            self.indices[index_id] = (index, resources, data)

            return pb2.BuildIndexResponse(
                index_id=index_id,
                n_vectors=request.n_rows,
                status="built"
            )
        except Exception as e:
            context.set_details(str(e))
            context.set_code(grpc.StatusCode.INTERNAL)
            return pb2.BuildIndexResponse(status=f"error: {e}")

    def Search(self, request, context):
        try:
            if request.index_id not in self.indices:
                raise ValueError(f"Index {request.index_id} not found")

            index, resources, data = self.indices[request.index_id]
            query = np.array(request.query, dtype=np.float32).reshape(1, -1)

            # Search k nearest neighbors
            distances, neighbors = cuvs.ivf_pq.search(
                resources, index, query, k=request.k
            )

            return pb2.SearchResponse(
                indices=neighbors[0].tolist(),
                distances=distances[0].tolist()
            )
        except Exception as e:
            context.set_details(str(e))
            context.set_code(grpc.StatusCode.INTERNAL)
            return pb2.SearchResponse()

    def GetIndexInfo(self, request, context):
        try:
            if request.index_id not in self.indices:
                raise ValueError(f"Index {request.index_id} not found")

            index, resources, data = self.indices[request.index_id]
            return pb2.GetIndexInfoResponse(
                n_vectors=data.shape[0],
                embedding_dim=data.shape[1],
                algorithm="ivf_pq"
            )
        except Exception as e:
            context.set_details(str(e))
            context.set_code(grpc.StatusCode.INTERNAL)
            return pb2.GetIndexInfoResponse()

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    grpc_pb2.add_CuVSServiceServicer_to_server(CuVSServicer(), server)
    server.add_insecure_port("[::]:50051")
    server.start()
    print("cuVS gRPC server listening on port 50051")
    server.wait_for_termination()

if __name__ == '__main__':
    serve()
