- [Home](https://incatools.github.io/ontology-access-kit/index.html)
- Introduction
- [View page source](https://incatools.github.io/ontology-access-kit/_sources/introduction.rst.txt)

* * *

# Introduction [](https://incatools.github.io/ontology-access-kit/introduction.html\#introduction "Link to this heading")

Ontology Access Toolkit (OAK) is a Python library for common
[Ontology](https://incatools.github.io/ontology-access-kit/glossary.html#term-Ontology) operations over a variety of Adapters.

This library provides a collection of different [Interfaces](https://incatools.github.io/ontology-access-kit/glossary.html#term-Interface) for different
kinds of ontology operations, including:

- basic features of an [Ontology Element](https://incatools.github.io/ontology-access-kit/glossary.html#term-Ontology-Element), such as its [Label](https://incatools.github.io/ontology-access-kit/glossary.html#term-Label), [Definition](https://incatools.github.io/ontology-access-kit/glossary.html#term-Definition),
[Relationships](https://incatools.github.io/ontology-access-kit/glossary.html#term-Relationship), or [Synonyms](https://incatools.github.io/ontology-access-kit/glossary.html#term-Synonym).

- Search an ontology for a term.

- Apply modifications to terms, including adding, deleting, or updating

- numerous specialized operations, such as [Graph Traversal](https://incatools.github.io/ontology-access-kit/glossary.html#term-Graph-Traversal), or Axiom processing,
Ontology Alignment, or :term\`Text Annotation\`.


These interfaces are _separated_ from any particular backend. This means
the same API can be used regardless of whether the ontology:

- is served by a remote API such as [OLS](https://incatools.github.io/ontology-access-kit/glossary.html#term-OLS) or [BioPortal](https://incatools.github.io/ontology-access-kit/glossary.html#term-Bioportal).

- is present locally on the filesystem in [OWL](https://incatools.github.io/ontology-access-kit/glossary.html#term-OWL), [OBO Format](https://incatools.github.io/ontology-access-kit/glossary.html#term-OBO-Format),
[OBO Graphs](https://incatools.github.io/ontology-access-kit/glossary.html#term-OBO-Graphs), or SQLite formats.

- is to be downloaded from a remote Ontology Repository such as the OBO Library.

- is queried from a remote database, including [SPARQL](https://incatools.github.io/ontology-access-kit/glossary.html#term-SPARQL) endpoints, A SQL
database, a Solr/ES endpoint.


## Basic Python Example [](https://incatools.github.io/ontology-access-kit/introduction.html\#basic-python-example "Link to this heading")

The following code will load an ontology from a SQLite database, lookup
basic information on terms matching a search

```
>>> from oaklib import get_adapter
>>> adapter = get_adapter("sqlite:obo:cl")
>>> for curie in adapter.basic_search("T cell"):
...     print(f'{curie} ! {adapter.label(curie)}')
...     print(f'Definition: {adapter.definition(curie)}')
...     for rel, fillers in adapter.outgoing_relationship_map(curie).items():
...         print(f'  RELATION: {rel} ! {adapter.label(rel)}')
...         for filler in fillers:
...             print(f'     * {filler} ! {adapter.label(filler)}')
CL:0000084 ! T cell
Definition: A type of lymphocyte whose defining characteristic is the expression of a T cell receptor complex.
   RELATION: RO:0002202 ! develops from
      * CL:0000827 ! pro-T cell
   RELATION: RO:0002215 ! capable of
      * GO:0002456 ! T cell mediated immunity
   RELATION: rdfs:subClassOf ! None
      * CL:0000542 ! lymphocyte
```

Copy to clipboard

## Basic Command Line Example [](https://incatools.github.io/ontology-access-kit/introduction.html\#basic-command-line-example "Link to this heading")

```
$ runoak -i sqlite:obo:obi info "assay"
```

Copy to clipboard

This does a basic lookup of the term “assay” in OBI