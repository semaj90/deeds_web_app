Integrations
Native
OpenTelemetry
Overview
# OpenTelemetry (OTEL) for LLM Observability
OpenTelemetry (OTEL)
is a
CNCF
project that provides a set of specifications, APIs, and libraries that define a standard way to collect distributed traces and metrics from your application.
Use this page if your application, framework, or collector already emits OpenTelemetry (OTEL) traces and you want to send them to Langfuse.
Using Python or JavaScript/TypeScript?
Use the
Langfuse SDK
instead of building directly on the OTEL API. The SDK handles Langfuse attributes, propagation, media, filtering, and export for you. For other languages, use the
native OpenTelemetry API for your language
and export spans to Langfuse.
## OpenTelemetry endpoint
Langfuse can receive traces on the
`/api/public/otel`
(OTLP) endpoint.
If you use a Collector that uses the OpenTelemetry SDK to export traces, you can use the following configuration:
```
OTEL_EXPORTER_OTLP_ENDPOINT="https://cloud.langfuse.com/api/public/otel" # 🇪🇺 EU data region
# Other Langfuse data regions include 🇺🇸 US: https://us.cloud.langfuse.com/api/public/otel, 🇯🇵 Japan: https://jp.cloud.langfuse.com/api/public/otel and ⚕️ HIPAA: https://hipaa.cloud.langfuse.com/api/public/otel
# OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:3000/api/public/otel" # 🏠 Local deployment (>= v3.22.0)

OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic ${AUTH_STRING},x-langfuse-ingestion-version=4"
```
Langfuse uses
Basic Auth
to authenticate requests.
You can use the following command to get the base64 encoded API keys (referred to as
`AUTH_STRING`
):
`echo -n "pk-lf-1234567890:sk-lf-1234567890" | base64`
.
For long API Keys on GNU systems, you may have to add
`-w 0`
at the end since
`base64`
auto-wraps columns.
### Enable real-time ingestion in Langfuse v4
If you send spans directly via OpenTelemetry, include the
`x-langfuse-ingestion-version: 4`
header so that new data appears in real time
on the v4 data model and the v2 Observations and Metrics APIs. Without
this header, directly ingested OpenTelemetry data can be delayed by up to 10
minutes. The
`OTEL_EXPORTER_OTLP_HEADERS`
configuration above already includes
the header.
If your setup uses signal-specific header settings, configure the same header
on the traces exporter:
```
OTEL_EXPORTER_OTLP_TRACES_HEADERS="Authorization=Basic ${AUTH_STRING},x-langfuse-ingestion-version=4"
```
If your collector requires signal-specific environment variables, the trace endpoint is
`/api/public/otel/v1/traces`
.
```
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="https://cloud.langfuse.com/api/public/otel/v1/traces" # EU data region
# Other Langfuse data regions include 🇺🇸 US: https://us.cloud.langfuse.com/api/public/otel/v1/traces, 🇯🇵 Japan: https://jp.cloud.langfuse.com/api/public/otel/v1/traces and ⚕️ HIPAA: https://hipaa.cloud.langfuse.com/api/public/otel/v1/traces
```
Please note that Langfuse currently supports OTLP over HTTP with both
`HTTP/JSON`
and
`HTTP/protobuf`
.
`gRPC`
is not supported yet.
Migrating to Langfuse v4?
If you send custom events to the legacy
`/api/public/ingestion`
endpoint, or already send OTEL spans that rely on trace input/output or root-only attributes, follow the
custom ingestion migration guide
.
Langfuse can operate as an OpenTelemetry Backend to receive traces on the
`/api/public/otel`
(OTLP) endpoint. In addition to the
Langfuse SDKs
and
native integrations
, this OpenTelemetry endpoint is designed to increase compatibility with frameworks, libraries, and languages beyond the SDKs and native integrations. Popular OpenTelemetry libraries include OpenLLMetry and OpenLIT which extend Language support of Langfuse tracing to Java and Go and cover frameworks such as AutoGen, Semantic Kernel, and more.
As the
Semantic Conventions
for GenAI attributes on traces are still evolving, Langfuse maps the received OTel traces to the
Langfuse data model
and supports additional attributes that are popular in the OTel GenAI ecosystem (
attribute mapping
). Please contribute to the discussion on
GitHub
if an integration does not work as expected or does not parse the correct attributes.
Using other OTEL-based tools?
If you're using Langfuse alongside other OpenTelemetry-based tools, you may run into conflicts. See
Using Langfuse with an Existing OpenTelemetry Setup
for configuration guidance.
Important:
If you want to filter and aggregate by
`userId`
,
`sessionId`
,
`metadata`
,
`version`
,
`release`
, or
`tags`
, you need to propagate these
trace-level attributes to every span in the trace. Start with
Propagating Trace Attributes to All Spans
before
wiring this up in production.
OTLP replaces the deprecated
`POST /api/public/ingestion`
API. See
Migration of deprecated APIs
for
the endpoint mapping; the deprecated endpoint itself is documented in its
endpoint reference section
.
## Important: Propagating Trace Attributes to All Spans
When using OpenTelemetry (OTEL) instrumentation to send traces to Langfuse,
certain trace-level attributes should be propagated to
all spans
within a
trace to enable accurate aggregations and filtering in Langfuse. These
attributes include:
`userId`
(via
`langfuse.user.id`
or
`user.id`
)
`sessionId`
(via
`langfuse.session.id`
or
`session.id`
)
`metadata`
(via
`langfuse.trace.metadata.*`
for top-level metadata keys)
`version`
(via
`langfuse.version`
)
`release`
(via
`langfuse.release`
)
`tags`
(via
`langfuse.trace.tags`
)
`trace_name`
(via
`langfuse.trace.name`
)
Langfuse filters and aggregations increasingly operate across individual
observations rather than only at the trace level. If you want to reliably
filter or aggregate by these attributes, they need to be present on each span
in the trace, not only on the root span.
### Recommended: Use OpenTelemetry Baggage for Propagation
The recommended approach for propagating these attributes across all spans is
to use
OpenTelemetry Baggage
with a
`BaggageSpanProcessor`
. Baggage is a built-in OpenTelemetry mechanism
for context propagation that automatically copies specified key-value pairs to
all spans within a trace context.
To implement this pattern:
Set the desired attributes as baggage entries at the beginning of your trace.
Set the attributes on the currently active span.
Configure a
`BaggageSpanProcessor`
in your OpenTelemetry setup to automatically copy baggage entries to span attributes.
The processor will ensure all downstream spans in the trace context receive these attributes.
For implementation details and code examples, refer to the OpenTelemetry
documentation for
Python
and
JavaScript
.
Security Consideration:
OpenTelemetry baggage is propagated across
service boundaries and to third-party APIs.
Do not include sensitive
information
(passwords, API keys, personal data, etc.) in baggage when
using this approach, as it will be transmitted to all downstream services.
### Alternative: Use Langfuse SDK Helpers
If you're using the
Langfuse SDKs
with
OpenTelemetry integration, you can use the convenience methods
`propagate_attributes()`
(Python) or
`propagateAttributes()`
(TypeScript),
which handle attribute propagation automatically. These methods provide a
simpler interface and are the recommended approach when using Langfuse SDKs.
## Ingestion Options
### OpenTelemetry-native Langfuse SDKs
The quickest path to start tracing with Langfuse is the
OTEL-native Langfuse SDK
for Python or JS/TS. The SDK is a thin layer on top of the official OpenTelemetry client that automatically converts emitted spans into Langfuse
observations
(Langfuse calls spans observations;
`span`
is also a specific
observation type
) and adds first-class helpers for LLM-specific features such as token usage, cost tracking, prompt linking, and scoring.
Because it lives in the shared OpenTelemetry context, spans from other OTEL-instrumented libraries can be exported to Langfuse too. By default, Langfuse focuses on LLM-relevant spans (Langfuse SDK spans, spans with
`gen_ai.*`
attributes, and known LLM instrumentors). To export everything, use a permissive custom filter as described in the
advanced SDK docs
.
Get started by following the
SDK overview
.
### Custom via OpenTelemetry SDKs
You can use the OpenTelemetry SDKs to directly export traces to Langfuse with the configuration mentioned above. Thereby, Language support of Langfuse is extended to other languages than the ones supported by the
Langfuse SDKs
(Python and JS/TS).
### Run experiments via OpenTelemetry
To group direct-OTEL traces as Langfuse experiments, start with
Experiments via OpenTelemetry
and then add the experiment and item attributes described in
Ingest experiment spans with OpenTelemetry
.
### Use OpenTelemetry GenAI Instrumentation Libraries
Any OpenTelemetry compatible instrumentation can be used to export traces to Langfuse. Check out the following end-to-end examples of popular instrumentation SDKs to get started:
Libraries
OpenLIT
OpenLLMetry
Arize
MLflow
Comparison of OpenTelemetry Instrumentation Libraries
+
Category | Item | OpenLLMetry | openlit | Arize
LLMs | AI21 | | ✅ | 
 | Aleph Alpha | ✅ | | 
 | Amazon Bedrock | ✅ | ✅ | ✅
 | Anthropic | ✅ | ✅ | ✅
 | Assembly AI | | ✅ | 
 | Azure AI Inference | | ✅ | 
 | Azure OpenAI | ✅ | ✅ | 
 | Cohere | ✅ | ✅ | 
 | DeepSeek | | ✅ | 
 | ElevenLabs | | ✅ | 
 | GitHub Models | | ✅ | 
 | Google AI Studio | | ✅ | 
 | Google Generative AI (Gemini) | ✅ | | 
 | Groq | ✅ | ✅ | ✅
 | HuggingFace | ✅ | ✅ | ✅
 | IBM Watsonx AI | ✅ | | 
 | Mistral AI | ✅ | ✅ | ✅
 | NVIDIA NIM | | ✅ | 
 | Ollama | ✅ | ✅ | 
 | OpenAI | ✅ | ✅ | ✅
 | OLA Krutrim | | ✅ | 
 | Prem AI | | ✅ | 
 | Replicate | ✅ | | 
 | SageMaker (AWS) | ✅ | | 
 | Titan ML | | ✅ | 
 | Together AI | ✅ | ✅ | 
 | vLLM | | ✅ | 
 | Vertex AI | ✅ | ✅ | ✅
 | xAI | | ✅ | 
