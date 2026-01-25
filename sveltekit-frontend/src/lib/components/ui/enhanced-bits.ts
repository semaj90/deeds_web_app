import DropdownContent from './BitsDropdown/Content.svelte';
import DropdownItem from './BitsDropdown/Item.svelte';
import DropdownRoot from './BitsDropdown/Root.svelte';
import DropdownSeparator from './BitsDropdown/Separator.svelte';
import DropdownTrigger from './BitsDropdown/Trigger.svelte';
import Button from './button/Button.svelte';
import Card from './Card.svelte';
import CardContent from './CardContent.svelte';
import CardHeader from './CardHeader.svelte';
import CardTitle from './CardTitle.svelte';
import * as Dialog from './dialog/index.js';
import Input from './input/InputBits.svelte';
import Label from './label/LabelCompat.svelte';
import Select from './select/Select.svelte';
import Separator from './separator/Separator.svelte';
import Textarea from './textarea/Textarea.svelte';

// Named exports for new code
export {
    Button,
    Card, CardContent, CardHeader,
    CardTitle, Dialog, DropdownContent, DropdownItem, DropdownRoot, DropdownSeparator, DropdownTrigger, Input, Label,
    Select, Separator, Textarea
};

// Compatibility namespace for legacy "bits.DropdownMenu.*" usage
export const DropdownMenu = {
    Root: DropdownRoot,
    Trigger: DropdownTrigger,
    Content: DropdownContent,
    Item: DropdownItem,
    Separator: DropdownSeparator
};

// default export includes both for flexible imports
export default {
    DropdownRoot, DropdownTrigger,
    DropdownContent, DropdownItem,
    DropdownSeparator, Button,
    Card, CardHeader,
    CardTitle, CardContent,
    Input, Label,
    Select, Dialog,
    Textarea, Separator
};
