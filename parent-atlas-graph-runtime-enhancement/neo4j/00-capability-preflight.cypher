CALL dbms.components() YIELD name, versions, edition
RETURN name, versions, edition;

RETURN apoc.version() AS apocVersion;

CALL gds.version() YIELD version
RETURN version AS gdsVersion;

SHOW INDEXES
YIELD name, state, populationPercent, labelsOrTypes, properties
RETURN name, state, populationPercent, labelsOrTypes, properties
ORDER BY name;
