oaklib
Contents:
Introduction
Tutorial
The OAK Guide
OAK Library Documentation
Command Line
General Guidelines
Common Patterns
Term Lists
Predicates
Cache Control
Controlling the cache on the command line
Controlling the cache with a configuration file
Commands
runoak
aliases
ancestors
annotate
apply
apply-obsolete
apply-taxon-constraints
associations
associations-counts
associations-graph
associations-matrix
axioms
cache-clear
cache-ls
chains
crawl
definitions
descendants
diff
diff-associations
diff-terms
diff-via-mappings
disjoints
dump
enrichment
expand-subsets
extract
fill-table
generate-definitions
generate-disjoints
generate-lexical-replacements
generate-logical-definitions
generate-synonyms
info
information-content
labels
languages
leafs
lexmatch
lint
logical-definitions
mappings
migrate-curies
normalize
obsoletes
ontologies
ontology-metadata
ontology-versions
paths
prefixes
query
relationships
rollup
roots
search
set-apikey
siblings
similarity
similarity-pair
singletons
statistics
subsets
synonymize
taxon-constraints
term-categories
term-metadata
term-subsets
terms
termset-similarity
transform
tree
usages
validate
validate-definitions
validate-mappings
validate-multiple
validate-subset
validate-synonyms
viz
Datamodels
How-To Guides
Examples
Glossary
FAQ
oaklib
Command Line
View page source
# Command Line 
Note
we follow the
CLIG
guidelines as far as possible
## General Guidelines 
Note
if you are running this as an internal OAK developer you need to precede the command with
`poetry shell`
The general structure is:
```bash
runoak --input HANDLE COMMAND [COMMAND ARGS AND OPTIONS]
```
The value for
`--input`
(which can be shorted to
`-i`
) is specified in the
Ontology Adapter Selectors
documentation.
Examples:
```bash
runoak --input ubergraph: COMMAND [COMMAND ARGS AND OPTIONS]
runoak --input fbbt.obo COMMAND [COMMAND ARGS AND OPTIONS]
runoak --input cl.db COMMAND [COMMAND ARGS AND OPTIONS]
runoak --input sqlite:obo:cl COMMAND [COMMAND ARGS AND OPTIONS]
```
It can be useful to create aliases for individual ontologies. For example, to create an alias for the Uberon ontology:
```bash
alias uberon='runoak -i sqlite:obo:uberon'
alias cl='runoak -i sqlite:obo:cl'
alias obi='runoak -i sqlite:obo:obi'
```
You can specify further implementations with
`-a`
which will create an
aggregator
implementation that wraps
multiple implementations. For example, you can multiplex queries over different endpoints.
## Common Patterns 
### Term Lists 
Many commands take a
term
or a
list of terms
as their primary argument. These are typically one of:
a
CURIE
such as
`UBERON:0000955`
a
Search Syntax
term, which is either:
an exact match to a label; for example “limb” or “plasma membrane”
a compound search term such as
`t~limb`
which finds terms with partial matches to limb
Search terms are
expanded
to matching CURIEs, and then fed into the command.
For example, (assuming the alias above) the following command will look up two terms using their labels:
```bash
uberon info hand foot
```
This is equivalent to:
```bash
uberon info UBERON:0002398 UBERON:0002397
```
### Predicates 
Many commands take a
`--predicates`
option (shortened to
`-p`
). This specifies a list of predicates
(aka
relationship types
, see
Predicates
) to be used in filtering. The list is specified as a comma-delimited
list (no spaces) of CURIEs.
For many biological ontologies, it can be useful to filter on is_a (rdfs:subClassOf) and part_of (BFO:0000050) so
the command line interface understands shortcuts for these:
`i`
: is-a (i.e rdfs:subClassOf between two named classes)
`p`
: part-of
For example, to draw the subgraph of terms starting from “hand” and “foot”
and tracing upwards through is_a and part_of relationships:
```bash
uberon viz -p i,p hand foot
```
## Cache Control 
OAK may download data from remote sources as part of its normal operations. For
example, using the
`sqlite:obo:...`
input selector will cause OAK to
fetch the requested Semantic-SQL database from a centralised repository.
Whenever that happens, the downloaded data will be cached in a local directory
so that subsequent commands using the same input selector do not have to
download the file again.
By default, OAK will refresh (download again) a previously downloaded file if
it was last downloaded more than 7 days ago.
The behavior of the cache can be controlled in two ways: with an option on the
command line and with a configuration file.
### Controlling the cache on the command line 
The global option
`--caching`
gives the user some control on how the
cache works.
To change the default cache expiry lifetime of 7 days, the
`--caching`
option accepts a value of the form
`ND`
, where
N
is a positive integer
and
D
can be either
`s`
,
`d`
,
`w`
,
`m`
, or
`y`
to indicate that
N
is a number of seconds, days, weeks, months, or years,
respectively. If the
D
part is omitted, it defaults to
`d`
.
For example,
`--caching=3w`
instructs OAK to refresh a cached file if it
was last refreshed 21 days ago.
The
`--caching`
option also accepts the following special values:
`refresh`
to force OAK to always refresh a file regardless of its age;
`no-refresh`
to do the opposite, that is, preventing OAK from
refreshing a file regardless of its age;
`clear`
to forcefully clear the cache (which will trigger a refresh as
a consequence);
`reset`
is a synonym of
`clear`
.
Note the difference between
`refresh`
and
`clear`
. The former will
only cause the requested file to be refreshed, leaving any other file that may
exist in the cache untouched. The latter will delete all cached files, so that
not only the requested file will be downloaded again, but any other
previously cached file will also have to be downloaded again the next time they
are requested.
In both case, refreshing and clearing will only happen if the OAK command in
which the
`--caching`
option is used attempts to look up a cached file.
Otherwise the option will have no effect.
To forcefully clear the cache independently of any command, the
cache-clear
command may be used. The contents of the cache may be
explored at any time with the
cache-ls
command.
### Controlling the cache with a configuration file 
Finer control of how the cache works is possible through a configuration file
that OAK will look up for at the following locations:
under GNU/Linux: in
`$XDG_CONFIG_HOME/ontology-access-kit/cache.conf`
;
under macOS: in
`$HOME/Library/Application Support/ontology-access-kit/cache.conf`
;
under Windows: in
`%LOCALAPPDATA%\ontology-access-kit\ontology-access-kit\cache.conf`
.
The file should contain lines of the form
`pattern = policy`
, where:
pattern
is a shell-type globbing pattern indicating the files that will be
concerned by the policy set forth on the line;
policy
is the same type of value as expected by the
`--caching`
option as explained in the previous section.
Blank lines and lines starting with
`#`
are ignored.
If the
pattern
is
`default`
(or
`*`
), the corresponding policy
will be used for any cached file that does not have a matching policy.
Here is a sample configuration file:
```default
# Uberon will be refreshed if older than 1 month
uberon.db = 1m
# FBbt will be refreshed if older than 2 weeks
fbbt.db = 2w
# Other FlyBase ontologies will be refreshed if older than 2 months
fb*.db = 2m
# All other files will be refreshed if older than 3 weeks
default = 3w
```
Note that when looking up the policy to apply to a given file, patterns are
tried in the order they appear in the file. This is why the
`fbbt.db`
pattern in the example above must be listed
before
the less specific
`fb*.db`
pattern, otherwise it would be ignored. (This does not apply to
the default pattern – whether it is specified as
`default`
or as
`*`
– which is always tried after all the other patterns.)
The
`--caching`
option described in the previous section always takes
precedence over the configuration file. That is, all rules set forth in the
configuration will be ignored if the
`--caching`
option is specified on
the command line.
## Commands 
The following section is autogenerated from the inline docs.
You should get the same results by running:
```bash
runoak COMMAND --help
```
For example, to get help on the
`viz`
command:
```bash
runoak viz --help
```
### runoak 
Run the oaklib Command Line.
A subcommand must be passed - for example: ancestors, terms, …
Most commands require an input ontology to be specified:
runoak -i <INPUT SPECIFICATION> SUBCOMMAND <SUBCOMMAND OPTIONS AND ARGUMENTS>
Get help on any command, e.g:
runoak viz -h
Usage
```shell
runoak [OPTIONS] COMMAND [ARGS]...
```
Options
-V
,
--version

Show the version and exit.
-v
,
--verbose

-q
,
--quiet
,
--no-quiet

--stacktrace
,
--no-stacktrace

If set then show full stacktrace on error
Default
:
`False`
--save-as
<save_as>

For commands that mutate the ontology, this specifies where changes are saved to
--autosave
,
--no-autosave

For commands that mutate the ontology, this determines if these are automatically saved in place
Default
:
`False`
--named-prefix-map
<named_prefix_map>

the name of a prefix map, e.g. obo, prefixcc
--prefix
<prefix>

prefix=expansion pair
--metamodel-mappings
<metamodel_mappings>

overrides for metamodel properties such as rdfs:label
--import-depth
<import_depth>

Maximum depth in the import tree to traverse. Currently this is only used by the pronto adapter
-g
,
--associations
<associations>

Location of ontology associations
-G
,
--associations-type
<associations_type>

Syntax of associations input
-l
,
--preferred-language
<preferred_language>

Preferred language for labels and lexical elements
--other-languages
<other_languages>

Additional languages for labels and lexical elements
--requests-cache-db
<requests_cache_db>

If specified, all http requests will be cached to this sqlite file
-W
,
--wrap-adapter
<wrap_adapter>

Wrap the input adapter using another adapter (e.g. llm or semsimian).
-i
,
--input
<input>

input implementation specification. This is either a path to a file, or an ontology selector
-I
,
--input-type
<input_type>

Input format. Permissible values vary depending on the context
-a
,
--add
<add>

additional implementation specification.
--merge
,
--no-merge

Merge all inputs specified using –add
Default
:
`False`
--profile
,
--no-profile

If set, will profile the command
Default
:
`False`
--caching
<caching>

Set the cache management policy
#### aliases 
List aliases for a term or set of terms.
Example:
runoak -i ubergraph:uberon aliases UBERON:0001988
TERMS should be either an explicit list of terms or queries, or can be a selector query,
such as ‘.all’ to fetch all terms in the ontology
Show all aliases:
runoak -i db/envo.db aliases .all
Currently the core behavior of this command assumes a simple datamodel for aliases, where an aliases
is a simple property-value tuples, with the property being from some standard vocabulary (e.g. skos:altLabel,
oboInOwl, etc)
If you know the synonyms follow the OBO/oboInOwl datamodel you can pass –obo-model, this will give back
richer data if present in the ontology, including synonym categories/types, synonym provenance
In future, this may become the default
Usage
```shell
runoak aliases [OPTIONS] [TERMS]...
```
Options
--obo-model
,
--no-obo-model

If true, assume the OBO synonym datamodel, including provenancem synonym types
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
TERMS

Optional argument(s)
#### ancestors 
List all ancestors of a given term or terms.
Here ancestor means the transitive closure of the parent relationship, where
a parent includes all relationship types, not just is-a.
Example:
runoak -i cl.owl ancestors CL:4023094
This will show ancestry over the full relationship graph. Like any relational
OAK command, this can be filtered by relationship type (predicate), using –predicate (-p).
For example, constrained to is-a and part-of:
runoak -i cl.owl ancestors CL:4023094 -p i,BFO:0000050
Multiple backends can be used, including ubergraph:
runoak -i ubergraph: ancestors CL:4023094 -p i,BFO:0000050
Search terms can also be used:
runoak -i cl.owl ancestors ‘goblet cell’
Multiple terms can be passed:
runoak -i sqlite:go.db ancestors GO:0005773 GO:0005737 -p i,p
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/obograph
Usage
```shell
runoak ancestors [OPTIONS] [TERMS]...
```
Options
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-M
,
--graph-traversal-method
<graph_traversal_method>

Whether formal entailment or graph walking should be used.
Options
:
HOP | ENTAILMENT
-O
,
--output-type
<output_type>

Desired output type
--statistics
,
--no-statistics

For each ancestor, show statistics.
Default
:
`False`
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
TERMS

Optional argument(s)
#### annotate 
Annotate a piece of text using a Named Entity Recognition annotation.
Some endpoints such as BioPortal have built-in support for annotation;
in these cases the endpoint functionality is used:
Example:
runoak -i bioportal: annotate “enlarged nucleus in T-cells from peripheral blood”
For other endpoints, the built-in OAK annotator is used. This currently uses a basic
algorithm based on lexical matching.
Example:
runoak -i sqlite:obo:cl annotate “enlarged nucleus in T-cells from peripheral blood”
Using the builtin annotator can be slow, as the lexical index is re-built every time.
To preserve this, use the
`--lexical-index-file`
(
`-L`
) option to specify a file to save.
On subsequent iterations the file is reused.
You can also use
`--text-file`
to pass in a text file to be parsed one line at a time
If gilda is installed as an extra, it can be used,
but
`--matches-whole-text`
(
`-W`
) must be specified,
as gilda only performs grounding.
Example:
runoak -i gilda: annotate -W BRCA2
Aliases can be listed in the output by setting the flag
–include-aliases to
true
(default: false).
Example (using the plugin oakx-spacy):
runoak -i spacy:sqlite:obo:bero annotate Myeloid derived suppressor cells. –include-aliases
will yield:
confidence: 0.8
object_aliases:
- Myeloid-Derived Suppressor Cells
- MDSCs
- mdscs
- myeloid-derived suppressor cells
object_id: obo:MESH_D000072737
object_label: Myeloid-Derived Suppressor Cells
subject_end: 30
subject_start: 0
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/text-annotator
Data model:
https://w3id.org/oak/text-annotator
Usage
```shell
runoak annotate [OPTIONS] [WORDS]...
```
Options
-W
,
--matches-whole-text
,
--no-W
,
--no-matches-whole-text

