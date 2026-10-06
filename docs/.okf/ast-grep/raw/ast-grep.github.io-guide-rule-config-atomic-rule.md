Are you an LLM? You can read better optimized documentation at /guide/rule-config/atomic-rule.md for this page in Markdown format
# Atomic Rule ​
ast-grep has three categories of rules. Let's start with the most basic one: atomic rule.
Atomic rule defines the most basic matching rule that determines whether one syntax node matches the rule or not. There are five kinds of atomic rule:
`pattern`
,
`kind`
,
`regex`
,
`nthChild`
and
`range`
.
## pattern ​
Pattern will match one single syntax node according to the
pattern syntax
.
yaml
```yaml
rule:
  pattern: console.log($GREETING)
```
The above rule will match code like
`console.log('Hello World')`
.
By default, a
string
`pattern`
is parsed and matched as a whole.
### Pattern Object ​
It is not always possible to select certain code with a simple string pattern. A pattern code can be invalid, incomplete or ambiguous for the parser since it lacks context.
For example, to select class field in JavaScript, writing
`$FIELD = $INIT`
will not work because it will be parsed as
`assignment_expression`
. See
playground
.
We can also use an
object
to specify a sub-syntax node to match within a larger context. It consists of an object with three properties:
`context`
,
`selector`
and
`strictness`
.
`context`
(required): defines the surrounding code that helps to resolve any ambiguity in the syntax.
`selector`
(optional): defines the sub-syntax node kind that is the actual matcher of the pattern.
`strictness`
(optional): defines how strictly pattern will match against nodes.
Let's see how pattern object can solve the ambiguity in the class field example above.
The pattern object below instructs ast-grep to select the
`field_definition`
node as the pattern target.
yaml
```yaml
pattern:
  selector: field_definition
  context: class A { $FIELD = $INIT }
```
ast-grep works like this:
First, the code in
`context`
,
`class A { $FIELD = $INIT }`
, is parsed as a class declaration.
Then, it looks for the
`field_definition`
node, specified by
`selector`
, in the parsed tree.
The selected
`$FIELD = $INIT`
is matched against code as the pattern.
In this way, the pattern is parsed as
`field_definition`
instead of
`assignment_expression`
. See
playground
in action.
Other examples are
function call in Go
and
function parameter in Rust
.
### strictness ​
You can also use pattern object to control the matching strategy with
`strictness`
field.
By default, ast-grep uses a smart strategy to match pattern against the AST node. All nodes in the pattern must be matched, but it will skip unnamed nodes in target code.
For the definition of
named
and
unnamed
nodes, please refer to the
core concepts
doc.
For example, the following pattern
`function $A() {}`
will match both plain function and async function in JavaScript. See
playground
js
```js
// function $A() {}
function foo() {}    // matched
async function bar() {} // matched
```
This is because the keyword
`async`
is an unnamed node in the AST, so the
`async`
in the code to search is skipped. As long as
`function`
,
`$A`
and
`{}`
are matched, the pattern is considered matched.
However, this is not always the desired behavior. ast-grep provides
`strictness`
to control the matching strategy. At the moment, it provides these options, ordered from the most strict to the least strict:
`cst`
: All nodes in the pattern and target code must be matched. No node is skipped.
`smart`
: All nodes in the pattern must be matched, but it will skip unnamed nodes in target code. This is the default behavior.
`ast`
: Only named AST nodes in both pattern and target code are matched. All unnamed nodes are skipped.
`relaxed`
: Named AST nodes in both pattern and target code are matched. Comments and unnamed nodes are ignored.
`signature`
: Only named AST nodes' kinds are matched. Comments, unnamed nodes and text are ignored.
Deep Dive and More Examples
`strictness`
is an advanced feature that you may not need in most cases.
If you are interested in more examples and details, please refer to the
deep dive
doc on ast-grep's match algorithm.
## kind ​
Sometimes it is not easy to write a pattern because it is hard to construct the valid syntax.
For example, if we want to match class property declaration in JavaScript like
`class A { a = 1 }`
, writing
`a = 1`
will not match the property because it is parsed as assigning to a variable.
Instead, we can use
`kind`
to specify the AST node type defined in
tree-sitter parser
.
`kind`
rule accepts the tree-sitter node's name, like
`if_statement`
and
`expression`
. You can refer to
ast-grep playground
for relevant
`kind`
names.
Back to our example, we can look up class property's kind from the playground.
yaml
```yaml
rule:
  kind: field_definition
```
It will match the following code successfully (
playground link
).
js
```js
class Test {
  a = 123 // match this line
}
```
Here are some situations that you can effectively use
`kind`
:
Pattern code is ambiguous to parse, e.g.
`{}`
in JavaScript can be either object or code block.
It is too hard to enumerate all patterns of an AST kind node, e.g. matching all Java/TypeScript class declaration will need including all modifiers, generics,
`extends`
and
`implements`
.
Patterns only appear within specific context, e.g. the class property definition.
`kind`
+
`pattern`
is different from pattern object
You may want to use
`kind`
to change how
`pattern`
is parsed. However, ast-grep rules are independent of each other.
To change the parsing behavior of
`pattern`
, you should use pattern object with
`context`
and
`selector`
field. See
this FAQ
.
### ESQuery style kind ​
From ast-grep v0.39.1, you can also use ESQuery style selector in
`kind`
to match AST nodes.
yaml
```yaml
rule:
  kind: call_expression > identifier
```
This will match the
`identifier`
node that is a child of
`call_expression`
node. Internally, it will be converted to a
relational rule
`has`
.
See
ESQuery style kind
for supported selectors and their equivalent rule objects.
## regex ​
The
`regex`
atomic rule searches the node's full text, including its children, using a Rust regular expression. A match anywhere in the text satisfies the rule; use
`^`
and
`$`
to match the entire text.
yaml
```yaml
rule:
  regex: "\w+"
```
TIP
The regular expression is written in
Rust syntax
, not the popular
PCRE like syntax
. So some features are not available like arbitrary look-ahead and back references.
You should almost always combine
`regex`
with other atomic rules to make sure the regular expression is applied to the correct AST node. Regex matching is quite expensive and cannot be optimized based on AST node kinds. While
`kind`
and
`pattern`
rules can be only applied to nodes with specific
`kind_id`
for optimized performance.
TIP
You can use
Rust‑style inline flags
, for example:
yaml
```yaml
rule:
  regex: "(?i)apple"
```
This matches Apple as well as apple or APPLE.
## nthChild ​
`nthChild`
is a rule to find nodes based on their indexes in the parent node's children list. In other words, it selects nodes based on their position among all sibling nodes within a parent node. It is very helpful in finding nodes without children or nodes appearing in specific positions.
`nthChild`
is heavily inspired by CSS's
`nth-child`
pseudo-class
, and it accepts similar forms of arguments.
yaml
```yaml
# a number to match the exact nth child
nthChild: 3

# An+B style string to match position based on formula
nthChild: 2n+1

# object style nthChild rule
nthChild:
  # accepts number or An+B style string
  position: 2n+1
  # optional, count index from the end of sibling list
  reverse: true # default is false
  # optional, filter the sibling node list based on rule
  ofRule:
    kind: function_declaration # accepts ast-grep rule
```
TIP
`nthChild`
's index is 1-based, not 0-based, as in the CSS selector.
`nthChild`
's node list only includes named nodes, not unnamed nodes.
Example
The
following rule
will match the second number in the JavaScript array.
yaml
```yaml
rule:
  kind: number
  nthChild: 2
```
It will match the following code:
js
```js
const arr = [ 1, 2, 3, ]
            //   |- match this number
```
## range ​
`range`
is a rule to match nodes based on their position in the source code. It is useful when you want to integrate external tools like compilers or type checkers with ast-grep. External tools can provide the range information of the interested node, and ast-grep can use it to rewrite the code.
`range`
rule accepts a range object with
`start`
and
`end`
fields. Each field is an object with
`line`
and
`column`
fields.
yaml
```yaml
rule:
  range:
    start:
      line: 0
      column: 0
    end:
      line: 1
      column: 5
```
The above example will match an AST node having the first three characters of the first line like
`foo`
in
`foo.bar()`
.
`line`
and
`column`
are 0-based and character-wise, and the
`start`
is inclusive while the
`end`
is exclusive.
## Tips for Writing Rules ​
Since one rule will have
only one
AST node in one match, it is recommended to first write the atomic rule that matches the desired node.
Suppose we want to write a rule which finds functions without a return type. For example, this code would trigger an error:
ts
```ts
const foo = () => {
	return 1;
}
```
The first step to compose a rule is to find the target. In this case, we can first use kind:
`arrow_function`
to find function node. Then we can use other rules to filter candidate nodes that does have return type.
Another trick to write cleaner rule is to use sub-rules as fields. Please refer to
composite rule
for more details.