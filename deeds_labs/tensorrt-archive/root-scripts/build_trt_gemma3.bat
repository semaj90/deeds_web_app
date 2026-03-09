@echo off
echo Starting Gemma3 TensorRT Engine Build...
echo.

REM Set up the environment and run the build
wsl bash -c "export LD_LIBRARY_PATH=/home/james/trt_env_310/lib/python3.10/site-packages/nvidia/cusparselt/lib:/home/james/trt_env_310/lib/python3.10/site-packages/nvidia/cudnn/lib:/home/james/trt_env_310/lib/python3.10/site-packages/nvidia/cublas/lib:/home/james/trt_env_310/lib/python3.10/site-packages/nvidia/cuda_runtime/lib:/home/james/trt_env_310/lib/python3.10/site-packages/tensorrt_libs:$LD_LIBRARY_PATH && cd /home/james && source trt_env_310/bin/activate && echo 'Environment activated' && echo 'Building TensorRT engine for Gemma3...' && mkdir -p /home/james/gemma3_trt_engine && trtllm-build --checkpoint_dir /home/james/gemma3_trt_ready --output_dir /home/james/gemma3_trt_engine --gemm_plugin float16 --max_batch_size 8 --max_input_len 2048 --max_output_len 2048 --max_beam_width 1 && echo 'Build complete!' && ls -lah /home/james/gemma3_trt_engine/"

echo.
echo Build process finished.
pause