/**
 * gpu_error_codes.h
 * 
 * Shared error codes for the LibTorch GPU pipeline.
 */
#ifndef GPU_ERROR_CODES_H
#define GPU_ERROR_CODES_H

enum GpuErrorCode {
    GPU_SUCCESS = 0,
    GPU_ERR_INVALID_ARGS = -1,
    GPU_ERR_BUFFER_TOO_SMALL = -2,
    GPU_ERR_TORCH_EXCEPTION = -3,
    GPU_ERR_INPUT_TOO_LARGE = -4,
    GPU_ERR_CUDA_OOM = -5,
    GPU_ERR_DEVICE_UNAVAILABLE = -6,
    GPU_ERR_UNKNOWN = -100
};

#endif // GPU_ERROR_CODES_H
