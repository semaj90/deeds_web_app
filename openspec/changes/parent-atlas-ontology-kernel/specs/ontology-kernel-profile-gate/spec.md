# Ontology Kernel Profile Gate

## ADDED Requirements

### Requirement: profile checking is separate from reasoning

The system MUST parse the OWL artifact through a Python FastAPI adapter backed
by an explicitly provisioned OWLAPI boundary and check
OWL 2 EL and OWL 2 DL profiles before selecting any formal reasoner.

#### Scenario: checker unavailable

- GIVEN no isolated OWLAPI runtime is configured
- WHEN a profile check is requested
- THEN the receipt MUST report `UNKNOWN`, `UNAVAILABLE`, and reasoner route `NONE`
- AND it MUST perform no ontology download or database write

### Requirement: Python owns the external profile adapter

The system MUST expose the future live profile check through the existing
Python 8095 sidecar and MUST keep OWLAPI process details outside TypeScript,
Neo4j, and the oaklib ontology-access adapter.

#### Scenario: no OWLAPI runtime provisioned

- GIVEN the 8095 sidecar is healthy but no OWLAPI runtime is configured
- WHEN a profile request is received
- THEN it MUST return a typed unavailable result
- AND it MUST NOT download a JAR, invoke a reasoner, or mutate persisted state

### Requirement: profile status is observable through the Python sidecar

The existing 8095 OAK FastAPI sidecar MUST expose profile-check availability
without claiming that OWLAPI is installed or that reasoning occurred.

#### Scenario: profile status before provisioning

- GIVEN the Python sidecar is running without an OWLAPI runtime
- WHEN `GET /oak/profile` is called
- THEN it MUST return `UNAVAILABLE`, `UNKNOWN`, and `NONE`
- AND it MUST report `reasoningPerformed: false` and `implicitDownload: false`

### Requirement: the Python sidecar exposes a fail-closed profile-check API

The existing 8095 sidecar MUST expose profile-check capabilities and a typed
unavailable response before an OWLAPI subprocess is explicitly provisioned.

#### Scenario: checker is not provisioned

- GIVEN the sidecar has no OWLAPI subprocess configured
- WHEN `GET /oak/profile-check/capabilities` and `POST /oak/profile-check` are called
- THEN capabilities MUST report unavailable and integration owner `PYTHON_FASTAPI_8095`
- AND the check MUST return profile `UNKNOWN`, route `NONE`, and `reasoningPerformed: false`
- AND `writesPerformed` MUST be false

### Requirement: checker implementation is injected

The profile routes MUST obtain the checker through a Python dependency seam so
the unavailable implementation can be replaced only by explicit provisioning.

#### Scenario: injected checker boundary

- GIVEN a checker is supplied through the FastAPI dependency
- WHEN the profile endpoint executes
- THEN it MUST pass the bounded RDF/XML bytes and expected checksum to that checker
- AND the default unavailable policy MUST remain unchanged when no override is supplied

### Requirement: profile results control later reasoner candidates

The system MUST route only proven profile results to later reasoner candidates.

#### Scenario: proven profile result

- GIVEN OWLAPI reports OWL 2 EL or OWL 2 DL
- WHEN the profile receipt is built
- THEN the receipt MUST preserve both profile reports and select ELK or HermiT as a candidate route
- AND it MUST record that no reasoning was performed
