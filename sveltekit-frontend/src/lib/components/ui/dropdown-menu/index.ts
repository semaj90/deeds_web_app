// DropdownMenu Component - Svelte 5 Native Implementation
import DropdownMenu from './DropdownMenu.svelte';
import DropdownMenuContent from './DropdownMenuContent.svelte';
import DropdownMenuItem from './DropdownMenuItem.svelte';
import DropdownMenuRoot from './DropdownMenuRoot.svelte';
import DropdownMenuSeparator from './DropdownMenuSeparator.svelte';
import DropdownMenuTrigger from './DropdownMenuTrigger.svelte';

// Named exports
export {
    DropdownMenu, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuRoot,
    DropdownMenuSeparator, DropdownMenuTrigger
};

// Aliased exports for compound pattern
    export {
        CheckboxItem, Content,
        //
        Root as DropdownMenu,
        CheckboxItem as DropdownMenuCheckboxItem,
        Content as DropdownMenuContent,
        Group as DropdownMenuGroup,
        Item as DropdownMenuItem,
        Label as DropdownMenuLabel,
        Portal as DropdownMenuPortal,
        RadioGroup as DropdownMenuRadioGroup,
        RadioItem as DropdownMenuRadioItem,
        Separator as DropdownMenuSeparator,
        Shortcut as DropdownMenuShortcut,
        Sub as DropdownMenuSub,
        SubContent as DropdownMenuSubContent,
        SubTrigger as DropdownMenuSubTrigger,
        Trigger as DropdownMenuTrigger, Group, Item,
        Label, RadioGroup,
        RadioItem, Root, Separator,
        Shortcut, Sub, SubContent,
        SubTrigger, Trigger
    };

// Type exports
    export type * from './types';

