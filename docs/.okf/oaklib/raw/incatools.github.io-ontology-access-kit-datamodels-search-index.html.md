oaklib
Contents:
Introduction
Tutorial
The OAK Guide
OAK Library Documentation
Command Line
Datamodels
Ontology Metadata Ontology Schema
search datamodel
Classes
Slots
Enumerations
Types
Subsets
Obographs Datamodel
SSSOM
FunOwl
KGCL
Semantic Similarity
Summary Statistics Datamodel
Taxon Constraints Reporting Datamodel
Validation Results Data Model
Lexical Index
Mapping Rules Datamodel
Text Annotator Datamodel
Cross-Ontology Diff
OAK Association Data Model
How-To Guides
Examples
Glossary
FAQ
oaklib
Datamodels
search datamodel
View page source
# search datamodel 
A datamodel for representing a search configuration and results.
This is intended to provide a unified layer over both:
(a) how searches are
parameterized
(b) the structure of search
results
.
The scope is any kind of service that provides search over
named entities
, including ontology concepts. It is not intended to cover generic
search results, e.g. google search, although parts could be generalized for this purpose.
URI: https://w3id.org/oak/search-datamodel
Name: search-datamodel
## Classes 
Class | Description
ComplexQuery | None
PathExpression | A path query
SearchBaseConfiguration | A user-specified configuration that determines how a particular search operation works
SearchResult | An individual search result
SearchResultSet | None
## Slots 
Slot | Description
all_of | 
any_of | 
atom | 
categories | categories that should be matched
configuration | 
cursor | when the number of search results exceed the limit this can be used to iterat…
force_case_insensitive | force case insensitive matching
graph_predicates | 
include_obsoletes_in_results | 
is_complete | 
is_fuzzy | 
is_partial | allows matches where the search term is a subset of the full span
limit | the maximum number of search results to be returned in one batch
matches_full_search_term | Does the matched field match the full string
none_of | 
object_id | The CURIE of the matched term
object_label | The label/name of the matched term
object_match_field | The field/property in which the match was found
object_source | The ontology or other source that contains the matched term
object_source_version | Version IRI or version string of the source of the object term
path_to | 
properties | determines which properties are searched over
rank | For relevancy-ranked results, this indicates the relevancy, with low numbers …
result_count | 
results | 
search_term | 
search_terms | An individual search term
snippet | shows how the field was matched
syntax | Determines how the search term is interpreted
traversal |
## Enumerations 
Enumeration | Description
BooleanOperator | 
GraphFunction | 
SearchProperty | A property that can be searched on
SearchTermSyntax |
## Types 
Type | Description
Boolean | A binary (true or false) value
Curie | a compact URI
Date | a date (year, month and day) in an idealized calendar
DateOrDatetime | Either a date or a datetime
Datetime | The combination of a date and time
Decimal | A real number with arbitrary precision that conforms to the xsd:decimal speci…
Double | A real number that conforms to the xsd:double specification
Float | A real number that conforms to the xsd:float specification
Integer | An integer
Jsonpath | A string encoding a JSON Path
Jsonpointer | A string encoding a JSON Pointer
Ncname | Prefix part of CURIE
Nodeidentifier | A URI, CURIE or BNODE that represents a node in a model
Objectidentifier | A URI or CURIE that represents an object in the model
SearchTerm | 
Sparqlpath | A string encoding a SPARQL Property Path
String | A character string
Time | A time object represents a (local) time of day, independent of any particular…
Uri | a complete URI
Uriorcurie | a URI or a CURIE
## Subsets 
Subset | Description
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