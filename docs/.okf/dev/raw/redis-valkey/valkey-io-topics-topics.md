**[Save Your Spot for ValkeyConf 2026](https://events.linuxfoundation.org/valkeyconf)** \| October 5, 2026 \| Prague, Czechia

[![Icon Close](https://valkey.io/img/icon-outline-close.svg)](https://valkey.io/)

# Documentation by Topic

The Valkey documentation is managed in markdown files in the
[valkey-doc repository](https://github.com/valkey-io/valkey-doc).
It's released under the
[Creative Commons Attribution-ShareAlike 4.0 International license](https://creativecommons.org/licenses/by-sa/4.0/).

# Valkey Documentation

## 1\. Introduction

- What is Valkey? See [Introduction](https://valkey.io/topics/introduction).
- [Quick start](https://valkey.io/topics/quickstart): Get started with Valkey.
- [Valkey Bundle](https://valkey.io/topics/valkey-bundle): Get started with Valkey Bundle.
- [FAQ](https://valkey.io/topics/faq): Frequently asked questions.

## 2\. Developer Guide

### Core Concepts

- [Data types](https://valkey.io/topics/data-types): Keys are strings, but values can be of many different data types.
- [The full list of commands](https://valkey.io/commands/), with documentation for each of them.
- [Pipelining](https://valkey.io/topics/pipelining): How to send multiple commands at once, saving on round trip time.
- [Transactions](https://valkey.io/topics/transactions): Valkey's approach to atomic transactions.
- [Expires](https://valkey.io/commands/expire): How to set a Time To Live (TTL) on key so that it will be automatically removed from the server when it expires.
- [Pub/Sub](https://valkey.io/topics/pubsub): Using Valkey as a message broker using the Publish/Subscribe messaging system.
- [Keyspace notifications](https://valkey.io/topics/notifications): Get notifications of keyspace events via Pub/Sub.
- [Keyspace management](https://valkey.io/topics/keyspace): How to alter, query, and navigate the keyspace.

### Application Patterns & Tutorials

- [Valkey as an LRU cache](https://valkey.io/topics/lru-cache): How to configure Valkey as a cache with a fixed amount of memory and automatic eviction of keys.
- [Client side caching](https://valkey.io/topics/client-side-caching): How a client can be notified by the server when a key has changed.
- [Distributed locks](https://valkey.io/topics/distlock): Implementing a distributed lock manager.
- [Secondary indexes](https://valkey.io/topics/indexing): How to simulate secondary indexes, composed indexes and traverse graphs using various data structures.
- [Writing a simple Twitter clone with PHP and Valkey](https://valkey.io/topics/twitter-clone)

## 3\. Extending Valkey

### Server-side scripting in Valkey

- [Programmability overview](https://valkey.io/topics/programmability): An overview of programmability in Valkey.
- [Introduction to Eval Scripts](https://valkey.io/topics/eval-intro): An introduction about using cached scripts.
- [Introduction to Valkey Functions](https://valkey.io/topics/functions-intro): An introduction about using functions.
- [Valkey Lua API](https://valkey.io/topics/lua-api): The embedded [Lua 5.1](https://lua.org/) interpreter runtime environment and APIs.
- [Debugging Lua scripts](https://valkey.io/topics/ldb): An overview of the native Valkey Lua debugger for cached scripts.

### Valkey modules API

- [Introduction to Valkey modules](https://valkey.io/topics/modules-intro): Extend Valkey using dynamically linked modules.
- [Implementing native data types](https://valkey.io/topics/modules-native-types): Modules scan implement new data types (data structures and more) that look like built-in data types. This documentation covers the API to do so.
- [Blocking operations](https://valkey.io/topics/modules-blocking-ops): Write commands that can block the client (without blocking Valkey) and can execute tasks in other threads.
- [Modules API reference](https://valkey.io/topics/modules-api-ref): Documentation of all module API functions. Low level details about API usage.

## 4\. Administration

### Core Management

- [License](https://valkey.io/topics/license): License information for Valkey.
- [Installation](https://valkey.io/topics/installation): How to install and configure Valkey. This targets people without prior experience with Valkey.
- [Release Downloads](https://valkey.io/download/releases/): Lists links to download all current and previous releases.
- [valkey-cli](https://valkey.io/topics/cli): The Valkey command line interface, used for administration, troubleshooting and experimenting with Valkey.
- [valkey-server](https://valkey.io/topics/server): How to run the Valkey server.
- [Configuration](https://valkey.io/topics/valkey.conf): How to configure Valkey.
- [Persistence](https://valkey.io/topics/persistence): Options for configuring durability using disk backups.
- [Signals Handling](https://valkey.io/topics/signals): How Valkey handles signals.
- [Connections Handling](https://valkey.io/topics/clients): How Valkey handles clients connections.
- [Migration](https://valkey.io/topics/migration): How to migrate from Redis to Valkey and check Redis compatibility.
- [Releases and Versioning](https://valkey.io/topics/releases): Valkey's development cycle and version numbering.
- [Administration](https://valkey.io/topics/admin): Various administration topics.

### Deployment Topology

- [Replication](https://valkey.io/topics/replication): What you need to know to set up primary-replica replication.
- [Sentinel](https://valkey.io/topics/sentinel): Valkey Sentinel is one of the official high availability deployment modes.
- [Sentinel client spec](https://valkey.io/topics/sentinel-clients): How to build clients for Valkey Sentinel.
- [Cluster tutorial](https://valkey.io/topics/cluster-tutorial): A gentle introduction to Valkey Cluster, a deployment mode for horizontal scaling and high availability.
- [Cluster specification](https://valkey.io/topics/cluster-spec): The more formal description of the behavior and algorithms used in Valkey Cluster.
- [Atomic slot migration](https://valkey.io/topics/atomic-slot-migration): An overview of atomic slot migration in Valkey Cluster.

### Security

- [Security](https://valkey.io/topics/security): An overview of Valkey's security.
- [Access Control Lists](https://valkey.io/topics/acl): ACLs make it possible to allow users to run only selected commands and access only specific key patterns.
- [TLS](https://valkey.io/topics/tls): How to use TLS for communication.

### Platform Specific

- [ARM and Raspberry Pi](https://valkey.io/topics/ARM): ARM and the Raspberry Pi are supported platforms. This page contains general information and benchmarks.
- [RDMA](https://valkey.io/topics/RDMA): An overview of RDMA support.

## 5\. Performance & Troubleshooting

- [Troubleshooting](https://valkey.io/topics/problems): Problems? Bugs? High latency? Other issues? Use our problems troubleshooting page as a starting point to find more information.
- [Memory optimization](https://valkey.io/topics/memory-optimization): Understand how Valkey uses RAM.
- [Latency monitoring](https://valkey.io/topics/latency-monitor): Integrated latency monitoring and reporting help tuning for low latency.
- [valkey-benchmark](https://valkey.io/topics/benchmark): The benchmarking tool shipped with Valkey.
- [On-CPU profiling and tracing](https://valkey.io/topics/performance-on-cpu): How to find on-CPU resource bottlenecks.
- [Debugging](https://valkey.io/topics/debugging): How to debug Valkey server processes.
- [Diagnosing latency issues](https://valkey.io/topics/latency): How to diagnose latency problems with Valkey.
- [Mass insertion of data](https://valkey.io/topics/mass-insertion): How to add a big amount of data to a Valkey instance in a short time.

## 6\. Low-Level Internals

- [Protocol specification](https://valkey.io/topics/protocol): The client-server protocol, for client authors.
- [Command key specifications](https://valkey.io/topics/key-specs): How to extract the names of keys accessed by every command.
- [Command tips](https://valkey.io/topics/command-tips): Command tips communicate non-trivial execution modes and post-processing information about commands.
- [Command arguments](https://valkey.io/topics/command-arguments): An overview of command arguments as returned by the `COMMAND DOCS` command.

reCAPTCHA