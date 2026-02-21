import sys, os, base64, zlib
B = 'c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/components'
# Read encoded data from stdin or file
with open('c:/Users/james/Videos/deeds-web-app/_data.b64','r') as f:
    data = f.read()
raw = zlib.decompress(base64.b64decode(data))
parts = raw.decode('utf-8').split('===FILE_SEP===')
names = ['legal/WorkspacePanel.svelte','legal/DocumentDetails.svelte','editor/WysiwygEditor.svelte']
for i,name in enumerate(names):
    if i < len(parts):
        fp = os.path.join(B, name)
        with open(fp, 'w', encoding='utf-8', newline='
') as out:
            out.write(parts[i])
        print(f'OK: {name} ({len(parts[i])} bytes)')
