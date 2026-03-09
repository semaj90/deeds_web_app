# Applies Gemma3 3840-wide patch inside the TensorRT-LLM container and reinstalls the package
$patch = @"  
diff --git a/tensorrt_llm/models/gemma/model.py b/tensorrt_llm/models/gemma/model.py
index 2e4dff0..abcd123 100644
--- a/tensorrt_llm/models/gemma/model.py
+++ b/tensorrt_llm/models/gemma/model.py
@@ -48,12 +48,15 @@ class GemmaAttention(nn.Module):
-        # Canonical Gemma3 hardcoded hidden dims
-        self.hidden_size = 4096
-        self.final_hidden_size = 4096
-        self.projection_dim = 4096
+        # Use HF/Unsloth/VLM config instead of hardcoded 4096
+        self.hidden_size = config.hidden_size
+        self.final_hidden_size = getattr(config, "final_hidden_size", config.hidden_size)
+        self.projection_dim = getattr(config, "projection_dim", config.hidden_size)
+        self.project_dim = getattr(config, "project_dim", config.hidden_size)
@@ -129,7 +132,7 @@ class GemmaAttention(nn.Module):
-        out = linear(hidden_states, 4096)  # original
+        out = linear(hidden_states, self.final_hidden_size)  # 3840-aware

diff --git a/tensorrt_llm/models/gemma/config.py b/tensorrt_llm/models/gemma/config.py
index 9eea21a..bbcc889 100644
--- a/tensorrt_llm/models/gemma/config.py
+++ b/tensorrt_llm/models/gemma/config.py
@@ -30,11 +30,18 @@ class GemmaConfig:
-        # default Gemma3 dims
-        self.hidden_size = 4096
-        self.final_hidden_size = 4096
-        self.projection_dim = 4096
-        self.project_dim = 4096
+        # Adopt model-specific geometry
+        self.hidden_size = kwargs.get("hidden_size", 3840)
+        self.final_hidden_size = kwargs.get("final_hidden_size", self.hidden_size)
+        self.projection_dim = kwargs.get("projection_dim", self.hidden_size)
+        self.project_dim = kwargs.get("project_dim", self.hidden_size)
+
+        assert self.hidden_size == self.final_hidden_size,
+            "Gemma variant: hidden_size must equal final_hidden_size"
+        assert self.projection_dim == self.hidden_size,
+            "Gemma variant: projection_dim must match hidden_size"
"@

if (-not (Test-Path 'trtllm_patch')) {
    New-Item -ItemType Directory -Path 'trtllm_patch' | Out-Null
}
Set-Content -Path 'trtllm_patch/gemma3840.patch' -Value $patch

docker cp 'trtllm_patch/gemma3840.patch' phase66-tensorrt-llm:/workspace/gemma3840.patch

$patchCmd = "cd /usr/local/lib/python3.12/dist-packages/tensorrt_llm && patch -p1 < /workspace/gemma3840.patch"
docker exec phase66-tensorrt-llm bash -lc $patchCmd

$installCmd = "cd /usr/local/lib/python3.12/dist-packages/tensorrt_llm && pip install --no-cache-dir ."
docker exec phase66-tensorrt-llm bash -lc $installCmd