if true, then only show matches that span the entire input text
Default
:
`False`
--include-aliases
,
--no-include-aliases

Include alias maps in output.
Default
:
`False`
--text-file
<text_file>

Text file to annotate. Each newline separated entry is a distinct text.
-L
,
--lexical-index-file
<lexical_index_file>

path to lexical index. This is recreated each time unless –no-recreate is passed
-A
,
--match-column
<match_column>

name of column to match on (if the input is tsv/csv)
-m
,
--model
<model>

Name of trained model to use for annotation, e.g. ‘en_ner_craft_md’.
-x
,
--exclude-tokens
<exclude_tokens>

Text file or list of tokens to filter from input prior to annotation. If passed as text file, each newline separated entry is a distinct text.
-R
,
--rules-file
<rules_file>

path to rules file. Conforms to
https://w3id.org/oak/mapping-rules
-C
,
--configuration-file
<configuration_file>

path to config file. Conforms to
https://w3id.org/oak/text-annotator
--category
<category>

Categories of entities to annotate. If not specified, all categories are annotated.
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
Arguments
WORDS

Optional argument(s)
#### apply 
Applies a patch to an ontology. The patch should be specified using KGCL syntax, see
https://github.com/INCATools/kgcl
Example:
runoak -i cl.owl.ttl apply “rename CL:0000561 to ‘amacrine neuron’” -o cl.owl.ttl -O ttl
On an obo format file:
runoak -i simpleobo:go-edit.obo apply “rename GO:0005634 from ‘nucleus’ to ‘foo’” -o go-edit-new.obo
With URIs:
runoak -i cl.owl.ttl apply “rename <
http://purl.obolibrary.org/obo/CL_0000561
> from ‘amacrine cell’ to ‘amacrine neuron’” -o cl.owl.ttl -O ttl
Warning:
This command is still experimental. Some things to bear in mind:
for some ontologies, CURIEs may not work, instead specify a full URI surrounded by <>s
only a subset of KGCL commands are supported by each backend
Usage
```shell
runoak apply [OPTIONS] [COMMANDS]...
```
Options
-o
,
--output
<output>

--changes-output
<changes_output>

output file for KGCL changes
--changes-input
<changes_input>

Path to an input changes file
--changes-format
<changes_format>

Format of the changes file (json or kgcl)
--dry-run
,
--no-dry-run

if true, only perform the parse of KCGL and do not apply
Default
:
`False`
--expand
,
--no-expand

if true, expand complex changes to atomic changes
Default
:
`True`
--ignore-invalid-changes
,
--no-ignore-invalid-changes

if true, ignore invalid changes, e.g. obsoletions of dependent entities
Default
:
`False`
--contributor
<contributor>

CURIE for the person contributing the patch
-O
,
--output-type
<output_type>

Desired output type
--overwrite
,
--no-overwrite

If set, any changes applied will be saved back to the input file/source
Arguments
COMMANDS