Vector DBs | AstraDB | | ✅ | 
 | Chroma | ✅ | | 
 | ChromaDB | | ✅ | 
 | LanceDB | ✅ | | 
 | Marqo | ✅ | | 
 | Milvus | ✅ | ✅ | 
 | Pinecone | ✅ | ✅ | 
 | Qdrant | ✅ | ✅ | 
 | Weaviate | ✅ | | 
Frameworks | AutoGen / AG2 | | ✅ | ✅
 | ControlFlow | | ✅ | 
 | CrewAI | ✅ | ✅ | ✅
 | Crawl4AI | | ✅ | 
 | Dynamiq | | ✅ | 
 | EmbedChain | | ✅ | 
 | FireCrawl | | ✅ | 
 | Guardrails AI | | ✅ | ✅
 | Haystack | ✅ | ✅ | ✅
 | Julep AI | | ✅ | 
 | LangChain | ✅ | ✅ | ✅
 | LlamaIndex | ✅ | ✅ | ✅
 | Letta | | ✅ | 
 | LiteLLM | ✅ | ✅ | ✅
 | mem0 | | ✅ | 
 | MultiOn | | ✅ | 
 | Phidata | | ✅ | 
 | SwarmZero | | ✅ | 
 | LlamaIndex Workflows | | | ✅
 | LangGraph | | | ✅
 | DSPy | | | ✅
 | Prompt flow | | | ✅
 | Instructor | | | ✅
