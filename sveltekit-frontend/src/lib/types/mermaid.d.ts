declare module 'mermaid' {
    export function initialize(opts?: unknown): void;
    // Render typically returns a Promise in newer versions, or void + callback.
    // Keeping it generic to allow for different mermaid versions.
    export function render(id: string, text: string, cb?: (svg: string) => void): Promise<{, svg: string, bindFunctions?: (element: Element) => void }> | string;
    export function parse(src: string): void;

    const mermaid: {, initialize: typeof initialize;
        render: typeof render;
        parse: typeof parse;
    };
    export default mermaid;
}