Optional argument(s)
#### apply-obsolete 
Sets an ontology element to be obsolete
Example:
runoak -i my.obo apply-obsolete MY:0002200 -o my-modified.obo
Multiple terms can be passed, as labels, IDs, or using OAK queries:
runoak -i my.obo apply-obsolete MY:1 MY:2 MY:3 … -o my-modified.obo
This may be chained, for example to take all terms matching a search query and then
obsolete them all:
runoak -i my.db search ‘l/^Foo/` | runoak -i my.db –autosave apply-obsolete -
This command is partially redundant with the more general “apply” command
Usage
```shell
runoak apply-obsolete [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

--expand
,
--no-expand

if true, expand complex changes to atomic changes
Default
:
`True`
--ignore-invalid-changes
,
--no-ignore-invalid-changes

if true, ignore invalid changes, e.g. obsoletions of dependent entities
Default
:
`False`
-O
,
--output-type
<output_type>

Desired output type
Arguments
TERMS

Optional argument(s)
#### apply-taxon-constraints 
Test candidate taxon constraints
Multiple candidate constraints can be passed as arguments. these are in the form of triples
separated by periods.
Example:
runoak -i db/go.db apply-taxon-constraints -p i,p
GO:0005743
only NCBITaxon:2759
never NCBITaxon:2 . GO:0005634 only NCBITaxon:2
The –evolution-file (-E) option can be used to pass in a file of candidates.
This should follow the format used in
https://arxiv.org/abs/1802.06004
E.g.
GO:0000229
,Gain|NCBITaxon:1(root);>Loss|NCBITaxon:2759(Eukaryota);
Example:
runoak -i db/go.db eval-taxon-constraints -p i,p -E tests/input/go-evo-gains-losses.csv
More examples:
https://github.com/INCATools/ontology-access-kit/blob/main/docs/examples/Commands/Apply.ipynb
Usage
```shell
runoak apply-taxon-constraints [OPTIONS] [CONSTRAINTS]...
```
Options
-E
,
--evolution-file
<evolution_file>

path to file containing gains and losses
-o
,
--output
<output>

Output file, e.g. obo file
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-M
,
--graph-traversal-method
<graph_traversal_method>

Whether formal entailment or graph walking should be used.
Options
:
HOP | ENTAILMENT
Arguments
CONSTRAINTS

Optional argument(s)
#### associations 
Lookup associations from or to entities.
Example:
runoak -i sqlite:obo:hp -g test.hpoa -G hpoa associations
The above will show all associations
To query using an ontology term, including is-a closure, specify one or more
terms or term queries, plus the closure predicate(s), e.g.
Example:
runoak -i sqlite:obo:hp -g test.hpoa -G hpoa associations -p i HP:0001392
This shows all annotations either to “Abnormality of the liver” (HP:0001392), or
to is-a descendants.
Using input specifications:
It can be awkward to specify both input ontology and association path and format. You
can use input specifications to bundle common combinations of inputs together.
For example, the go-dictybase-input-spec combines go plus dictybase associations.
Example:
runoak –i src/oaklib/conf/go-dictybase-input-spec.yaml associations -p i,p
GO:0008104
More examples:
https://github.com/INCATools/ontology-access-kit/blob/main/docs/examples/Commands/Associations.ipynb
Usage
```shell
runoak associations [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
--if-absent
<if_absent>

determines behavior when the value is not present or is empty.
Options
:
absent-only | present-only
-S
,
--set-value
<set_value>

the value to set for all terms for the given property.
--add-closure-fields
,
--no-add-closure-fields

Add closure fields to the output
Default
:
`False`
--association-predicates
<association_predicates>

A comma-separated list of predicates for the association relation
-Q
,
--terms-role
<terms_role>

How to interpret query terms.
Default
:
`'object'`
Options
:
subject | object | both
--expand
,
--no-expand

Expand by feeding results into subsequent query
Default
:
`False`
-H
,
--header
,
--no-header
,
--no-H

Show a header
Default
:
`False`
Arguments
TERMS

Optional argument(s)
#### associations-counts 
Count associations, grouped by subject or object
Example:
runoak -i sqlite:obo:hp -g test.hpoa -G hpoa associations-counts
This will default to summarzing by objects (HPO term), showing the number
of associations for each term.
This will be direct counts only. To include is-a closure, specify
the closure predicate(s), e.g.
Example:
runoak -i sqlite:obo:hp -g test.hpoa -G hpoa associations -p i
You can also group by other fields
Example:
runoak -i sqlite:obo:hp -g test.hpoa -G hpoa associations-counts –group-by subject
This will show the number of associations for each disease.
OAK also includes a number of specialized adapters that implement this method
for particular databases.
For example, to get the number of IEA associations for each GO term:
runoak -i amigo: associations-counts –limit -1 -F evidence_type=IEA –no-autolabel
This can be constrained by species:
runoak -i amigo:NCBITaxon:9606 associations-counts –limit -1 -F evidence_type=IEA –no-autolabel
Other options:
This command accepts many of the same options as the associations command, see
the docs for this command for details.
Usage
```shell
runoak associations-counts [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
--add-closure-fields
,
--no-add-closure-fields

Add closure fields to the output
Default
:
`False`
--association-predicates
<association_predicates>

A comma-separated list of predicates for the association relation
-Q
,
--terms-role
<terms_role>

How to interpret query terms.
Default
:
`'object'`
Options
:
subject | object | both
-L
,
--limit
<limit>

Limit the number of results
Default
:
`10`
-F
,
--filter
<filter>

Additional filters in K=V format
--min-facet-count
<min_facet_count>

Minimum count for a facet to be included
Default
:
`1`
--group-by
<group_by>

Group by subject or object
Default
:
`'object'`
Arguments
TERMS

Optional argument(s)
#### associations-graph 
Query associations and fill out ontology graph.
Example:
runoak -i amigo: associations-graph -p i,p -A sqlite:obo:go -Q subject WB:WBGene00001187 -o gene.json
This queries for associations whose subject is the gene WBGene00001187 in AmiGO, and uses
the GO ontology to fill out the graph, following is-a and part-of relationships.
To immediately visualize, add –view to the end:
runoak -i amigo: associations-graph -p i,p -A sqlite:obo:go -Q subject WB:WBGene00001187 –view
You can use –gap-fill to trim the graph to only pairwise MRCAs and span the gaps:
runoak -i amigo: associations-graph -p i,p -A sqlite:obo:go -Q subject WB:WBGene00001187 –gap-fill –view
Usage
```shell
runoak associations-graph [OPTIONS] [TERMS]...
```
Options
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file
--association-predicates
<association_predicates>

A comma-separated list of predicates for the association relation
-A
,
--ontology-adapter
<ontology_adapter>

Adapter to use for traversing ontology graph
--gap-fill
,
--no-gap-fill

Fill in missing nodes
Default
:
`False`
-Q
,
--terms-role
<terms_role>

How to interpret query terms.
Default
:
`'object'`
Options
:
subject | object | both
--view
,
--no-view

if view is set then open the image after rendering
Default
:
`True`
-S
,
--stylemap
<stylemap>

a json file to configure visualization. See
https://berkeleybop.github.io/kgviz-model/
-C
,
--configure
<configure>

overrides for stylemap, specified as yaml. E.g.
`
-C “styles: [filled, rounded]” `
Arguments
TERMS

Optional argument(s)
#### associations-matrix 
Co-annotation matrix query.
This queries for co-annotations between pairs of terms.
See: Wood V., Carbon S., et al,
https://royalsocietypublishing.org/doi/10.1098/rsob.200149
Example:
runoak -i amigo:NCBITaxon:9606 associations-matrix -p i,p GO:0042416 GO:0014046
This results in a 2x2 matrix (shown as a long table)
As a heatmap:
runoak -i amigo:NCBITaxon:9606 associations-matrix -p i,p GO:0042416 GO:0014046 -O heatmap > /tmp/heatmap.png
By default the heatmap will show the percentage of overlap between the two terms. To change this
to be either the percentage of the first term in the second, or the percentage of the second term in the first,
use the –main-score-field (-S) option, with “1” or “2”.
You can plug in as many terms as you like, it will perform an all-by-all
To compare one set with another, use the “@” separator.
You can also substitute OAK expression language query terms
runoak –stacktrace -i amigo:NCBITaxon:9606 associations-matrix -p i,p .idfile cp.txt @ .idfile ct.txt
Usage
```shell
runoak associations-matrix [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
--association-predicates
<association_predicates>

A comma-separated list of predicates for the association relation
-Q
,
--terms-role
<terms_role>

How to interpret query terms.
Default
:
`'object'`
Options
:
subject | object | both
--include-entities
,
--no-include-entities

Include entities (e.g. genes) in the output, otherwise just the counts
Default
:
`True`
-S
,
--main-score-field
<main_score_field>

Score used for summarization
Default
:
`'proportion_subjects_in_common'`
Arguments
TERMS

Optional argument(s)
#### axioms 
Filters axioms
Example:
runoak -i cl.ofn axiom
The above will write all axioms.
You can filter by axiom type:
Example:
runoak -i cl.ofn axiom –axiom-type SubClassOf
Note this currently only works with the funowl adapter, on functional syntax files
Usage
```shell
runoak axioms [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
--axiom-type
<axiom_type>

Type of axiom, e.g. SubClassOf
--about
<about>

CURIE that the axiom is about
--references
<references>

CURIEs that the axiom references
Arguments
TERMS

Optional argument(s)
#### cache-clear 
Clear the contents of the pystow oaklib cache.
Usage
```shell
runoak cache-clear [OPTIONS]
```
Options
--days-old
<days_old>

Clear anything more than this number of days old
Default
:
`100`
#### cache-ls 
List the contents of the pystow oaklib cache.
Usage
```shell
runoak cache-ls [OPTIONS]
```
#### chains 
List all paths following a query template.
(Experimental)
Assume we have aliased
cl
to
runoak -i sqlite:obo:cl
:
All chains of is-a followed by develops from:
cl chains /rdfs:subClassOf /RO:0002202
Or using predicate shorthand:
cl chains /i /d
As above, but ending with “stem cell”
cl chains /i /d “stem cell”
Usage
```shell
runoak chains [OPTIONS] [TERMS]...
```
Options
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Path to output file
Arguments
TERMS

Optional argument(s)
#### crawl 
Crawl one or more ontologies, hopping over edges and mappings
Crawl is a powerful command that allows for multi-ontology traversal, particularly
on mapping paths. Multiple ontologies and ontology sources (e.g. BioPortal, OLS)
provide mappings between terms. No single ontology is likely to have a complete source.
Using crawl, you can walk across the union of mappings in all ontologies, with custom rules
for each ontology (e.g. normalizing prefixes).
Documentation for this command will be provided in a separate notebook.
Usage
```shell
runoak crawl [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Path to output file
-O
,
--output-type
<output_type>

Desired output type
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-M
,
--maps-to-source
<maps_to_source>

Return only mappings with subject or object source equal to this
--mapper
<mapper>

A selector for an adapter that is to be used for the main lookup operation
--unmelt
,
--no-unmelt

Use a wide table for display.
Default
:
`False`
--adapters
<adapters>

A comma-separated list of adapters
--allowed-prefixes
<allowed_prefixes>

A comma-separated list of prefixes to traverse over
--mapping-predicates
<mapping_predicates>

A comma-separated list of mapping predicates to traverse over
--viz
,
--no-viz

If true then draw a graph
Default
:
`False`
-S
,
--stylemap
<stylemap>

a json file to configure visualization. See
https://berkeleybop.github.io/kgviz-model/
-C
,
--configure
<configure>

overrides for stylemap, specified as yaml. E.g.
`
-C “styles: [filled, rounded]” `
-d
,
--directory
<directory>

Directory to write output files
--whole-ontology
,
--no-whole-ontology

Run over whole ontology
Default
:
`False`
-C
,
--config-yaml
<config_yaml>

Arguments
TERMS

Optional argument(s)
#### definitions 
Show textual definitions for term or set of terms
Example:
runoak -i sqlite:obo:envo definitions ‘tropical biome’ ‘temperate biome’
You can use the “.all” selector to show all definitions for all terms in the ontology:
Example:
runoak -i sqlite:obo:envo definitions .all
You can also include definition metadata, such as provenance and source:
runoak -i sqlite:obo:cl definitions –additional-metadata neuron
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/basic
Usage
```shell
runoak definitions [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-D
,
--display
<display>

A comma-separated list of display options. Use ‘all’ for all
-O
,
--output-type
<output_type>

Desired output type
Options
:
obo | obojson | ofn | rdf | json | yaml | fhirjson | csv | tsv | nl
--if-absent
<if_absent>

determines behavior when the value is not present or is empty.
Options
:
absent-only | present-only
--additional-metadata
,
--no-additional-metadata

if true then fetch additional metadata about statements stored as OWL reification
Default
:
`False`
-S
,
--set-value
<set_value>

the value to set for all terms for the given property.
-P
,
--lookup-references
,
--no-lookup-references

Lookup references for each term, e.g. PMIDs
Default
:
`False`
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
Arguments
TERMS

Optional argument(s)
#### descendants 
List all descendants of a term
Example:
runoak -i sqlite:obo:obi descendants assay -p i
Example:
runoak -i sqlite:obo:uberon descendants heart -p i,p
This is the inverse of the ‘ancestors’ command; see the documentation for
that command. But note that ‘descendants’ commands have the potential to be more
“explosive” than ancestors commands, especially for high level terms, and for when
predicates are not specified
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/obograph
Usage
```shell
runoak descendants [OPTIONS] [TERMS]...
```
Options
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-M
,
--graph-traversal-method
<graph_traversal_method>

Whether formal entailment or graph walking should be used.
Options
:
HOP | ENTAILMENT
-D
,
--display
<display>

A comma-separated list of display options. Use ‘all’ for all
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
TERMS

Optional argument(s)
#### diff 
Compute difference between two ontologies.
Example:
runoak -i foo.obo diff -X bar.obo -o diff.yaml
This will produce a list of Changes that are required to go from the main input ontology (–input)
to the other ontology (–other-ontology, or -X).
The output follows the KGCL data model.
See
https://incatools.github.io/ontology-access-kit/datamodels/kgcl/index.html
You can use –output-type to control the output format.
KGCL controlled natural language:
runoak -i foo.obo diff -X bar.obo -o diff.txt –output-type kgcl
KGCL JSON:
runoak -i foo.obo diff -X bar.obo -o diff.json –output-type json
YAML (default):
runoak -i foo.obo diff -X bar.obo -o diff.yaml –output-type yaml
The –statistics option can be used to generate summary statistics for the changes.
These are grouped according to the –group-by-property option. For example,
the GO uses the oio:hasOBONamespace property to partition classes into 3 categories.
Example:
runoak -i go.obo diff -X go-new.obo -o diff.yaml –statistics –group-by-property oio:hasOBONamespace
This will produce a YAML dictionary, with outer keys being the values of the oio:hasOBONamespace property,
and inner keys being the change types.
If –group-by-property is not specified, or there is no value for this property, then the outer key
will be “__RESIDUAL__”
For summary statistics, you can also specify –output-type csv, to get a tabular out
Limitations:
This does not do a diff over every axiom in each ontology. For a complete OWL diff, you should
use ROBOT.
Usage
```shell
runoak diff [OPTIONS]
```
Options
-X
,
--other-ontology
<other_ontology>

other ontology
--simple
,
--no-simple

perform a quick difference showing only terms that differ
Default
:
`False`
--statistics
,
--no-statistics

show summary statistics only
Default
:
`False`
--change-type
<change_type>

filter by KGCL change type (e.g. ‘ClassCreation’, ‘EdgeDeletion’)
--group-by-property
<group_by_property>

group summaries by a metadata property, e.g. rdfs:isDefinedBy
--group-by-obo-namespace
,
--no-group-by-obo-namespace

shortcut for –group-by-property oio:hasOBONamespace (note this is distinct from the ID namespace)
Default
:
`False`
--group-by-defined-by
,
--no-group-by-defined-by

shortcut for –group-by-property rdfs:isDefinedBy. This may be inferred from prefix if not set explicitly
Default
:
`False`
--group-by-prefix
,
--no-group-by-prefix

shortcut for –group-by-property sh:prefix. Groups by the prefix of the CURIE
Default
:
`False`
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
#### diff-associations 
Diffs two association sources.
Example:
runoak -i sqlite:obo:go -G gaf diff-associations –old-date ${date1} –new-date ${date2} -g “${download_dir}/${group}-${date1}.gaf” -X “${download_dir}/${group}-${date2}.gaf” –group-by publications -p i,p -o “${group}-diff-${date1}-to-${date2}.tsv
See
https://w3id.org/oak/association
for the diff data model.
NOTE: This functionality may move out of core
Usage
```shell
runoak diff-associations [OPTIONS]
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
--old-date
<old_date>

Old date, in YYYY-MM-DD format
--new-date
<new_date>

Old date, in YYYY-MM-DD format
-g
,
--associations
<associations>

associations
-X
,
--other-associations
<other_associations>

other associations
--group-by
<group_by>

One of: publications; primary_knowledge_source
#### diff-terms 
Compares a pair of terms in two ontologies
EXPERIMENTAL
Usage
```shell
runoak diff-terms [OPTIONS] [TERMS]...
```
Options
--other-ontology
<other_ontology>

other ontology
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
TERMS

Optional argument(s)
#### diff-via-mappings 
Calculates cross-ontology diff using mappings
Given a pair of ontologies, and mappings that connect terms in both ontologies, this
command will perform a structural comparison of all mapped pairs of terms
Example:
runoak -i sqlite:obo:uberon diff-via-mappings –other-input sqlite:obo:zfa –source UBERON –source ZFA -O csv
Note the above command does not have any mapping file specified; the mappings that are distributed within
each ontology is used (in this case, Uberon contains mappings to ZFA)
If the mappings are provided externally:
runoak -i ont1.obo diff-via-mappings –other-input ont2.obo –mapping-input mappings.sssom.tsv
(in the above example, –source is not passed, so all mappings are tested)
If there are no existing mappings, you can use the lexmatch command to generate them:
runoak -i ont1.obo diff-via-mappings -a ont2.obo lexmatch -o mappings.sssom.tsv
runoak -i ont1.obo diff-via-mappings –other-input ont2.obo –mapping-input mappings.sssom.tsv
The output from this command follows the cross-ontology-diff data model
(
https://incatools.github.io/ontology-access-kit/datamodels/cross-ontology-diff/index.html
)
This can be serialized in YAML or TSV form
Usage
```shell
runoak diff-via-mappings [OPTIONS] [TERMS]...
```
Options
-S
,
--source
<source>

ontology prefixes e.g. HP, MP
--mapping-input
<mapping_input>

File of mappings in SSSOM format. If not provided then mappings in ontology(ies) are used
-X
,
--other-input
<other_input>

Additional input file
--other-input-type
<other_input_type>

Type of additional input file
--intra
,
--no-intra

If true, then all sources are in the main input ontology
Default
:
`False`
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
--include-identity-mappings
,
--no-include-identity-mappings

Use identity relation as mapping; use this for two versions of the same ontology
Default
:
`False`
--filter-category-identical
,
--no-filter-category-identical

Do not report cases where a relationship has not changed
Default
:
`False`
--bidirectional
,
--no-bidirectional

Show diff from both left and right perspectives
Default
:
`True`
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
Arguments
TERMS

Optional argument(s)
#### disjoints 
Show all disjoints for a set of terms, or whole ontology.
Leave off all arguments for defaults - all terms, YAML OboGraph model
serialization:
Example:
runoak -i sqlite:obo:uberon disjoints
Note that this will include pairwise disjoints, setwise disjoints,
disjoint unions, and disjoints involving simple class expressions.
A tabular format can be easier to browse, and includes labels by default:
Example:
runoak -i sqlite:obo:uberon disjoints –autolabel -O csv
To perform this on a subset:
Example:
runoak -i sqlite:obo:cl disjoints –autolabel -O csv .desc//p=i “immune cell”
Data model:
https://w3id.org/oak/obograph
Usage
```shell
runoak disjoints [OPTIONS] [TERMS]...
```
Options
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
--named-classes-only
,
--no-named-classes-only

Only show disjointness axioms between two named classes.
Default
:
`False`
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
TERMS

Optional argument(s)
#### dump 
Exports (dumps) the entire contents of an ontology.
Example:
runoak -i pato.obo dump -o pato.json -O json
Example:
runoak -i pato.owl dump -o pato.ttl -O turtle
You can also pass in a JSON configuration file to parameterize the dump process.
Currently this is only used for fhirjson dumps, the configuration options are specified here:
https://incatools.github.io/ontology-access-kit/converters/obo-graph-to-fhir.html
Example:
runoak -i pato.owl dump -o pato.ttl -O fhirjson -c fhir_config.json -o pato.fhir.json
Currently each implementation only supports a subset of formats.
The dump command is also blocked for remote endpoints such as Ubergraph,
to avoid killer queries.
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/basic
Usage
```shell
runoak dump [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Path to output file
-O
,
--output-type
<output_type>

Desired output type
-c
,
--config-file
<config_file>

Config file for additional params. Presently used by
fhirjson
only.
--enforce-canonical-ordering
,
--no-enforce-canonical-ordering

Forces the serialization to be in canonical order, which is useful for diffing
Default
:
`False`
Arguments
TERMS

Optional argument(s)
#### enrichment 
Run class enrichment analysis.
Given a sample file of identifiers (e.g. gene IDs), plus a set of associations (e.g. gene to term
associations, return the terms that are over-represented in the sample set.
Example:
runoak -i sqlite:obo:uberon -g gene2anat.txt -G g2t enrichment -U my-genes.txt -O csv
This runs an enrichment using Uberon on my-genes.txt, using the gene2anat.txt file as the
association file (assuming simple gene-to-term format). The output is in CSV format.
It is recommended you always provide a background set, including all the entity identifiers
considered in the experiment.
You can specify –filter-redundant to filter out redundant terms. This will block reporting
of any terms that are either subsumed by or subsume a lower p-value term that is already
reported.
For a full example, see:
https://github.com/INCATools/ontology-access-kit/blob/main/docs/examples/Commands/Enrichment.ipynb
Note that it is possible to run “pseudo-enrichments” on term lists only by passing
no associations and using –ontology-only. This creates a fake association set that is simply
reflexive relations between each term and itself. This can be useful for summarizing term lists,
but note that P-values may not be meaningful.
Usage
```shell
runoak enrichment [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
-T
,
--ontology-only
,
--no-ontology-only

If true, perform a pseudo-enrichment analysis treating each term as an association to itself.
Default
:
`False`
--cutoff
<cutoff>

The cutoff for the p-value; any p-values greater than this are not reported.
Default
:
`0.05`
-U
,
--sample-file
<sample_file>

file containing input list of entity IDs (e.g. gene IDs)
-B
,
--background-file
<background_file>

file containing background list of entity IDs (e.g. gene IDs)
--association-predicates
<association_predicates>

A comma-separated list of predicates for the association relation
--filter-redundant
,
--no-filter-redundant

If true, filter out redundant terms
--allow-labels
,
--no-allow-labels

If true, allow labels as well as CURIEs in the input files
Arguments
TERMS

Optional argument(s)
#### expand-subsets 
For each subset provide a mapping of each term in the ontology to a subset
Example:
runoak -i db/pato.db expand-subsets attribute_slim value_slim
Usage
```shell
runoak expand-subsets [OPTIONS] [SUBSETS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
Arguments
SUBSETS

Optional argument(s)
#### extract 
Extracts a sub-ontology.
Simple example:
runoak -i cl.db extract neuron
This will extract a single node for “neuron”. No relationships will be included,
as –no-dangling is the default
To include edges even if dangling:
runoak -i cl.db extract neuron –dangling
A subset of relationship types (predicates):
runoak -i cl.db extract neuron –dangling -p i
If you wish to get a fully connected is-a graph for all is-a ancestors:
runoak -i cl.db extract .anc//p=i neuron –dangling -p i
If you prefer, you can split this into 2 commands:
runoak -i cl.db ancestors -p i neuron > seed.txt
Then:
runoak -i cl.db extract .idfile seed.txt –dangling -p i
You can specify different output types and output paths:
runoak -i cl.db extract .idfile seed.txt -O owl -o neuron.owl.ttl
Allowed formats include: obo, obographs, owl/ttl, fhirjson
Usage
```shell
runoak extract [OPTIONS] [TERMS]...
```
Options
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-o
,
--output
<output>

Path to output file
--dangling
,
--no-dangling

If True, allow dangling edges in the output
Default
:
`False`
--include-metadata
,
--no-include-metadata

If True, include term metadata such as definitions, synonyms
Default
:
`False`
-O
,
--output-type
<output_type>

Desired output type
Arguments
TERMS

Optional argument(s)
#### fill-table 
Fills missing values in a table of ontology elements
See
https://incatools.github.io/ontology-access-kit/src/oaklib.utilities.table_filler
Given a TSV with a populated ID column, and unpopulated columns for definition, label, mappings, ancestors,
this will iterate through each row filling in each missing value by performing ontology lookups.
In some cases, this can also perform reverse lookups; i.e given a table with labels populated and blank IDs,
then fill in the IDs
In the most basic scenario, you have a table with two columns ‘id’ and ‘label’. These are the “conventional” column
headers for a table of ontology elements (see later for configuration when you don’t follow conventions)
Example:
runoak -i cl.owl.ttl fill-table my-table.tsv
(any implementation can be used)
The same command will work for the reverse scenario - when you have labels populated, but IDs are not populated
By default this will throw an error if a lookup is not successful; this can be relaxed
Relaxed:
runoak -i cl.owl.ttl fill-table –allow-missing my-table.tsv
In this case missing values that cannot be populated will remain empty
To explicitly populate a value:
runoak -i cl.owl.ttl fill-table –missing-value-token NO_DATA my-table.tsv
Currently the following columns are recognized:
id – the unique identifier of the element
label – the rdfs:label of the element
definition – the definition of the element
mappings – mappings for the element
ancestors – ancestors for the element (this can be parameterized)
The metadata inference procedure will also work for when you have denormalized TSV files
with columns such as “foo_id” and “foo_name”. This will be recognized as an implicit normalized
label relation between id and name of a foo element.
You can be more explicit in one of two ways:
Pass in a YAML structure (on command line or in a YAML file) listing relations
Pass in a LinkML data definitions YAML file
For the first method, you can pass in multiple relations using the –relation arg. For example,
given a TSV with columns cl_identifier and cl_display_label you can say:
Example:
runoak -i cl.owl.ttl fill-table –relation “{primary_key: cl_identifier, dependent_column: cl_display_label, relation: label}”
You can also specify this in a YAML file
For the 2nd method, you need to specify a LinkML schema with a class where (1) at least one field is annotated
as being an identifier (2) one or more slots have slot_uri elements mapping them to standard metadata elements
such as rdfs:label.
For example, my-schema.yaml:
classes:
Person:
attributes:
id:
identifier: true
name:
slot_uri: rdfs:label
This is a powerful command with many ways of configuring it - we will add separate docs for this soon,
for now please file an issue on github with any questions
TODO: allow for an option that will perform fuzzy matches of labels
TODO: reverse lookup is not provided for all fields, such as definitions
TODO: add an option to detect inconsistencies
TODO: add logical for obsoletion/replaced by
TODO: use most optimized method for whichever backend
Usage
```shell
runoak fill-table [OPTIONS] TABLE_FILE
```
Options
--allow-missing
,
--no-allow-missing

Allow some dependent values to be blank, post-processing
Default
:
`False`
--missing-value-token
<missing_value_token>

Populate all missing values with this token
--schema
<schema>

Path to linkml schema. This is used to infer which fields are identifiers and which are dependent columns, e.g labels
--delimiter
<delimiter>

Delimiter between columns in input and output
Default
:
`'\t'`
--comment
<comment>

Comment indicator at the beginning of a row.
Default
:
`'#'`
--relation
<relation>

Serialized YAML string corresponding to a normalized relation between two columns
--relation-file
<relation_file>

Path to YAML file corresponding to a list of normalized relation between two columns
--fields-to-label
<fields_to_label>

Comma-separated list of field names for identifiers which should be labeled.
--autolabel
,
--no-autolabel

Autolabel columns
Default
:
`False`
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
TABLE_FILE

Required argument
#### generate-definitions 
Generate definitions for a term or terms.
Currently this only works with the llm extension.
Example:
runoak -i llm:sqlite:obo:foodon generate-definitions FOODON:03315258
The –style-hints option can be used to provide hints to the definition generator.
Example:
runoak -i llm:sqlite:obo:foodon generate-definitions FOODON:03315258 –style-hints “Write the definition in the style of a pretentious food critic”
Generates:
“The pancake, a humble delight in the realm of breakfast fare,
presents itself as a delectable disc of gastronomic delight…”
Usage
```shell
runoak generate-definitions [OPTIONS] [TERMS]...
```
Options
--style-hints
<style_hints>

Description of style for definitions
--apply-patch
,
--no-apply-patch

Apply KGCL syntax.
Default
:
`False`
--patch
<patch>

Path to where patch file will be written.
--patch-format
<patch_format>

Output syntax for patches.
--exclude-defined
,
--no-exclude-defined

Exclude terms that already have definitions
Default
:
`False`
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
Arguments
TERMS

Optional argument(s)
#### generate-disjoints 
Generate candidate disjointness axioms.
Example:
runoak -i sqlite:obo:iao generate-disjoints -O obo
To generate spatial disjointness axioms:
runoak -i sqlite:obo:zfa generate-disjoints -O obo p i,p
Usage
```shell
runoak generate-disjoints [OPTIONS] [TERMS]...
```
Options
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-o
,
--output
<output>

Output file, e.g. obo file
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-O
,
--output-type
<output_type>

Desired output type
-M
,
--min-descendants
<min_descendants>

Minimum number of descendants for a class to have to be considered a candidate.
Default
:
`3`
--exclude-existing
,
--no-exclude-existing

Do not report duplicates with existing disjointness axioms.
Default
:
`True`
Arguments
TERMS

Optional argument(s)
#### generate-lexical-replacements 
Generate lexical replacements based on a set of synonymizer rules.
If the
–apply-patch
flag is set, the output will be an ontology file with the changes
applied. Pass the
–patch
argument to lso get the patch file in KGCL format.
Example:
runoak -i foo.obo generate-lexical-replacements -R foo_rules.yaml –patch patch.kgcl –apply-patch -o foo_syn.obo
If the
apply-patch
flag is NOT set then the main input will be KGCL commands
Example:
runoak -i foo.obo generate-lexical-replacements -R foo_rules.yaml -o changes.kgcl
You can also pass the expressions directly as YAML
Example:
runoak -i foo.obo generate-lexical-replacements -Y ‘{match: “nuclear (w+)”, replacement: “1 nucleus”}’ .all
see
https://github.com/INCATools/kgcl
.
Note: this command is very similar to generate-synonyms, but the main use case here
is replacing terms, and applying rules to other elements such as definitions
Usage
```shell
runoak generate-lexical-replacements [OPTIONS] [TERMS]...
```
Options
-R
,
--rules-file
<rules_file>

path to rules file. Conforms to rules_datamodel. e.g.
https://github.com/INCATools/ontology-access-kit/blob/main/tests/input/matcher_rules.yaml
-Y
,
--rules-expression
<rules_expression>

YAML encoding of a rules expression
--apply-patch
,
--no-apply-patch

Apply KGCL syntax generated based on the synonymizer rules file.
Default
:
`False`
--patch
<patch>

Path to where patch file will be written.
--patch-format
<patch_format>

Output syntax for patches.
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
Arguments
TERMS

Optional argument(s)
#### generate-logical-definitions 
Generate logical definitions based on patterns file.
Usage
```shell
runoak generate-logical-definitions [OPTIONS] [TERMS]...
```
Options
-P
,
--patterns-file
<patterns_file>

path to patterns file
--show-extract
,
--no-show-extract

Show the original extracted object.
Default
:
`False`
--parse
,
--no-parse

Parse the input terms according to the patterns.
Default
:
`True`
--fill
,
--no-fill

If true, fill in descendant logical definitions.
Default
:
`False`
--analyze
,
--no-analyze

Analyze consistency of logical definitions (in progress).
Default
:
`False`
--unmelt
,
--no-unmelt

Use a wide table for display.
Default
:
`False`
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
Arguments
TERMS

Optional argument(s)
#### generate-synonyms 
Generate synonyms based on a set of synonymizer rules.
If the
–apply-patch
flag is set, the output will be an ontology file with the changes
applied. Pass the
–patch
argument to lso get the patch file in KGCL format.
Example:
runoak -i foo.obo generate-synonyms -R foo_rules.yaml –patch patch.kgcl –apply-patch -o foo_syn.obo
If the
apply-patch
flag is NOT set then the main input will be KGCL commands
Example:
runoak -i foo.obo generate-synonyms -R foo_rules.yaml -o changes.kgcl
see
https://github.com/INCATools/kgcl
.
Usage
```shell
runoak generate-synonyms [OPTIONS] [TERMS]...
```
Options
-R
,
--rules-file
<rules_file>

Required
path to rules file. Conforms to rules_datamodel. e.g.
https://github.com/INCATools/ontology-access-kit/blob/main/tests/input/matcher_rules.yaml
--apply-patch
,
--no-apply-patch

Apply KGCL syntax generated based on the synonymizer rules file.
Default
:
`False`
--patch
<patch>

Path to where patch file will be written.
--patch-format
<patch_format>

Output syntax for patches.
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
Arguments
TERMS

Optional argument(s)
#### info 
Show information on term or set of terms
Example:
runoak -i sqlite:obo:cl info CL:4023094
The default output is minimal, showing only ID and label
The –output-type (-O) option can be used to specify other formats for the output.
Currently there are only a few output types are supported. More will be provided in future.
In OBO format:
runoak -i cl.owl info CL:4023094 -O obo
As CSV:
runoak -i cl.obo info CL:4023094 -O csv
The info output format can be parameterized with –display (-D)
With xrefs and definitions:
runoak -i cl.owl info CL:4023094 -D x,d
With all information:
runoak -i cl.owl info CL:4023094 -D all
Like all OAK commands, input term lists can be multivalued, a mixture of IDs and labels, as well
as queries that can be combined using boolean logic
Info on two STATO terms:
runoak -i ontobee:stato info STATO:0000286 STATO:0000287 -O obo
All terms in ENVO with the string “forest” in them:
runoak -i sqlite:obo:envo info l~forest
Info on all subtypes of “statistical hypothesis test” in STATO:
runoak -i sqlite:obo:stato info .desc//p=i ‘statistical hypothesis test’
Usage
```shell
runoak info [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-D
,
--display
<display>

A comma-separated list of display options. Use ‘all’ for all
-O
,
--output-type
<output_type>

Desired output type
Arguments
TERMS

Optional argument(s)
#### information-content 
Show information content for term or list of terms
Example:
runoak -i cl.db information-content -p i .all
Like all OAK commands that operate over graphs, the graph traversal is controlled
by the
–predicates
option. In the above case, the frequency of each term is equal to
the number of reflexive is-a descendants of the term divided by total number of terms
By default, the ontology is used as the corpus for computing term frequency.
You can use an association file as the corpus:
runoak -g hpoa.tsv -G hpoa -i hp.db information-content -p i –use-associations .all
Usage
```shell
runoak information-content [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--use-associations
,
--no-use-associations

Use associations to calculate IC
Default
:
`False`
Arguments
TERMS

Optional argument(s)
#### labels 
Show labels for term or list of terms
Example:
runoak -i cl.owl labels CL:4023093 CL:4023094
You can use the “.all” selector to show all labels:
Example:
runoak -i cl.owl labels .all
(this may be blocked for remote endpoints)
You can query for terms that have either no label, or to include only ones with labels:
Nodes with no labels:
runoak -i cl.owl labels .all –if-absent exclude
Multilingual support: if the adapter supports multilingual querying
(currently only SQL)
and
the ontology has multilingual support, you can restrict results to
a particular language.
Example:
runoak –preferred-language fr -i sqlite:obo:hpinternational labels .ancestors HP:0020110
You can also query for all languages, and see these pivoted:
Example:
runoak -i sqlite:obo:hpinternational labels .ancestors HP:0020110 –pivot-languages
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/labels
Usage
```shell
runoak labels [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-D
,
--display
<display>

A comma-separated list of display options. Use ‘all’ for all
-O
,
--output-type
<output_type>

Desired output type
Options
:
obo | obojson | ofn | rdf | json | yaml | fhirjson | csv | tsv | nl
--pivot-languages
,
--no-pivot-languages

include one column per language
--all-languages
,
--no-all-languages

if source is multi-lingual, show all languages rather than just default
--if-absent
<if_absent>

determines behavior when the value is not present or is empty.
Options
:
absent-only | present-only
-S
,
--set-value
<set_value>

the value to set for all terms for the given property.
Arguments
TERMS

Optional argument(s)
#### languages 
Show available languages
Example:
runoak languages
Usage
```shell
runoak languages [OPTIONS]
```
#### leafs 
List all leaf nodes in the ontology
Like all OAK relational commands, this is parameterized by –predicates (-p).
Note that the default is to return the roots of the relation graph over
all
predicates
Example:
runoak -i db/cob.db leafs
This command is a wrapper onto the “leafs” command in the BasicOntologyInterface.
https://incatools.github.io/ontology-access-kit/interfaces/basic
.html#
oaklib.interfaces.basic_ontology_interface.BasicOntologyInterface.leafs
Usage
```shell
runoak leafs [OPTIONS]
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--filter-obsoletes
,
--no-filter-obsoletes

If set, results will exclude obsoletes
Default
:
`True`
#### lexmatch 
Performs lexical matching between pairs of terms in one more more ontologies.
Examples
-
runoak -i foo.obo lexmatch -o foo.sssom.tsv
In this example, the input ontology file is assumed to contain all pairs of terms to be mapped.
It is more common to map between all pairs of terms in two ontology files. In this case,
you can merge the ontologies using a tool like ROBOT; or, to avoid a merge
preprocessing step, use the –addl (-a) option to specify a second ontology file.
runoak -i foo.obo –add bar.obo lexmatch -o foo.sssom.tsv
By default, this command will compare all terms in all ontologies. You can use the OAK
term query syntax to pass in the set of all terms to be compared.
For example, to compare all terms in union of FOO and BAR namespaces:
runoak -i foo.obo –add bar.obo lexmatch -o foo.sssom.tsv i^FOO: i^BAR:
All members of the set are compared (including FOO to FOO matches and BAR to BAR
matches), omitting trivial reciprocal matches.
Use an “@” separator between two queries to feed in two explicit sets:
runoak -i foo.obo –add bar.obo lexmatch -o foo.sssom.tsv i^FOO: @ i^BAR:
ALGORITHM: lexmatch implements a simple algorithm:
create a lexical index, keyed by normalized strings of labels, synonyms
report all pairs of entities that have the same key
The lexical index can be exported (in native YAML) using -L:
runoak -i foo.obo lexmatch -L foo.index.yaml -o foo.sssom.tsv
Note: if you run the above command a second time it will be faster as the index
will be reused.
RULES: Using custom rules:
runoak -i foo.obo lexmatch -R match_rules.yaml -L foo.index.yaml -o foo.sssom.tsv
Full documentation:
https://incatools.github.io/ontology-access-kit/packages/src/oaklib.utilities.lexical.lexical_indexer
.html#
module-oaklib.utilities.lexical.lexical_indexer
Usage
```shell
runoak lexmatch [OPTIONS] [TERMS]...
```
Options
-R
,
--rules-file
<rules_file>

path to rules file. Conforms to rules_datamodel. e.g.
https://github.com/INCATools/ontology-access-kit/blob/main/tests/input/matcher_rules.yaml
--add-labels
,
--no-add-labels

Populate empty labels with URI fragments or CURIE local IDs, for ontologies that use semantic IDs
Default
:
`False`
-L
,
--lexical-index-file
<lexical_index_file>

path to lexical index. This is recreated each time unless –no-recreate is passed
--recreate
,
--no-recreate

if true and lexical index is specified, always recreate, otherwise load from index
Default
:
`True`
--ensure-strict-prefixes
,
--no-ensure-strict-prefixes

Clean prefix map and mappings before generating an output.
Default
:
`False`
--exclude-mapped
,
--no-exclude-mapped

Return only mappings for subjects that have not been mapped
Default
:
`False`
--add-pipeline-step
<add_pipeline_step>

E.g. WordOrderNormalization
--exclude-self-matches
,
--no-exclude-self-matches

If true, do not report matches between the same id space
Default
:
`False`
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
TERMS

Optional argument(s)
#### lint 
Lints an ontology, applying changes in place.
The current implementation is highly incomplete, and only handles
linting of syntactic patterns (chains of whitespace, trailing whitespace)
in labels and definitions.
The output is a list of changes, in a KCGL-compliant syntax.
By default, changes will be applied
Example:
runoak -i my.obo lint
This can be executed in dry-run mode, in which case changes are not applied:
runoak -i my.obo lint –dry-run
One common workflow is to emit the changes to a KCGL file which is manually checked,
then applied as a separate step.
Example workflow:
runoak -i my.obo lint –dry-run -o changes.kgcl
# examine and edit changes.kgcl
runoak -i my.obo apply –changes-input changes.kgcl
Usage
```shell
runoak lint [OPTIONS]
```
Options
-o
,
--output
<output>

--report-format
<report_format>

Output format for reporting proposed/applied changes
--dry-run
,
--no-dry-run

If true, nothing will be modified by executing command
-O
,
--output-type
<output_type>

Desired output type
#### logical-definitions 
Show all logical definitions for a term or terms.
To show all logical definitions in an ontology, pass the “.all” query term
Example; first create an alias:
alias pato=”runoak -i obo:sqlite:pato”
Then run the query:
pato logical-definitions .all
By default, “.all” will query all axioms for all terms including merged terms;
to restrict to only the current terms, use an ID query:
pato logical-definitions i^PATO
You can also restrict to branches:
pato logical-definitions .desc//p=i “physical object quality”
By default, the output is a subset of OboGraph datamodel rendered as YAML, e.g.
definedClassId: PATO:0045071
genusIds:
- PATO:0001439
restrictions:
- fillerId: PATO:0000461
propertyId: RO:0015010
You can also specify CSV to generate a flattened form of this.
Example:
pato logical-definitions .all –output-type csv
You can optionally choose to “–matrix-axes” to transform the output to a matrix form.
This is a comma-separated pair of axes, where each element is a logical definition element
type: “f” for filler, “p” for predicate, “g” for genus, “d” for defined class.
Example:
Each property/predicate is a column
For repeated properties, columns of the form prop_1, prop_2, … are generated
Example:
pato logical-definitions .all –matrix-axes d,p –output-type csv
This will generate a row for each defined class with a logical definition, with columns
for each predicate (“genus” is treated as a predicate here).
Limitations:
Currently this only works for definitions that follow a basic genus-differentia pattern,
which is what is currently represented in the OboGraph datamodel.
Consider using the “axioms” command for inspection of complex nested OWL axioms.
More examples:
https://github.com/INCATools/ontology-access-kit/blob/main/docs/examples/Commands/LogicalDefinitions.ipynb
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/obograph
Data model:
https://w3id.org/oak/obograph
Usage
```shell
runoak logical-definitions [OPTIONS] [TERMS]...
```
Options
--unmelt
,
--no-unmelt

Flatten to a wide table
Default
:
`False`
--matrix-axes
<matrix_axes>

If specified, transform results to matrix using these row and column axes. Examples: d,p; f,g
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
--if-absent
<if_absent>

determines behavior when the value is not present or is empty.
Options
:
absent-only | present-only
-S
,
--set-value
<set_value>

the value to set for all terms for the given property.
Arguments
TERMS

Optional argument(s)
#### mappings 
List all mappings encoded in the ontology
Example:
runoak -i sqlite:obo:envo mappings
The default output is SSSOM YAML. To use the (canonical) csv format:
runoak -i sqlite:obo:envo mappings -O sssom
By default, labels are not included. Use –autolabel to include labels (but note
that if the label is not in the source ontology, then no label will be retrieved)
runoak -i sqlite:obo:envo mappings -O sssom
You can also “unmelt” (pivot) tabular output, such that each column/field
is a mapping object source.
runoak -i sqlite:obo:go mappings -O csv –unmelt
(this format is lossy as it doesn’t include the predicate or provenance of the
mapping, but it can be useful for high level breakdowns)
To constrain the mapped object source:
runoak -i sqlite:obo:foodon mappings -O sssom –maps-to-source SUBSET_SIREN
Like most OAK commands, you can pass in lists of individidual IDs, term labels,
or OAK query expressions.
For example, to find all mappings for the MF branch of GO:
runoak -i sqlite:obo:go mappings .sub molecular_function
All parts of the brain in Uberon:
runoak -i sqlite:obo:uberon mappings .desc//p=i,p “brain”
To get all GO mappings for terms that are mapped to EC:
runoak -i sqlite:obo:go mappings x^EC
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/mapping-provider
Data model:
https://w3id.org/oak/mapping-provider
More examples:
https://github.com/INCATools/ontology-access-kit/blob/main/docs/examples/Commands/Mappings.ipynb
Usage
```shell
runoak mappings [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-M
,
--maps-to-source
<maps_to_source>

Return only mappings with subject or object source equal to this
--mapper
<mapper>

A selector for an adapter that is to be used for the main lookup operation
--unmelt
,
--no-unmelt

Use a wide table for display.
Default
:
`False`
Arguments
TERMS

Optional argument(s)
#### migrate-curies 
Rewires an ontology replacing all instances of an ID or IDs
Note: the specified ontology is modified in place
The input for this command is a list equals-separated pairs, specifying the
source and the target
Example:
runoak -i db/uberon.db migrate-curies –replace SRC1=TGT1 SRC2=TGT2
This command is a wrapper onto the “migrate_curies” command in the PatcherInterface
https://incatools.github.io/ontology-access-kit/interfaces/patcher
.html#
oaklib.interfaces.patcher_interface.PatcherInterface.migrate_curies
Usage
```shell
runoak migrate-curies [OPTIONS] [CURIE_PAIRS]...
```
Options
--replace
,
--no-replace

If true, will update in place
Default
:
`False`
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
CURIE_PAIRS

Optional argument(s)
#### normalize 
Normalize all input identifiers.
Example:
runoak -i translator: normalize HGNC:1 HGNC:2 -M NCBIGene
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/mapping-provider
Data model:
https://w3id.org/oak/mapping-provider
Usage
```shell
runoak normalize [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-M
,
--maps-to-source
<maps_to_source>

Required
Return only mappings with subject or object source equal to this
Arguments
TERMS

Optional argument(s)
#### obsoletes 
Shows all obsolete entities.
Example:
runoak -i obolibrary:go.obo obsoletes
To exclude
merged terms
, use the
`--no-include-merged`
flag
Example:
runoak -i obolibrary:go.obo obsoletes –no-include-merged
To show migration relationships, use the
`--show-migration-relationships`
flag
Example:
runoak -i obolibrary:go.obo obsoletes –show-migration-relationships
You can also specify terms to show obsoletes for:
Example:
runoak -i obolibrary:go.obo obsoletes –show-migration-relationships GO:0000187 GO:0000188
More examples:
https://github.com/INCATools/ontology-access-kit/blob/main/docs/examples/Commands/Obsoletes.ipynb
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/basic
Usage
```shell
runoak obsoletes [OPTIONS] [TERMS]...
```
Options
--include-merged
,
--no-include-merged

Include merged terms in output
Default
:
`True`
--show-migration-relationships
,
--no-show-migration-relationships

Show migration relationships (e.g. replaced_by, consider)
Default
:
`False`
-O
,
--output-type
<output_type>

Desired output type
Options
:
obo | obojson | ofn | rdf | json | yaml | fhirjson | csv | tsv | nl
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
TERMS

Optional argument(s)
#### ontologies 
Shows all ontologies
If the input is a pre-merged ontology, then the output of this command is trivially
a single line, with the name of the input ontology
This command is more meaningful when the input is a multi-ontology endpoint, e.g
runoak -i ubergraph: ontologies
Or
runoak -i bioportal: ontologies
In future this command will be expanded to allow showing more metadata about each ontology
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/basic
Usage
```shell
runoak ontologies [OPTIONS]
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
#### ontology-metadata 
Shows ontology metadata
Example:
runoak -i bioportal: ontology-metadata obi uberon foodon
Use the
`--all`
option to show all ontologies
Example:
runoak -i bioportal: ontology-metadata –all
By default the output is YAML. You can get the results as TSV:
Example:
runoak -i bioportal: ontology-metadata –all -O csv
Warning
The output data model is not yet standardized – this may change in future
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/basic
Usage
```shell
runoak ontology-metadata [OPTIONS] [ONTOLOGIES]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
--all
,
--no-all

If true, show all ontologies. Use in place of passing an explicit list
Default
:
`True`
Arguments
ONTOLOGIES

Optional argument(s)
#### ontology-versions 
Shows ontology versions
Currently only implemented for BioPortal
Example:
runoak -i bioportal: ontology-versions mp
All ontologies:
runoak -i bioportal ontology-versions –all
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/basic
Usage
```shell
runoak ontology-versions [OPTIONS] [ONTOLOGIES]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
--all
,
--no-all

If true, show all ontologies. Use in place of passing an explicit list
Default
:
`True`
Arguments
ONTOLOGIES

Optional argument(s)
#### paths 
List all paths between one or more start curies.
Example:
runoak -i sqlite:obo:go paths -p i,p ‘nuclear membrane’
This shows all shortest paths from nuclear membrane to all ancestors
Example:
runoak -i sqlite:obo:go paths -p i,p ‘nuclear membrane’ –target cytoplasm
This shows shortest paths between two nodes
Example:
runoak -i sqlite:obo:go paths -p i,p ‘nuclear membrane’ ‘thylakoid’ –target cytoplasm ‘thylakoid membrane’
This shows all shortest paths between 4 combinations of starts and ends
You can also use “@” to separate start node list and end node list. Like most OAK commands,
you can pass either explicit terms, or term queries. For example, if you have two files of IDs,
then you can do this:
runoak -i sqlite:obo:go paths -p i,p .idfile START_NODES.txt @ .idfile END_NODES.txt
You can also pass in weights for each predicate, used when calculating shortest paths.
Example:
runoak -i sqlite:obo:go paths -p i,p ‘nuclear membrane’ –target cytoplasm –predicate-weights “{i: 0.0001, p: 999}”
This shows all shortest paths after weighting relations
(Note: you can use the same shorthands as in the
–predicates
option)
This command can be combined with others to visualize the paths.
Example:
alias go=”runoak -i sqlite:obo:go”
go paths -p i,p ‘nuclear membrane’ –target cytoplasm –narrow | go viz –fill-gaps -
This visualizes the path by first exporting the path as a flat list, then passing the
results to viz, using the fill-gaps option.
More examples:
https://github.com/INCATools/ontology-access-kit/blob/main/docs/examples/Commands/Paths.ipynb
Usage
```shell
runoak paths [OPTIONS] [TERMS]...
```
Options
--target
<target>

end point of path
--narrow
,
--no-narrow

If true then output path is written a list of terms
Default
:
`False`
--viz
,
--no-viz

If true then generate a path graph from output
Default
:
`False`
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--exclude-predicates
<exclude_predicates>

A comma-separated list of predicates to exclude
-O
,
--output-type
<output_type>

Desired output type
--directed
,
--no-directed

only show directed paths
Default
:
`False`
--include-predicates
,
--no-include-predicates

show predicates between nodes
Default
:
`False`
--predicate-weights
<predicate_weights>

key-value pairs specified in YAML where keys are predicates or shorthands and values are weights
-S
,
--stylemap
<stylemap>

a json file to configure visualization. See
https://berkeleybop.github.io/kgviz-model/
-C
,
--configure
<configure>

overrides for stylemap, specified as yaml. E.g.
`
-C “styles: [filled, rounded]” `
-o
,
--output
<output>

Path to output file
Arguments
TERMS

Optional argument(s)
#### prefixes 
Shows prefix declarations.
All standard prefixes:
runoak prefixes
Specific prefixes:
runoak prefixes GO CL oio skos
By default, prefix maps are exported as simple pairwise TSVs.
Prefixes can also be exported in different formats, such as YAML and JSON, where they are
simple dictionaries:
In yaml:
runoak prefixes –O yaml
In turtle:
runoak prefixes –O rdf
For RDF exports, the prefix declaration should appear in BOTH prefix declarations, AND also as
instances of SHACL PrefixDeclarations, e.g.
@prefix CL: <
http://purl.obolibrary.org/obo/
CL_
> .
…
[] a sh:PrefixDeclaration ;
sh:namespace CL: ;
sh:prefix “CL” .
The default prefixmap is always used, unless options are passed specifying additional
prefix maps.
Example:
runoak –named-prefix-map prefixcc prefixes
If an ontology is loaded, then –used-only can be used to restrict to
prefixes for entities in that ontology
runoak -i sqlite:obo:cl prefixes –used-only
Usage
```shell
runoak prefixes [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

--used-only
,
--no-used-only

If True, show only prefixes used in ontology
Default
:
`False`
-O
,
--output-type
<output_type>

Desired output type
Arguments
TERMS

Optional argument(s)
#### query 
Execute an arbitrary query.
The syntax of the query is backend-dependent.
Usage
```shell
runoak query [OPTIONS]
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-q
,
--query
<query>

Main query, specified in adapter-specific language (SQL, SPARQL)
-L
,
--label-fields
<label_fields>

Comma-separated list of fields to use as labels
-P
,
--prefixes
<prefixes>

Comma-separated list of prefixes to expand
#### relationships 
Show all relationships for a term or terms
By default, this shows all relationships where the input term(s) are the
subjects
Example:
runoak -i cl.db relationships CL:4023094
Like all OAK commands, a label can be passed instead of a CURIE
Example:
runoak -i cl.db relationships neuron
To reverse the direction, and query where the search term(s) are
objects
, use the –direction flag:
Example:
runoak -i cl.db relationships –direction down neuron
Multiple terms can be passed
Example:
runoak -i uberon.db relationships heart liver lung
And like all OAK commands, a query can be passed rather than an explicit term list
The following query lists all arteries in the limb together which what structures they supply
Query:
runoak -i uberon.db relationships -p RO:0002178 .desc//p=i “artery” .and .desc//p=i,p “limb”
More examples:
https://github.com/INCATools/ontology-access-kit/blob/main/docs/examples/Commands/Relationships.ipynb
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/basic
Usage
```shell
runoak relationships [OPTIONS] [TERMS]...
```
Options
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--direction
<direction>

direction of traversal over edges, which up is subject to object, down is object to subject.
Options
:
up | down | both
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
--if-absent
<if_absent>

determines behavior when the value is not present or is empty.
Options
:
absent-only | present-only
-S
,
--set-value
<set_value>

the value to set for all terms for the given property.
--include-entailed
,
--no-include-entailed

Include entailed indirect relationships
Default
:
`False`
--non-redundant-entailed
,
--no-non-redundant-entailed

Include entailed but exclude entailed redundant relationships
Default
:
`False`
--include-tbox
,
--no-include-tbox

Include class-class relationships (subclass and existentials)
Default
:
`True`
--include-abox
,
--no-include-abox

Include instance relationships (class and object property assertions)
Default
:
`True`
--include-metadata
,
--no-include-metadata

Include metadata (axiom annotations)
Default
:
`False`
Arguments
TERMS

Optional argument(s)
#### rollup 
Produce an association rollup report.
The report will list associations where the subject is one of the terms provided. The
associations will be grouped by any provided –object-group options. This option can be
provided multiple times. If the value is a comma separated list of object IDs, the first
will be used as a primary grouping dimension and the remainder will be used to create
sub-groups.
Example:
runoak -i sqlite:go.db -g wb.gaf -G gaf rollup –object-group GO:0032502,GO:0007568,GO:0048869,GO:0098727 –object-group GO:0008152,GO:0009056,GO:0044238,GO:1901275 –object-group GO:0050896,GO:0051716,GO:0051606,GO:0051606,GO:0014823 –object-group=GO:0023052 –output rollup.html WB:WBGene00000417 WB:WBGene00000912 WB:WBGene00000898 WB:WBGene00006752
By default, is-a relationships between association objects are used to perform the rollup.
Use the -p/–predicates option to change this behavior.
Usage
```shell
runoak rollup [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
--object-group
<object_group>

An object ID to group by. If a comma separated list of IDs is provided, the first one is interpreted as a top-level grouping and the remaining IDs are interpreted as sub-groups within.
Arguments
TERMS

Optional argument(s)
#### roots 
List all root nodes in the ontology
Like all OAK relational commands, this is parameterized by –predicates (-p).
Note that the default is to return the roots of the relation graph over
all
predicates.
This can sometimes give unintuitive results, so we recommend always being explicit
and parameterizing
Example:
runoak -i db/cob.db roots
This command is a wrapper onto the “roots” command in the BasicOntologyInterface.
https://incatools.github.io/ontology-access-kit/interfaces/basic
.html#
oaklib.interfaces.basic_ontology_interface.BasicOntologyInterface.roots
Usage
```shell
runoak roots [OPTIONS]
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-P
,
--has-prefix
<has_prefix>

filter based on a prefix, e.g. OBI
-O
,
--output-type
<output_type>

Desired output type
-A
,
--annotated-roots
,
--no-annotated-roots
,
--no-A

If true, use annotated roots, if present
Default
:
`False`
#### search 
Searches ontology for entities that have a label, alias, or other property matching a search term.
Example:
runoak -i uberon.obo search limb
This uses the Pronto implementation to load uberon from disk, and does a basic substring
search over the labels and synonyms - results are not ranked
Bioportal (all ontologies):
runoak -i bioportal: search limb
(You need to set your API key first)
This uses the Bioportal API to search over a broad set of ontologies, returning a ranked list
ranked by relevance. There may be many results, the results are streamed, do ctrl^C to stop
Ubergraph (all ontologies):
runoak -i ubergraph: search limb
Ubergraph (one ontology):
runoak -i ubergraph:uberon search limb
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/search
Data model:
https://w3id.org/oak/search
Warning
The behavior of search is not yet fully unified across endpoints
Warning
The behavior of search is not yet fully unified across endpoints
Usage
```shell
runoak search [OPTIONS] [TERMS]...
```
Options
-O
,
--output-type
<output_type>

Desired output type
Options
:
obo | obojson | ofn | rdf | json | yaml | fhirjson | csv | tsv | nl
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
TERMS

Optional argument(s)
#### set-apikey 
Sets an API key
Example:
oak set-apikey -e bioportal MY-KEY-VALUE
This is stored in an OS-dependent path
Usage
```shell
runoak set-apikey [OPTIONS] KEYVAL
```
Options
-e
,
--endpoint
<endpoint>

Required
Name of endpoint, e.g. bioportal
Arguments
KEYVAL

Required argument
#### siblings 
List all siblings of a specified term or terms
Example:
runoak -i cl.owl siblings CL:4023094
Note that siblings is by default over ALL relationship types, so we recommend
always being explicit and passing a predicate using -p (–predicates)
Usage
```shell
runoak siblings [OPTIONS] [TERMS]...
```
Options
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
Options
:
obo | obojson | ofn | rdf | json | yaml | fhirjson | csv | tsv | nl
Arguments
TERMS

Optional argument(s)
#### similarity 
All by all similarity.
This calculates a similarity matrix for two sets of terms.
Input sets of a terms can be specified in different ways:
via a file
via explicit lists of terms or queries
Example:
runoak -i hp.db similarity -p i –set1-file HPO-TERMS1 –set2-file HPO-TERMS2 -O csv
This will compare every term in TERMS1 vs TERMS2
Alternatively standard OAK term queries can be used, with “@” separating the two lists
Example:
runoak -i hp.db similarity -p i TERM_1 TERM_2 … TERM_N @ TERM_N+1 … TERM_M
The .all term syntax can be used to select all terms in an ontology
Example:
runoak -i ma.db similarity -p i,p .all @ .all
This can be mixed with other term selectors; for example to calculate the similarity of “neuron”
vs all terms in CL:
runoak -i cl.db similarity -p i,p .all @ neuron
An example pipeline to do all by all over all phenotypes in HPO:
Explicit:
runoak -i hp.db descendants -p i HP:0000118 > HPO
runoak -i hp.db similarity -p i –set1-file HPO –set2-file HPO -O csv -o RESULTS.tsv
The same thing can be done more compactly with term queries:
runoak -i hp.db similarity -p i .desc//p=i HP:0000118 @ .desc//p=i HP:0000118
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/semantic-similarity
Data model:
https://w3id.org/oak/similarity
Usage
```shell
runoak similarity [OPTIONS] [TERMS]...
```
Options
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--set1-file
<set1_file>

ID file for set1
--set2-file
<set2_file>

ID file for set2
--min-jaccard-similarity
<min_jaccard_similarity>

Minimum value for jaccard score
--min-ancestor-information-content
<min_ancestor_information_content>

Minimum value for information content
-o
,
--output
<output>

path to output
--main-score-field
<main_score_field>

Score used for summarization
Default
:
`'phenodigm_score'`
--information-content-file
<information_content_file>

File containing information content for each term
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
Arguments
TERMS

Optional argument(s)
#### similarity-pair 
Determine pairwise similarity between two terms using a variety of metrics
NOTE: this command may be deprecated, consider using similarity
Note: We recommend always specifying explicit predicate lists
Example:
runoak -i ubergraph: similarity-pair -p i,p CL:0000540 CL:0000000
You can omit predicates if you like but be warned this may yield
hard to interpret results.
E.g.
runoak -i ubergraph: similarity-pair CL:0000540 GO:0001750
yields “fully formed stage” (i.e these are both found in the adult) as
the MRCA
For phenotype ontologies, UPHENO relationship types connect phenotype terms to anatomy, etc:
runoak -i ubergraph: similarity-pair MP:0010922 HP:0010616 -p i,p,UPHENO:0000001
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/semantic-similarity
Data model:
https://w3id.org/oak/similarity
Usage
```shell
runoak similarity-pair [OPTIONS] [TERMS]...
```
Options
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
Arguments
TERMS

Optional argument(s)
#### singletons 
List all singleton nodes in the ontology
Like all OAK relational commands, this is parameterized by –predicates (-p).
Note that the default is to return the singletons of the relation graph over
all
predicates
Obsoletes are filtered by default
Example:
runoak -i db/cob.db singletons
This command is a wrapper onto the “singletons” command in the BasicOntologyInterface.
https://incatools.github.io/ontology-access-kit/interfaces/basic
.html#
oaklib.interfaces.basic_ontology_interface.BasicOntologyInterface.singletons
Usage
```shell
runoak singletons [OPTIONS]
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--filter-obsoletes
,
--no-filter-obsoletes

If set, results will exclude obsoletes
Default
:
`True`
#### statistics 
Shows all descriptive/summary statistics
Example:
runoak -i sqlite:obo:pr statistics
By default, this will show combined summary statistics for all terms
You can also break down the statistics in two ways:
by a collection of branch roots
by a metadata property (e.g. oio:hasOBONamespace, rdfs:isDefinedBy)
by prefix (e.g. GO, PR, CL, OBI)
Example:
runoak -i sqlite:obo:pr statistics -p oio:hasOBONamespace
Note: the oio:hasOBONamespace is
not
the same as the ID prefix, it is
a field that is used by a subset of ontologies to partition classes into
broad groupings, similar to subsets. Its use is non-standard, yet a lot
of ontologies use this as the main partitioning mechanism.
A note on bundled ontologies:
The standard release many OBO ontologies “bundles” parts of other ontologies
(formally, the release product includes a merged imports closure of import
modules). This can complicate generation of statistics. A naive count of
all classes in the main OBI release will include not only “native” OBI classes,
but also classes from other ontologies that are bundled in the release.
For bundled ontologies, we recommend some kind of partitioning, such as via
defined roots, or via the CURIE prefix, using the
`--group-by-prefix`
option.
Output formats:
The recommended output types for this command are yaml, json, or csv.
The default output type is yaml, following the SummaryStatistics data model.
This is naturally nested, as the statistics includes faceted groupings
(e.g. edge counts are broken down by predicate). When specifying a flat
format like csv, this is flattened into a single table, with dynamic
column names.
Change statistics:
You can optionally combine the ontology statistics with a change
summary relative to another ontology, using the
`--compare-with`
option.
Example:
runoak -i v2.obo statistics –group-by-obo-namespace –compare-with v1.obo
This will also include change stats broken down by KGCL change types. If
a group-by option is specified, these will be grouped accordingly.
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/summary-statistics
Data model:
https://w3id.org/oak/summary-statistics
Usage
```shell
runoak statistics [OPTIONS] [BRANCHES]...
```
Options
-O
,
--output-type
<output_type>

Desired output type
Options
:
obo | obojson | ofn | rdf | json | yaml | fhirjson | csv | tsv | nl
--group-by-property
<group_by_property>

group summaries by a metadata property, e.g. rdfs:isDefinedBy
--group-by-obo-namespace
,
--no-group-by-obo-namespace

shortcut for –group-by-property oio:hasOBONamespace (note this is distinct from the ID namespace)
Default
:
`False`
--group-by-prefix
,
--no-group-by-prefix

shortcut for –group-by-property sh:prefix. Groups by the prefix of the CURIE
Default
:
`False`
--group-by-defined-by
,
--no-group-by-defined-by

shortcut for –group-by-property rdfs:isDefinedBy. This may be inferred from prefix if not set explicitly
Default
:
`False`
--include-residuals
,
--no-include-residuals

If true include an OTHER category for terms that do not have the property
-X
,
--compare-with
<compare_with>

Compare with another ontology
-P
,
--has-prefix
<has_prefix>

filter based on a prefix, e.g. OBI
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
BRANCHES

Optional argument(s)
#### subsets 
Shows information on subsets
Example:
runoak -i obolibrary:go.obo subsets
Example:
runoak -i cl.owl subsets
For background on subsets, see
https://incatools.github.io/ontology-access-kit/concepts.html#subsets
Note you can use subsets in selector queries for other commands; e.g. to fetch all
terms (directly) in goslim_generic in GO:
Example:
runoak -i sqlite:obo:go info .in goslim_generic
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/basic
See Also:
-
term-subsets command, which shows relationships of terms to subsets
Usage
```shell
runoak subsets [OPTIONS]
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
#### synonymize 
Deprecated: use generate-synonyms
Usage
```shell
runoak synonymize [OPTIONS] [TERMS]...
```
Options
-R
,
--rules-file
<rules_file>

path to rules file. Conforms to rules_datamodel. e.g.
https://github.com/INCATools/ontology-access-kit/blob/main/tests/input/matcher_rules.yaml
--apply-patch
,
--no-apply-patch

Apply KGCL syntax generated based on the synonymizer rules file.
Default
:
`False`
--patch
<patch>

Output patch file containing KGCL commands.
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
TERMS

Optional argument(s)
#### taxon-constraints 
Compute all taxon constraints for a term or terms.
This will apply rules using the inferred ancestors of subject terms, as well as inferred
ancestors/descendants of taxon terms.
The input ontology MUST include both the taxon constraint relationships AND the relevant portion
of NCBI Taxonomy
Example:
runoak -i db/go.db taxon-constraints
GO:0034357
–include-redundant -p i,p
Example:
runoak -i sqlite:obo:uberon taxon-constraints UBERON:0003884 UBERON:0003941 -p i,p
More examples:
https://github.com/INCATools/ontology-access-kit/blob/main/docs/examples/Commands/TaxonConstraints.ipynb
This command is a wrapper onto taxon_constraints_utils:
https://incatools.github.io/ontology-access-kit/src/oaklib.utilities.taxon.taxon_constraints_utils
Usage
```shell
runoak taxon-constraints [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-M
,
--graph-traversal-method
<graph_traversal_method>

Whether formal entailment or graph walking should be used.
Options
:
HOP | ENTAILMENT
-A
,
--all
,
--no-A
,
--no-all

if specified then perform for all terms
Default
:
`False`
--include-redundant
,
--no-include-redundant

if specified then include redundant taxon constraints from ancestral subjects
Default
:
`False`
--direct
,
--no-direct

only include directly asserted taxon constraints
Default
:
`False`
Arguments
TERMS

Optional argument(s)
#### term-categories 
List categories for a term or set of terms.
Usage
```shell
runoak term-categories [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
--category-system
<category_system>

Example: biolink, cob, bfo, dbpedia, …
Arguments
TERMS

Optional argument(s)
#### term-metadata 
Shows term metadata.
Example:
runoak -i sqlite:obo:uberon term-metadata lung heart
You can filter the results for only selected predicates:
runoak -i sqlite:obo:uberon term-metadata lung heart -p id,oio:hasDbXref
The default output is YAML documents, where each YAML document is a term, with
keys representing selected predicates. Values are always lists of atoms, even
when there is typically one value (e.g. rdfs:label)
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/basic
Data model:
https://w3id.org/oak/ontology-metadata
Usage
```shell
runoak term-metadata [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
--additional-metadata
,
--no-additional-metadata

if true then fetch additional metadata about statements stored as OWL reification
Default
:
`False`
Arguments
TERMS

Optional argument(s)
#### term-subsets 
List subsets for a term or set of terms.
Example:
runoak -i sqlite:obo:uberon term-subsets heart lung
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/basic
Usage
```shell
runoak term-subsets [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
Arguments
TERMS

Optional argument(s)
#### terms 
List all terms in the ontology
Example:
runoak -i db/cob.db terms
All terms without obsoletes:
runoak -i prontolib:cl.obo terms –filter-obsoletes
By default “terms” is considered to be any entity type in the ontology. Use –owl-type to constrain this:
Classes:
runoak -i sqlite:obo:ro terms –owl-type owl:Class
Relationship types (Object properties):
runoak -i sqlite:obo:ro terms –owl-type owl:ObjectProperty
Annotation properties:
runoak -i sqlite:obo:omo terms –owl-type owl:AnnotationProperty
Usage
```shell
runoak terms [OPTIONS]
```
Options
--filter-obsoletes
,
--no-filter-obsoletes

If set, results will exclude obsoletes
Default
:
`True`
-o
,
--output
<output>

Output file, e.g. obo file
--owl-type
<owl_type>

only include entities of this type, e.g. owl:Class, rdf:Property
#### termset-similarity 
Termset similarity.
This calculates a similarity matrix for two sets of terms.
Example:
runoak -i go.db termset-similarity -p i,p nucleus membrane @ “nuclear membrane” vacuole -p i,p
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/semantic-similarity
Data model:
https://w3id.org/oak/similarity
Usage
```shell
runoak termset-similarity [OPTIONS] [TERMS]...
```
Options
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
--information-content-file
<information_content_file>

File containing information content for each term
Arguments
TERMS

Optional argument(s)
#### transform 
Applies a defined transformation to an ontology (EXPERIMENTAL).
Transformations include:
SEPTransform: implements Structured-Entities-Parts (SEP) design pattern
EdgeFilterTransformer: filters edges based on a predicate
Note that for most transformation operations, we recommend using ROBOT
and commands such as remove, filter, query.
Example:
runoak -i xao.obo transform -t SEPTransform -o xao.sep.obo
Removes all P part-of Ws from XAO and replaces occurrences with triads of the form:
W subClassOf W-structure
W subClassOf W-structure
W-Part subClassOf W-structure
P subClassOf W-Part
Usage
```shell
runoak transform [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Path to output file
-O
,
--output-type
<output_type>

Desired output type
-c
,
--config-file
<config_file>

Config file for additional transform params.
-t
,
--transform
<transform>

Required
Name of transformation to apply.
Arguments
TERMS

Optional argument(s)
#### tree 
Display an ancestor graph as an ascii/markdown tree.
For general instructions, see the viz command, which this is analogous too.
Example:
runoak -i envo.db tree ENVO:00000372 -p i,p
This produces output like:
.packages:
```default
* [i] ENVO:00000094 ! volcanic feature
    * [i] ENVO:00000247 ! volcano
        * [i] ENVO:00000403 ! shield volcano
            * [i] **ENVO:00000372 ! pyroclastic shield volcano**
```
Note: for many ontologies the tree view will explode, especially if no predicates are specified.
You may wish to start with the is-a tree (-p i).
You can use the –gap-fill option to create a minimal tree:
Example:
runoak -i envo.db tree –gap-fill ‘pyroclastic shield volcano’ ‘subglacial volcano’ volcano -p i
This will show the tree containing only these terms, and the most direct inferred relationships between them.
You can also give a list of leaf terms and specify –add-mrcas alongside –gap-fill to fill in
the most informative intermediate classes:
Example:
runoak -i envo.db tree –add-mrcas –gap-fill ‘pyroclastic shield volcano’ ‘subglacial volcano’ ‘mud volcano’ -p i
This will fill in the term “volcano”, as it is the most recent common ancestor of the specified terms
The –max-hops option can control the distance
runoak -i envo.db tree ‘pyroclastic shield volcano’ ‘subglacial volcano’ –max-hops 1 -p i
This will generate:
[] ENVO:00000247 ! volcano
[i] ENVO:00000403 ! shield volcano
[i]
ENVO:00000372 ! pyroclastic shield volcano
[i]
ENVO:00000407 ! subglacial volcano
Note that ‘volcano’ is the root, even though it is 2 hops from one of the terms, it can be connected
to at least one of the seeds (highlighted with asterisks) by a path of length 1.
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/obograph
Data model:
https://w3id.org/oak/obograph
Usage
```shell
runoak tree [OPTIONS] [TERMS]...
```
Options
--down
,
--no-down

traverse down
Default
:
`False`
--gap-fill
,
--no-gap-fill

If set then find the minimal graph that spans all input curies
Default
:
`False`
--add-mrcas
,
--no-add-mrcas

If set then extend input seed list to include all pairwise MRCAs
Default
:
`False`
-S
,
--stylemap
<stylemap>

a json file to configure visualization. See
https://berkeleybop.github.io/kgviz-model/
-C
,
--configure
<configure>

overrides for stylemap, specified as yaml. E.g.
`
-C “styles: [filled, rounded]” `
--max-hops
<max_hops>

Trim nodes that are equal to or greater than this distance from terms
--skip
<skip>

Exclude paths that contain this node
--root
<root>

Use this node or nodes as roots
-D
,
--display
<display>

A comma-separated list of display options. Use ‘all’ for all
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
TERMS

Optional argument(s)
#### usages 
List usages of a term or set of terms.
Usages of neuron in GO:
runoak -i sqlite:obo:go usages CL:0000540
Association/annotations sources can also be used:
runoak -i quickgo: usages
GO:0031969
Note this query may be slow - you can restrict to a species:
runoak -i quickgo:NCBITaxon:9606 usages GO:0031969
(this should return no results, as there should be no human proteins annotated
to chloroplast membrane)
Using amigo:
runoak -i amigo: usages
GO:0031969
Using ubergraph:
runoak -i ubergraph: usages CL:0000540
This will include usages over multiple ontologies
Using ontobee:
runoak -i ubergraph: usages CL:0000540
You can multiple queries over multiple sources (an AggregatorImplementation):
runoak -i sqlite:obo:go -a ubergraph: -a amigo: -a quickgo: usages GO:0031969
Usage
```shell
runoak usages [OPTIONS] [TERMS]...
```
Options
-o
,
--output
<output>

Output file, e.g. obo file
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
-P
,
--used-by-prefix
<used_by_prefix>

--include-unused
,
--no-include-unused

Default
:
`True`
Arguments
TERMS

Optional argument(s)
#### validate 
Validate an ontology against ontology metadata
Implementation notes: Currently only works on SQLite
Example:
runoak -i db/ecto.db validate -o results.tsv
The default validation performed is structural (conformance to the ontology_metadata schema)
There is experimental support for additional ontology rules, which includes heuristic methods
such as aligning text and logical definitions. These are off by default.
To run these, pass –no-skip-ontology-rules
Example:
runoak -i db/uberon.db validate –skip-structural-validation –no-skip-ontology-rules
For more information, see the OAK how-to guide:
https://incatools.github.io/ontology-access-kit/howtos/validate-an-obo-ontology.html
Usage
```shell
runoak validate [OPTIONS] [TERMS]...
```
Options
--cutoff
<cutoff>

maximum results to report for any (type, predicate) pair
Default
:
`50`
--skip-structural-validation
,
--no-skip-structural-validation

If true, main structural validation checks are skipped
Default
:
`False`
--skip-ontology-rules
,
--no-skip-ontology-rules

If true, ontology rules are skipped
Default
:
`True`
-R
,
--rule
<rule>

A rule to run. Can be specified multiple times. If not specified, all rules are run.
-o
,
--output
<output>

Output file, e.g. obo file
-O
,
--output-type
<output_type>

Desired output type
Arguments
TERMS

Optional argument(s)
#### validate-definitions 
Checks presence and structure of text definitions.
To run:
runoak validate-definitions -i db/uberon.db -o results.tsv
By default this will apply basic text mining of text definitions to check
against machine actionable OBO text definition guideline rules.
This can result in an initial lag - to skip this, and ONLY perform
checks for
presence
of definitions, use –skip-text-annotation:
Example:
runoak validate-definitions -i db/uberon.db –skip-text-annotation
Like most OAK commands, this accepts lists of terms or term queries
as arguments. You can pass in a CURIE list to selectively validate
individual classes
Example:
runoak validate-definitions -i db/cl.db CL:0002053
Only on CL identifiers:
runoak validate-definitions -i db/cl.db i^CL:
Only on neuron hierarchy:
runoak validate-definitions -i db/cl.db .desc//p=i neuron
Output format:
This command emits objects conforming to the OAK validation datamodel.
See
https://incatools.github.io/ontology-access-kit/datamodels
for more
on OAK datamodels.
The default serialization of the datamodel is CSV.
##### Notes: 
This command is largely redundant with the validate command, but is useful for
targeted validation focused solely on definitions
Usage
```shell
runoak validate-definitions [OPTIONS] [TERMS]...
```
Options
--skip-text-annotation
,
--no-skip-text-annotation

If true, do not parse text annotations
Default
:
`False`
-C
,
--configuration-file
<configuration_file>

Path to a configuration file. This is typically a YAML file, but may be a JSON file
--adapter-mapping
<adapter_mapping>

Multiple prefix=selector pairs, e.g. –adapter-mapping uberon=db/uberon.db
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
TERMS

Optional argument(s)
#### validate-mappings 
Validates mappings in ontology using additional ontologies.
To run:
runoak validate-mappings -i db/uberon.db
For sssom:
runoak validate-mappings -i db/uberon.db -o bad-mappings.sssom.tsv
By default this will attempt to download and connect to
sqlite versions of different ontologies, when attempting to resolve a foreign
subject or object id.
You can customize this mapping:
runoak validate-mappings -i db/uberon.db –adapter-mapping uberon=db/uberon.db –adapter-mapping zfa=db/zfa.db
This will use a local sqlite file for ZFA:nnnnnnn IDs.
You can use “*” as a wildcard, in the case where you have an application ontology
with many mapped entities merged in:
runoak validate-mappings -i db/uberon.db –adapter-mapping “*”=db/merged.db”
The default behavior for this command is to perform deterministic rule-based
checks; for example, the mapped IDs should not be obsolete, and if the mapping
is skos:exactMatch, then the cardinality is expected to be 1:1.
Other adapters may choose to implement bespoke behaviors. In future there
might be a boomer adapter that will perform probabilistic reasoning on the
mappings. The experimental LLM backend will use an LLM to qualitatively
validate mappings (see the LLM how-to guide for more details).
Usage
```shell
runoak validate-mappings [OPTIONS] [TERMS]...
```
Options
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
--adapter-mapping
<adapter_mapping>

Multiple prefix=selector pairs, e.g. –adapter-mapping uberon=db/uberon.db
-o
,
--output
<output>

Output file, e.g. obo file
-C
,
--configuration-file
<configuration_file>

Path to a configuration file. This is typically a YAML file, but may be a JSON file
Arguments
TERMS

Optional argument(s)
#### validate-multiple 
Validate multiple ontologies against ontology metadata
See the validate command - this is the same except you can pass a list of databases
For more information, see the OAK how-to guide:
https://incatools.github.io/ontology-access-kit/howtos/validate-an-obo-ontology.html
Usage
```shell
runoak validate-multiple [OPTIONS] [DBS]...
```
Options
--cutoff
<cutoff>

maximum results to report for any (type, predicate) pair
Default
:
`50`
-s
,
--schema
<schema>

Path to schema (if you want to override the bundled OMO schema)
-o
,
--output
<output>

Output file, e.g. obo file
Arguments
DBS

Optional argument(s)
#### validate-subset 
Validates term subsets.
The default metrics used for evaluation involve calculating the degree of overlap between members of the
subset. Subsets in general should partition the ontology into sets that overlap as little as possible.
Different overlap metrics can be plugged in, see the information-content methods for more details.
The simplest way to run this is to pass in a list of terms via a subset query
runoak -i po.db validate-subset p i,p .in Tomato
You can also calculate IC scores for each term and pass them in via a file:
runoak -i amigo:NCBITaxon:9606 information-content -o human-ic.tsv
Then
runoak -i go.db validate-subset p i,p .in goslim_generic –information-content-file human-ic.tsv
This command also understand the GO subset metadata format. You can use this as configuration for
validating multiple subsets:
runoak -i go.db validate-subset –config-yaml go_subsets_metadata.yaml -X “i^BFO:” -O yaml
The taxon field is used to validate each subset according to its appropriate context
Usage
```shell
runoak validate-subset [OPTIONS] [TERMS]...
```
Options
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
--adapter-mapping
<adapter_mapping>

Multiple prefix=selector pairs, e.g. –adapter-mapping uberon=db/uberon.db
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-X
,
--exclude-query
<exclude_query>

A query to exclude certain terms
--information-content-file
<information_content_file>

File containing information content for each term
--information-content-adapter
<information_content_adapter>

Adapter to use for information content scores
--config-yaml
<config_yaml>

-o
,
--output
<output>

Output file, e.g. obo file
-C
,
--configuration-file
<configuration_file>

Path to a configuration file. This is typically a YAML file, but may be a JSON file
Arguments
TERMS

Optional argument(s)
#### validate-synonyms 
Validates synonyms in ontology using additional ontologies.
To run:
runoak validate-synonyms -i db/uberon.db
You can customize this mapping:
runoak validate-synonyms -i db/uberon.db –adapter-mapping uberon=db/uberon.db –adapter-mapping zfa=sqlite:obo:zfa
This will use a remote sqlite file for ZFA:nnnnnnn IDs.
You can use “*” as a wildcard, in the case where you have an application ontology
with many mapped entities merged in:
runoak validate-synonyms -i db/uberon.db –adapter-mapping “*”=db/merged.db”
You can also pass synonymizer rules. For example:
runoak -i sqlite:obo:go validate-synonyms -R go-strip-activity.synonymizer.yaml GO:0000010 –adapter-mapping ec=sqlite:obo:eccode
In this case if the synonymizer rule file contains:

rules:
match: ” activity”
replacement: “”

Then the GO synonyms will have the word “activity” stripped from them, prior to attempting
to match with EC.
The default behavior for this command is to perform deterministic rule-based
checks; for example, the mapped IDs should not be obsolete, and if the mapping
is skos:exactMatch, then the cardinality is expected to be 1:1.
Other adapters may choose to implement bespoke behaviors. In future there
might be a boomer adapter that will perform probabilistic reasoning on the
mappings. The experimental LLM backend will use an LLM to qualitatively
validate mappings (see the LLM how-to guide for more details).
Usage
```shell
runoak validate-synonyms [OPTIONS] [TERMS]...
```
Options
--autolabel
,
--no-autolabel

If set, results will automatically have labels assigned
Default
:
`True`
-O
,
--output-type
<output_type>

Desired output type
--adapter-mapping
<adapter_mapping>

Multiple prefix=selector pairs, e.g. –adapter-mapping uberon=db/uberon.db
-o
,
--output
<output>

Output file, e.g. obo file
-C
,
--configuration-file
<configuration_file>

Path to a configuration file. This is typically a YAML file, but may be a JSON file
-R
,
--rules-file
<rules_file>

path to rules file. Conforms to rules_datamodel. e.g.
https://github.com/INCATools/ontology-access-kit/blob/main/tests/input/matcher_rules.yaml
Arguments
TERMS

Optional argument(s)
#### viz 
Visualize an ancestor graph using
obographviz
For general background on what is meant by a graph in OAK,
see
https://incatools.github.io/ontology-access-kit/interfaces/obograph
Note
This requires that
obographviz
is installed.
Example:
runoak -i sqlite:cl.db viz CL:4023094
Same query on ubergraph:
runoak -i ubergraph: viz CL:4023094
Example, showing only is-a:
runoak -i sqlite:cl.db viz CL:4023094 -p i
Example, showing only is-a and part-of, to include Uberon:
runoak -i sqlite:cl.db viz CL:4023094 -p i,p
As above, including develops-from:
runoak -i sqlite:cl.db viz CL:4023094 -p i,p,RO:0002202
With abbreviation:
runoak -i sqlite:cl.db viz CL:4023094 -p i,p,d
We can also limit the number of “hops” from the seed terms; for
example, all is-a and develops-from ancestors of T-cell, limiting
to a distance of 2:
runoak -i sqlite:cl.db viz ‘T cell’ -p i,d –max-hops 2
Python API:
https://incatools.github.io/ontology-access-kit/interfaces/obograph
Data model:
https://w3id.org/oak/obograph
Usage
```shell
runoak viz [OPTIONS] [TERMS]...
```
Options
--view
,
--no-view

if view is set then open the image after rendering
Default
:
`True`
--down
,
--no-down

traverse down
Default
:
`False`
--gap-fill
,
--no-gap-fill

If set then find the minimal graph that spans all input curies
Default
:
`False`
--add-mrcas
,
--no-add-mrcas

If set then extend input seed list to include all pairwise MRCAs
Default
:
`False`
-S
,
--stylemap
<stylemap>

a json file to configure visualization. See
https://berkeleybop.github.io/kgviz-model/
-C
,
--configure
<configure>

overrides for stylemap, specified as yaml. E.g.
`
-C “styles: [filled, rounded]” `
--max-hops
<max_hops>

Trim nodes that are equal to or greater than this distance from terms
--meta
,
--no-meta

Add metadata object to graph nodes, including xrefs, definitions
Default
:
`False`
-p
,
--predicates
<predicates>

A comma-separated list of predicates. This may be a shorthand (i, p) or CURIE
-O
,
--output-type
<output_type>

Desired output type
-o
,
--output
<output>

Path to output file
Arguments
TERMS

Optional argument(s)
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