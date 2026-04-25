import { browser } from '$app/environment';
import { userStore } from '$lib/stores/user.ts';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ data }) => {
  if (browser) {
    userStore.set(data.user);
  }
  return data;
};
