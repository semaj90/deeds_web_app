oaklib
Contents:
Introduction
Tutorial
The OAK Guide
OAK Basics
Identifying entities: CURIEs and URIs
Primary Labels
Aliases and Synonyms
Mappings and Cross-References
Obsoletion
Relationships and Graphs
Associations and Curated Annotations
Enrichment and Over-Representation Analysis
Computing Similarity between Entities
Learning More
OAK Library Documentation
Command Line
Datamodels
How-To Guides
Examples
Glossary
FAQ
oaklib
The OAK Guide
View page source
# The OAK Guide 
This guide provides an explanation of basic concepts in OAK, how
to use both the Python library, and the command line.
For a quick introduction, see the
Tutorial
Contents:
OAK Basics
What is an ontology and why would I want to access one?
Ontology languages, standards, and formats
Core OAK concepts
Identifying entities: CURIEs and URIs
Prefix maps
Querying prefixmaps
Non-default prefixmaps
Structure of identifiers
Further reading
Primary Labels
Looking up labels
Custom label annotation properties
Multilingual ontologies
Other edge cases
Further reading
Aliases and Synonyms
Use Cases
Search
Text mining and NLP
Different aliases for different communities
Different Languages
Different approaches to representing synonym metadata
Representation of synonyms in OAK
Simple Core Model
Obo Graph Data Model
Mappings and Cross-References
SSSOM
Mappings in OAK
In Python
Directionality of mappings
Support for SSSOM
Generating Mappings
Further reading
Obsoletion
Looking up obsoleted entities
Conventions and standards
obsolete entities should not be in the signature of any logical axiom
obsolete entities should be accompanied by metadata that provides additional context for humans and machines
Merged entities
Further Reading
Relationships and Graphs
Exploring relationships
Graph Traversal and Relation Graph Reasoning
Graph Traversal Strategies
Examples of where entailment yields more
Examples of where graph traversal yields more ancestors than entailment
Which strategy should I use?
A note on entailed direct edges
Further notes on OWL and Graph Projection
Associations and Curated Annotations
Background
Association support in OAK
Data Model
Selecting association sources
Further reading
Enrichment and Over-Representation Analysis
Background
Concepts
Statistical Significance in Enrichment
Redundancy Filtering
Performing Enrichment Analysis
Using the Command Line
Visualizing Results
Programmatic Interface
Interpreting Results
Advanced Options
Pseudo-enrichment
Custom Background Sets
Cross-Ontology Enrichment
Companion Notebooks
Further Reading
Computing Similarity between Entities
Background
Concepts
Jaccard Similarity
Jaccard Similarity of ontology terms
Information Content
Ensemble Scoring of term pairs
Other similarity measures
Aggregate measures for comparing entities
Vector-based approaches
Implementations
Default Implementation
Ubergraph
Semsimian
Companion Notebooks
Further reading
Learning More
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