GPUs | AMD Radeon | | ✅ | 
 | NVIDIA | | ✅ | 
JavaScript | OpenAI Node SDK | | | ✅
 | LangChain.js | | | ✅
 | Vercel AI SDK | | | ✅
Framework integrations powered by OpenTelemetry
Hugging Face smolagents
CrewAI
AutoGen
Semantic Kernel
Pydantic AI
Spring AI
Strands
LlamaIndex
LlamaIndex Workflows
### Export from OpenTelemetry Collector
If you run an
OpenTelemetry Collector
, you can use the following configuration to export traces to Langfuse:
```
receivers:
  otlp:
    protocols:
    grpc:
      endpoint: 0.0.0.0:4317
    http:
      endpoint: 0.0.0.0:4318

processors:
  batch:
  memory_limiter:
    # 80% of maximum memory up to 2G
    limit_mib: 1500
    # 25% of limit up to 2G
    spike_limit_mib: 512
    check_interval: 5s

exporters:
  otlphttp/langfuse:
    endpoint: "https://cloud.langfuse.com/api/public/otel" # EU data region
    # Other regions: US https://us.cloud.langfuse.com/api/public/otel, Japan https://jp.cloud.langfuse.com/api/public/otel, HIPAA https://hipaa.cloud.langfuse.com/api/public/otel
    headers:
      Authorization: "Basic ${AUTH_STRING}" # Previously encoded API keys
      x-langfuse-ingestion-version: "4"

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp/langfuse]
```
#### Filtering Spans sent to Langfuse
In case you want to selectively send OTel Spans to Langfuse, you can use the OTel Collector
filterprocessor
.
It enables you to filter spans based on attributes, span names, and more.
As this applies on a Span level, you may risk incomplete traces and should be careful when applying complex filter rules.
Langfuse also requires that a root span is sent to our backend to ensure that a trace is created correctly.
With the configuration below, you would only forward Spans which have a
`gen_ai.system`
attribute set to
`openai`
:
```
receivers:
  otlp:
    protocols:
    grpc:
      endpoint: 0.0.0.0:4317
    http:
      endpoint: 0.0.0.0:4318

processors:
  filter/openaisystem:
    error_mode: ignore
    traces:
      span:
        - 'attributes["gen_ai.system"] != "openai"'

exporters:
  otlphttp/langfuse:
    endpoint: "https://cloud.langfuse.com/api/public/otel" # EU data region
    # Other regions: US https://us.cloud.langfuse.com/api/public/otel, Japan https://jp.cloud.langfuse.com/api/public/otel, HIPAA https://hipaa.cloud.langfuse.com/api/public/otel
    headers:
      Authorization: "Basic ${AUTH_STRING}" # Previously encoded API keys
      x-langfuse-ingestion-version: "4"

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [filter/openaisystem]
      exporters: [otlphttp/langfuse]
```
## Attribute Mapping
Langfuse aims to be compliant with the
OpenTelemetry GenAI semantic conventions
and support major LLM instrumentation frameworks.
Furthermore, Langfuse uses attributes within the
`langfuse.*`
namespace to map OpenTelemetry span attributes directly to the Langfuse data model. These specific attributes always take precedence over the generic OpenTelemetry conventions and are recommended for all users that are manually instrumenting their applications.
Please
raise an issue on GitHub
if any mapping or integration does
not work as expected or does not parse the correct attributes.
Reserved attribute key segments:
Attribute keys that contain
`__proto__`
,
`constructor`
, or
`prototype`
as a path segment (e.g.
`gen_ai.prompt.__proto__.foo`
) are silently dropped during ingestion. This is a security measure to prevent prototype pollution. If you notice missing attributes, check that your keys do not include these reserved segments.
Langfuse distinguishes between trace-level attributes and observation-level attributes.
Trace-level attributes
represent shared context for an entire interaction. If Langfuse detects these attributes on a specific span, it will treat them as properties of the whole trace.
Observation-level attributes
describe individual steps within a trace. Langfuse keeps them on the observation level.
### How Metadata Mapping Works
OpenTelemetry spans can carry arbitrary attributes. Langfuse handles these attributes differently depending on how they are named:
Attribute Type | Where it Appears in Langfuse | Example
Explicit metadata mapping | First-level key in metadata (filterable) | langfuse.trace.metadata.customer_tier → metadata.customer_tier
Unmapped OTel attributes | Nested under metadata.attributes (catch-all) | http.method → metadata.attributes.http.method
Resource attributes | Nested under metadata.resourceAttributes | service.name → metadata.resourceAttributes.service.name
Langfuse SDKs vs. standard OpenTelemetry SDKs
Langfuse SDKs
provide utility functions (like
`update()`
with a
`metadata`
parameter) that automatically set the
`langfuse.*.metadata.*`
prefixed attributes. This means custom metadata appears at the first level and is filterable.
Standard OpenTelemetry SDKs
set attributes directly on spans. Unless you explicitly use the
`langfuse.trace.metadata.*`
or
`langfuse.observation.metadata.*`
prefix, these attributes end up in the
`metadata.attributes`
catch-all and are not directly filterable in Langfuse.
### Trace-Level Attributes
These attributes are applied to the trace record in Langfuse. They may be set on any span in the trace.
Langfuse Field | Description | Mapped from OTel Attribute
name | The name of the trace. | • langfuse.trace.name : string • Span name of the root span
userId | The unique identifier for the end-user. | • langfuse.user.id : string • user.id : string
sessionId | The unique identifier for the user session. | • langfuse.session.id : string • session.id : string
release | The release version of your application. | • langfuse.release : string
public | A boolean flag to mark a trace as public, allowing it to be shared via a URL. | • langfuse.trace.public : boolean
tags | An array of strings to categorize or label the trace. | • langfuse.trace.tags : string[]
metadata | A flexible object for storing any additional, unstructured data on the trace. See note below. | • langfuse.trace.metadata.* : string • Root span's observation metadata
input | Deprecated trace input, retained for legacy trace-level evaluators. In v4, use the root observation's input. | • langfuse.trace.input : string • Root span's observation input
output | Deprecated trace output, retained for legacy trace-level evaluators. In v4, use the root observation's output. | • langfuse.trace.output : string • Root span's observation output
version | The version of the trace, useful for tracking changes to your application logic. | • Root span's attributes mapped to version
environment | The deployment environment where the trace was generated. | • Root span's attributes mapped to environment
Filtering by metadata key in Langfuse
Langfuse only supports filtering on top-level keys within the
`metadata`
of an event.
By default, all OpenTelemetry attributes and resource attributes are mapped into an
`attributes`
and
`resourceAttributes`
key within
`metadata`
and are thus not queryable.
If you want to query on specific attributes, you can use the
`langfuse.trace.metadata`
prefix to map them to the top-level
`metadata`
object of the trace.
The following snippet will produce a filterable
`user_name`
property in the
`metadata`
object of the trace:
```
with tracer.start_as_current_span("Langfuse Attributes") as span:
    span.set_attribute("langfuse.trace.metadata.user_name", "user-123")
```
### Observation-Level Attributes
These attributes are applied to individual observations (spans) within a trace (
data model
).
Langfuse Field | Description | Mapped from OTel Attribute
type | The type of observation . A recognized langfuse.observation.type always wins; see ingestion transformations . | • langfuse.observation.type : "span" | "generation" | "event" | "embedding" | "agent" | "tool" | "chain" | "retriever" | "guardrail" | "evaluator" • If unset or unrecognized: inferred from other conventions, then from a model attribute ( generation ), then "span"
level | The severity level of the observation. | • langfuse.observation.level : "DEBUG" | "DEFAULT" | "WARNING" | "ERROR" , default: "DEFAULT" • Inferred from span.status.code
statusMessage | A message describing the status of the observation, often used for errors. | • langfuse.observation.status_message : string • Inferred from span.status.message
metadata | A flexible object for storing additional unstructured data. See note below. | • langfuse.observation.metadata.* : string
input | The input data for this specific observation. | • langfuse.observation.input : (JSON) string • gen_ai.prompt • input.value (OpenInference) • mlflow.spanInputs (MLFlow) • gen_ai.tool.call.arguments (OpenTelemetry GenAI tool spans, used when no other input attribute is set)
output | The output data from this specific observation. | • langfuse.observation.output : (JSON) string • gen_ai.completion • output.value (OpenInference) • mlflow.spanOutputs (MLFlow) • gen_ai.tool.call.result (OpenTelemetry GenAI tool spans, used when no other output attribute is set)
model | The name of the generative model used. Generation only. | • langfuse.observation.model.name • gen_ai.request.model • gen_ai.response.model • llm.model_name • model
modelParameters | Key-value pairs for model invocation settings. Generation only. | • langfuse.observation.model.parameters : JSON string • gen_ai.request.* • llm.invocation_parameters.*
usage | Token counts for the generation. Generation only. | • langfuse.observation.usage_details : JSON string • gen_ai.usage.* • llm.token_count.*
cost | The calculated cost in USD. Generation only. | • langfuse.observation.cost_details : JSON string • gen_ai.usage.cost (set as total key)
prompt | The name of a versioned prompt managed in Langfuse. Generation only. | • langfuse.observation.prompt.name or langfuse.prompt.name : string • langfuse.observation.prompt.version or langfuse.prompt.version : integer
completionStartTime | Timestamp for when the model began generating. Generation only. | • langfuse.observation.completion_start_time : ISO 8601 date string
version | The version of the observation. | • langfuse.version : string
environment | The deployment environment where the observation was generated. | • langfuse.environment • deployment.environment • deployment.environment.name
Filtering by metadata key in Langfuse
Langfuse only supports filtering on top-level keys within the
`metadata`
of an event.
By default, all OpenTelemetry attributes and resource attributes are mapped into an
`attributes`
and
`resourceAttributes`
key within
`metadata`
and are thus not queryable.
If you want to query on specific attributes, you can use the
`langfuse.observation.metadata`
prefix to map them to the top-level
`metadata`
object of the observation.
The following snippet will produce a filterable
`user_name`
property in the
`metadata`
object:
```
with tracer.start_as_current_span("Langfuse Attributes") as span:
    span.set_attribute("langfuse.observation.metadata.user_name", "user-123")
```
### Ingestion transformations
Langfuse accepts incomplete or non-standard OTLP spans instead of rejecting
them. The request still succeeds; the span is rewritten.
Accepted
`langfuse.observation.type`
values
are
`span`
,
`generation`
,
`event`
,
`embedding`
,
`agent`
,
`tool`
,
`chain`
,
`retriever`
,
`guardrail`
, and
`evaluator`
.
An unrecognized explicit type is not rejected.
A typo or a vendor-specific string such as
`llm`
falls through to other mapped conventions (for example
`gen_ai.operation.name`
), then to the model fallback, then to
`span`
.
A model attribute infers
`generation`
only as a fallback
— when no recognized
`langfuse.observation.type`
and no higher-priority convention applied. A valid explicit type always wins, even if the span also has a model name (
`langfuse.observation.model.name`
,
`gen_ai.request.model`
,
`gen_ai.response.model`
,
`llm.model_name`
, or
`model`
).
Missing timestamps are filled in.
If
`startTimeUnixNano`
or
`endTimeUnixNano`
is missing or unparseable, Langfuse copies the remaining edge so both start and end are set (the observation has zero duration). If both are missing, both become the ingest time. Send both fields on every span.
## Next steps
Once spans are arriving in Langfuse,
Tracing in the Langfuse Academy
covers how traces are structured and which attributes make them useful downstream, and
Monitoring
covers how to read them once they are there.
## Troubleshooting
If you encounter
`4xx`
errors while self-hosting Langfuse, please upgrade your deployment to the latest version. The OpenTelemetry endpoint was first introduced in Langfuse
v3.22.0
and has seen significant improvements since then.
Langfuse supports OTLP over HTTP with both
`HTTP/JSON`
and
`HTTP/protobuf`
.
`gRPC`
is not supported yet.
If an observation's type or timestamps look wrong, Langfuse may have rewritten them on ingest. See
Ingestion transformations
.
## FAQ
How to integrate Langfuse with an existing OpenTelemetry setup
Was this page helpful?
Support
Last updated on
Previous
API ↗
Next
Migrate ingestion to v4
Product
Observability
Prompt Management
Evaluations
Metrics
Langfuse for Agents
Chat agents
Coding agents
Workflow automation
Financial Services Industry
Healthcare and life sciences
Playground
Pricing
Enterprise
Developers
Documentation
Self-Hosting
SDKs
Integrations
API Reference
Status
Talk to Us
Resources
Blog
Changelog
Events
Roadmap
Interactive Demo
Customers
Compare
AI Engineering Library
Workshop
Guides & Cookbooks
Company
About Us
Partners
Careers
Handbook
Press
Security
Support
Open source
Terms
Privacy
Imprint
Cookie Policy
© 2022–
2026
Langfuse GmbH
/ Finto Technologies Inc.
Design by
Altalogy