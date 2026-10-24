# Exporters
Process and export your telemetry data
Send telemetry to the
OpenTelemetry Collector
to make sure
it’s exported correctly. Using the Collector in production environments is a
best practice. To visualize your telemetry, export it to a backend such as
Jaeger
,
Zipkin
,
Prometheus
, or a
vendor-specific
backend.
## Available exporters
The registry contains a
list of exporters for JavaScript
.
Among exporters,
OpenTelemetry Protocol (OTLP)
exporters are designed
with the OpenTelemetry data model in mind, emitting OTel data without any loss
of information. Furthermore, many tools that operate on telemetry data support
OTLP (such as
Prometheus
,
Jaeger
, and most
vendors
), providing you
with a high degree of flexibility when you need it. To learn more about OTLP,
see
OTLP Specification
.
This page covers the main OpenTelemetry JavaScript exporters and how to set
them up.
Note
If you use
zero-code instrumentation
,
you can learn how to set up exporters by following the
Configuration Guide
.
## OTLP
### Collector Setup
Note
If you have a OTLP collector or backend already set up, you can skip this
section and
setup the OTLP exporter dependencies
for
your application.
To try out and verify your OTLP exporters, you can run the collector in a docker
container that writes telemetry directly to the console.
In an empty directory, create a file called
`collector-config.yaml`
with the
following content:
```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
exporters:
  debug:
    verbosity: detailed
service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [debug]
    metrics:
      receivers: [otlp]
      exporters: [debug]
    logs:
      receivers: [otlp]
      exporters: [debug]
```
Now run the collector in a docker container:
```shell
docker run -p 4317:4317 -p 4318:4318 --rm -v $(pwd)/collector-config.yaml:/etc/otelcol/config.yaml otel/opentelemetry-collector
```
This collector is now able to accept telemetry via OTLP. Later you may want to
configure the collector
to send your telemetry
to your observability backend.
## Dependencies
If you want to send telemetry data to an OTLP endpoint (like the
OpenTelemetry Collector
,
Jaeger
or
Prometheus
), you can choose between three different protocols to
transport your data:
HTTP/protobuf
HTTP/JSON
gRPC
Start by installing the respective exporter packages as a dependency for your
project:
```shell
npm install --save @opentelemetry/exporter-trace-otlp-proto \
  @opentelemetry/exporter-metrics-otlp-proto
```
```shell
npm install --save @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http
```
```shell
npm install --save @opentelemetry/exporter-trace-otlp-grpc \
  @opentelemetry/exporter-metrics-otlp-grpc
```
## Usage with Node.js
Next, configure the exporter to point at an OTLP endpoint. For example you can
update the file
`instrumentation.ts`
(or
`instrumentation.js`
if you use
JavaScript) from the
Getting Started
like the following
to export traces and metrics via OTLP (
`http/protobuf`
) :
```ts
/*instrumentation.ts*/
import * as opentelemetry from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const sdk = new opentelemetry.NodeSDK({
  traceExporter: new OTLPTraceExporter({
    // optional - default url is http://localhost:4318/v1/traces
    url: '<your-otlp-endpoint>/v1/traces',
    // optional - collection of custom headers to be sent with each request, empty by default
    headers: {},
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: '<your-otlp-endpoint>/v1/metrics', // url is optional and can be omitted - default is http://localhost:4318/v1/metrics
      headers: {}, // an optional object containing custom headers to be sent with each request
    }),
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```
```js
/*instrumentation.js*/
const opentelemetry = require('@opentelemetry/sdk-node');
const {
  getNodeAutoInstrumentations,
} = require('@opentelemetry/auto-instrumentations-node');
const {
  OTLPTraceExporter,
} = require('@opentelemetry/exporter-trace-otlp-proto');
const {
  OTLPMetricExporter,
} = require('@opentelemetry/exporter-metrics-otlp-proto');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');

const sdk = new opentelemetry.NodeSDK({
  traceExporter: new OTLPTraceExporter({
    // optional - default url is http://localhost:4318/v1/traces
    url: '<your-otlp-endpoint>/v1/traces',
    // optional - collection of custom headers to be sent with each request, empty by default
    headers: {},
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: '<your-otlp-endpoint>/v1/metrics', // url is optional and can be omitted - default is http://localhost:4318/v1/metrics
      headers: {}, // an optional object containing custom headers to be sent with each request
      concurrencyLimit: 1, // an optional limit on pending requests
    }),
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```
## Usage in the Browser
When you use the OTLP exporter in a browser-based application, you need to note
that:
Using gRPC for exporting is not supported
Content Security Policies
(CSPs) of your website might block your exports
Cross-Origin Resource Sharing
(CORS) headers might not allow your exports
to be sent
You might need to expose your collector to the public internet
Below you will find instructions to use the right exporter, to configure your
CSPs and CORS headers and what precautions you have to take when exposing your
collector.
### Use OTLP exporter with HTTP/JSON or HTTP/protobuf
OpenTelemetry Collector Exporter with gRPC
works only with Node.js,
therefore you are limited to use the
OpenTelemetry Collector Exporter with
HTTP/JSON
or
OpenTelemetry Collector Exporter with HTTP/protobuf
.
Make sure that the receiving end of your exporter (collector or observability
backend) accepts
`http/json`
if you are using
OpenTelemetry Collector Exporter
with HTTP/JSON
, and that you are exporting your data to the right endpoint
with your port set to 4318.
### Configure CSPs
If your website is making use of Content Security Policies (CSPs), make sure
that the domain of your OTLP endpoint is included. If your collector endpoint is
`https://collector.example.com:4318/v1/traces`
, add the following directive:
```text
connect-src collector.example.com:4318/v1/traces
```
If your CSP is not including the OTLP endpoint, you will see an error message,
stating that the request to your endpoint is violating the CSP directive.
### Configure CORS headers
If your website and collector are hosted at a different origin, your browser
might block the requests going out to your collector. You need to configure
special headers for Cross-Origin Resource Sharing (CORS).
The OpenTelemetry Collector provides
a feature
for http-based receivers to
add the required headers to allow the receiver to accept traces from a web
browser:
```yaml
receivers:
  otlp:
    protocols:
      http:
        include_metadata: true
        cors:
          allowed_origins:
            - https://foo.bar.com
            - https://*.test.com
          allowed_headers:
            - Example-Header
          max_age: 7200
```
### Securely expose your collector
To receive telemetry from a web application you need to allow the browsers of
your end-users to send data to your collector. If your web application is
accessible from the public internet, you also have to make your collector
accessible for everyone.
It is recommended that you do not expose your collector directly, but that you
put a reverse proxy (NGINX, Apache HTTP Server, …) in front of it. The reverse
proxy can take care of SSL-offloading, setting the right CORS headers, and many
other features specific to web applications.
Below you will find a configuration for the popular NGINX web server to get you
started:
```nginx
server {
    listen 80 default_server;
    server_name _;
    location / {
        # Take care of preflight requests
        if ($request_method = 'OPTIONS') {
             add_header 'Access-Control-Max-Age' 1728000;
             add_header 'Access-Control-Allow-Origin' 'name.of.your.website.example.com' always;
             add_header 'Access-Control-Allow-Headers' 'Accept,Accept-Language,Content-Language,Content-Type' always;
             add_header 'Access-Control-Allow-Credentials' 'true' always;
             add_header 'Content-Type' 'text/plain charset=UTF-8';
             add_header 'Content-Length' 0;
             return 204;
        }

        add_header 'Access-Control-Allow-Origin' 'name.of.your.website.example.com' always;
        add_header 'Access-Control-Allow-Credentials' 'true' always;
        add_header 'Access-Control-Allow-Headers' 'Accept,Accept-Language,Content-Language,Content-Type' always;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_pass http://collector:4318;
    }
}
```
## Console
To debug your instrumentation or see the values locally in development, you can
use exporters writing telemetry data to the console (stdout).
If you followed the
Getting Started
or
Manual Instrumentation
guides, you already
have the console exporter installed.
The
`ConsoleSpanExporter`
is included in the
`@opentelemetry/sdk-trace`
package and the
`ConsoleMetricExporter`
is included in the
`@opentelemetry/sdk-metrics`
package:
## Jaeger
### Backend Setup
Jaeger
natively supports OTLP to receive trace
data. You can run Jaeger in a docker container with the UI accessible on port
16686 and OTLP enabled on ports 4317 and 4318:
```shell
docker run --rm \
  -p 16686:16686 \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 9411:9411 \
  jaegertracing/jaeger:latest
```
### Usage
Now following the instruction to setup the
OTLP exporters
.
## Prometheus
To send your metric data to
Prometheus
, you can
either:
Enable Prometheus’ OTLP Receiver
and use the
OTLP exporter
(best practice), or
Use the Prometheus exporter, a
`MetricReader`
that starts an HTTP server that
collects metrics and serializes to Prometheus text format on request.
### Backend setup
To run a Prometheus server backend and begin scraping metrics, see the
Prometheus getting started guide
.
To enable the OTLP Receiver, see the
Prometheus guide for enabling the OTLP Receiver
.
## Dependencies
Install the
exporter package
as a dependency for your application:
```shell
npm install --save @opentelemetry/exporter-prometheus
```
Update your OpenTelemetry configuration to use the exporter and to send data to
your Prometheus backend:
```ts
import * as opentelemetry from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

const sdk = new opentelemetry.NodeSDK({
  metricReader: new PrometheusExporter({
    port: 9464, // optional - default is 9464
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```
```js
const opentelemetry = require('@opentelemetry/sdk-node');
const {
  getNodeAutoInstrumentations,
} = require('@opentelemetry/auto-instrumentations-node');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const sdk = new opentelemetry.NodeSDK({
  metricReader: new PrometheusExporter({
    port: 9464, // optional - default is 9464
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```
With the above you can access your metrics at
http://localhost:9464/metrics
.
Prometheus or an OpenTelemetry Collector with the Prometheus receiver can scrape
the metrics from this endpoint.
## Zipkin
### Backend Setup
Note
If you have Zipkin or a Zipkin-compatible backend already set up, you can skip
this section and setup the
Zipkin exporter dependencies
for your application.
You can run
Zipkin
on in a Docker container by executing
the following command:
```shell
docker run --rm -d -p 9411:9411 --name zipkin openzipkin/zipkin
```
## Dependencies
To send your trace data to
Zipkin
, you can use the
`ZipkinExporter`
.
Install the
exporter package
as a dependency for your application:
```shell
npm install --save @opentelemetry/exporter-zipkin
```
Update your OpenTelemetry configuration to use the exporter and to send data to
your Zipkin backend:
```ts
import * as opentelemetry from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';

const sdk = new opentelemetry.NodeSDK({
  traceExporter: new ZipkinExporter({}),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```
