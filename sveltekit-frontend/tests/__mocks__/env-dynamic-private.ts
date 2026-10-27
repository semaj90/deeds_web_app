export const env: Record<string, string | undefined> = new Proxy(process.env, {
  get(target, prop: string) {
    return target[prop];
  },
});
