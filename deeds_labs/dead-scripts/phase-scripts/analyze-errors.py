#!/usr/bin/env python3
import re
from collections import Counter

with open('svelte-check-latest.txt', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract filenames from error lines like "c:\path\to\file.ts:123:45"
# Pattern: absolute path ending in :\d+:\d+
matches = re.findall(r'^(c:[^\n]+?):\d+:\d+\s*$', content, re.MULTILINE)

counts = Counter(matches)

print("Top 30 Files with Most Errors:")
print("=" * 80)
for file, count in counts.most_common(30):
    print(f'{count:4d}  {file}')
