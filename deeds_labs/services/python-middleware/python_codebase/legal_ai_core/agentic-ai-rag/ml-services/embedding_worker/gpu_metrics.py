# GPU metrics utilities (PyTorch-based)
import torch


def tensor_core_dot(a: torch.Tensor, b: torch.Tensor):
    a, b = a.cuda(), b.cuda()
    return torch.matmul(a, b)


def cosine_similarity_gpu(a: torch.Tensor, b: torch.Tensor):
    a, b = a.cuda(), b.cuda()
    return torch.nn.functional.cosine_similarity(a, b)


def stochastic_descent_metrics(gradients: torch.Tensor):
    return torch.mean(gradients**2).item()


def gpu_parallel_inverse_search(tensor: torch.Tensor, target: float):
    tensor = tensor.cuda()
    diff = torch.abs(tensor - target)
    idx = torch.argmin(diff)
    return idx.item()
