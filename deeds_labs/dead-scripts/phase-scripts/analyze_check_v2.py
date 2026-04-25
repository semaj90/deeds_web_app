import re
import collections
import os
import sys

def analyze_log(log_path):
    print(f"Analyzing {log_path}...", flush=True)
    error_counts = collections.Counter()

    # Regex for "X:\Path\To\File.ext:line:col"
    # Matches typical Windows absolute paths followed by line numbers
    path_pattern = re.compile(r'^(?:[a-zA-Z]:\\|[\\/]).+?:\d+:\d+')

    line_count = 0
    match_count = 0

    try:
        # utf-8-sig to handle BOM if present from PowerShell Out-File
        with open(log_path, 'r', encoding='utf-8-sig', errors='replace') as f:
            for line in f:
                line_count += 1
                line = line.strip()
                if not line: continue

                match = path_pattern.match(line)
                if match:
                    match_count += 1
                    full_match = match.group(0)
                    file_path = full_match.rsplit(':', 2)[0]
                    error_counts[file_path] += 1

    except FileNotFoundError:
        print(f"File not found: {log_path}")
        return
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    print(f"Scanned {line_count} lines.")
    print(f"Found {match_count} error lines.")
    print(f"Found {len(error_counts)} unique files with errors.")
    print("-" * 60)
    print("TOP 100 FILES BY ERROR COUNT")
    print("-" * 60)

    top_100 = error_counts.most_common(100)
    for i, (path, count) in enumerate(top_100, 1):
        print(f"{i}. {path} ({count} errors)")

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else 'svelte_check_full.txt'
    analyze_log(target)
