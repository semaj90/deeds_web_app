[Edit](https://serde.rs/#)

[Font Settings](https://serde.rs/#)

AA

SerifSans

WhiteSepiaNight

# [Overview](https://serde.rs/)

[![GitHub](https://serde.rs/img/github.svg)](https://github.com/serde-rs/serde)[![rustdoc](https://serde.rs/img/rustdoc.svg)](https://docs.rs/serde)[![Latest Version](https://img.shields.io/crates/v/serde.svg?style=social)](https://crates.io/crates/serde)

# Serde

Serde is a framework for **_ser_** ializing and **_de_** serializing Rust data
structures efficiently and generically.

The Serde ecosystem consists of data structures that know how to serialize and
deserialize themselves along with data formats that know how to serialize and
deserialize other things. Serde provides the layer by which these two groups
interact with each other, allowing any supported data structure to be serialized
and deserialized using any supported data format.

Decrusting the serde crate - YouTube

Tap to unmute

[Decrusting the serde crate](https://www.youtube.com/watch?v=BI_bHCGRgMY) [Jon Gjengset](https://www.youtube-nocookie.com/channel/UC_iD0xppBwwsrM9DegC5cQQ)

![thumbnail-image](https://yt3.ggpht.com/qeOPL5VD3HyYtB2IR45AamePTTlAPLAVMIJR1gnqB8-RB5giim7SBLhOz2NRYZx-CeBAF3wp=s68-c-k-c0x00ffffff-no-rj)

Jon Gjengset111K subscribers

[Watch on](https://www.youtube.com/watch?v=BI_bHCGRgMY)

### Design

Where many other languages rely on runtime reflection for serializing data,
Serde is instead built on Rust's powerful trait system. A data structure that
knows how to serialize and deserialize itself is one that implements Serde's
`Serialize` and `Deserialize` traits (or uses Serde's derive attribute to
automatically generate implementations at compile time). This avoids any
overhead of reflection or runtime type information. In fact in many situations
the interaction between data structure and data format can be completely
optimized away by the Rust compiler, leaving Serde serialization to perform
the same speed as a handwritten serializer for the specific selection of data
structure and data format.

### Data formats

The following is a partial list of data formats that have been implemented for
Serde by the community.

- [JSON](https://github.com/serde-rs/json), the ubiquitous JavaScript Object Notation used by many HTTP APIs.
- [Postcard](https://github.com/jamesmunns/postcard), a no\_std and embedded-systems friendly compact binary format.
- [CBOR](https://github.com/enarx/ciborium), a Concise Binary Object Representation designed for small message size
without the need for version negotiation.
- [YAML](https://github.com/dtolnay/serde-yaml), a self-proclaimed human-friendly configuration language that ain't
markup language.
- [MessagePack](https://github.com/3Hren/msgpack-rust), an efficient binary format that resembles a compact JSON.
- [TOML](https://docs.rs/toml), a minimal configuration format used by [Cargo](https://doc.rust-lang.org/cargo/reference/manifest.html).
- [Pickle](https://github.com/birkenfeld/serde-pickle), a format common in the Python world.
- [RON](https://github.com/ron-rs/ron), a Rusty Object Notation.
- [BSON](https://github.com/mongodb/bson-rust), the data storage and network transfer format used by MongoDB.
- [Avro](https://docs.rs/apache-avro), a binary format used within Apache Hadoop, with support for schema
definition.
- [JSON5](https://github.com/callum-oakley/json5-rs), a superset of JSON including some productions from ES5.
- [URL](https://docs.rs/serde_qs) query strings, in the x-www-form-urlencoded format.
- [Starlark](https://github.com/dtolnay/serde-starlark), the format used for describing build targets by the Bazel and Buck
build systems. _(serialization only)_
- [Envy](https://github.com/softprops/envy), a way to deserialize environment variables into Rust structs.
_(deserialization only)_
- [Envy Store](https://github.com/softprops/envy-store), a way to deserialize [AWS Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html) parameters into Rust
structs. _(deserialization only)_
- [S-expressions](https://github.com/rotty/lexpr-rs), the textual representation of code and data used by the Lisp
language family.
- [D-Bus](https://docs.rs/zvariant)'s binary wire format.
- [FlexBuffers](https://github.com/google/flatbuffers/tree/master/rust/flexbuffers), the schemaless cousin of Google's FlatBuffers zero-copy
serialization format.
- [Bencode](https://github.com/P3KI/bendy), a simple binary format used in the BitTorrent protocol.
- [Token streams](https://github.com/oxidecomputer/serde_tokenstream), for processing Rust procedural macro input. _(deserialization_
_only)_
- [DynamoDB Items](https://docs.rs/serde_dynamo), the format used by [rusoto\_dynamodb](https://docs.rs/rusoto_dynamodb) to transfer data to
and from DynamoDB.
- [Hjson](https://github.com/Canop/deser-hjson), a syntax extension to JSON designed around human reading and editing.
_(deserialization only)_
- [CSV](https://docs.rs/csv), Comma-separated values is a tabular text file format.

### Data structures

Out of the box, Serde is able to serialize and deserialize common Rust data
types in any of the above formats. For example `String`, `&str`, `usize`,
`Vec<T>`, `HashMap<K,V>` are all supported. In addition, Serde provides a derive
macro to generate serialization implementations for structs in your own program.
Using the derive macro goes like this:

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
struct Point {
    x: i32,
    y: i32,
}

fn main() {
    let point = Point { x: 1, y: 2 };

    // Convert the Point to a JSON string.
    let serialized = serde_json::to_string(&point).unwrap();

    // Prints serialized = {"x":1,"y":2}
    println!("serialized = {}", serialized);

    // Convert the JSON string back to a Point.
    let deserialized: Point = serde_json::from_str(&serialized).unwrap();

    // Prints deserialized = Point { x: 1, y: 2 }
    println!("deserialized = {:?}", deserialized);
}
```