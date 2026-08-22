declare module '@qdrant/js-client' {
  export type Qdrant = any;
}

// The @atlas/semantic-contracts ambient shim that used to live here has been
// replaced by the real package at packages/semantic-contracts (added to the
// root workspaces array). Its types are a superset of this placeholder's
// fields — see packages/semantic-contracts/src/index.ts.
