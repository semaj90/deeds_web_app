export function selectRootWorkspaceSnapshotScopeV1(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.repositories) || !Array.isArray(snapshot.sources)) {
    throw new Error('SNAPSHOT_REPOSITORY_OR_SOURCE_LIST_MISSING');
  }

  const rootRepository = snapshot.repositories.filter(repository => repository.relativePath === '');
  if (rootRepository.length !== 1 || rootRepository[0].kind !== 'ROOT') {
    throw new Error('SNAPSHOT_ROOT_REPOSITORY_NOT_UNIQUE');
  }

  const rootSources = snapshot.sources.filter(source =>
    source.repositoryId === 'repo:root' && source.repositoryPath === '',
  );
  if (rootSources.length === 0) throw new Error('SNAPSHOT_ROOT_SOURCE_COHORT_EMPTY');

  const sourceRefs = rootSources.map(source => source.sourceRef);
  if (sourceRefs.some(sourceRef => typeof sourceRef !== 'string' || sourceRef.length === 0)) {
    throw new Error('SNAPSHOT_ROOT_SOURCE_REF_INVALID');
  }
  if (new Set(sourceRefs).size !== sourceRefs.length) {
    throw new Error('SNAPSHOT_ROOT_SOURCE_REF_DUPLICATE');
  }

  return {
    rootRepository: rootRepository[0],
    rootSources,
    excludedNestedRepositorySourceCount: snapshot.sources.length - rootSources.length,
  };
}
