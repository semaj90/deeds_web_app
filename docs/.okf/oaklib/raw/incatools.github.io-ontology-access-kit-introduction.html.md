oaklib
Contents:
Introduction
Basic Python Example
Basic Command Line Example
Tutorial
The OAK Guide
OAK Library Documentation
Command Line
Datamodels
How-To Guides
Examples
Glossary
FAQ
oaklib
Introduction
View page source
# Introduction 
Ontology Access Toolkit (OAK) is a Python library for common
Ontology
operations over a variety of
Adapters
.
This library provides a collection of different
Interfaces
for different
kinds of ontology operations, including:
basic features of an
Ontology Element
, such as its
Label
,
Definition
,
Relationships
, or
Synonyms
.
Search
an ontology for a term.
Apply
modifications to terms, including adding, deleting, or updating
numerous specialized operations, such as
Graph Traversal
, or
Axiom
processing,
Ontology Alignment
, or :term`Text Annotation`.
These interfaces are
separated
from any particular backend. This means
the same API can be used regardless of whether the ontology:
is served by a remote API such as
OLS
or
BioPortal
.
is present locally on the filesystem in
OWL
,
OBO Format
,
OBO Graphs
, or
SQLite
formats.
is to be downloaded from a remote
Ontology Repository
such as the
OBO Library
.
is queried from a remote database, including
SPARQL
endpoints, A SQL
database, a Solr/ES endpoint.
## Basic Python Example 
The following code will load an ontology from a
SQLite
database, lookup
basic information on terms matching a search
```python
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
## Basic Command Line Example 
```bash
$ runoak -i sqlite:obo:obi info "assay"
```
This does a basic lookup of the term “assay” in
OBI
Previous
Next
© Copyright 2022-2026, OAK developers.
Built with
Sphinx
using a
theme
provided by
Read the Docs
.