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


def test_pos_assertions_and_dependency_edges_use_grounded_utf8_byte_spans(monkeypatch):
    text = '🙂 The dog runs.'

    def token(start, value, lemma, pos, tag, dep):
        return type('FakeToken', (), {
            'idx': start,
            'text': value,
            'lemma_': lemma,
            'pos_': pos,
            'tag_': tag,
            'dep_': dep,
            'head': None,
        })()

    emoji = token(0, '🙂', '🙂', 'SYM', 'SYM', 'punct')
    determiner = token(2, 'The', 'the', 'DET', 'DT', 'det')
    noun = token(6, 'dog', 'dog', 'NOUN', 'NN', 'nsubj')
    verb = token(10, 'runs', 'run', 'VERB', 'VBZ', 'ROOT')
    punctuation = token(14, '.', '.', 'PUNCT', '.', 'punct')
    emoji.head = verb
    determiner.head = noun
    noun.head = verb
    verb.head = verb
    punctuation.head = verb
    tokens = [emoji, determiner, noun, verb, punctuation]
    noun_phrase = type('FakeSpan', (), {'text': 'The dog', 'start_char': 2, 'end_char': 9})()

    class ParsedDoc:
        noun_chunks = [noun_phrase]

        def __iter__(self):
            return iter(tokens)

        @staticmethod
        def has_annotation(name):
            return name in {'POS', 'DEP'}

    class Pipeline:
        @staticmethod
        def __call__(_text):
            return ParsedDoc()

    monkeypatch.setattr(sidecar, '_lazy_spacy', lambda: Pipeline())
    result = sidecar._spacy_pos_tags(text)

    encoded = text.encode('utf-8')
    assert result.source == 'spacy'
    assert result.coordinate_basis == 'UTF8_BYTES'
    for assertion in result.token_assertions:
        assert encoded[assertion.start_byte:assertion.end_byte].decode('utf-8') == assertion.text
    assert result.token_assertions[0].start_byte == 0
    assert result.token_assertions[0].end_byte == 4
    assert result.noun_phrase_spans[0].text == 'The dog'
    assert encoded[result.noun_phrase_spans[0].start_byte:result.noun_phrase_spans[0].end_byte].decode('utf-8') == 'The dog'
    assert result.dependency_parser_available is True
    assert any(
        edge.dependent_text == 'dog'
        and edge.head_text == 'runs'
        and edge.relation == 'nsubj'
        and encoded[edge.dependent_start_byte:edge.dependent_end_byte].decode('utf-8') == 'dog'
        and encoded[edge.head_start_byte:edge.head_end_byte].decode('utf-8') == 'runs'
        for edge in result.dependency_edges
    )
