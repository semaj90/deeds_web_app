import asyncio

import httpx

from python import miniforge_nlp_sidecar_v2


def test_v2_classify_route_returns_existing_noncanonical_proposal():
    async def request_classification():
        transport = httpx.ASGITransport(app=miniforge_nlp_sidecar_v2.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.post(
                "/classify",
                json={
                    "text": "The retrieval service uses PostgreSQL full text search and Qdrant.",
                    "sourceRef": "openspec/changes/example/tasks.md",
                    "sourceRevision": "sha256:" + "a" * 64,
                    "sourceNamespace": "openspec",
                    "treeNodeId": "fixture:task:1",
                    "title": "Retrieval search task",
                    # Request fields cannot promote a proposal or claim a write.
                    "canonicalAuthority": True,
                    "writesPerformed": True,
                },
            )

    response = asyncio.run(request_classification())

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["schema"] == "atlas.nlp-classification-proposal.v1"
    assert payload["sourceRef"] == "openspec/changes/example/tasks.md"
    assert payload["sourceRevision"] == "sha256:" + "a" * 64
    assert payload["linkedTupleProposal"]["status"] == "PROPOSAL_ONLY"
    assert payload["canonicalAuthority"] is False
    assert payload["writesPerformed"] is False
    assert payload["trainedClassifier"]["status"] == "NOT_REQUESTED"


def test_v2_classify_route_rejects_missing_source_revision():
    async def request_classification():
        transport = httpx.ASGITransport(app=miniforge_nlp_sidecar_v2.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            return await client.post(
                "/classify",
                json={
                    "text": "A task needs a source-bound classification.",
                    "sourceRef": "openspec/changes/example/tasks.md",
                    "sourceRevision": "",
                },
            )

    response = asyncio.run(request_classification())

    assert response.status_code == 422
