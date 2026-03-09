#!/usr/bin/env python3
"""
Test script for the embedding service with Code Fix Style summaries.
"""

import asyncio
import tempfile
import os
import hashlib
from embedding_service import EmbeddingService

async def test_code_fix_summaries():
    """Test the code fix style summary generation"""

    service = EmbeddingService()
    # Skip model loading for summary testing
    # await service.load_model()

    # Test files with different types of fixes
    test_files = {
        "cpp_fixes.cpp": '''
#include <cuda_runtime.h>
#include <torch/torch.h>
#include <chrono>
#include <memory>

// Fixes chrono template mismatch
using namespace std::chrono;

// Adds CUDA error handling
#define CHECK_CUDA(call) \\
    do { \\
        cudaError_t error = call; \\
        if (error != cudaSuccess) { \\
            fprintf(stderr, "CUDA error: %s\\n", cudaGetErrorString(error)); \\
            exit(1); \\
        } \\
    } while(0)

// Implements gradient checkpointing
class GradientCheckpointing {
private:
    std::unique_ptr<torch::Tensor> checkpoint_;

public:
    void save_checkpoint(torch::Tensor& tensor) {
        checkpoint_ = std::make_unique<torch::Tensor>(tensor.detach());
    }

    torch::Tensor recompute_forward(torch::Tensor& input) {
        // Recompute intermediate activations
        return torch::relu(torch::conv2d(input, weight_));
    }
};
''',

        "python_fixes.py": '''
import torch
import logging
from torch import nn

# GPU device handling fixes
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

class ModelWithFixes(nn.Module):
    def __init__(self):
        super().__init__()
        self.layer = nn.Linear(768, 768)

    @torch.no_grad()
    def forward_no_grad(self, x):
        # Gradient computation fixes
        return self.layer(x.to(device))

    async def async_processing(self, x):
        # Async processing improvements
        return await self.process_async(x)

# Logging improvements
logger = logging.getLogger(__name__)
logger.info("Model initialized with fixes")
''',

        "ts_fixes.ts": '''
import { onMount } from 'svelte';

interface User {
    id: number;
    name: string;
}

// Svelte 5 rune optimizations
let user: User = $props();
let data: User | null = $state(null);
let loading: boolean = $state(true);

// Reactive state with $derived
let displayName: string = $derived(data?.name ?? 'Loading...');

// Lifecycle improvements
onMount(async () => {
    try {
        // Error boundary handling
        const response = await fetch(`/api/users/${user.id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch user');
        }
        const userData: User = await response.json();
        data = userData;
        loading = false;
    } catch (error) {
        console.error('Error fetching user:', error);
        loading = false;
    }
});
'''
    }

    print("Testing Code Fix Style Summaries")
    print("=" * 50)

    for filename, content in test_files.items():
        # Create temporary file
        with tempfile.NamedTemporaryFile(mode='w', suffix=f"_{filename}", delete=False) as f:
            f.write(content)
            temp_path = f.name

        try:
            # Store summary in database without processing embeddings
            file_hash = hashlib.sha256(content.encode('utf-8')).hexdigest()
            summary = service.generate_summary(temp_path, content)
            extension = os.path.splitext(filename)[1]
            word_count = len(content.split())

            await service._store_file_summary(temp_path, file_hash, summary, extension, word_count)

            print(f"\n📄 {filename}")
            print(f"📝 Summary: {summary}")

            # Show what fixes were detected
            fixes = service._extract_code_fixes(content, extension)
            print(f"🔧 Detected fixes: {', '.join(fixes) if fixes else 'none'}")

        finally:
            # Clean up
            os.unlink(temp_path)

    print("\n" + "=" * 50)
    print("✅ Code Fix Style summary testing complete!")

if __name__ == '__main__':
    asyncio.run(test_code_fix_summaries())