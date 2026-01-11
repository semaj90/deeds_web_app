<script>
 import { redirect } from '@sveltejs/kit';

 // Redirect to the new command center in the (app) route group
 throw redirect(302, '/(app)/command-center');
</script>

<!-- This page has been moved to /(app)/command-center -->
