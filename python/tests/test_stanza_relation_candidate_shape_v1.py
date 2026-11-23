from __future__ import annotations

from types import SimpleNamespace

from python.atlas_external_docs import stanza_observations


def test_stanza_relation_is_explicit_proposal_with_role_candidates_and_extractor_revision():
    words = [
        SimpleNamespace(id=1, text="Atlas", lemma="atlas", upos="PROPN", xpos="NNP", feats=None,
                        deprel="nsubj", head=2, start_char=0, end_char=5),
        SimpleNamespace(id=2, text="uses", lemma="use", upos="VERB", xpos="VBZ", feats=None,
                        deprel="root", head=0, start_char=6, end_char=10),
        SimpleNamespace(id=3, text="API", lemma="api", upos="PROPN", xpos="NN", feats=None,
                        deprel="obj", head=2, start_char=11, end_char=14),
    ]
    pipeline = lambda _text: SimpleNamespace(sentences=[SimpleNamespace(words=words)])

    _tokens, relations = stanza_observations(
        "Atlas uses API.", pipeline=pipeline, model_revision="stanza-fixture-model-v1",
    )

    assert len(relations) == 1
    relation = relations[0]
    assert relation["status"] == "PROPOSED"
    assert relation["canonical_authority"] is False
    assert relation["extractor_version"] == "stanza-pos-depparse-v1"
    assert relation["subject_candidates"][0]["text"] == "Atlas"
    assert relation["subject_candidates"][0]["role"] == "subject"
    assert relation["object_candidates"][0]["text"] == "API"
    assert relation["object_candidates"][0]["role"] == "object"
    assert relation["predicate"] == "uses"
    assert relation["predicate_span_chars"] == [6, 10]
    assert relation["evidence_span_chars"] == [0, 14]
