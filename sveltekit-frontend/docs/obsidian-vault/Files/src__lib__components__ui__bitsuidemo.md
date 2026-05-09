---
type: "file"
path: "src/lib/components/ui/BitsUIDemo.svelte"
aliases: ["BitsUIDemo.svelte","src/lib/components/ui/BitsUIDemo.svelte"]
clusterId: 34
ext: ".svelte"
lineCount: 268
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ui/BitsUIDemo.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-34]]"]
imports: ["[[Files/dialog__dialog]]","[[Files/select__select]]","[[Files/select__selectitem]]","[[Files/input__input]]","[[Files/button__button]]"]
tags: ["file","ext/svelte","cluster/34","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/ui/BitsUIDemo.svelte`
## For future Claude
> .svelte at src/lib/components/ui/BitsUIDemo.svelte (268 lines), Svelte component.
cluster:: [[Clusters/cluster-34]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 268
## Imports

- imports:: [[Files/dialog__dialog]] `./dialog/Dialog.svelte`
- imports:: [[Files/select__select]] `./select/Select.svelte`
- imports:: [[Files/select__selectitem]] `./select/SelectItem.svelte`
- imports:: [[Files/input__input]] `./input/Input.svelte`
- imports:: [[Files/button__button]] `./button/Button.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```