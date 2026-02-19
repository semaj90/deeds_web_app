import os
from typing import List

import numpy as np
import torch
import triton_python_backend_utils as pb_utils


class TritonPythonModel:
    """Triton Python backend wrapper around the TorchScript autoencoder."""

    def initialize(self, args):
        model_dir = args["model_repository"]
        version = args["model_version"]
        artifact_path = os.path.join(model_dir, version, "model.pt")
        if not os.path.exists(artifact_path):
            raise FileNotFoundError(f"TorchScript artifact missing: {artifact_path}")
        self.model = torch.jit.load(artifact_path, map_location="cuda" if torch.cuda.is_available() else "cpu")
        self.model.eval()

    def execute(self, requests: List[pb_utils.InferenceRequest]):
        responses = []
        device = next(self.model.parameters()).device if hasattr(self.model, "parameters") else torch.device("cpu")

        with torch.no_grad():
            for request in requests:
                input_tensor = pb_utils.get_input_tensor_by_name(request, "INPUT")
                np_input = input_tensor.as_numpy().astype(np.float32)
                tensor_input = torch.from_numpy(np_input).to(device)
                reconstruction, latent = self.model(tensor_input)
                recon_np = reconstruction.cpu().numpy().astype(np.float32)
                latent_np = latent.cpu().numpy().astype(np.float32)
                outputs = [
                    pb_utils.Tensor("RECONSTRUCTION", recon_np),
                    pb_utils.Tensor("LATENT", latent_np),
                ]
                responses.append(pb_utils.InferenceResponse(output_tensors=outputs))
        return responses

    def finalize(self):
        pass

