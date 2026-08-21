from python.parent_atlas_workflow_dag_oracle import evaluate


def budget(**overrides):
    value={"maxNodes":12,"maxEdges":16,"maxDepth":8,"maxWidth":4,"maxCompute":20,"maxToolCalls":8,"maxContextTokens":4096,"maxGpuBytes":1024,"maxElapsedMs":500};value.update(overrides);return value

def plan(nodes,**budget_overrides): return {"schema":"atlas.workflow-dag-plan.v1","workflowRevision":7,"nodes":nodes,"budget":budget(**budget_overrides)}

def test_forward_only_retry_chain_is_admissible():
    r=evaluate(plan([{"id":"PATCH","cost":{"toolCalls":1}},{"id":"VERIFY_0","dependencies":["PATCH"],"logicalActionId":"VERIFY","attempt":0},{"id":"REPAIR_1","dependencies":["VERIFY_0"],"logicalActionId":"REPAIR","attempt":1},{"id":"VERIFY_1","dependencies":["REPAIR_1"],"logicalActionId":"VERIFY","attempt":1}]))
    assert r["admissible"] is True;assert r["topologicalOrder"]==["PATCH","VERIFY_0","REPAIR_1","VERIFY_1"];assert r["metrics"]["depth"]==4

def test_cycle_is_rejected():
    r=evaluate(plan([{"id":"A","dependencies":["B"]},{"id":"B","dependencies":["A"]}]));assert r["admissible"] is False;assert "cycle_or_invalid_dependency_graph" in r["violations"]

def test_missing_dependency_is_rejected():
    r=evaluate(plan([{"id":"VERIFY","dependencies":["PATCH"]}]));assert r["admissible"] is False;assert r["missingDependencies"]==["PATCH"]

def test_width_and_tool_budgets_are_enforced():
    r=evaluate(plan([{"id":"A","cost":{"toolCalls":1}},{"id":"B","cost":{"toolCalls":1}},{"id":"C","cost":{"toolCalls":1}}],maxWidth=2,maxToolCalls=2));assert r["admissible"] is False;assert "width_budget_exceeded" in r["violations"];assert "toolCalls_budget_exceeded" in r["violations"]
