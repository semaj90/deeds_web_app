#!/usr/bin/env python3
"""Update notebook with all fixes"""
import json
from pathlib import Path

# Read notebook
nb_path = Path(__file__).parent / '@3_2_26Gemma3_12B_Legal_Production.ipynb'
with open(nb_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

print('Updating notebook with 3 fixes...\n')

# Fix 1: Update Cell 2 (Unsloth version pinning)
for i, cell in enumerate(nb['cells']):
    source = ''.join(cell.get('source', []))
    if '!pip install --upgrade --no-cache-dir "unsloth[colab-new]' in source and cell['cell_type'] == 'code':
        print(f'Fix 1: Updating Cell {i+1} - Unsloth version pinning')

        # Replace install section
        new_source = []
        in_install_section = False

        for line in cell['source']:
            if '!pip uninstall unsloth' in line:
                new_source.extend([
                    '!pip uninstall unsloth unsloth-zoo -y\n',
                    '\n',
                    '# Pin to stable version (avoid KeyError: sanitize_logprob)\n',
                    '!pip install --no-cache-dir "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git@2025.1" || \\\n',
                    '  pip install --no-cache-dir "unsloth==2024.12.5"\n',
                    '\n',
                ])
                in_install_section = True
            elif in_install_section and '!pip install' in line and 'unsloth' not in line:
                # Skip old dependency install lines
                continue
            elif in_install_section and 'print(' in line and 'Unsloth' in line:
                new_source.extend([
                    '!pip install --no-cache-dir \\\n',
                    '  bitsandbytes>=0.43.0 \\\n',
                    '  accelerate>=0.26.0 \\\n',
                    '  peft>=0.8.0 \\\n',
                    '  trl>=0.7.10 \\\n',
                    '  transformers>=4.37.0 \\\n',
                    '  datasets>=2.16.0 \\\n',
                    '  huggingface_hub>=0.20.0 \\\n',
                    '  pillow>=10.0.0\n',
                    '\n',
                    'print("\\nOK Unsloth stable version installed")\n',
                ])
                in_install_section = False
            elif not in_install_section:
                new_source.append(line)

        cell['source'] = new_source
        print('  OK: Unsloth version pinned to 2025.1/2024.12.5\n')
        break

# Fix 2: Add Google Drive path finder cell BEFORE Cell 12
cell_12_index = None
for i, cell in enumerate(nb['cells']):
    source = ''.join(cell.get('source', []))
    if 'shutil.copytree' in source and 'local-datasets' in source and cell['cell_type'] == 'code':
        cell_12_index = i
        print(f'Fix 2: Found Cell 12 at index {i+1}')
        break

if cell_12_index:
    # Check if path finder already exists
    prev_cell = nb['cells'][cell_12_index - 1] if cell_12_index > 0 else None
    prev_source = ''.join(prev_cell.get('source', [])) if prev_cell else ''

    if 'Searching for training-datasets' not in prev_source:
        path_finder_cell = {
            'cell_type': 'code',
            'execution_count': None,
            'metadata': {},
            'outputs': [],
            'source': [
                '# Find Google Drive training data path\n',
                'from google.colab import drive\n',
                'from pathlib import Path\n',
                '\n',
                'drive.mount("/content/drive")\n',
                '\n',
                'print("Searching for training-datasets...\\n")\n',
                '\n',
                'paths = [\n',
                '    Path("/content/drive/MyDrive/COLAB_PACKAGE/COLAB_PACKAGE/training-datasets"),\n',
                '    Path("/content/drive/MyDrive/COLAB_PACKAGE/training-datasets"),\n',
                '    Path("/content/drive/My Drive/COLAB_PACKAGE/training-datasets"),\n',
                ']\n',
                '\n',
                'found = None\n',
                'for p in paths:\n',
                '    print(f"Checking: {p}")\n',
                '    if p.exists():\n',
                '        found = p\n',
                '        print(f"  OK FOUND!\\n")\n',
                '        break\n',
                '    print(f"  ❌ Not found\\n")\n',
                '\n',
                'if found:\n',
                '    files = list(found.glob("*.jsonl"))\n',
                '    print(f"OK Path: {found}")\n',
                '    print(f"   Files: {len(files)} datasets")\n',
                'else:\n',
                '    print("❌ ERROR: Not found!")\n',
                '    print("\\nUpload to: /MyDrive/COLAB_PACKAGE/training-datasets/")\n',
                '    raise FileNotFoundError("training-datasets")\n'
            ]
        }

        nb['cells'].insert(cell_12_index, path_finder_cell)
        print(f'  OK: Inserted path finder cell\n')
        cell_12_index += 1

# Fix 3: Update Cell 12 (local disk copy)
if cell_12_index:
    print(f'Fix 3: Updating Cell {cell_12_index+1} - Local disk copy')

    nb['cells'][cell_12_index]['source'] = [
        'from google.colab import drive\n',
        'from pathlib import Path\n',
        'import shutil\n',
        '\n',
        'drive.mount("/content/drive")\n',
        '\n',
        'paths = [\n',
        '    Path("/content/drive/MyDrive/COLAB_PACKAGE/COLAB_PACKAGE/training-datasets"),\n',
        '    Path("/content/drive/MyDrive/COLAB_PACKAGE/training-datasets"),\n',
        '    Path("/content/drive/My Drive/COLAB_PACKAGE/training-datasets"),\n',
        ']\n',
        '\n',
        'source = None\n',
        'for p in paths:\n',
        '    if p.exists():\n',
        '        source = p\n',
        '        print(f"Found: {p}")\n',
        '        break\n',
        '\n',
        'if not source:\n',
        '    print("\\n❌ ERROR: Cannot find training-datasets!")\n',
        '    raise FileNotFoundError("Upload to /MyDrive/COLAB_PACKAGE/training-datasets/")\n',
        '\n',
        'local = Path("/content/local-datasets")\n',
        '\n',
        'if local.exists():\n',
        '    files = list(local.glob("*.jsonl"))\n',
        '    print(f"\\nOK LOCAL DISK EXISTS ({len(files)} files)\\n")\n',
        'else:\n',
        '    print(f"\\nCopying to local SSD...")\n',
        '    print(f"  From: {source}")\n',
        '    print(f"  To: {local}\\n")\n',
        '    \n',
        '    shutil.copytree(source, local)\n',
        '    \n',
        '    files = list(local.glob("*.jsonl"))\n',
        '    size = sum(f.stat().st_size for f in files) / (1024**2)\n',
        '    \n',
        '    print(f"\\nOK COPY COMPLETE!")\n',
        '    print(f"   Files: {len(files)} datasets")\n',
        '    print(f"   Size: {size:.1f} MB")\n',
        '\n',
        'print("\\n" + "="*70)\n',
        'print("⚡ LOCAL DISK READY - 10x faster I/O!")\n',
        'print("="*70 + "\\n")\n'
    ]
    print(f'  OK: Updated with multi-path support\n')

# Save
with open(nb_path, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1, ensure_ascii=False)

print('OK Notebook updated!\n')
print('Fixes applied:')
print('  1. Cell 2: Unsloth 2025.1/2024.12.5')
print('  2. NEW cell: Google Drive path finder')
print('  3. Cell 12: Multi-path local disk copy')
