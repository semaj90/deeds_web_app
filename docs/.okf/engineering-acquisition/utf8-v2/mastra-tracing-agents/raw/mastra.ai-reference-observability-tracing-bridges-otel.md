# OtelBridge
warning
The OpenTelemetry Bridge is currently
experimental
. APIs and configuration options may change in future releases.
Enables bidirectional integration between Mastra tracing and OpenTelemetry infrastructure. Creates native OTEL spans for Mastra operations and inherits context from active OTEL spans. Also forwards Mastra log events to the globally-registered OTEL
`LoggerProvider`
, emitting each log under the OTEL context of the originating Mastra span so trace-log correlation works automatically.
## Constructor Direct link to Constructor
```typescript
new OtelBridge(config?: OtelBridgeConfig)
```
## Methods Direct link to Methods
### executeInContext Direct link to executeincontext
```typescript
executeInContext<T>(spanId: string, fn: () => Promise<T>): Promise<T>
```
Executes an async function within the OTEL context of a Mastra span. OTEL-instrumented code running inside the function will have correct parent relationships.
Returns:
`Promise<T>`
- The result of the function execution.
### executeInContextSync Direct link to executeincontextsync
```typescript
executeInContextSync<T>(spanId: string, fn: () => T): T
```
Executes a synchronous function within the OTEL context of a Mastra span.
Returns:
`T`
- The result of the function execution.
### onLogEvent Direct link to onlogevent
```typescript
async onLogEvent(event: LogEvent): Promise<void>
```
Forwards a Mastra log event to the globally-registered OTEL
`LoggerProvider`
. Trace correlation is resolved in this order:
If the log carries a
`spanId`
the bridge has an OTEL span for, the log is emitted under that span's stored OTEL context.
Otherwise, if the log carries
`traceId`
and
`spanId`
, those IDs are attached to the emitted log record's
`SpanContext`
.
Otherwise, the log is emitted under whatever OTEL context is currently active.
If no
`LoggerProvider`
is registered globally, emission is a silent no-op.
### flush Direct link to flush
```typescript
async flush(): Promise<void>
```
Force flushes the tracer provider and logger provider if they support
`forceFlush`
. The global providers are resolved at flush time, so a
`LoggerProvider`
registered after the bridge was constructed is flushed too. Useful in serverless environments where you need to drain telemetry before the runtime terminates. Call
`sdk.shutdown()`
as well before the process exits to wait for any batch your OTEL SDK has already started exporting. Neither this method nor the provider's own
`forceFlush()`
waits for that batch.
### shutdown Direct link to shutdown
```typescript
async shutdown(): Promise<void>
```
Shuts down the bridge and cleans up resources. Ends any spans that weren't properly closed, then flushes the providers so those spans are exported.
## Usage examples Direct link to Usage examples
### Basic Usage Direct link to Basic Usage
```typescript
import { Mastra } from '@mastra/core'
import { Observability } from '@mastra/observability'
import { OtelBridge } from '@mastra/otel-bridge'

const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-service',
        bridge: new OtelBridge(),
      },
    },
  }),
  agents: { myAgent },
})
```
### Combined with Exporters Direct link to Combined with Exporters
The bridge can be used alongside exporters. The bridge handles OTEL context, while exporters send data to additional destinations:
```typescript
import { Mastra } from '@mastra/core'
import { Observability, MastraStorageExporter } from '@mastra/observability'
import { OtelBridge } from '@mastra/otel-bridge'
import { LangfuseExporter } from '@mastra/langfuse'

const mastra = new Mastra({
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'my-service',
        bridge: new OtelBridge(), // Handles OTEL context
        exporters: [
          new MastraStorageExporter(), // Studio access
          new LangfuseExporter({
            // Additional destination
            publicKey: process.env.LANGFUSE_PUBLIC_KEY,
            secretKey: process.env.LANGFUSE_SECRET_KEY,
          }),
        ],
      },
    },
  }),
})
```
## Setup requirements Direct link to Setup requirements
The bridge creates spans through an OpenTelemetry tracer provider. For Mastra spans to be exported:
A tracer provider must be available.
Register one globally before Mastra runs, for example by calling
`sdk.start()`
on
`NodeSDK`
from
`@opentelemetry/sdk-node`
, or by calling
`trace.setGlobalTracerProvider(provider)`
. If the provider isn't registered globally, pass it with
`new OtelBridge({ tracerProvider })`
.
A context manager must be installed for Mastra spans to nest under outer spans.
`NodeSDK`
installs one automatically. Without a context manager, spans are still exported, but Mastra root spans can't read the active span, so they start new traces instead of joining the outer trace.
When no tracer provider is available, agents and workflows still run, but no Mastra spans are exported through OpenTelemetry. The bridge logs this warning once:
```text
[OtelBridge] No OpenTelemetry tracer provider is registered globally, so Mastra spans will not be exported through OpenTelemetry. ...
```
See the
OtelBridge Guide
for complete setup instructions, including how to configure OTEL instrumentation and run your application.
## Tags support Direct link to Tags support
The OtelBridge supports trace tagging for categorization and filtering. Tags are only applied to root spans and are included as the
`mastra.tags`
attribute on native OTEL spans.
### Usage Direct link to Usage
```typescript
const result = await agent.generate('Hello', {
  tracingOptions: {
    tags: ['production', 'experiment-v2', 'user-request'],
  },
})
```
### How Tags Are Stored Direct link to How Tags Are Stored
Tags are stored as a JSON-stringified array in the
`mastra.tags`
span attribute:
```json
{
  "mastra.tags": "[\"production\",\"experiment-v2\",\"user-request\"]"
}
```
The format is compatible with all OTEL-compatible backends and collectors.
## Related Direct link to Related
OtelBridge Guide
: Setup guide with examples
Tracing Overview
: General tracing concepts
OtelExporter Reference
: OTEL exporter for sending traces
Edit this page on GitHub