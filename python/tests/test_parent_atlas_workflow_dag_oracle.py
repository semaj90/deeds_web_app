from python.parent_atlas_workflow_dag_oracle import evaluate


def budget(**overrides):
    value = {
        "maxNodes": 12,
        "maxEdges": 16,
        "maxDepth": 8,
        "maxWidth": 4,
        "maxCompute": 20,
        "maxToolCalls": 8,
        "maxContextTokens": 4096,
        "maxGpuBytes": 1024,
        "maxElapsedMs": 500,
    }
    value.update(overrides)
    return value


def plan(nodes, **budget_overrides):
    return {
        "schema": "atlas.workflow-dag-plan.v1",
        "workflowRevision": 7,
        "nodes": nodes,
        "budget": budget(**budget_overrides),
    }


def test_forward_only_retry_chain_is_admissible():
    receipt = evaluate(
        plan(
            [
                {"id": "PATCH", "cost": {"toolCalls": 1}},
                {"id": "VERIFY_0", "dependencies": ["PATCH"], "logicalActionId": "VERIFY", "attempt": 0},
                {"id": "REPAIR_1", "dependencies": ["VERIFY_0"], "logicalActionId": "REPAIR", "attempt": 1},
                {"id": "VERIFY_1", "dependencies": ["REPAIR_1"], "logicalActionId": "VERIFY", "attempt": 1},
            ]
        )
    )
    assert receipt["admissible"] is True
    assert receipt["topologicalOrder"] == ["PATCH", "VERIFY_0", "REPAIR_1", "VERIFY_1"]
    assert receipt["metrics"]["depth"] == 4
    assert [row["attempt"] for row in receipt["retryLineage"]["VERIFY"]] == [0, 1]


def test_cycle_is_rejected():
    receipt = evaluate(
        plan(
            [
                {"id": "A", "dependencies": ["B"]},
                {"id": "B", "dependencies": ["A"]},
            ]
        )
    )
    assert receipt["admissible"] is False
    assert "cycle_or_invalid_dependency_graph" in receipt["violations"]
    assert receipt["cycleEdges"]


def test_missing_dependency_is_rejected():
    receipt = evaluate(plan([{"id": "VERIFY", "dependencies": ["PATCH"]}]))
    assert receipt["admissible"] is False
    assert receipt["missingDependencies"] == ["PATCH"]


def test_width_and_tool_budgets_are_enforced():
    receipt = evaluate(
        plan(
            [
                {"id": "A", "cost": {"toolCalls": 1}},
                {"id": "B", "cost": {"toolCalls": 1}},
                {"id": "C", "cost": {"toolCalls": 1}},
            ],
            maxWidth=2,
            maxToolCalls=2,
        )
    )
    assert receipt["admissible"] is False
    assert "width_budget_exceeded" in receipt["violations"]
    assert "toolCalls_budget_exceeded" in receipt["violations"]
