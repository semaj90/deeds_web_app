export function withBase(base: string, path) {
 return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