```js
const opentelemetry = require('@opentelemetry/sdk-node');
const {
  getNodeAutoInstrumentations,
} = require('@opentelemetry/auto-instrumentations-node');
const { ZipkinExporter } = require('@opentelemetry/exporter-zipkin');

const sdk = new opentelemetry.NodeSDK({
  traceExporter: new ZipkinExporter({}),
  instrumentations: [getNodeAutoInstrumentations()],
});
```
## Custom exporters
Finally, you can also write your own exporter. For more information, see the
SpanExporter Interface in the API documentation
.
## Batching span and log records
The OpenTelemetry SDK provides a set of default span and log record processors,
that allow you to either emit spans one-by-on (“simple”) or batched. Using
batching is recommended, but if you do not want to batch your spans or log
records, you can use a simple processor instead as follows:
```ts
/*instrumentation.ts*/
import * as opentelemetry from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```
```js
/*instrumentation.js*/
const opentelemetry = require('@opentelemetry/sdk-node');
const {
  getNodeAutoInstrumentations,
} = require('@opentelemetry/auto-instrumentations-node');

const sdk = new opentelemetry.NodeSDK({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
```
## Feedback
Was this page helpful?
Thank you. Your feedback is appreciated!
Please let us know
how we can improve this page
. Your feedback is appreciated!
Last modified October 16, 2026:
Update JS docs for otel-js sdk-trace migration (#12084) (c0af68cd)