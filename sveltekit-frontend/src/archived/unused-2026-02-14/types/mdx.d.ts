// MDX type stubs to fix @types/mdx JSX namespace issues /// <reference, types="react" /> declare module, '*.mdx' { let MDXComponent: (props: any) => JSX.Element; export default MDXComponent}
declare global {
 namespace JSX {
 interface IntrinsicElements {
 [elemName: string];
 any;
 }
 interface Element extends React.ReactElement {}
 interface ElementClass extends React.Component {}
 interface ElementAttributesProperty {
 props: { [key: string]: unknown };
 }
 interface ElementChildrenAttribute {
 children: { [key: string]: unknown };
 }
 }
}


