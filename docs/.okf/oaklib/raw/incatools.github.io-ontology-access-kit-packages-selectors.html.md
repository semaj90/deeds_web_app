oaklib
Contents:
Introduction
Tutorial
The OAK Guide
OAK Library Documentation
Architecture
Interfaces
Implementations
Ontology Adapter Selectors
Syntax
Examples
Schemes
pronto
prontolib
sqlite
obosqlite
ontobee
ols
bioportal
owl and funowl
Functions
`get_adapter()`
`add_associations()`
`get_implementation_from_shorthand()`
`get_implementation_class_from_scheme()`
`get_resource_from_shorthand()`
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
Ontology Adapter Selectors
View page source
# Ontology Adapter Selectors 
In the command line interface and in Python code,
descriptors
can be used as a shorthand way to refer to either a local or remote ontology, plus
a method for parsing/querying it. The OntologyResource that is returned can be used
to instantiate an implementation. The descriptors can also be used in the
CLI
Note
Ontologies are available in a sometimes bewildering range of formats. One thing that constantly
trips people up is the distinction between ontology
language
and
serialization
. OWL is an ontology
language,
not
a syntax. OWL has its own syntaxes such as
Manchester Syntax
, OWL-XML and
Functional Syntax’ – additionally
it can be *mapped* to RDF, which is its *own* datamodel/language, with its *own* serializations (:term:`Turtle
,
RDF/XML (NOT the same as OWL-XML), JSON-LD, …). Confusing, huh? We are doing our best in this library
to simplify things for you the user, please be patient!
## Syntax 
A descriptor is EITHER:
prefixed with a
scheme
OR
is a
*
path (in which case the scheme is inferred)
## Examples 
Examples of scheme-less descriptors, implicit implementation:
`tests/input/go-nucleus.obo`
- local
OBO Format
file loaded with pronto
`tests/input/go-nucleus.json`
- local
OBO Graphs
json format file loaded with pronto
`tests/input/go-nucleus.owl`
- local OWL file loaded with the horned-owl-backed
FunOwl Adapter
`tests/input/go-nucleus.ofn`
- local
Functional Syntax
OWL file loaded with the horned-owl-backed
FunOwl Adapter
`tests/input/go-nucleus.omn`
- local Manchester OWL file loaded with the horned-owl-backed
FunOwl Adapter
`tests/input/go-nucleus.owx`
- local OWL/XML file loaded with the horned-owl-backed
FunOwl Adapter
`tests/input/go-nucleus.owl.ttl`
- local OWL
Turtle
file (loaded with rdflib at the moment, may change)
`tests/input/go-nucleus.db`
- local sqlite3 db loaded with SqlImplementation
`http://purl.obolibrary.org/obo/pato.obo`
- NOT IMPLEMENTED; download locally for now
`http://purl.obolibrary.org/obo/pato.owl`
- NOT IMPLEMENTED; download locally for now
Examples of explicit schemes:
`sparql:tests/input/go-nucleus.owl.ttl`
- local OWL file in turtle serialization
`sparql:tests/input/go-nucleus.owl`
- local OWL file (RDF/XML assumed unless explicit format option passed)
`pronto:tests/input/go-nucleus.obo`
- local
OBO Format
file loaded with pronto
`pronto:tests/input/go-nucleus.json`
- local
OBO Graphs
json format file loaded with pronto
`pronto:tests/input/go-nucleus.owl`
- local OWL rdf/xml format file (loaded with pronto at the moment may change)
`owl:tests/input/go-nucleus.owl`
- local OWL file loaded with the horned-owl-backed OWL object model
`funowl:tests/input/go-nucleus.owl`
- backward-compatible alias for the horned-owl-backed OWL object model
`funowl:tests/input/go-nucleus.ofn`
- local
Functional Syntax
OWL file loaded with the horned-owl-backed OWL object model
`pronto:tests/input/go-nucleus.db`
- local sqlite3 db loaded with SqlImplementation
`prontolib:pato.obo`
- remote
OBO Format
file loaded from OBO Library with pronto
`prontolib:pato.owl`
- remote owl format file loaded from OBO Library with pronto
`sqlite:tests/input/go-nucleus.db`
- local SQLite file
`sqlite:tests/input/go-nucleus.owl`
- convert OWL to SQLite and query using sql_implementation
`sqlite:obo:go`
- pre-made SQLite from
Semantic SQL
registry
`bioportal:`
all of bioportal
`bioportal:pato`
pato in bioportal
`ontobee:`
all of ontobee
`ontobee:pato`
pato in ontobee
`ols:`
all of OLS
`ols:pato`
pato in OLS (NOT IMPLEMENTED)
`ubergraph:`
all of OLS
`ubergraph:pato`
pato in ubergraph
See
CLI
for more examples
## Schemes 
### pronto 
Implementation:
Pronto / OBO Files Adapter
The slug is a path to a file on disk. Must be in obo or owl or json
### prontolib 
Implementation:
Pronto / OBO Files Adapter
The slug is the name of the resource on obo, e.g. pato.obo, cl.owl
### sqlite 
Implementation:
SQL Database Adapter
The slug is the path to the sqlite .db file on local disk
### obosqlite 
Implementation:
SQL Database Adapter
The slug is the name of the ontology, e.g ‘hp’, ‘uberon’
TODO: download from s3
### ontobee 
Implementation:
Ontobee Adapter
Currently the slug is ignored
### ols 
Implementation:
Ontology Lookup Service (OLS) Adapter
Currently the slug is ignored
### bioportal 
Implementation:
Bioportal Adapter
Currently the slug is ignored
### owl and funowl 
Implementation:
FunOwl Adapter
The
`owl:`
selector loads local OWL files with the py-horned-owl-backed OWL
object model. The older
`funowl:`
selector name is retained as a
backward-compatible alias. Plain local paths ending in
`.owl`
,
`.ofn`
,
`.omn`
, or
`.owx`
also resolve to this implementation by default; use an explicit scheme
such as
`sqlite:`
or
`sparql:`
to force a different backend.
## Functions 
oaklib.selector.
get_adapter
(
descriptor
:
str
|
Path
|
InputSpecification
,
format
:
str
=
None
,
implements
:
Type
[
T
]
|
None
=
None
,
**
kwargs
)
→
T
[source]

Gets an adapter (implementation) for a given descriptor.
OAK allows for multiple different
adapters
(aka
implementations
);
for example,
SQLImplementation
and
BioPortalImplementation
.
This function allows you to get an adapter for a given descriptor.
A descriptor combines a
scheme
followed by a colon symbol, and then
optionally additional information that specifies how to access a particular
resource or ontology within that scheme.
### Example: 
If you omit the scheme then OAK will try to guess the scheme based on the
suffix of the descriptor
If you want to pass extra information through to the implementation
class, you can do so with keyword arguments:
param descriptor
:
The input specification, path to a YAML describing an input specification,
or a shorthand string for instantiating an ontology interface
param format
:
file format/syntax, e.g obo, turtle
param kwargs
:
Keyword arguments to pass through to the implementation class
return
:
An instantiated interface
oaklib.selector.
add_associations
(
adapter
:
AssociationProviderInterface
,
descriptor
:
str
,
format
:
str
=
None
,
normalizers
:
List
[
Normalizer
]
|
None
=
None
,
primary_knowledge_source
:
str
|
None
=
None
,
aggregator_knowledge_source
:
str
|
None
=
None
)
→
None
[source]

Adds associations to an adapter.
Parameters
:
adapter
descriptor
format
normalizers
Returns
:
oaklib.selector.
get_implementation_from_shorthand
(
descriptor
:
str
,
format
:
str
=
None
)
→
BasicOntologyInterface
[source]

Gets an adapter (implementation) for a given descriptor.
Warning
this is an alias for
get_adapter
- use this instead,
get_implementation_from_shorthand will be deprecated in future.
Parameters
:
descriptor
format
Returns
:
Deprecated since version Use:
get_adapter instead
oaklib.selector.
get_implementation_class_from_scheme
(
scheme
:
str
)
→
Type
[
OntologyInterface
]
[source]

Given a selector schema (e.g. sqlite, ubergraph, pronto, etc.) return the adapter class.
Parameters
:
scheme
Returns
:
adapter (implementation) class that implements the OntologyInterface
oaklib.selector.
get_resource_from_shorthand
(
descriptor
:
str
,
format
:
str
=
None
,
import_depth
:
int
|
None
=
None
)
→
OntologyResource
[source]

Maps from a shorthand descriptor to an OntologyResource.
Parameters
:
descriptor
format
– file format/syntax, e.g obo, turtle
import_depth
– maximum import depth to traverse
Returns
:
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