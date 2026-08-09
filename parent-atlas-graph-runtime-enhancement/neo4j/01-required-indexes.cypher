CREATE INDEX codebase_file_path IF NOT EXISTS
FOR (n:CodebaseFile) ON (n.path);

SHOW INDEXES
YIELD name, state, populationPercent, labelsOrTypes, properties
WHERE name = 'codebase_file_path'
RETURN name, state, populationPercent, labelsOrTypes, properties;
