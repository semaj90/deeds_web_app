export type GraphTopologyFilterV1 =
  | 'ALL'
  | 'HAS_IMPORTS'
  | 'IMPORTED_BY'
  | 'ROUTE'
  | 'TEST'
  | 'SSR_UNSAFE';

export interface GraphTopologyFileV1 {
  imports?: readonly string[];
  fanIn?: number;
  isRoute?: boolean;
  isTest?: boolean;
  ssrUnsafe?: boolean;
}

export function matchesGraphTopologyFilterV1(
  file: GraphTopologyFileV1,
  filter: GraphTopologyFilterV1,
): boolean {
  switch (filter) {
    case 'HAS_IMPORTS':
      return (file.imports?.length ?? 0) > 0;
    case 'IMPORTED_BY':
      return (file.fanIn ?? 0) > 0;
    case 'ROUTE':
      return file.isRoute === true;
    case 'TEST':
      return file.isTest === true;
    case 'SSR_UNSAFE':
      return file.ssrUnsafe === true;
    case 'ALL':
      return true;
  }
}

export function filterGraphTopologyFilesV1<T extends GraphTopologyFileV1>(
  files: readonly T[],
  filter: GraphTopologyFilterV1,
): T[] {
  return files.filter((file) => matchesGraphTopologyFilterV1(file, filter));
}
