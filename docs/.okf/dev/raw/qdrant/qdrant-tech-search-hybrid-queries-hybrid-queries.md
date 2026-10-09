- [Documentation](https://qdrant.tech/documentation/)
- [Search](https://qdrant.tech/documentation/search/)
- Hybrid Queries

# [Anchor](https://qdrant.tech/documentation/search/hybrid-queries/\#hybrid-and-multi-stage-queries) Hybrid and Multi-Stage Queries

_Available as of v1.10.0_

With the introduction of [multiple named vectors per point](https://qdrant.tech/documentation/manage-data/vectors/#named-vectors), there are use-cases when the best search is obtained by combining multiple queries,
or by performing the search in more than one stage.

Qdrant has a flexible and universal interface to make this possible, called `Query API` ( [API reference](https://api.qdrant.tech/api-reference/search/query-points)).

The main component for making the combinations of queries possible is the `prefetch` parameter, which enables making sub-requests.

Specifically, whenever a query has at least one prefetch, Qdrant will:

1. Perform the prefetch query (or queries),
2. Apply the main query over the results of its prefetch(es).

Additionally, prefetches can have prefetches themselves, so you can have nested prefetches.

## [Anchor](https://qdrant.tech/documentation/search/hybrid-queries/\#hybrid-search) Hybrid Search

One of the most common problems when you have different representations of the same data is to combine the queried points for each representation into a single result.

![Fusing results from multiple queries](https://qdrant.tech/docs/fusion-idea.png)

Fusing results from multiple queries

For example, in text search, it is often useful to combine dense and sparse vectors to get the best of both worlds: semantic understanding from dense vectors and precise word matching from sparse vectors.

Qdrant has a few ways of fusing the results from different queries: `rrf` and `dbsf`

### [Anchor](https://qdrant.tech/documentation/search/hybrid-queries/\#reciprocal-rank-fusion-rrf) Reciprocal Rank Fusion (RRF)

[RRF](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) considers the positions of results within each query and boosts those that appear closer to the top in multiple sets of results. The score of a document is calculated using its rank in each result set:

score(d∈D)=∑rd∈R(d)1k+rd+1wr−1

Where:

- D the set of points across all results
- R(d) is the set of rankings for a particular document
- k is a constant (set to 2 by default)
- r is an ordered set of results from one source
- rd is the rank of document d in ranking r
- wr is the weight of ranking r (set to 1 by default)

_Qdrant uses zero-based rank positions; the top result has rd=0._

Because wr defaults to 1, without setting explicit weights, the formula can be simplified to the original RRF function:

score(d∈D)=∑rd∈R(d)1k+rd

Here is an example of RRF for a query containing two prefetches against different named vectors configured to hold sparse and dense vectors, respectively.

httppythontypescriptrustjavacsharpgo

```http
POST /collections/{collection_name}/points/query
{
    "prefetch": [\
        {\
            "query": {\
                "indices": [1, 42],    // <┐\
                "values": [0.22, 0.8]  // <┴─sparse vector\
             },\
            "using": "sparse",\
            "limit": 20\
        },\
        {\
            "query": [0.01, 0.45, 0.67, ...], // <-- dense vector\
            "using": "dense",\
            "limit": 20\
        }\
    ],
    "query": { "rrf": {} }, // <--- reciprocal rank fusion with defaults
    "limit": 10
}
```

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333")

client.query_points(
    collection_name="{collection_name}",
    prefetch=[\
        models.Prefetch(\
            query=models.SparseVector(indices=[1, 42], values=[0.22, 0.8]),\
            using="sparse",\
            limit=20,\
        ),\
        models.Prefetch(\
            query=[0.01, 0.45, 0.67],  # <-- dense vector\
            using="dense",\
            limit=20,\
        ),\
    ],
    query=models.RrfQuery(rrf=models.Rrf()),
    limit=10,
)
```

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({ host: "localhost", port: 6333 });

client.query("{collection_name}", {
    prefetch: [\
        {\
            query: {\
                values: [0.22, 0.8],\
                indices: [1, 42],\
            },\
            using: 'sparse',\
            limit: 20,\
        },\
        {\
            query: [0.01, 0.45, 0.67],\
            using: 'dense',\
            limit: 20,\
        },\
    ],
    query: {
        rrf: {},
    },
    limit: 10,
});
```

```rust
use qdrant_client::Qdrant;
use qdrant_client::qdrant::{PrefetchQueryBuilder, Query, QueryPointsBuilder, RrfBuilder};

let client = Qdrant::from_url("http://localhost:6334").build()?;

client.query(
    QueryPointsBuilder::new("{collection_name}")
        .add_prefetch(PrefetchQueryBuilder::default()
            .query(Query::new_nearest([(1, 0.22), (42, 0.8)].as_slice()))
            .using("sparse")
            .limit(20u64)
        )
        .add_prefetch(PrefetchQueryBuilder::default()
            .query(Query::new_nearest(vec![0.01, 0.45, 0.67]))
            .using("dense")
            .limit(20u64)
        )
        .query(Query::new_rrf(RrfBuilder::default()))
        .limit(10u64)
).await?;
```

```java
import static io.qdrant.client.QueryFactory.nearest;
import static io.qdrant.client.QueryFactory.rrf;

import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Points.PrefetchQuery;
import io.qdrant.client.grpc.Points.QueryPoints;
import io.qdrant.client.grpc.Points.Rrf;
import java.util.List;

QdrantClient client = new QdrantClient(QdrantGrpcClient.newBuilder("localhost", 6334, false).build());

client.queryAsync(
    QueryPoints.newBuilder()
    .setCollectionName("{collection_name}")
    .addPrefetch(PrefetchQuery.newBuilder()
      .setQuery(nearest(List.of(0.22f, 0.8f), List.of(1, 42)))
      .setUsing("sparse")
      .setLimit(20)
      .build())
    .addPrefetch(PrefetchQuery.newBuilder()
      .setQuery(nearest(List.of(0.01f, 0.45f, 0.67f)))
      .setUsing("dense")
      .setLimit(20)
      .build())
    .setQuery(rrf(Rrf.newBuilder().build()))
    .setLimit(10)
    .build())
  .get();
```

```csharp
using Qdrant.Client;
using Qdrant.Client.Grpc;

var client = new QdrantClient("localhost", 6334);

await client.QueryAsync(
  collectionName: "{collection_name}",
  prefetch: new List < PrefetchQuery > {
    new() {
      Query = new(float, uint)[] {
          (0.22f, 1), (0.8f, 42),
        },
        Using = "sparse",
        Limit = 20
    },
    new() {
      Query = new float[] {
          0.01f, 0.45f, 0.67f
        },
        Using = "dense",
        Limit = 20
    }
  },
  query: new Rrf(),
  limit: 10
);
```

```go
import (
	"context"

	"github.com/qdrant/go-client/qdrant"
)

client, err := qdrant.NewClient(&qdrant.Config{
	Host: "localhost",
	Port: 6334,
})

client.Query(context.Background(), &qdrant.QueryPoints{
	CollectionName: "{collection_name}",
	Prefetch: []*qdrant.PrefetchQuery{
		{
			Query: qdrant.NewQuerySparse([]uint32{1, 42}, []float32{0.22, 0.8}),
			Using: qdrant.PtrOf("sparse"),
			Limit: qdrant.PtrOf(uint64(20)),
		},
		{
			Query: qdrant.NewQueryDense([]float32{0.01, 0.45, 0.67}),
			Using: qdrant.PtrOf("dense"),
			Limit: qdrant.PtrOf(uint64(20)),
		},
	},
	Query: qdrant.NewQueryRRF(&qdrant.Rrf{}),
	Limit: qdrant.PtrOf(uint64(10)),
})
```

pythonrust

```python
from qdrant_edge import Fusion, Prefetch, Query, QueryRequest, SparseVector

results = edge_shard.query(QueryRequest(
    prefetches=[\
        Prefetch(\
            query=Query.Nearest(SparseVector(indices=[1, 42], values=[0.22, 0.8]), using="sparse"),\
            limit=20,\
        ),\
        Prefetch(\
            query=Query.Nearest([0.01, 0.45, 0.67], using="dense"),\
            limit=20,\
        ),\
    ],
    query=Fusion.Rrf(k=2),
    limit=10,
))
```

```rust
use qdrant_edge::*;

let results = edge_shard.query(
    QueryRequestBuilder::new(10)
        .add_prefetch(
            PrefetchBuilder::new(20)
                .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                    query: VectorInternal::Sparse(SparseVector::new(vec![1, 42], vec![0.22, 0.8])?),
                    using: Some("sparse".to_string()),
                })))
                .build(),
        )
        .add_prefetch(
            PrefetchBuilder::new(20)
                .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                    query: vec![0.01f32, 0.45, 0.67].into(),
                    using: Some("dense".to_string()),
                })))
                .build(),
        )
        .query(ScoringQuery::Fusion(Fusion::Rrf { k: 2, weights: None }))
        .build(),
)?;
```

Deployment type:Qdrant ServerQdrant Edge

#### [Anchor](https://qdrant.tech/documentation/search/hybrid-queries/\#setting-rrf-constant-k) Setting RRF Constant k

_Available as of v1.16.0_

To set the constant k in the formula:

httppythontypescriptrustjavacsharpgo

```http
POST /collections/{collection_name}/points/query
{
    "prefetch": [\
      // 2+ prefetches here\
    ],
    "query": { "rrf": {"k": 60 } }, // <--- parameterized reciprocal rank fusion
    "limit": 10
}
```

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333")

client.query_points(
    collection_name="{collection_name}",
    prefetch=[\
        # 2+ prefetches here\
    ],
    query=models.RrfQuery(rrf=models.Rrf(k=60)),
)
```

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({ host: "localhost", port: 6333 });

client.query("{collection_name}", {
    prefetch: [\
      // 2+ prefetches here\
    ],
    query: { rrf: { k: 60 } },
});
```

```rust
use qdrant_client::Qdrant;
use qdrant_client::qdrant::{RrfBuilder, Query, QueryPointsBuilder};

let client = Qdrant::from_url("http://localhost:6334").build()?;

client.query(
    QueryPointsBuilder::new("{collection_name}")
        // .add_prefetch(...)  <┐
        // .add_prefetch(...)  <┴─ 2+ prefetches here
        .query(Query::new_rrf(RrfBuilder::with_k(60)))
).await?;
```

```java
import static io.qdrant.client.QueryFactory.rrf;

import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Points.PrefetchQuery;
import io.qdrant.client.grpc.Points.QueryPoints;
import io.qdrant.client.grpc.Points.Rrf;
import java.util.List;

QdrantClient client = new QdrantClient(QdrantGrpcClient.newBuilder("localhost", 6334, false).build());

client
    .queryAsync(
        QueryPoints.newBuilder()
            .setCollectionName("{collection_name}")
            // .addPrefetch(...) <┐
            // .addPrefetch(...) <┴─ 2+ prefetches here
            .setQuery(rrf(Rrf.newBuilder().setK(60).build()))
            .build())
    .get();
```

```csharp
using Qdrant.Client;
using Qdrant.Client.Grpc;

var client = new QdrantClient("localhost", 6334);

await client.QueryAsync(
  collectionName: "{collection_name}",
  prefetch: new List<PrefetchQuery>
  {
	  // 2+ prefetches here
  },
  query: new Rrf
  {
	  K = 60,
  }
);
```

```go
import (
	"context"

	"github.com/qdrant/go-client/qdrant"
)

client, err := qdrant.NewClient(&qdrant.Config{
	Host: "localhost",
	Port: 6334,
})

client.Query(context.Background(), &qdrant.QueryPoints{
	CollectionName: "{collection_name}",
	Prefetch:       []*qdrant.PrefetchQuery{
		// 2+ prefetches here
	},
	Query: qdrant.NewQueryRRF(
		&qdrant.Rrf{
			K: qdrant.PtrOf(uint32(60)),
		}),
})
```

pythonrust

```python
from qdrant_edge import Fusion, Prefetch, Query, QueryRequest

results = edge_shard.query(QueryRequest(
    prefetches=[\
        # 2+ prefetches here\
    ],
    query=Fusion.Rrf(k=60),
    limit=10,
))
```

```rust
use qdrant_edge::*;

let results = edge_shard.query(
    QueryRequestBuilder::new(10)
        // .add_prefetch(...)  <┐
        // .add_prefetch(...)  <┴─ 2+ prefetches here
        .query(ScoringQuery::Fusion(Fusion::Rrf { k: 60, weights: None }))
        .build(),
)?;
```

Deployment type:Qdrant ServerQdrant Edge

#### [Anchor](https://qdrant.tech/documentation/search/hybrid-queries/\#weighted-rrf) Weighted RRF

_Available as of v1.17.0_

By default, each query is assigned an equal weight. In reality, one retriever is often stronger than the other for a given workload. For example, a dense retriever may dominate on natural-language queries, while BM25 may win on identifier-heavy ones. Assigning equal weight to both can let the weaker retriever drag down results. To address this, you can assign greater weight to rankers that perform well on your evaluation set.

The `rrf` query allows you to configure relative weights for each of the prefetches. For example, if you have two prefetches and assign a weight of 3.0 to the first and 1.0 to the second, a document ranked third in the first query scores the same as a document ranked first in the second query. In the case of non-overlapping result sets, these weights return three results from the first set for every one result from the second set.

Weights should be provided as an array of numbers, where each weight is applied to the corresponding prefetch in the order they are defined. The number of weights must match the number of prefetches.

httppythontypescriptrustjavacsharpgo

```http
POST /collections/{collection_name}/points/query
{
    "prefetch": [\
        // Prefetches here\
    ],
    "query": {
        "rrf": {
            "weights": [3.0, 1.0]
        }
    },
    "limit": 10
}
```

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333")

client.query_points(
    collection_name="{collection_name}",
    prefetch=[\
        # 2+ prefetches here\
    ],
    query=models.RrfQuery(rrf=models.Rrf(weights=[3.0, 1.0])),
)
```

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({ host: "localhost", port: 6333 });

client.query("{collection_name}", {
    prefetch: [\
        // Prefetches here\
    ],
    query: {
        rrf: {
            weights: [3.0, 1.0],
        },
    },
    limit: 10,
});
```

```rust
use qdrant_client::qdrant::{Query, QueryPointsBuilder, RrfBuilder};
use qdrant_client::Qdrant;

let client = Qdrant::from_url("http://localhost:6334").build()?;

client
    .query(
        QueryPointsBuilder::new("{collection_name}")
            // .add_prefetch(...)  <┐
            // .add_prefetch(...)  <┴─ 2+ prefetches here
            .query(Query::new_rrf(RrfBuilder::new().weights(vec![3.0, 1.0]))),
    )
    .await?;
```

```java
import static io.qdrant.client.QueryFactory.rrf;

import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Points.PrefetchQuery;
import io.qdrant.client.grpc.Points.QueryPoints;
import io.qdrant.client.grpc.Points.Rrf;
import java.util.List;

QdrantClient client = new QdrantClient(QdrantGrpcClient.newBuilder("localhost", 6334, false).build());

client
        .queryAsync(
        QueryPoints.newBuilder()
                .setCollectionName("{collection_name}")
                // .addPrefetch(...) <┐
                // .addPrefetch(...) <┴─ Prefetches here
                .setQuery(rrf(Rrf.newBuilder().addAllWeights(List.of(3.0f, 1.0f)).build()))
                .build())
        .get();
```

```csharp
using Qdrant.Client;
using Qdrant.Client.Grpc;

var client = new QdrantClient("localhost", 6334);

await client.QueryAsync(
  collectionName: "{collection_name}",
  prefetch: new List<PrefetchQuery>
  {
	  // 2+ prefetches here
  },
  query: new Rrf
  {
	  Weights = {3.0f, 1.0f},
  }
);
```

```go
import (
	"context"

	"github.com/qdrant/go-client/qdrant"
)

client, err := qdrant.NewClient(&qdrant.Config{
	Host: "localhost",
	Port: 6334,
})

client.Query(context.Background(), &qdrant.QueryPoints{
	CollectionName: "{collection_name}",
	Prefetch:       []*qdrant.PrefetchQuery{
		// Prefetches here
	},
	Query: qdrant.NewQueryRRF(
		&qdrant.Rrf{
			Weights: []float32{3.0, 1.0},
		}),
})
```

pythonrust

```python
from qdrant_edge import Fusion, Prefetch, Query, QueryRequest

results = edge_shard.query(QueryRequest(
    prefetches=[\
        # 2+ prefetches here\
    ],
    query=Fusion.Rrf(k=2, weights=[3.0, 1.0]),
    limit=10,
))
```

```rust
use qdrant_edge::*;
use qdrant_edge::external::ordered_float::OrderedFloat;

let results = edge_shard.query(
    QueryRequestBuilder::new(10)
        // .add_prefetch(...)  <┐
        // .add_prefetch(...)  <┴─ 2+ prefetches here
        .query(ScoringQuery::Fusion(Fusion::Rrf {
            k: 2,
            weights: Some(vec![OrderedFloat(3.0f32), OrderedFloat(1.0f32)]),
        }))
        .build(),
)?;
```

Deployment type:Qdrant ServerQdrant Edge

Weights are a configuration choice, not something you can tune arbitrarily. The most reliable way to set them is by testing on your data.

- **With an eval set (queries paired with known-relevant docs):** split your eval queries in two. Try different weights on the first half, then measure on the second half. Measuring on the same queries you tuned on inflates the result. The [Choosing a Fusion Method notebook](https://githubtocolab.com/qdrant/examples/blob/master/fusion-methods/Choosing_a_Fusion_Method.ipynb) provides a reusable `tune_rrf_weights` grid-search helper you can adapt to a train/val split.
- **Without an eval set:** leave weights at the default `(1.0, 1.0)`. Hand-tuned weights without measurement are unlikely to beat the default reliably.

Retune when your retrievers change (new embedding model, new chunking), when your corpus drifts substantially, or on a fixed cadence with a fresh eval sample.

### [Anchor](https://qdrant.tech/documentation/search/hybrid-queries/\#distribution-based-score-fusion-dbsf) Distribution-Based Score Fusion (DBSF)

_Available as of v1.11.0_

[DBSF](https://medium.com/plain-simple-software/distribution-based-score-fusion-dbsf-a-new-approach-to-vector-search-ranking-f87c37488b18) keeps the raw scores from each query but normalizes their distributions before combining. For each retriever’s returned set, it computes the mean μ and sample standard deviation σ, then normalizes every score using the 3-sigma extremes as endpoints:

s^=s−(μ−3σ)6σ

Normalized scores are summed across retrievers. Different score magnitudes no longer matter because each retriever contributes on the same comparable range.

DBSF is a reasonable choice when you trust your retrievers’ raw scores to carry magnitude information. On well-calibrated retrievers DBSF can outperform tuned weighted RRF; on others weighted RRF wins. Neither dominates the other in general, so use your eval set to choose between them. Two caveats apply: the statistics come from the prefetch top-k (a small sample), and a single dominant outlier in that top-k can skew normalization for that query. Increase the prefetch `limit` if you see unstable rankings.

httppythontypescriptrustjavacsharpgo

```http
POST /collections/{collection_name}/points/query
{
    "prefetch": [\
        {\
            "query": {\
                "indices": [1, 42],    // <┐\
                "values": [0.22, 0.8]  // <┴─sparse vector\
             },\
            "using": "sparse",\
            "limit": 20\
        },\
        {\
            "query": [0.01, 0.45, 0.67, ...], // <-- dense vector\
            "using": "dense",\
            "limit": 20\
        }\
    ],
    "query": { "fusion": "dbsf" }, // <--- distribution-based score fusion
    "limit": 10
}
```

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333")

client.query_points(
    collection_name="{collection_name}",
    prefetch=[\
        models.Prefetch(\
            query=models.SparseVector(indices=[1, 42], values=[0.22, 0.8]),\
            using="sparse",\
            limit=20,\
        ),\
        models.Prefetch(\
            query=[0.01, 0.45, 0.67],  # <-- dense vector\
            using="dense",\
            limit=20,\
        ),\
    ],
    query=models.FusionQuery(fusion=models.Fusion.DBSF),
)
```

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({ host: "localhost", port: 6333 });

client.query("{collection_name}", {
    prefetch: [\
        {\
            query: {\
                values: [0.22, 0.8],\
                indices: [1, 42],\
            },\
            using: 'sparse',\
            limit: 20,\
        },\
        {\
            query: [0.01, 0.45, 0.67],\
            using: 'dense',\
            limit: 20,\
        },\
    ],
    query: {
        fusion: 'dbsf',
    },
});
```

```rust
use qdrant_client::Qdrant;
use qdrant_client::qdrant::{Fusion, PrefetchQueryBuilder, Query, QueryPointsBuilder};

let client = Qdrant::from_url("http://localhost:6334").build()?;

client.query(
    QueryPointsBuilder::new("{collection_name}")
        .add_prefetch(PrefetchQueryBuilder::default()
            .query(Query::new_nearest([(1, 0.22), (42, 0.8)].as_slice()))
            .using("sparse")
            .limit(20u64)
        )
        .add_prefetch(PrefetchQueryBuilder::default()
            .query(Query::new_nearest(vec![0.01, 0.45, 0.67]))
            .using("dense")
            .limit(20u64)
        )
        .query(Query::new_fusion(Fusion::Dbsf))
).await?;
```

```java
import static io.qdrant.client.QueryFactory.fusion;
import static io.qdrant.client.QueryFactory.nearest;

import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Points.Fusion;
import io.qdrant.client.grpc.Points.PrefetchQuery;
import io.qdrant.client.grpc.Points.QueryPoints;
import java.util.List;

QdrantClient client = new QdrantClient(QdrantGrpcClient.newBuilder("localhost", 6334, false).build());

client.queryAsync(
    QueryPoints.newBuilder()
    .setCollectionName("{collection_name}")
    .addPrefetch(PrefetchQuery.newBuilder()
      .setQuery(nearest(List.of(0.22f, 0.8f), List.of(1, 42)))
      .setUsing("sparse")
      .setLimit(20)
      .build())
    .addPrefetch(PrefetchQuery.newBuilder()
      .setQuery(nearest(List.of(0.01f, 0.45f, 0.67f)))
      .setUsing("dense")
      .setLimit(20)
      .build())
    .setQuery(fusion(Fusion.DBSF))
    .build())
  .get();
```

```csharp
using Qdrant.Client;
using Qdrant.Client.Grpc;

var client = new QdrantClient("localhost", 6334);

await client.QueryAsync(
  collectionName: "{collection_name}",
  prefetch: new List < PrefetchQuery > {
    new() {
      Query = new(float, uint)[] {
          (0.22f, 1), (0.8f, 42),
        },
        Using = "sparse",
        Limit = 20
    },
    new() {
      Query = new float[] {
          0.01f, 0.45f, 0.67f
        },
        Using = "dense",
        Limit = 20
    }
  },
  query: Fusion.Dbsf
);
```

```go
import (
	"context"

	"github.com/qdrant/go-client/qdrant"
)

client, err := qdrant.NewClient(&qdrant.Config{
	Host: "localhost",
	Port: 6334,
})

client.Query(context.Background(), &qdrant.QueryPoints{
	CollectionName: "{collection_name}",
	Prefetch: []*qdrant.PrefetchQuery{
		{
			Query: qdrant.NewQuerySparse([]uint32{1, 42}, []float32{0.22, 0.8}),
			Using: qdrant.PtrOf("sparse"),
			Limit: qdrant.PtrOf(uint64(20)),
		},
		{
			Query: qdrant.NewQueryDense([]float32{0.01, 0.45, 0.67}),
			Using: qdrant.PtrOf("dense"),
			Limit: qdrant.PtrOf(uint64(20)),
		},
	},
	Query: qdrant.NewQueryFusion(qdrant.Fusion_DBSF),
})
```

pythonrust

```python
from qdrant_edge import Fusion, Prefetch, Query, QueryRequest, SparseVector

results = edge_shard.query(QueryRequest(
    prefetches=[\
        Prefetch(\
            query=Query.Nearest(SparseVector(indices=[1, 42], values=[0.22, 0.8]), using="sparse"),\
            limit=20,\
        ),\
        Prefetch(\
            query=Query.Nearest([0.01, 0.45, 0.67], using="dense"),\
            limit=20,\
        ),\
    ],
    query=Fusion.Dbsf(),
    limit=10,
))
```

```rust
use qdrant_edge::*;

let results = edge_shard.query(
    QueryRequestBuilder::new(10)
        .add_prefetch(
            PrefetchBuilder::new(20)
                .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                    query: VectorInternal::Sparse(SparseVector::new(vec![1, 42], vec![0.22, 0.8])?),
                    using: Some("sparse".to_string()),
                })))
                .build(),
        )
        .add_prefetch(
            PrefetchBuilder::new(20)
                .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                    query: vec![0.01f32, 0.45, 0.67].into(),
                    using: Some("dense".to_string()),
                })))
                .build(),
        )
        .query(ScoringQuery::Fusion(Fusion::Dbsf))
        .build(),
)?;
```

Deployment type:Qdrant ServerQdrant Edge

### [Anchor](https://qdrant.tech/documentation/search/hybrid-queries/\#choosing-a-fusion-method) Choosing a Fusion Method

| If you have… | Use |
| --- | --- |
| An eval set (queries with known-relevant docs) to tune on | Weighted RRF, with weights tuned on a train/val split |
| Trust in your retrievers’ raw scores and no eval set | DBSF |
| Neither an eval set nor strong score priors | RRF (the safe default) |

For a deeper breakdown of when to prefer each, see the [FAQ on RRF vs. DBSF](https://qdrant.tech/documentation/faq/qdrant-fundamentals/#when-should-i-use-reciprocal-rank-fusion-rrf-vs-distribution-based-score-fusion-dbsf-for-hybrid-search). To layer business logic (recency, popularity, geo) on top of a fused result, see [Custom scoring with a formula query](https://qdrant.tech/documentation/search/hybrid-queries/#custom-scoring-with-a-formula-query).

## [Anchor](https://qdrant.tech/documentation/search/hybrid-queries/\#multi-stage-queries) Multi-Stage Queries

In general, larger vector representations give more accurate search results, but makes them more expensive to compute.

Splitting the search into two stages is a known technique to mitigate this effect:

- First, use a smaller and cheaper representation to get a large list of candidates.
- Then, re-score the candidates using the larger and more accurate representation.

There are a few ways to build search architectures around this idea:

- The quantized vectors as a first stage, and the full-precision vectors as a second stage.
- Leverage Matryoshka Representation Learning ( [MRL](https://arxiv.org/abs/2205.13147)) to generate candidate vectors with a shorter vector, and then refine them with a longer one.
- Use regular dense vectors to pre-fetch the candidates, and then re-score them with a multi-vector model like [ColBERT](https://arxiv.org/abs/2112.01488).

To get the best of all worlds, Qdrant has a convenient interface to perform the queries in stages,
such that the coarse results are fetched first, and then they are refined later with larger vectors.

### [Anchor](https://qdrant.tech/documentation/search/hybrid-queries/\#re-scoring-examples) Re-Scoring Examples

Fetch 1000 results using a shorter MRL byte vector, then re-score them using the full vector and get the top 10.

httppythontypescriptrustjavacsharpgo

```http
POST /collections/{collection_name}/points/query
{
    "prefetch": {
        "query": [1, 23, 45, 67], // <------------- small byte vector
        "using": "mrl_byte",
        "limit": 1000
    },
    "query": [0.01, 0.299, 0.45, 0.67, ...], // <-- full vector
    "using": "full",
    "limit": 10
}
```

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333")

client.query_points(
    collection_name="{collection_name}",
    prefetch=models.Prefetch(
        query=[1, 23, 45, 67],  # <------------- small byte vector
        using="mrl_byte",
        limit=1000,
    ),
    query=[0.01, 0.299, 0.45, 0.67],  # <-- full vector
    using="full",
    limit=10,
)
```

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({ host: "localhost", port: 6333 });

client.query("{collection_name}", {
  prefetch: {
    query: [1, 23, 45, 67], // <------------- small byte vector
    using: 'mrl_byte',
    limit: 1000,
  },
  query: [0.01, 0.299, 0.45, 0.67], // <-- full vector,
  using: 'full',
  limit: 10,
});
```

```rust
use qdrant_client::Qdrant;
use qdrant_client::qdrant::{PrefetchQueryBuilder, Query, QueryPointsBuilder};

let client = Qdrant::from_url("http://localhost:6334").build()?;

client.query(
    QueryPointsBuilder::new("{collection_name}")
        .add_prefetch(PrefetchQueryBuilder::default()
            .query(Query::new_nearest(vec![1.0, 23.0, 45.0, 67.0]))
            .using("mlr_byte")
            .limit(1000u64)
        )
        .query(Query::new_nearest(vec![0.01, 0.299, 0.45, 0.67]))
        .using("full")
        .limit(10u64)
).await?;
```

```java
import static io.qdrant.client.QueryFactory.nearest;

import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Points.PrefetchQuery;
import io.qdrant.client.grpc.Points.QueryPoints;

QdrantClient client =
    new QdrantClient(QdrantGrpcClient.newBuilder("localhost", 6334, false).build());

client
    .queryAsync(
        QueryPoints.newBuilder()
            .setCollectionName("{collection_name}")
            .addPrefetch(
                PrefetchQuery.newBuilder()
                    .setQuery(nearest(1, 23, 45, 67))	// <------------- small byte vector
                    .setLimit(1000)
                    .setUsing("mrl_byte")
                    .build())
            .setQuery(nearest(0.01f, 0.299f, 0.45f, 0.67f))	 // <-- full vector
            .setUsing("full")
            .setLimit(10)
            .build())
    .get();
```

```csharp
using Qdrant.Client;
using Qdrant.Client.Grpc;

var client = new QdrantClient("localhost", 6334);

await client.QueryAsync(
  collectionName: "{collection_name}",
  prefetch: new List<PrefetchQuery> {
    new() {
      Query = new float[] { 1,23, 45, 67 }, // <------------- small byte vector
        Using = "mrl_byte",
        Limit = 1000
    }
  },
  query: new float[] { 0.01f, 0.299f, 0.45f, 0.67f }, // <-- full vector
  usingVector: "full",
  limit: 10
);
```

```go
import (
	"context"

	"github.com/qdrant/go-client/qdrant"
)

client, err := qdrant.NewClient(&qdrant.Config{
	Host: "localhost",
	Port: 6334,
})

client.Query(context.Background(), &qdrant.QueryPoints{
	CollectionName: "{collection_name}",
	Prefetch: []*qdrant.PrefetchQuery{
		{
			Query: qdrant.NewQueryDense([]float32{1, 23, 45, 67}),
			Using: qdrant.PtrOf("mrl_byte"),
			Limit: qdrant.PtrOf(uint64(1000)),
		},
	},
	Query: qdrant.NewQueryDense([]float32{0.01, 0.299, 0.45, 0.67}),
	Using: qdrant.PtrOf("full"),
})
```

pythonrust

```python
from qdrant_edge import Prefetch, Query, QueryRequest

results = edge_shard.query(QueryRequest(
    prefetches=[\
        Prefetch(\
            query=Query.Nearest([1.0, 23.0, 45.0, 67.0], using="mrl_byte"),  # <--- small byte vector\
            limit=1000,\
        ),\
    ],
    query=Query.Nearest([0.01, 0.299, 0.45, 0.67], using="full"),
    limit=10,
))
```

```rust
use qdrant_edge::*;

let results = edge_shard.query(
    QueryRequestBuilder::new(10)
        .add_prefetch(
            PrefetchBuilder::new(1000)
                .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                    query: vec![1.0f32, 23.0, 45.0, 67.0].into(),
                    using: Some("mrl_byte".to_string()),
                })))
                .build(),
        )
        .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
            query: vec![0.01f32, 0.299, 0.45, 0.67].into(),
            using: Some("full".to_string()),
        })))
        .build(),
)?;
```

Deployment type:Qdrant ServerQdrant Edge

Fetch 100 results using the default vector, then re-score them using a multi-vector to get the top 10.

httppythontypescriptrustjavacsharpgo

```http
POST /collections/{collection_name}/points/query
{
    "prefetch": {
        "query": [0.01, 0.45, 0.67, ...], // <-- dense vector
        "limit": 100
    },
    "query": [           // <─┐\
        [0.1, 0.2, ...], // < │\
        [0.2, 0.1, ...], // < ├─ multi-vector\
        [0.8, 0.9, ...]  // < │\
    ],                   // <─┘
    "using": "colbert",
    "limit": 10
}
```

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333")

client.query_points(
    collection_name="{collection_name}",
    prefetch=models.Prefetch(
        query=[0.01, 0.45, 0.67, 0.53],  # <-- dense vector
        limit=100,
    ),
    query=[\
        [0.1, 0.2, 0.32],  # <─┐\
        [0.2, 0.1, 0.52],  # < ├─ multi-vector\
        [0.8, 0.9, 0.93],  # < ┘\
    ],
    using="colbert",
    limit=10,
)
```

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({ host: "localhost", port: 6333 });

client.query("{collection_name}", {
    prefetch: {
        query: [1, 23, 45, 67], // <------------- small byte vector
        limit: 100,
    },
    query: [\
        [0.1, 0.2], // <─┐\
        [0.2, 0.1], // < ├─ multi-vector\
        [0.8, 0.9], // < ┘\
    ],
    using: 'colbert',
    limit: 10,
});
```

```rust
use qdrant_client::Qdrant;
use qdrant_client::qdrant::{PrefetchQueryBuilder, Query, QueryPointsBuilder};

let client = Qdrant::from_url("http://localhost:6334").build()?;

client.query(
    QueryPointsBuilder::new("{collection_name}")
        .add_prefetch(PrefetchQueryBuilder::default()
            .query(Query::new_nearest(vec![0.01, 0.45, 0.67]))
            .limit(100u64)
        )
        .query(Query::new_nearest(vec![\
            vec![0.1, 0.2],\
            vec![0.2, 0.1],\
            vec![0.8, 0.9],\
        ]))
        .using("colbert")
        .limit(10u64)
).await?;
```

```java
import static io.qdrant.client.QueryFactory.nearest;

import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Points.PrefetchQuery;
import io.qdrant.client.grpc.Points.QueryPoints;

QdrantClient client =
    new QdrantClient(QdrantGrpcClient.newBuilder("localhost", 6334, false).build());

client
    .queryAsync(
        QueryPoints.newBuilder()
            .setCollectionName("{collection_name}")
            .addPrefetch(
                PrefetchQuery.newBuilder()
                    .setQuery(nearest(0.01f, 0.45f, 0.67f)) // <-- dense vector
                    .setLimit(100)
                    .build())
            .setQuery(
                nearest(
                    new float[][] {
                      {0.1f, 0.2f},	// <─┐
                      {0.2f, 0.1f},	// < ├─ multi-vector
                      {0.8f, 0.9f}	// < ┘
                    }))
            .setUsing("colbert")
            .setLimit(10)
            .build())
    .get();
```

```csharp
using Qdrant.Client;
using Qdrant.Client.Grpc;

var client = new QdrantClient("localhost", 6334);

await client.QueryAsync(
  collectionName: "{collection_name}",
  prefetch: new List <PrefetchQuery> {
    new() {
      Query = new float[] { 0.01f, 0.45f, 0.67f	},	// <-- dense vector****
        Limit = 100
    }
  },
  query: new float[][] {
    [0.1f, 0.2f], // <─┐
    [0.2f, 0.1f], // < ├─ multi-vector
    [0.8f, 0.9f]  // < ┘
  },
  usingVector: "colbert",
  limit: 10
);
```

```go
import (
	"context"

	"github.com/qdrant/go-client/qdrant"
)

client, err := qdrant.NewClient(&qdrant.Config{
	Host: "localhost",
	Port: 6334,
})

client.Query(context.Background(), &qdrant.QueryPoints{
	CollectionName: "{collection_name}",
	Prefetch: []*qdrant.PrefetchQuery{
		{
			Query: qdrant.NewQueryDense([]float32{0.01, 0.45, 0.67}),
			Limit: qdrant.PtrOf(uint64(100)),
		},
	},
	Query: qdrant.NewQueryMulti([][]float32{
		{0.1, 0.2},
		{0.2, 0.1},
		{0.8, 0.9},
	}),
	Using: qdrant.PtrOf("colbert"),
})
```

pythonrust

```python
from qdrant_edge import Prefetch, Query, QueryRequest

results = edge_shard.query(QueryRequest(
    prefetches=[\
        Prefetch(\
            query=Query.Nearest([0.01, 0.45, 0.67, 0.53], using="dense"),\
            limit=100,\
        ),\
    ],
    query=Query.Nearest(
        [\
            [0.1, 0.2, 0.32],  # <─┐\
            [0.2, 0.1, 0.52],  # < ├─ multi-vector\
            [0.8, 0.9, 0.93],  # < ┘\
        ],
        using="colbert",
    ),
    limit=10,
))
```

```rust
use qdrant_edge::*;

let results = edge_shard.query(
    QueryRequestBuilder::new(10)
        .add_prefetch(
            PrefetchBuilder::new(100)
                .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                    query: vec![0.01f32, 0.45, 0.67, 0.53].into(),
                    using: Some("dense".to_string()),
                })))
                .build(),
        )
        .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
            query: TypedMultiDenseVector::<f32>::try_from_matrix(vec![\
                vec![0.1f32, 0.2, 0.32],  // <─┐\
                vec![0.2, 0.1, 0.52],      // < ├─ multi-vector\
                vec![0.8, 0.9, 0.93],      // < ┘\
            ])?.into(),
            using: Some("colbert".to_string()),
        })))
        .build(),
)?;
```

Deployment type:Qdrant ServerQdrant Edge

You can combine all of these techniques in a single query:

httppythontypescriptrustjavacsharpgo

```http
POST /collections/{collection_name}/points/query
{
    "prefetch": {
        "prefetch": {
            "query": [1, 23, 45, 67], // <------ small byte vector
            "using": "mrl_byte",
            "limit": 1000
        },
        "query": [0.01, 0.45, 0.67, ...], // <-- full dense vector
        "using": "full",
        "limit": 100
    },
    "query": [           // <─┐\
        [0.1, 0.2, ...], // < │\
        [0.2, 0.1, ...], // < ├─ multi-vector\
        [0.8, 0.9, ...]  // < │\
    ],                   // <─┘
    "using": "colbert",
    "limit": 10
}
```

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333")

client.query_points(
    collection_name="{collection_name}",
    prefetch=models.Prefetch(
        prefetch=models.Prefetch(
            query=[1, 23, 45, 67],  # <------ small byte vector
            using="mrl_byte",
            limit=1000,
        ),
        query=[0.01, 0.45, 0.67],  # <-- full dense vector
        using="full",
        limit=100,
    ),
    query=[\
        [0.17, 0.23, 0.52],  # <─┐\
        [0.22, 0.11, 0.63],  # < ├─ multi-vector\
        [0.86, 0.93, 0.12],  # < ┘\
    ],
    using="colbert",
    limit=10,
)
```

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({ host: "localhost", port: 6333 });

client.query("{collection_name}", {
  prefetch: {
    prefetch: {
      query: [1, 23, 45, 67], // <------------- small byte vector
      using: 'mrl_byte',
      limit: 1000,
    },
    query: [0.01, 0.45, 0.67],  // <-- full dense vector
    using: 'full',
    limit: 100,
  },
  query: [\
    [0.1, 0.2], // <─┐\
    [0.2, 0.1], // < ├─ multi-vector\
    [0.8, 0.9], // < ┘\
  ],
  using: 'colbert',
  limit: 10,
});
```

```rust
use qdrant_client::Qdrant;
use qdrant_client::qdrant::{PrefetchQueryBuilder, Query, QueryPointsBuilder};

let client = Qdrant::from_url("http://localhost:6334").build()?;

client.query(
    QueryPointsBuilder::new("{collection_name}")
        .add_prefetch(PrefetchQueryBuilder::default()
            .add_prefetch(PrefetchQueryBuilder::default()
                .query(Query::new_nearest(vec![1.0, 23.0, 45.0, 67.0]))
                .using("mlr_byte")
                .limit(1000u64)
            )
            .query(Query::new_nearest(vec![0.01, 0.45, 0.67]))
            .using("full")
            .limit(100u64)
        )
        .query(Query::new_nearest(vec![\
            vec![0.1, 0.2],\
            vec![0.2, 0.1],\
            vec![0.8, 0.9],\
        ]))
        .using("colbert")
        .limit(10u64)
).await?;
```

```java
import static io.qdrant.client.QueryFactory.nearest;

import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Points.PrefetchQuery;
import io.qdrant.client.grpc.Points.QueryPoints;

QdrantClient client =
    new QdrantClient(QdrantGrpcClient.newBuilder("localhost", 6334, false).build());

client
    .queryAsync(
        QueryPoints.newBuilder()
            .setCollectionName("{collection_name}")
            .addPrefetch(
                PrefetchQuery.newBuilder()
                    .addPrefetch(
                        PrefetchQuery.newBuilder()
                            .setQuery(nearest(1, 23, 45, 67))	// <------------- small byte vector
                            .setUsing("mrl_byte")
                            .setLimit(1000)
                            .build())
                    .setQuery(nearest(0.01f, 0.45f, 0.67f)) // <-- dense vector
                    .setUsing("full")
                    .setLimit(100)
                    .build())
            .setQuery(
                nearest(
                    new float[][] {
                      {0.1f, 0.2f},	// <─┐
                      {0.2f, 0.1f},	// < ├─ multi-vector
                      {0.8f, 0.9f}	// < ┘
                    }))
            .setUsing("colbert")
            .setLimit(10)
            .build())
    .get();
```

```csharp
using Qdrant.Client;
using Qdrant.Client.Grpc;

var client = new QdrantClient("localhost", 6334);

await client.QueryAsync(
  collectionName: "{collection_name}",
  prefetch: new List <PrefetchQuery> {
    new() {
      Prefetch = {
          new List <PrefetchQuery> {
            new() {
              Query = new float[] { 1, 23, 45, 67 }, // <------------- small byte vector
                Using = "mrl_byte",
                Limit = 1000
            },
          }
        },
        Query = new float[] {0.01f, 0.45f, 0.67f}, // <-- dense vector
        Using = "full",
        Limit = 100
    }
  },
  query: new float[][] {
    [0.1f, 0.2f], // <─┐
    [0.2f, 0.1f], // < ├─ multi-vector
    [0.8f, 0.9f]  // < ┘
  },
  usingVector: "colbert",
  limit: 10
);
```

```go
import (
	"context"

	"github.com/qdrant/go-client/qdrant"
)

client, err := qdrant.NewClient(&qdrant.Config{
	Host: "localhost",
	Port: 6334,
})

client.Query(context.Background(), &qdrant.QueryPoints{
	CollectionName: "{collection_name}",
	Prefetch: []*qdrant.PrefetchQuery{
		{
			Prefetch: []*qdrant.PrefetchQuery{
				{
					Query: qdrant.NewQueryDense([]float32{1, 23, 45, 67}),
					Using: qdrant.PtrOf("mrl_byte"),
					Limit: qdrant.PtrOf(uint64(1000)),
				},
			},
			Query: qdrant.NewQueryDense([]float32{0.01, 0.45, 0.67}),
			Limit: qdrant.PtrOf(uint64(100)),
			Using: qdrant.PtrOf("full"),
		},
	},
	Query: qdrant.NewQueryMulti([][]float32{
		{0.1, 0.2},
		{0.2, 0.1},
		{0.8, 0.9},
	}),
	Using: qdrant.PtrOf("colbert"),
})
```

pythonrust

```python
from qdrant_edge import Prefetch, Query, QueryRequest

results = edge_shard.query(QueryRequest(
    prefetches=[\
        Prefetch(\
            prefetches=[\
                Prefetch(\
                    query=Query.Nearest([1.0, 23.0, 45.0, 67.0], using="mrl_byte"),  # <--- small byte vector\
                    limit=1000,\
                ),\
            ],\
            query=Query.Nearest([0.01, 0.45, 0.67], using="full"),\
            limit=100,\
        ),\
    ],
    query=Query.Nearest(
        [\
            [0.17, 0.23, 0.52],  # <─┐\
            [0.22, 0.11, 0.63],  # < ├─ multi-vector\
            [0.86, 0.93, 0.12],  # < ┘\
        ],
        using="colbert",
    ),
    limit=10,
))
```

```rust
use qdrant_edge::*;

let results = edge_shard.query(
    QueryRequestBuilder::new(10)
        .add_prefetch(
            PrefetchBuilder::new(100)
                .add_prefetch(
                    PrefetchBuilder::new(1000)
                        .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                            query: vec![1.0f32, 23.0, 45.0, 67.0].into(),
                            using: Some("mrl_byte".to_string()),
                        })))
                        .build(),
                )
                .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                    query: vec![0.01f32, 0.45, 0.67].into(),
                    using: Some("full".to_string()),
                })))
                .build(),
        )
        .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
            query: TypedMultiDenseVector::<f32>::try_from_matrix(vec![\
                vec![0.17f32, 0.23, 0.52],  // <─┐\
                vec![0.22, 0.11, 0.63],      // < ├─ multi-vector\
                vec![0.86, 0.93, 0.12],      // < ┘\
            ])?.into(),
            using: Some("colbert".to_string()),
        })))
        .build(),
)?;
```

Deployment type:Qdrant ServerQdrant Edge

### [Anchor](https://qdrant.tech/documentation/search/hybrid-queries/\#custom-scoring-with-a-formula-query) Custom Scoring with a Formula Query

_Available as of v1.14.0_

A formula query lets you compose a final score from prefetch scores (`$score`), payload fields, and built-in helpers like exponential or Gaussian decay. The typical pattern is to fuse retrievers with RRF or DBSF in a prefetch, then wrap that prefetch in a formula query that layers ranking logic on top: recency decay, popularity boosts, geo decay, or category-conditional multipliers.

httppythontypescriptrustjavacsharpgo

```http
POST /collections/{collection_name}/points/query
{
    "prefetch": {
        "prefetch": [\
            {\
                "query": {\
                    "indices": [1, 42],    // <┐\
                    "values": [0.22, 0.8]  // <┴─sparse vector\
                },\
                "using": "sparse",\
                "limit": 100\
            },\
            {\
                "query": [0.01, 0.45, 0.67, ...], // <-- dense vector\
                "using": "dense",\
                "limit": 100\
            }\
        ],
        "query": { "rrf": {} },
        "limit": 100
    },
    "query": {
        "formula": {
            "sum": [\
                "$score", // the fused score from the RRF prefetch\
                {\
                    "mult": [\
                        0.1, // caps decay contribution\
                        {\
                            "exp_decay": {\
                                "x": {\
                                    "datetime_key": "published_at"\
                                },\
                                "target": {\
                                    "datetime": "YYYY-MM-DDT00:00:00Z"\
                                },\
                                "scale": 15552000, // 180 days in seconds\
                                "midpoint": 0.5\
                            }\
                        }\
                    ]\
                }\
            ]
        }
    },
    "limit": 10
}
```

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333")

client.query_points(
    collection_name="{collection_name}",
    prefetch=models.Prefetch(
        prefetch=[\
            models.Prefetch(\
                query=models.SparseVector(indices=[1, 42], values=[0.22, 0.8]),\
                using="sparse",\
                limit=100,\
            ),\
            models.Prefetch(\
                query=[0.01, 0.45, 0.67],  # <-- dense vector\
                using="dense",\
                limit=100,\
            ),\
        ],
        query=models.RrfQuery(rrf=models.Rrf()),
        limit=100,
    ),
    query=models.FormulaQuery(
        formula=models.SumExpression(
            sum=[\
                "$score",  # the fused score from the RRF prefetch\
                models.MultExpression(mult=[\
                    0.1,  # caps decay contribution; un-weighted decay [0, 1] would otherwise crowd out small RRF scores\
                    models.ExpDecayExpression(\
                        exp_decay=models.DecayParamsExpression(\
                            x=models.DatetimeKeyExpression(datetime_key="published_at"),\
                            target=models.DatetimeExpression(datetime="YYYY-MM-DDT00:00:00Z"),\
                            scale=86400 * 180,  # 180 days in seconds\
                            midpoint=0.5,\
                        )\
                    ),\
                ]),\
            ]
        )
    ),
    limit=10,
)
```

```typescript
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({ host: "localhost", port: 6333 });

await client.query("{collection_name}", {
    prefetch: {
        prefetch: [\
            {\
                query: {\
                    values: [0.22, 0.8],\
                    indices: [1, 42],\
                },\
                using: "sparse",\
                limit: 100,\
            },\
            {\
                query: [0.01, 0.45, 0.67], // <-- dense vector\
                using: "dense",\
                limit: 100,\
            },\
        ],
        query: { rrf: {} },
        limit: 100,
    },
    query: {
        formula: {
            sum: [\
                "$score", // the fused score from the RRF prefetch\
                {\
                    mult: [\
                        0.1, // caps decay contribution; un-weighted decay [0, 1] would otherwise crowd out small RRF scores\
                        {\
                            exp_decay: {\
                                x: { datetime_key: "published_at" },\
                                target: { datetime: "YYYY-MM-DDT00:00:00Z" },\
                                scale: 86400 * 180, // 180 days in seconds\
                                midpoint: 0.5,\
                            },\
                        },\
                    ],\
                },\
            ],
        },
    },
    limit: 10,
});
```

```rust
use qdrant_client::Qdrant;
use qdrant_client::qdrant::{
    DecayParamsExpressionBuilder, Expression, FormulaBuilder, PrefetchQueryBuilder, Query,
    QueryPointsBuilder, RrfBuilder,
};

let client = Qdrant::from_url("http://localhost:6334").build()?;

client.query(
    QueryPointsBuilder::new("{collection_name}")
        .add_prefetch(
            PrefetchQueryBuilder::default()
                .add_prefetch(
                    PrefetchQueryBuilder::default()
                        .query(Query::new_nearest([(1, 0.22), (42, 0.8)].as_slice()))
                        .using("sparse")
                        .limit(100u64),
                )
                .add_prefetch(
                    PrefetchQueryBuilder::default()
                        .query(Query::new_nearest(vec![0.01, 0.45, 0.67]))
                        .using("dense")
                        .limit(100u64),
                )
                .query(Query::new_rrf(RrfBuilder::default()))
                .limit(100u64),
        )
        .query(
            FormulaBuilder::new(Expression::sum_with([\
                Expression::score(),\
                Expression::mult_with([\
                    Expression::constant(0.1),\
                    Expression::exp_decay(\
                        DecayParamsExpressionBuilder::new(Expression::datetime_key("published_at"))\
                            .target(Expression::datetime("YYYY-MM-DDT00:00:00Z"))\
                            .scale(86400.0 * 180.0)\
                            .midpoint(0.5),\
                    ),\
                ]),\
            ])),
        )
        .limit(10u64),
)
.await?;
```

```java
import static io.qdrant.client.ExpressionFactory.constant;
import static io.qdrant.client.ExpressionFactory.datetime;
import static io.qdrant.client.ExpressionFactory.datetimeKey;
import static io.qdrant.client.ExpressionFactory.expDecay;
import static io.qdrant.client.ExpressionFactory.mult;
import static io.qdrant.client.ExpressionFactory.sum;
import static io.qdrant.client.ExpressionFactory.variable;
import static io.qdrant.client.QueryFactory.formula;
import static io.qdrant.client.QueryFactory.nearest;
import static io.qdrant.client.QueryFactory.rrf;

import io.qdrant.client.QdrantClient;
import io.qdrant.client.QdrantGrpcClient;
import io.qdrant.client.grpc.Points.DecayParamsExpression;
import io.qdrant.client.grpc.Points.Formula;
import io.qdrant.client.grpc.Points.MultExpression;
import io.qdrant.client.grpc.Points.PrefetchQuery;
import io.qdrant.client.grpc.Points.QueryPoints;
import io.qdrant.client.grpc.Points.Rrf;
import io.qdrant.client.grpc.Points.SumExpression;
import java.util.List;

QdrantClient client =
  new QdrantClient(QdrantGrpcClient.newBuilder("localhost", 6334, false).build());

client.queryAsync(
    QueryPoints.newBuilder()
        .setCollectionName("{collection_name}")
        .addPrefetch(
            PrefetchQuery.newBuilder()
                .addPrefetch(
                    PrefetchQuery.newBuilder()
                        .setQuery(nearest(List.of(0.22f, 0.8f), List.of(1, 42)))
                        .setUsing("sparse")
                        .setLimit(100)
                        .build())
                .addPrefetch(
                    PrefetchQuery.newBuilder()
                        .setQuery(nearest(List.of(0.01f, 0.45f, 0.67f)))
                        .setUsing("dense")
                        .setLimit(100)
                        .build())
                .setQuery(rrf(Rrf.newBuilder().build()))
                .setLimit(100)
                .build())
        .setQuery(
            formula(
                Formula.newBuilder()
                    .setExpression(
                        sum(
                            SumExpression.newBuilder()
                                .addSum(variable("$score"))
                                .addSum(
                                    mult(
                                        MultExpression.newBuilder()
                                            .addMult(constant(0.1f))
                                            .addMult(
                                                expDecay(
                                                    DecayParamsExpression.newBuilder()
                                                        .setX(datetimeKey("published_at"))
                                                        .setTarget(
                                                            datetime("YYYY-MM-DDT00:00:00Z"))
                                                        .setScale(86400 * 180)
                                                        .setMidpoint(0.5f)
                                                        .build()))
                                            .build()))
                                .build()))
                    .build()))
        .setLimit(10)
        .build())
  .get();
```

```csharp
using Qdrant.Client;
using Qdrant.Client.Grpc;

var client = new QdrantClient("localhost", 6334);

await client.QueryAsync(
    collectionName: "{collection_name}",
    prefetch:
    [\
        new PrefetchQuery {\
            Prefetch = {\
                new PrefetchQuery {\
                    Query = new(float, uint)[] { (0.22f, 1), (0.8f, 42) },\
                    Using = "sparse",\
                    Limit = 100\
                },\
                new PrefetchQuery {\
                    Query = new float[] { 0.01f, 0.45f, 0.67f },\
                    Using = "dense",\
                    Limit = 100\
                },\
            },\
            Query = new Rrf(),\
            Limit = 100\
        },\
    ],
    query: new Formula
    {
        Expression = new SumExpression
        {
            Sum =
            {
                "$score", // the fused score from the RRF prefetch
                new MultExpression
                {
                    Mult =
                    {
                        0.1f, // caps decay contribution
                        Expression.FromExpDecay(
                            new()
                            {
                                X = Expression.FromDateTimeKey("published_at"),
                                Target = Expression.FromDateTime("YYYY-MM-DDT00:00:00Z"),
                                Scale = 86400 * 180, // 180 days in seconds
                                Midpoint = 0.5f
                            }
                        )
                    }
                }
            }
        }
    },
    limit: 10
);
```

```go
import (
	"context"

	"github.com/qdrant/go-client/qdrant"
)

client, err := qdrant.NewClient(&qdrant.Config{
	Host: "localhost",
	Port: 6334,
})

client.Query(context.Background(), &qdrant.QueryPoints{
	CollectionName: "{collection_name}",
	Prefetch: []*qdrant.PrefetchQuery{
		{
			Prefetch: []*qdrant.PrefetchQuery{
				{
					Query: qdrant.NewQuerySparse([]uint32{1, 42}, []float32{0.22, 0.8}),
					Using: qdrant.PtrOf("sparse"),
					Limit: qdrant.PtrOf(uint64(100)),
				},
				{
					Query: qdrant.NewQueryDense([]float32{0.01, 0.45, 0.67}),
					Using: qdrant.PtrOf("dense"),
					Limit: qdrant.PtrOf(uint64(100)),
				},
			},
			Query: qdrant.NewQueryRRF(&qdrant.Rrf{}),
			Limit: qdrant.PtrOf(uint64(100)),
		},
	},
	Query: qdrant.NewQueryFormula(&qdrant.Formula{
		Expression: qdrant.NewExpressionSum(&qdrant.SumExpression{
			Sum: []*qdrant.Expression{
				qdrant.NewExpressionVariable("$score"), // the fused score from the RRF prefetch
				qdrant.NewExpressionMult(&qdrant.MultExpression{
					Mult: []*qdrant.Expression{
						qdrant.NewExpressionConstant(0.1), // caps decay contribution
						qdrant.NewExpressionExpDecay(&qdrant.DecayParamsExpression{
							X:        qdrant.NewExpressionDatetimeKey("published_at"),
							Target:   qdrant.NewExpressionDatetime("YYYY-MM-DDT00:00:00Z"),
							Scale:    qdrant.PtrOf(float32(86400 * 180)), // 180 days in seconds
							Midpoint: qdrant.PtrOf(float32(0.5)),
						}),
					},
				}),
			},
		}),
	}),
	Limit: qdrant.PtrOf(uint64(10)),
})
```

pythonrust

```python
from qdrant_edge import (
    DecayKind,
    Expression,
    Formula,
    Fusion,
    Prefetch,
    Query,
    QueryRequest,
    SparseVector,
)

results = edge_shard.query(QueryRequest(
    prefetches=[\
        Prefetch(\
            prefetches=[\
                Prefetch(\
                    query=Query.Nearest(SparseVector(indices=[1, 42], values=[0.22, 0.8]), using="sparse"),\
                    limit=100,\
                ),\
                Prefetch(\
                    query=Query.Nearest([0.01, 0.45, 0.67], using="dense"),\
                    limit=100,\
                ),\
            ],\
            query=Fusion.Rrf(k=2),\
            limit=100,\
        ),\
    ],
    query=Formula(
        formula=Expression.Sum([\
            Expression.Variable("$score"),\
            Expression.Mult([\
                Expression.Constant(0.1),\
                Expression.Decay(\
                    kind=DecayKind.Exp,\
                    x=Expression.DatetimeKey("published_at"),\
                    target=Expression.Datetime("YYYY-MM-DDT00:00:00Z"),\
                    midpoint=0.5,\
                    scale=86400.0 * 180.0,\
                ),\
            ]),\
        ]),
    ),
    limit=10,
))
```

```rust
use qdrant_edge::*;

let results = edge_shard.query(
    QueryRequestBuilder::new(10)
        .add_prefetch(
            PrefetchBuilder::new(100)
                .add_prefetch(
                    PrefetchBuilder::new(100)
                        .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                            query: VectorInternal::Sparse(SparseVector::new(vec![1, 42], vec![0.22, 0.8])?),
                            using: Some("sparse".to_string()),
                        })))
                        .build(),
                )
                .add_prefetch(
                    PrefetchBuilder::new(100)
                        .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
                            query: vec![0.01f32, 0.45, 0.67].into(),
                            using: Some("dense".to_string()),
                        })))
                        .build(),
                )
                .query(ScoringQuery::Fusion(Fusion::Rrf { k: 2, weights: None }))
                .build(),
        )
        .query(ScoringQuery::Formula(
            Formula {
                formula: Expression::Sum(vec![\
                    Expression::Variable("$score".to_string()),\
                    Expression::Mult(vec![\
                        Expression::Constant(0.1),\
                        Expression::Decay {\
                            kind: DecayKind::Exp,\
                            x: Box::new(Expression::DatetimeKey(\
                                "published_at".try_into().unwrap(),\
                            )),\
                            target: Some(Box::new(Expression::Datetime(\
                                "YYYY-MM-DDT00:00:00Z".to_string(),\
                            ))),\
                            midpoint: Some(0.5),\
                            scale: Some(86400.0 * 180.0),\
                        },\
                    ]),\
                ]),
                defaults: Default::default(),
            }
            .try_into()?,
        ))
        .build(),
)?;
```

Deployment type:Qdrant ServerQdrant Edge

The [Choosing a Fusion Method notebook](https://githubtocolab.com/qdrant/examples/blob/master/fusion-methods/Choosing_a_Fusion_Method.ipynb) shows this pattern end-to-end with exponential decay on a `published_at` payload field. For full formula query and decay function syntax, see the [Search Relevance reference](https://qdrant.tech/documentation/search/search-relevance/).

### [Anchor](https://qdrant.tech/documentation/search/hybrid-queries/\#fusion-in-distributed-collections) Fusion in Distributed Collections

The previous example puts the fusion inside a prefetch. In a multi-shard collection, a fusion merges results across all shards only when it is the main query, held in the top-level `query` field with the retrievers as its prefetches, as in the [RRF](https://qdrant.tech/documentation/search/hybrid-queries/#reciprocal-rank-fusion-rrf) and [DBSF](https://qdrant.tech/documentation/search/hybrid-queries/#distribution-based-score-fusion-dbsf) examples. When it instead sits inside a prefetch, each shard computes the fusion on its local results, so the fused ranking is per shard rather than global.

To fuse across shards, make the fusion the main query. A main query is a single operation, so it cannot be both a fusion and a formula. To keep a formula rescore over fused results, use a single shard.

## [Anchor](https://qdrant.tech/documentation/search/hybrid-queries/\#grouping) Grouping

_Available as of v1.11.0_

It is possible to group results by a certain field. This is useful when you have multiple points for the same item, and you want to avoid redundancy of the same item in the results.

REST API ( [Schema](https://api.qdrant.tech/master/api-reference/search/query-points-groups)):

httppythontypescriptrustjavacsharpgo

```http
POST /collections/{collection_name}/points/query/groups
{
    // Same as in the regular query API
    "query": [1.1],
    // Grouping parameters
    "group_by": "document_id",  // Path of the field to group by
    "limit": 4,                 // Max amount of groups
    "group_size": 2            // Max amount of points per group
}
```

```python
client.query_points_groups(
    collection_name="{collection_name}",
    # Same as in the regular query_points() API
    query=[1.1],
    # Grouping parameters
    group_by="document_id",  # Path of the field to group by
    limit=4,  # Max amount of groups
    group_size=2,  # Max amount of points per group
)
```

```typescript
client.queryGroups("{collection_name}", {
    query: [1.1],
    group_by: "document_id",
    limit: 4,
    group_size: 2,
});
```

```rust
use qdrant_client::qdrant::QueryPointGroupsBuilder;

client
    .query_groups(
        QueryPointGroupsBuilder::new("{collection_name}", "document_id")
            .query(vec![0.2, 0.1, 0.9, 0.7])
            .group_size(2u64)
            .with_payload(true)
            .with_vectors(true)
            .limit(4u64),
    )
    .await?;
```

```java
import static io.qdrant.client.QueryFactory.nearest;

import io.qdrant.client.grpc.Points.QueryPointGroups;
import io.qdrant.client.grpc.Points.SearchPointGroups;
import java.util.List;

client.queryGroupsAsync(
        QueryPointGroups.newBuilder()
                .setCollectionName("{collection_name}")
                .setQuery(nearest(0.2f, 0.1f, 0.9f, 0.7f))
                .setGroupBy("document_id")
                .setLimit(4)
                .setGroupSize(2)
                .build())
        .get();
```

```csharp
using Qdrant.Client;

var client = new QdrantClient("localhost", 6334);

await client.QueryGroupsAsync(
    collectionName: "{collection_name}",
    query: new float[] { 0.2f, 0.1f, 0.9f, 0.7f },
    groupBy: "document_id",
    limit: 4,
    groupSize: 2
);
```

```go
import (
	"context"

	"github.com/qdrant/go-client/qdrant"
)

client, err := qdrant.NewClient(&qdrant.Config{
	Host: "localhost",
	Port: 6334,
})

client.QueryGroups(context.Background(), &qdrant.QueryPointGroups{
	CollectionName: "{collection_name}",
	Query:          qdrant.NewQuery(0.2, 0.1, 0.9, 0.7),
	GroupBy:        "document_id",
	GroupSize:      qdrant.PtrOf(uint64(2)),
})
```

pythonrust

``

Not supported for Python on Qdrant Edge

```rust
use qdrant_edge::*;
use qdrant_edge::EdgeShardRead;

let results = edge_shard.query_groups(GroupRequest {
    query: QueryRequestBuilder::new(2)
        .query(ScoringQuery::Vector(QueryEnum::Nearest(NamedQuery {
            query: vec![0.2f32, 0.1, 0.9, 0.7].into(),
            using: None,
        })))
        .with_payload(WithPayloadInterface::Bool(true))
        .with_vector(WithVector::Bool(true))
        .build(),
    group_by: "document_id".try_into().unwrap(),
    groups: 4,
    group_size: 2,
})?;
```

Deployment type:Qdrant ServerQdrant Edge

For more information on the `grouping` capabilities refer to the reference documentation for search with [grouping](https://qdrant.tech/documentation/search/search/#search-groups) and [lookup](https://qdrant.tech/documentation/search/search/#lookup-in-groups).

**See also:** the [Multi-Representation Search](https://qdrant.tech/documentation/tutorials-search-engineering/multi-representation-search/) tutorial for a worked end-to-end example of grouping in a hybrid retrieval pipeline.

##### Was this page useful?

![Thumb up icon](https://qdrant.tech/icons/outline/thumb-up.svg)
Yes
![Thumb down icon](https://qdrant.tech/icons/outline/thumb-down.svg)
No

Thank you for your feedback! 🙏

We are sorry to hear that. 😔 You can [edit](https://qdrant.tech/github.com/qdrant/landing_page/tree/master/qdrant-landing/content/documentation/search/hybrid-queries.md) this page on GitHub, or [create](https://github.com/qdrant/landing_page/issues/new/choose) a GitHub issue.

On this page:

- [View as Markdown](https://qdrant.tech/documentation/search/hybrid-queries/index.md)
- [Edit on Github](https://github.com/qdrant/landing_page/tree/master/qdrant-landing/content/documentation/search/hybrid-queries.md)
- [Create an issue](https://github.com/qdrant/landing_page/issues/new/choose)

[![](https://qdrant.tech/icons/outline/rocket.png)\\
Ready to try Qdrant?](https://cloud.qdrant.io/signup)

×

[Powered by](https://qdrant.tech/)