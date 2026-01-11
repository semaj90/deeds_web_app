// Type augmentation for bits-ui v2.14.4 namespace exports
// Fixes: Property 'Root' does not exist on type 'typeof import("bits-ui")'

declare module "bits-ui" {
  import type { Component } from "svelte";

  // Button
  export namespace Button {
    export const Root: Component<any>;
  }

  // Checkbox
  export namespace Checkbox {
    export const Root: Component<any>;
    export const Indicator: Component<any>;
  }

  // Select
  export namespace Select {
    export const Root: Component<any>;
    export const Trigger: Component<any>;
    export const Value: Component<any>;
    export const Portal: Component<any>;
    export const Content: Component<any>;
    export const Group: Component<any>;
    export const Label: Component<any>;
    export const Item: Component<any>;
    export const ItemIndicator: Component<any>;
    export const Separator: Component<any>;
  }

  // DropdownMenu
  export namespace DropdownMenu {
    export const Root: Component<any>;
    export const Trigger: Component<any>;
    export const Portal: Component<any>;
    export const Content: Component<any>;
    export const Group: Component<any>;
    export const Label: Component<any>;
    export const Item: Component<any>;
    export const Separator: Component<any>;
  }

  // Tooltip
  export namespace Tooltip {
    export const Root: Component<any>;
    export const Trigger: Component<any>;
    export const Content: Component<any>;
    export const Arrow: Component<any>;
  }

  // Switch
  export namespace Switch {
    export const Root: Component<any>;
    export const Thumb: Component<any>;
  }

  // Label
  export namespace Label {
    export const Root: Component<any>;
  }

  // Dialog
  export namespace Dialog {
    export const Root: Component<any>;
    export const Portal: Component<any>;
    export const Overlay: Component<any>;
    export const Content: Component<any>;
    export const Title: Component<any>;
    export const Description: Component<any>;
    export const Close: Component<any>;
  }
}


