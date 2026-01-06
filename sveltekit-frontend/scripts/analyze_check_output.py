import re
import collections
import os

def analyze_log(log_path):
    print(f"Analyzing {log_path}...")
    error_counts = collections.Counter()

    # Regex for "X:\Path\To\File.ext:line:col"
    # Matches typical Windows absolute paths followed by line numbers
    # Also forgiving for relative paths if any
    path_pattern = re.compile(r'^(?:[a-zA-Z]:\\|[\\/]).+?:\d+:\d+')

    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                match = path_pattern.match(line)
                if match:
                    # Extract full path from the match
                    full_match = match.group(0)
                    # The path is everything before the last two colons (line:col)
                    # But verifying safely: split by ':' reversed
                    parts = full_match.split(':')
                    if len(parts) >= 3:
                        # Reconstruct path. On windows it might be "C", "\Users\...", "line", "col"
                        # Last two are line and col. First part is drive letter if len > 3.
                        # Actually simpler: rsplit on : twice.
                        file_path = full_match.rsplit(':', 2)[0]
                        error_counts[file_path] += 1
    except FileNotFoundError:
        print(f"File not found: {log_path}")
        return

    print(f"Found {len(error_counts)} files with errors.")
    print("-" * 60)
    print("TOP 100 FILES BY ERROR COUNT")
    print("-" * 60)

    top_100 = error_counts.most_common(100)
    for i, (path, count) in enumerate(top_100, 1):
        print(f"{i}. {path} ({count} errors)")

if __name__ == "__main__":
    analyze_log('svelte_check_full.txt')
