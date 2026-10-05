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
Obographs Datamodel
Classes
Slots
Enumerations
Types
Subsets
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
Obographs Datamodel
View page source
# Obographs Datamodel 
A data model for graph-oriented representations of ontologies. Each ontology is represented as a Graph, and multiple ontologies can be connected together in a GraphDocument.
The principle elements of a Graph are Node objects and Edge objects. A Node represents an arbitrary ontology element, including but not limited to the core terms in the ontology. Edges represent simple relationships between Nodes. Nodes and Edges can both have Meta objects attached, providing additional metedata.
Not everything in an ontology can be represented as nodes and edges. More complex axioms have specialized structures such as DomainRangeAxiom objects and LogicalDefinitionAxiom.
URI: https://github.com/geneontology/obographs
Name: obographs_datamodel
## Classes 
Class | Description
Axiom | A generic grouping for any OWL axiom or group of axioms that is not captured by existing constructs in this standard.
 | 
DisjointClassExpressionsAxiom | An axiom that defines a set of classes or class expressions as being mutually disjoint. Formally, there exists no instance that instantiates more that one of the union of classIds and classExpressions.
DomainRangeAxiom | This groups potentially multiple axioms that constrain the usage of a property depending on some combination of domain and range.
EquivalentNodesSet | A clique of nodes that are all mutually equivalent
LogicalDefinitionAxiom | An axiom that defines a class in terms of a genus or set of genus classes and a set of differentia
PropertyChainAxiom | An axiom that represents an OWL property chain, e.g. R <- R1 o … o Rn
Edge | An edge is a simple typed relationship between two nodes. When mapping to OWL, an edge represents either (a) s SubClassOf o (b) s SubClassOf p some o (c) s p o (where s and o are individuals) (d) s SubPropertyOf o (e) s EquivalentTo o (f) s type o
ExistentialRestrictionExpression | An existential restriction (OWL some values from) expression
Graph | A graph is a collection of nodes and edges and other axioms that represents a single ontology.
GraphDocument | A graph document is a collection of graphs together with a set of prefixes that apply across all of them
Meta | A collection of annotations on an entity or ontology or edge or axiom. Metadata typically does not affect the logical interpretation of the container but provides useful information to humans or machines.
Node | A node is a class, property, or other entity in an ontology
PrefixDeclaration | A mapping between an individual prefix (e.g. GO) and a namespace (e.g. http://purl.obolibrary.org/obo/GO_)
PropertyValue | A generic grouping for the different kinds of key-value associations on object. Minimally, a property value has a predicate and a value. It can also have a list of xrefs indicating provenance, as well as a metadata object.
BasicPropertyValue | A property value that represents an assertion about an entity that is not a definition, synonym, or xref
DefinitionPropertyValue | A property value that represents an assertion about the textual definition of an entity
SynonymPropertyValue | A property value that represents an assertion about a synonym of an entity
XrefPropertyValue | A property value that represents an assertion about an external reference to an entity
SubsetDefinition | None
SynonymTypeDefinition | None
## Slots 
Slot | Description
allValuesFromEdges | A list of edges that represent subclasses of universal restrictions
basicPropertyValues | A list of open-ended property values that does not correspond to those predef…
chainPredicateIds | A list of identifiers of predicates that form the precedent clause of a prope…
classExpressions | The set of class expressions that are mutually disjoint
classIds | The set of named classes that are mutually disjoint
comments | A list of comments about the entity
definedClassId | The class that is defined by this axiom
definition | A definition of an entity
deprecated | 
disjointClassExpressionsAxioms | A list of logical disjointness axioms that specify that a class or class expr…
domainClassIds | 
domainRangeAxioms | A list of axioms that define the domain and range of a property
edges | All edges present in a graph
equivalentNodesSets | A list of sets of nodes that form equivalence cliques
fillerId | in an OWL restriction expression, the filler is the object of the restriction
genusIds | The set of classes that are the genus of the defined class
graphs | A list of all graphs (ontologies) in an ontology document
id | The unique identifier of the entity
isExact | 
lang | the language of a property value
lbl | the human-readable label of a node
logicalDefinitionAxioms | A list of logical definition axioms that define the meaning of a class in ter…
meta | A collection of metadata about either an ontology (graph), an entity, or an a…
namespace | The namespace associated with a prefix in a prefix declaration
nodeIds | 
nodes | All nodes present in a graph
obj | the object of an edge
pred | the predicate of an edge
predicateId | 
prefix | The prefix of a prefix declaration
prefixes | A collection of mappings between prefixes and namespaces, used to map CURIEs …
propertyChainAxioms | A list of axioms that define an OWL property chain
propertyId | in an OWL restriction expression, this is the predicate
propertyType | 
rangeClassIds | 
representativeNodeId | The identifier of a node that represents the class in an OWL equivalence cliq…
restrictions | The set of restrictions that are the differentiating features of the defined …
sub | the subject of an edge
subsetDefinitions | 
subsets | A list of subsets to which this entity belongs
synonyms | A list of synonym property value assertions for an entity
synonymType | This standard follows oboInOwl in allowing an open ended list of synonym type…
synonymTypeDefinitions | 
type | 
unionEquivalentTo | If present, this equates to an OWL DisjointUnion expression
unionEquivalentToExpression | if present, this class expression is equivalent ot the (disjoint) union of th…
val | the value of a property
valType | the datatype of a property value
version | 
xrefs | A list of cross references to other entities represented in other ontologies,…
## Enumerations 
Enumeration | Description
NodeTypeEnum | The main type of a node
PropertyTypeEnum | The node subtype for property nodes
ScopeEnum | A vocabulary of terms that can be used to “scope” a synonym
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
OboIdentifierString | A string that represents an OBO identifier
Sparqlpath | A string encoding a SPARQL Property Path
String | A character string
SynonymTypeIdentifierString | A string that represents a synonym type
Time | A time object represents a (local) time of day, independent of any particular…
Uri | a complete URI
Uriorcurie | a URI or a CURIE
XrefString | A string that is a cross reference to another entity represented in another o…
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