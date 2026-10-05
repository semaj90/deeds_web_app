oaklib
Contents:
Introduction
Tutorial
The OAK Guide
OAK Library Documentation
Architecture
Interfaces
Basic Ontology Interface
Search Interface
Subsetting
Validator Interface
Relation Graph
Mapping Provider Interface
OboGraph Interface
Text Annotator Interface
Summary Statistics
Differ Interface
Patcher Interface
Semantic Similarity Interface
Association Provider Interface
Class Enrichment Calculation Interface
Dumper Interface
OWL Interface
Aggregator Interface
Implementations
Ontology Adapter Selectors
Converters
Utilities
Command Line
Datamodels
How-To Guides
Examples
Glossary
FAQ
oaklib
OAK Library Documentation
Interfaces
View page source
# Interfaces 
oaklib provides a variety of
interfaces
that abstract away from
implementation details and provide a coherent set of operations to
perform on an ontology. Developers can code to the interface largely without
worrying about whether the implementation is a relational database, a local
file, etc.
For example, the
Ubergraph Adapter
implements
Search Interface
which
has the method
`oaklib.interfaces.search_interface.SearchInterface.basic_search()`
, so you can write code like this:
```python
>>> from oaklib import get_adapter
>>> adapter = get_adapter("sqlite:obo:uberon")
>>> for r in adapter.descendants('UBERON:0003884'):
...     print(r)

...

...
```
The most common operations are found in the
Basic Ontology Interface
Contents:
Basic Ontology Interface
`BasicOntologyInterface`
`BasicOntologyInterface.strict`
`BasicOntologyInterface.autosave`
`BasicOntologyInterface.exclude_owl_top_and_bottom`
`BasicOntologyInterface.ontology_metamodel_mapper`
`BasicOntologyInterface.auto_relax_axioms`
`BasicOntologyInterface.cache_lookups`
`BasicOntologyInterface.prefix_map()`
`BasicOntologyInterface.get_prefix_map()`
`BasicOntologyInterface.converter`
`BasicOntologyInterface.set_metamodel_mappings()`
`BasicOntologyInterface.curie_to_uri()`
`BasicOntologyInterface.uri_to_curie()`
`BasicOntologyInterface.edge_index`
`BasicOntologyInterface.entailed_edge_index`
`BasicOntologyInterface.multilingual`
`BasicOntologyInterface.languages()`
`BasicOntologyInterface.default_language`
`BasicOntologyInterface.ontologies()`
`BasicOntologyInterface.ontology_curies()`
`BasicOntologyInterface.all_ontology_curies()`
`BasicOntologyInterface.obsoletes()`
`BasicOntologyInterface.obsoletes_migration_relationships()`
`BasicOntologyInterface.all_obsolete_curies()`
`BasicOntologyInterface.dangling()`
`BasicOntologyInterface.ontology_versions()`
`BasicOntologyInterface.ontology_metadata_map()`
`BasicOntologyInterface.entities()`
`BasicOntologyInterface.all_entity_curies()`
`BasicOntologyInterface.owl_types()`
`BasicOntologyInterface.owl_type()`
`BasicOntologyInterface.defined_by()`
`BasicOntologyInterface.defined_bys()`
`BasicOntologyInterface.roots()`
`BasicOntologyInterface.leafs()`
`BasicOntologyInterface.singletons()`
`BasicOntologyInterface.subsets()`
`BasicOntologyInterface.subset_curies()`
`BasicOntologyInterface.all_subset_curies()`
`BasicOntologyInterface.subset_members()`
`BasicOntologyInterface.terms_subsets()`
`BasicOntologyInterface.terms_categories()`
`BasicOntologyInterface.curies_by_subset()`
`BasicOntologyInterface.label()`
`BasicOntologyInterface.get_label_by_curie()`
`BasicOntologyInterface.labels()`
`BasicOntologyInterface.multilingual_labels()`
`BasicOntologyInterface.get_labels_for_curies()`
`BasicOntologyInterface.set_label()`
`BasicOntologyInterface.curies_by_label()`
`BasicOntologyInterface.get_curies_by_label()`
`BasicOntologyInterface.comments()`
`BasicOntologyInterface.relationships()`
`BasicOntologyInterface.relationships_metadata()`
`BasicOntologyInterface.hierarchical_parents()`
`BasicOntologyInterface.outgoing_relationship_map()`
`BasicOntologyInterface.outgoing_relationships()`
`BasicOntologyInterface.incoming_relationship_map()`
`BasicOntologyInterface.incoming_relationships()`
`BasicOntologyInterface.all_relationships()`
`BasicOntologyInterface.definition()`
`BasicOntologyInterface.definitions()`
`BasicOntologyInterface.get_definition_by_curie()`
`BasicOntologyInterface.simple_mappings_by_curie()`
`BasicOntologyInterface.simple_mappings()`
`BasicOntologyInterface.entity_aliases()`
`BasicOntologyInterface.aliases_by_curie()`
`BasicOntologyInterface.entity_alias_map()`
`BasicOntologyInterface.alias_map_by_curie()`
`BasicOntologyInterface.entity_metadata_map()`
`BasicOntologyInterface.entities_metadata_statements()`
`BasicOntologyInterface.add_missing_property_values()`
`BasicOntologyInterface.create_entity()`
`BasicOntologyInterface.delete_entity()`
`BasicOntologyInterface.query()`
`BasicOntologyInterface.save()`
`BasicOntologyInterface.clone()`
`BasicOntologyInterface.precompute_lookups()`
Search Interface
`SearchInterface`
`SearchInterface.basic_search()`
`SearchInterface.multiterm_search()`
`SearchConfiguration`
Subsetting
`SubsetterInterface`
`SubsetterInterface.extract_subset_ontology()`
`SubsetterInterface.gap_fill_relationships()`
Validator Interface
Schema Validation
LLM-based validation
`ValidatorInterface`
Relation Graph
`RelationGraphInterface`
`RelationGraphInterface.entailed_outgoing_relationships()`
`RelationGraphInterface.entailed_incoming_relationships()`
`RelationGraphInterface.entailed_relationships_between()`
Mapping Provider Interface
`MappingProviderInterface`
`MappingProviderInterface.sssom_mappings()`
`MappingProviderInterface.sssom_mappings_by_source()`
`MappingProviderInterface.all_sssom_mappings()`
`MappingProviderInterface.get_sssom_mappings_by_curie()`
`MappingProviderInterface.get_transitive_mappings_by_curie()`
`MappingProviderInterface.normalize()`
`MappingProviderInterface.normalize_prefix()`
`MappingProviderInterface.create_normalization_map()`
OboGraph Interface
`OboGraphInterface`
`OboGraphInterface.enable_transitive_query_cache()`
`OboGraphInterface.disable_transitive_query_cache()`
`OboGraphInterface.node()`
`OboGraphInterface.nodes()`
`OboGraphInterface.edges()`
`OboGraphInterface.synonym_map_for_curies()`
`OboGraphInterface.direct_graph()`
`OboGraphInterface.ancestor_graph()`
`OboGraphInterface.descendant_graph()`
`OboGraphInterface.non_redundant_entailed_relationships()`
`OboGraphInterface.ancestors()`
`OboGraphInterface.descendants()`
`OboGraphInterface.descendant_count()`
`OboGraphInterface.subgraph_from_traversal()`
`OboGraphInterface.extract_graph()`
`OboGraphInterface.relationships_to_graph()`
`OboGraphInterface.walk_up_relationship_graph()`
`OboGraphInterface.paths()`
`OboGraphInterface.logical_definitions()`
`OboGraphInterface.disjoint_class_expressions_axioms()`
`OboGraphInterface.add_metadata()`
`OboGraphInterface.as_obograph()`
`OboGraphInterface.load_graph()`
`TraversalConfiguration`
Text Annotator Interface
`TextAnnotatorInterface`
`TextAnnotatorInterface.lexical_index`
`TextAnnotatorInterface.cache_directory`
`TextAnnotatorInterface.rule_collection`
`TextAnnotatorInterface.annotate_text()`
`TextAnnotatorInterface.annotate_file()`
`TextAnnotatorInterface.annotate_tabular_file()`
`TextAnnotation`
Summary Statistics
`SummaryStatisticsInterface`
`SummaryStatisticsInterface.global_summary_statistics()`
`SummaryStatisticsInterface.branch_summary_statistics()`
`SummaryStatisticsInterface.metadata_property_summary_statistics()`
`SummaryStatisticsInterface.summary_statistic_description()`
Differ Interface
`DifferInterface`
`DifferInterface.grouped_diff()`
`DifferInterface.diff()`
`DifferInterface.diff_summary()`
`DifferInterface.compare_ontology_term_lists()`
Patcher Interface
`PatcherInterface`
`PatcherInterface.auto_add_contributor_using`
`PatcherInterface.ignore_invalid_changes`
`PatcherInterface.apply_patch()`
`PatcherInterface.migrate_curies()`
`PatcherInterface.save()`
`PatcherInterface.expand_changes()`
`PatcherInterface.expand_change()`
`PatcherInterface.undo()`
`PatcherInterface.reverse_changes()`
Semantic Similarity Interface
`SemanticSimilarityInterface`
`SemanticSimilarityInterface.cached_information_content_map`
`SemanticSimilarityInterface.most_recent_common_ancestors()`
`SemanticSimilarityInterface.setwise_most_recent_common_ancestors()`
`SemanticSimilarityInterface.multiset_most_recent_common_ancestors()`
`SemanticSimilarityInterface.common_ancestors()`
`SemanticSimilarityInterface.load_information_content_scores()`
`SemanticSimilarityInterface.set_information_content_scores()`
`SemanticSimilarityInterface.get_information_content()`
`SemanticSimilarityInterface.information_content_method()`
`SemanticSimilarityInterface.information_content_scores()`
`SemanticSimilarityInterface.pairwise_similarity()`
`SemanticSimilarityInterface.all_by_all_pairwise_similarity()`
Association Provider Interface
`AssociationProviderInterface`
`AssociationProviderInterface.associations()`
`AssociationProviderInterface.associations_subjects()`
`AssociationProviderInterface.associations_subject_search()`
`AssociationProviderInterface.association_pairwise_coassociations()`
`AssociationProviderInterface.add_associations()`
`AssociationProviderInterface.association_counts()`
`AssociationProviderInterface.association_subject_counts()`
`AssociationProviderInterface.map_associations()`
`AssociationProviderInterface.normalize_associations()`
`AssociationProviderInterface.normalize_association()`
Class Enrichment Calculation Interface
`ClassEnrichmentCalculationInterface`
`ClassEnrichmentCalculationInterface.enriched_classes()`
`ClassEnrichmentCalculationInterface.create_self_associations()`
Dumper Interface
`DumperInterface`
`DumperInterface.dump()`
OWL Interface
Quick examples
Reasoning
`OwlInterface`
Aggregator Interface
Note
Some interfaces may not be “pure” interfaces, in that they may provide
a default implementation, which may or may not be overridden by an
implementation
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