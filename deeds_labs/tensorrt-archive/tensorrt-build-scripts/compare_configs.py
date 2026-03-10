import json

with open('input/config.json') as f:
    gemma3_config = json.load(f)

print('=== Gemma3 12B Actual Parameters ===')
print(f'Vocab Size: {gemma3_config["vocab_size"]}')
print(f'Hidden Size: {gemma3_config["hidden_size"]}')
print(f'Layers: {gemma3_config["num_hidden_layers"]}')
print(f'Attention Heads: {gemma3_config["num_attention_heads"]}')
print(f'KV Heads: {gemma3_config["num_key_value_heads"]}')
print(f'Intermediate Size: {gemma3_config["intermediate_size"]}')
print(f'Head Dim: {gemma3_config["head_dim"]}')
print(f'RMS Norm EPS: {gemma3_config["rms_norm_eps"]}')
print(f'Sliding Window: {gemma3_config["sliding_window"]}')
print(f'Sliding Window Pattern: {gemma3_config["sliding_window_pattern"]}')

print('\n=== Comparison with Your Config ===')
print('Your config (INCORRECT):')
print('  Vocab Size: 50432 (Gemma2)')
print('  Layers: 70 (Gemma2)')
print('  KV Heads: 30 (Gemma2)')
print('  Intermediate Size: 12288 (Gemma2)')

print('\nGemma3 config (CORRECT):')
print(f'  Vocab Size: {gemma3_config["vocab_size"]} (Gemma3)')
print(f'  Layers: {gemma3_config["num_hidden_layers"]} (Gemma3)')
print(f'  KV Heads: {gemma3_config["num_key_value_heads"]} (Gemma3)')
print(f'  Intermediate Size: {gemma3_config["intermediate_size"]} (Gemma3)')