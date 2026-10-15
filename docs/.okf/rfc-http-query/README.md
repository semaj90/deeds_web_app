# RFC 10008: The HTTP QUERY Method

**Document title:** The HTTP QUERY Method  
**RFC:** 10008  
**Published:** June 2026  
**Status:** Standards Track, Proposed Standard  
**Classification:** External protocol reference; not an Atlas capability receipt

## Source references

- [RFC 10008 — The HTTP QUERY Method](https://www.rfc-editor.org/rfc/rfc10008.html)
- [RFC 9114 — HTTP/3](https://www.rfc-editor.org/rfc/rfc9114.html)
- [RFC 9000 — QUIC: A UDP-Based Multiplexed and Secure Transport](https://www.rfc-editor.org/rfc/rfc9000.html)
- [ASGI server implementations](https://asgi.readthedocs.io/en/latest/implementations.html)

The RFC pages were retrieved with Firecrawl for source discovery and reviewed
against their publisher pages. The repository's existing BeautifulSoup/Pydantic
capture validator was also attempted for these URLs, but it stopped before
fetching because this Windows Python environment lacks `pydantic`. Therefore no
BeautifulSoup validation or persisted raw capture is claimed. Retry through the
existing validator in its declared Python environment before treating these as
validated captures.

## Protocol distinctions

- RFC 10008 defines HTTP `QUERY`: a request content body is processed as a safe,
  idempotent query. It is an HTTP method, not a transport and not a claim that an
  Atlas route currently accepts it.
- The request media type must be explicit and supported. A server can use the
  `Accept-Query` response field to advertise supported query media types; it must
  not infer or override a missing or incorrect media type by content sniffing.
- A shared cache key for `QUERY` must incorporate request content and related
  metadata. Atlas must additionally isolate authorization and source/workspace
  revisions or disable shared caching.
- RFC 9114 maps HTTP semantics onto QUIC. HTTP/3 requests use QUIC streams; this
  does not establish gRPC-over-QUIC, global request ordering, or CPU parallelism.
  Join concurrent work by request/correlation identity and explicit ordering
  fields, not stream or completion order.

## Parent Atlas application boundary

The existing `.okf` keyword corpus may use these terms for local, bounded
reference lookup. Its `reference_only`, `canonical_authority: false`, and
non-indexed policy remain unchanged. A future HTTP QUERY endpoint must delegate
to the existing read-only SearchRuntime contract, validate a bounded request
body, preserve caller/request digests and revisions, and remain write- and
tool-execution-free. No route, HTTP/3 listener, QUIC RPC client, or production
cache behavior is implemented or proven by this note.

## Acquisition record

| Source | Firecrawl | BeautifulSoup/Pydantic validator |
| --- | --- | --- |
| RFC 10008 | Retrieved; title confirmed | Blocked before fetch: `pydantic` missing |
| RFC 9114 | Retrieved; title confirmed | Blocked before fetch: `pydantic` missing |
| RFC 9000 | Retrieved; title confirmed | Blocked before fetch: `pydantic` missing |
| ASGI implementations | Retrieved | Blocked before fetch: `pydantic` missing |

This note is a curated research summary, not a verbatim copy of the RFCs. The
publisher documents remain the authoritative protocol sources.
