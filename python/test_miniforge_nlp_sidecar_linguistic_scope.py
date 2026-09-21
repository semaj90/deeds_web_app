import miniforge_nlp_sidecar as sidecar
from miniforge_nlp_sidecar import _linguistic_input, _build_pass_results, AnalyzeRequest


def test_linguistic_input_masks_code_and_preserves_comments_and_strings():
    source = '// Retrieve the canonical packet.\nexport function atlasFixture() { return "query packet source"; }'
    masked = _linguistic_input(source, code_mode=True)

    assert 'Retrieve the canonical packet.' in masked
    assert 'query packet source' in masked
    assert 'atlasFixture' not in masked
    assert 'export' not in masked


def test_linguistic_pass_records_bounded_input_scope_and_no_code_symbol():
    source = '/** Retrieve the canonical packet source. */ export function atlasFixture(value: string) { return value.trim(); }'
    req = AnalyzeRequest(
        text=source,
        source_type='codebase',
        source_ref='fixtures/linguistic.ts',
        source_revision='sha256:fixture-linguistic-v1',
        language='typescript',
        passes=['linguistic'],
    )
    results, *_ = _build_pass_results(req, source, [], [], [], [], [])
    linguistic = results[0]
    assert linguistic.artifacts['input_scope'] == 'comments_docstrings_strings_query_text'
    assert all(entity['label'] != 'CODE_SYMBOL' for entity in linguistic.artifacts['entities'])


def test_pos_fails_closed_when_spacy_has_no_pos_annotations(monkeypatch):
    class BlankDoc:
        def has_annotation(self, name):
            return False

    class BlankPipeline:
        def __call__(self, text):
            return BlankDoc()

    monkeypatch.setattr(sidecar, '_lazy_spacy', lambda: BlankPipeline())

    result = sidecar._spacy_pos_tags('The parser validates source revisions.')

    assert result.source == 'unavailable'
    assert result.nouns == []
    assert result.verbs == []


def test_spacy_model_readiness_is_separate_from_package_import(monkeypatch):
    class FakeUtil:
        @staticmethod
        def is_package(name):
            return False

    class FakeSpacy:
        util = FakeUtil()

    monkeypatch.setattr(sidecar, 'SPACY_AVAILABLE', True)
    monkeypatch.setattr(sidecar, 'spacy', FakeSpacy())
    monkeypatch.setattr(sidecar, 'SPACY_MODEL', 'missing_model')

    assert sidecar._spacy_model_installed() is False
    assert sidecar._capabilities()['spacy'] is True
    assert sidecar._capabilities()['spacy_pos'] is False
