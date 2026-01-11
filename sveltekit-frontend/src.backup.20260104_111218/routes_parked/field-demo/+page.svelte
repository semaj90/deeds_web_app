<script lang="ts">
 import { Field } from '$lib/components/ui';
 import Input from '$lib/components/ui/Input.svelte';
 import Select from '$lib/components/ui/Select.svelte';
 import Textarea from '$lib/components/ui/Textarea.svelte';
</script>

<div class="max-w-md mx-auto p-6 space-y-6">
 <h1 class="text-2xl font-bold">Field Component Demo</h1>

 <Field label="Full Name" required hint="Enter your complete name">
 <Input placeholder="John Doe" />
 </Field>

 <Field label="Email Address" required error="Please enter a valid email">
 <Input type="email" placeholder="john@example.com" />
 </Field>

 <Field label="Priority Level" hint="Choose the urgency level">
 <Select>
 <option value="low">Low</option>
 <option value="medium">Medium</option>
 <option value="high">High</option>
 </Select>
 </Field>

 <Field label="Notes" hint="Optional additional information">
 <Textarea placeholder="Enter any additional notes..." rows="3" />
 </Field>

 <Field label="Disabled Field" hint="This field is disabled">
 <Input disabled placeholder="Cannot edit this" />
 </Field>
</div>