# Introduction to gRPC

An introduction to gRPC and protocol buffers.

[Contents](https://grpc.io/docs/what-is-grpc/introduction/#td-content__toc)

# Introduction to gRPC

An introduction to gRPC and protocol buffers.

This page introduces you to gRPC and protocol buffers. gRPC can use
protocol buffers as both its Interface Definition Language ( **IDL**) and as its underlying message
interchange format. If you’re new to gRPC and/or protocol buffers, read this!
If you just want to dive in and see gRPC in action first,
[select a language](https://grpc.io/docs/languages/) and try its **Quick start**.

gRPC in 5 minutes \| Eric Anderson & Ivy Zhuang, Google - YouTube

Tap to unmute

[gRPC in 5 minutes \| Eric Anderson & Ivy Zhuang, Google](https://www.youtube.com/watch?v=njC24ts24Pg) [gRPC](https://www.youtube.com/channel/UCrnk1HWelWnYtF78YZX80fg)

gRPC3.92K subscribers

## Overview

In gRPC, a client application can directly call a method on a server application
on a different machine as if it were a local object, making it easier for you to
create distributed applications and services. As in many RPC systems, gRPC is
based around the idea of defining a service, specifying the methods that can be
called remotely with their parameters and return types. On the server side, the
server implements this interface and runs a gRPC server to handle client calls.
On the client side, the client has a stub (referred to as just a client in some
languages) that provides the same methods as the server.

![Concept Diagram](https://grpc.io/img/landing-2.svg)

gRPC clients and servers can run and talk to each other in a variety of
environments - from servers inside Google to your own desktop - and can be
written in any of gRPC’s supported languages. So, for example, you can easily
create a gRPC server in Java with clients in Go, Python, or Ruby. In addition,
the latest Google APIs will have gRPC versions of their interfaces, letting you
easily build Google functionality into your applications.

### Working with Protocol Buffers

By default, gRPC uses [Protocol Buffers](https://protobuf.dev/overview), Google’s
mature open source mechanism for serializing structured data (although it
can be used with other data formats such as JSON). Here’s a quick intro to how
it works. If you’re already familiar with protocol buffers, feel free to skip
ahead to the next section.

The first step when working with protocol buffers is to define the structure
for the data you want to serialize in a _proto file_: this is an ordinary text
file with a `.proto` extension. Protocol buffer data is structured as
_messages_, where each message is a small logical record of information
containing a series of name-value pairs called _fields_. Here’s a simple
example:

```proto
message Person {
  string name = 1;
  int32 id = 2;
  bool has_ponycopter = 3;
}
```

Then, once you’ve specified your data structures, you use the protocol buffer
compiler `protoc` to generate data access classes in your preferred language(s)
from your proto definition. These provide simple accessors for each field,
like `name()` and `set_name()`, as well as methods to serialize/parse
the whole structure to/from raw bytes. So, for instance, if your chosen
language is C++, running the compiler on the example above will generate a
class called `Person`. You can then use this class in your application to
populate, serialize, and retrieve `Person` protocol buffer messages.

You define gRPC services
in ordinary proto files, with RPC method parameters and return types specified as
protocol buffer messages:

```proto
// The greeter service definition.
service Greeter {
  // Sends a greeting
  rpc SayHello (HelloRequest) returns (HelloReply) {}
}

// The request message containing the user's name.
message HelloRequest {
  string name = 1;
}

// The response message containing the greetings
message HelloReply {
  string message = 1;
}
```

gRPC uses `protoc` with a special gRPC plugin to
generate code from your proto file: you get
generated gRPC client and server code, as well as the regular protocol buffer
code for populating, serializing, and retrieving your message types. To learn more about protocol buffers, including how to install `protoc` with the
gRPC plugin in your chosen language, see the [protocol buffers documentation](https://protobuf.dev/overview).

## Protocol buffer versions

While [protocol buffers](https://protobuf.dev/overview) have been available to open source users for some time,
most examples from this site use protocol buffers version 3 (proto3), which has
a slightly simplified syntax, some useful new features, and supports more
languages. Proto3 is currently available in Java, C++, Dart, Python,
Objective-C, C#, a lite-runtime (Android Java), Ruby, and JavaScript from the
[protocol buffers GitHub repo](https://github.com/google/protobuf/releases), as well as a Go language generator from the
[golang/protobuf official package](https://pkg.go.dev/google.golang.org/protobuf), with more languages in development. You can
find out more in the [proto3 language guide](https://protobuf.dev/programming-guides/proto3) and the [reference\\
documentation](https://protobuf.dev/reference) available for each language. The reference documentation also
includes a [formal specification](https://protobuf.dev/reference/protobuf/proto3-spec) for the `.proto` file format.

In general, while you can use proto2 (the current default protocol buffers
version), we recommend that you use proto3 with gRPC as it lets you use the
full range of gRPC-supported languages, as well as avoiding compatibility
issues with proto2 clients talking to proto3 servers and vice versa.

Last modified November 12, 2024: [Embed YouTube videos in different webpages (#1380) (196f408)](https://github.com/grpc/grpc.io/commit/196f408ae74741605fbb66f3ccf23b81fe384667)

[View page source](https://github.com/grpc/grpc.io/tree/main/content/en/docs/what-is-grpc/introduction.md) [Edit this page](https://github.com/grpc/grpc.io/edit/main/content/en/docs/what-is-grpc/introduction.md) [Create child page](https://github.com/grpc/grpc.io/new/main/content/en/docs/what-is-grpc/introduction.md?filename=change-me.md&value=---%0Atitle%3A+%22Long+Page+Title%22%0AlinkTitle%3A+%22Short+Nav+Title%22%0Aweight%3A+100%0Adescription%3A+%3E-%0A+++++Page+description+for+heading+and+indexes.%0A---%0A%0A%23%23+Heading%0A%0AEdit+this+template+to+create+your+new+page.%0A%0A%2A+Give+it+a+good+name%2C+ending+in+%60.md%60+-+e.g.+%60getting-started.md%60%0A%2A+Edit+the+%22front+matter%22+section+at+the+top+of+the+page+%28weight+controls+how+its+ordered+amongst+other+pages+in+the+same+directory%3B+lowest+number+first%29.%0A%2A+Add+a+good+commit+message+at+the+bottom+of+the+page+%28%3C80+characters%3B+use+the+extended+description+field+for+more+detail%29.%0A%2A+Create+a+new+branch+so+you+can+preview+your+new+file+and+request+a+review+via+Pull+Request.%0A) [Create documentation issue](https://github.com/grpc/grpc.io/issues/new?title=Introduction%20to%20gRPC) [Create project issue](https://github.com/grpc/grpc.io/issues/new)