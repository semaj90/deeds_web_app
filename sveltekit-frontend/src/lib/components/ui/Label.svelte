<script lang="ts">
  interface Props {
    for_?: string;
    class_?: string;
    children?: any;
  }
  let { for_ = '', class_ = '', children }: Props = $props();
</script>

<label for={for_} class="text-sm font-medium text-gray-700">
  {@render children?.()}
</label>
;


