Are you an LLM? You can read better optimized documentation at /guide/rule-config/relational-rule.md for this page in Markdown format
# Relational Rules ​
Atomic rule can only match the target node directly. But sometimes we want to match a node based on its surrounding nodes. For example, we want to find
`await`
expression inside a
`for`
loop.
Relational rules are powerful operators that can filter the
target
nodes based on their
surrounding
nodes.
ast-grep now supports four kinds of relational rules:
`inside`
,
`has`
,
`follows`
, and
`precedes`
.
All four relational rules accept a sub rule object as their value. The sub rule will match the surrounding node while the relational rule itself will match the target node.
## Relational Rule Example ​
Having an
`await`
expression inside a for loop is usually a bad idea because every iteration will have to wait for the previous promise to resolve.
We can use the relational rule
`inside`
to filter out the
`await`
expression.
yaml
```yaml
rule:
  pattern: await $PROMISE
  inside:
    kind: for_in_statement
    stopBy: end
```
The rule reads as "matches an
`await`
expression that is
`inside`
a
`for_in_statement`
". See
Playground
.
The relational rule
`inside`
accepts a rule and will match any node that is inside another node that satisfies the inside rule. The
`inside`
rule itself matches
`await`
and its sub rule
`kind`
matches the surrounding loop.
## Relational Rule's Sub Rule ​
Since relational rules accept another ast-grep rule, we can compose more complex examples by using operators recursively.
yaml
```yaml
rule:
  pattern: await $PROMISE
  inside:
    any:
      - kind: for_in_statement
      - kind: for_statement
      - kind: while_statement
      - kind: do_statement
    stopBy: end
```
The above rule will match different kinds of loops, like
`for`
,
`for-in`
,
`while`
and
`do-while`
.
So all the code below matches the rule:
js
```js
while (foo) {
  await bar()
}
for (let i = 0; i < 10; i++) {
  await bar()
}
for (let key in obj) {
  await bar()
}
do {
  await bar()
} while (condition)
```
See in
playground
.
Pro Tip
You can also use
`pattern`
in relational rule! The metavariable matched in relational rule can also be used in
`fix`
. This will effectively let you extract a child node from a match.
## Relational Rule Mnemonics ​
The four relational rules can read as:
`inside`
: the
target
node must be
inside
a node that matches the sub rule.
`has`
: the
target
node must
have
a child node specified by the sub rule.
`follows`
: the
target
node must
follow
a node specified by the sub rule. (target after surrounding)
`precedes`
: the
target
node must
precede
a node specified by the sub rule. (target before surrounding).
It is sometimes confusing to remember whether the rule matches target node or surrounding node. Here is the mnemonics to help you read the rule.
First, relational rule is usually used along with another rule.
Second, the other rule will match the target node.
Finally, the relational rule's sub rule will match the surrounding node.
Together, the rule specifies that the target node will
`be inside`
or
`follows`
the surrounding node.
TIP
All relational rule takes the form of
`target`
`relates`
to
`surrounding`
.
For example, the rule below will match
`hello`
(target)
greeting that
follows(relation)
a
`world`
(surrounding)
greeting.
yaml
```yaml
pattern: console.log('hello');
follows:
  pattern: console.log('world');
```
Consider the
input source code
. Only the second
`console.log('hello')`
will match the rule.
javascript
```javascript
console.log('hello'); // does not match
console.log('world');
console.log('hello'); // matches!!
```
## Fine Tuning Relational Rule ​
Relational rule has several options to let you find nodes more precisely.
### stopBy ​
By default, relational rule will only match nodes one level further. For example, ast-grep will only match the direct children of the target node for the
`has`
rule.
You can change the behavior by using the
`stopBy`
field. It accepts three kinds of values: string
`'end'`
, string
`'neighbor'`
(the default option), and a rule object.
`stopBy: end`
will make ast-grep search surrounding nodes until it reaches the end. For example, it stops when the rule hits root node, leaf node or the first/last sibling node.
yaml
```yaml
has:
  stopBy: end
  pattern: $MY_PATTERN
```
`stopBy`
can also accept a custom rule object, so the searching will only stop when the rule matches the surrounding node.
yaml
```yaml
# find if a node is inside a function called test. It stops whenever the ancestor node is a function.
inside:
  stopBy:
    kind: function
  pattern: function test($$$) { $$$ }
```
Note the
`stopBy`
rule is inclusive. So when both
`stopBy`
rule and relational rule hit a node, the node is considered as a match.
### field ​
Sometimes it is useful to specify the node by its field. Suppose we want to find a JavaScript object property with the key
`prototype`
, an outdated practice that we should avoid.
yaml
```yaml
kind: pair # key-value pair in JS
has:
  field: key # note here
  regex: 'prototype'
```
This rule will match the following code
js
```js
var a = {
  prototype: anotherObject
}
```
but will not match this code
js
```js
var a = {
  normalKey: prototype
}
```
Though
`pair`
has a child with text
`prototype`
in the second example, its relative field is not
`key`
. That is,
`prototype`
is not used as
`key`
but instead used as value. So it does not match the rule.