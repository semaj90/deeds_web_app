# Cold / Warm / Hot Packet Lifecycle

_Goal: minimize the repo surface without losing provenance, traversal, or replay._

This note separates the system into two lanes that must stay connected:

1. repo minification and storage
2. semantic traversal and indexing

The rule is simple:

- cold store owns originals
- warm index owns packets and summaries
- hot cache owns active lookups
- queue owns work-in-flight

The stronger correction is:

- do not put the whole repo in the hot brain
- keep Qdrant as the hot semantic lookup and filtered traversal layer
- keep topology / quaternion / SOM / XGBoost math in the CUDA, PyTorch, or LibTorch lane
- promote the resulting vectors and payload fields back into Qdrant only after they are computed elsewhere
- treat Qdrant/TurboVec/Redis LOD as compressed approximate semantic geometry with optional exact rescore, not durable truth
- use the superseded-score report to rank originals before any archive eligibility decision

## 1. Storage Tiers

### Cold store

Cold store is where original artifacts live when they no longer need to stay hot in the repo.

Use cold storage for:

- raw docs
- giant transcript dumps
- backup trees
- generated logs that have already been summarized
- large `.md` / `.txt` evidence files
- mirror trees that are only needed for historical lookup

Preferred cold store:

- SeaweedFS

Repository rule:

- keep only completion notes, packet indexes, and active control docs in the repo
- move the original artifact out only after it has been copied to SeaweedFS, checksum-verified, recorded in Postgres, and marked archive-eligible

Archive scoring rule:

- give each original file a superseded score from 0 to 100
- 0 means keep hot in the repo
- 100 means fully superseded by validated packets, summaries, and sourceRef-linked mirrors
- this scorer is candidate-only: `delete_allowed` and `move_allowed` must always remain false
- archive eligibility is advisory until cold-copy verification, checksum validation, and human review all pass
- the score should be backed by duplicate detection, validation coverage, and sourceRef / feature_id resolution

### Warm index

Warm index is the packet layer that points back to cold originals.

Warm index records should be small and replayable:

- `sourceRef`
- `feature_id`
- `title_id`
- `queryHash`
- `pathMap` or `stableKey`
- short summary
- payload metadata
- pointer to the cold URI
- `cold_original_ref`
- archive-eligible status

Warm index is allowed in:

- Postgres
- DuckDB mirrors
- parent atlas packets
- Qdrant payloads
- Neo4j context trees
- Redis / Bitfrost tuple caches

### Hot cache

Hot cache is active memory for the current session or current task queue.

Use hot cache for:

- exact-hit packets
- centroid / similarity results
- ACE packet tuples
- sourceRef-first hot joins
- current-task replay state

Hot cache stores keys, pointers, summaries, and packet tuples.
It does not store the original blob as the authoritative copy.

## 2. Provenance Spine

The canonical join spine is:

```txt
file_path -> mapreduce stableKey -> sourceRef -> feature_id -> packetId
```

Use this spine for:

- mapreduce joins
- DuckDB materialization
- Postgres mirror rows
- Qdrant payload filters
- Redis / Bitfrost packet cache
- Neo4j context trees
- ACE packet generation

Do not use Qdrant point id as the atlas identity.

## 3. Lane Split

### Lane A: Repo minification / storage

This lane answers:

- What can leave the repo?
- What should stay as a completion note?
- What should become a packet index?
- What should be moved to SeaweedFS?

The output of this lane is:

- archive plan
- dirty-tree classification
- completion notes
- packet manifest
- cold-store URI map

This lane is offline-first and report-only.

### Lane B: Semantic traversal / indexing

This lane answers:

- How do we find the right packet quickly?
- How do we traverse from sourceRef to nearby context?
- How do we cluster and rerank without loading the full corpus?

The output of this lane is:

- Qdrant candidate set
- Redis / Bitfrost exact-hit result
- Neo4j context expansion
- ACE packet
- Gemma4 synthesis input

This lane is also offline-first.

## 4. Retrieval Stack

The traversal stack should stay small and deterministic:

1. sparse gate
2. dense recall
3. graph expansion
4. synthesis

Practical mapping:

- sparse gate: `rg`, path maps, feature ids, source refs, hashes
- dense recall: Qdrant ANN over compressed/indexed semantic geometry
- graph expansion: Neo4j / KAG / DAG
- synthesis: Gemma4

Redis / Bitfrost sits between sparse and dense as a hot reuse layer.

Candidate flow:

```txt
filters first
  -> approximate ANN candidate search
  -> dynamic oversampling when needed
  -> optional exact rescore
  -> packet assembly
```

## 5. Packet Contract

Packet rows should be narrow and replayable.

Recommended fields:

- `packetId`
- `schemaVersion`
- `sourceRef`
- `sourceRefs`
- `featureId`
- `titleId`
- `queryHash`
- `summary`
- `payload`
- `coldUri`
- `cacheKey`
- `parentAtlasCardId`

The packet should point back to cold originals, not inline them.

## 6. Queue Contract

RabbitMQ dequeues work, not whole corpora.

Use separate queues or priority queues, not one catch-all deque:

- `urgent.user-request`
- `normal.reindex`
- `bulk.cold-archive`
- dead-letter queues for rejected, failed, or expired work

Keep the priority range small for classic queues and treat quorum queue priority behavior as version-specific.

Use the queue for:

- packetization jobs
- warmup jobs
- indexing jobs
- summary jobs
- promotion jobs

Queue messages should contain:

- paths
- ids
- hashes
- packet references
- cold URIs

Do not enqueue large blobs.

## 7. Langfuse and Observability

Langfuse records:

- prompts
- tool calls
- summaries
- packet ids
- provenance
- traversal choices

Langfuse is not the blob store.
It is the audit trail.

## 8. What to Keep in the Repo

Keep these hot in the repo:

- active architecture notes
- completion notes
- packetizers
- join scripts
- schema definitions
- reports that are still navigation surfaces
- TOC and index files

Keep these cold or external:

- raw dumps
- old generated evidence
- redundant report snapshots
- mirror trees that are only used for historical lookup

## 9. What Not to Do

- do not keep originals hot just because they are convenient
- do not join atlas identity on Qdrant point ids
- do not treat Redis as durable truth
- do not turn Neo4j into the blob store
- do not re-summarize packets that already have a valid summary and sourceRef spine

## 10. Next Implementation Step

The next safe step is a dry-run join report that:

- reads the sourceRef / path map / mapreduce outputs
- emits compact packet indexes
- points at cold originals
- groups by `sourceRef` and `feature_id`
- leaves the original blobs in cold storage only

That report should be the handoff between repo minification and semantic traversal.

## 11. Superseded Score Is Advisory

`superseded_score` is a prioritization score, not a move/delete command.

- 0 means keep hot in repo
- 100 means eligible for reviewed archival only after all provenance/cold-copy requirements pass
- No score grants delete permission
- No score grants move permission
- `delete_allowed` must remain false until a separate reviewed archive execution gate exists
- `move_allowed` must remain false in candidate-only phases

Archive eligibility requires all of the following:
1. validated warm packets/cards exist
2. sourceRef coverage confirmed
3. feature_id/workspace_task_id coverage confirmed where applicable
4. cold copy candidate in SeaweedFS
5. checksum verification complete
6. Postgres ledger entry written
7. restore manifest in place
8. manual/operator review sign-off
