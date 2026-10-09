## ![](https://pkg.go.dev/static/shared/icon/chrome_reader_mode_gm_grey_24dp.svg)  README  [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#section-readme "Go to Readme")

[![Go Reference](https://pkg.go.dev/badge/github.com/jackc/pgx/v5.svg)](https://pkg.go.dev/github.com/jackc/pgx/v5)[![Build Status](https://github.com/jackc/pgx/actions/workflows/ci.yml/badge.svg)](https://github.com/jackc/pgx/actions/workflows/ci.yml)

### pgx - PostgreSQL Driver and Toolkit

pgx is a pure Go driver and toolkit for PostgreSQL.

The pgx driver is a low-level, high performance interface that exposes PostgreSQL-specific features such as `LISTEN` /
`NOTIFY` and `COPY`. It also includes an adapter for the standard `database/sql` interface.

The toolkit component is a related set of packages that implement PostgreSQL functionality such as parsing the wire protocol
and type mapping between PostgreSQL and Go. These underlying packages can be used to implement alternative drivers,
proxies, load balancers, logical replication clients, etc.

#### Quick Start

##### Installation

```
go get github.com/jackc/pgx/v5
```

##### Example Usage

```
package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	// urlExample := "postgres://username:password@localhost:5432/database_name"
	conn, err := pgx.Connect(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(context.Background())

	var name string
	var weight int64
	err = conn.QueryRow(context.Background(), "select name, weight from widgets where id=$1", 42).Scan(&name, &weight)
	if err != nil {
		fmt.Fprintf(os.Stderr, "QueryRow failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(name, weight)
}
```

##### Connection Configuration

`pgx.Connect` and `pgxpool.New` accept PostgreSQL connection URLs (such as `postgres://user:pass@host:5432/db?sslmode=verify-full`) as well as `key=value` strings. See [`pgconn.ParseConfig`](https://pkg.go.dev/github.com/jackc/pgx/v5/pgconn#ParseConfig) and the [PostgreSQL connection string documentation](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING) for supported options and environment variables.

For a step-by-step walkthrough, see the [getting started guide](https://github.com/jackc/pgx/wiki/Getting-started-with-pgx).

#### Documentation

Package documentation and API reference are available on [pkg.go.dev](https://pkg.go.dev/github.com/jackc/pgx/v5):

- [`pgx`](https://pkg.go.dev/github.com/jackc/pgx/v5) — base PostgreSQL driver
- [`pgxpool`](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool) — concurrency-safe connection pool
- [`stdlib`](https://pkg.go.dev/github.com/jackc/pgx/v5/stdlib) — `database/sql` compatibility adapter

#### Features

- Support for approximately 70 different PostgreSQL types
- Automatic statement preparation and caching
- Batch queries
- Single-round trip query mode
- Full TLS connection control
- Binary format support for custom types (allows for much quicker encoding/decoding)
- `COPY` protocol support for faster bulk data loads
- Tracing and logging support
- Connection pool with after-connect hook for arbitrary connection setup
- `LISTEN` / `NOTIFY`
- Conversion of PostgreSQL arrays to Go slice mappings for integers, floats, and strings
- `hstore` support
- `json` and `jsonb` support
- Maps `inet` and `cidr` PostgreSQL types to `netip.Addr` and `netip.Prefix`
- Large object support
- NULL mapping to pointer to pointer
- Supports `database/sql.Scanner` and `database/sql/driver.Valuer` interfaces for custom types
- Notice response handling
- Simulated nested transactions with savepoints

#### Choosing Between the pgx and database/sql Interfaces

The pgx interface is faster. Many PostgreSQL specific features such as `LISTEN` / `NOTIFY` and `COPY` are not available
through the `database/sql` interface.

The pgx interface is recommended when:

1. The application only targets PostgreSQL.
2. No other libraries that require `database/sql` are in use.

It is also possible to use the `database/sql` interface and convert a connection to the lower-level pgx interface as needed.

#### Development and Testing

Each checkout has its own PostgreSQL 14-18 clusters and CockroachDB node, so the whole test matrix
is available locally on macOS, on Linux, or in the included devcontainer. Only PostgreSQL 18 stays
running by default; other targets start and stop around their tests:

```
scripts/setup-host # native macOS (Homebrew required) or Ubuntu: host packages and mise
export PATH="$HOME/.local/bin:$PATH" # if mise was just installed
mise trust
mise install        # project tools
mise run dev:init   # checkout ports and certificates
mise run dev        # start PostgreSQL 18 and the on-demand database supervisor
./test.sh           # the suite against PostgreSQL 18
./test.sh all       # every target, starting and stopping each server as needed
```

Host setup installs PostgreSQL 14-18 and Ruby build dependencies. It does not install project
tools or initialize the checkout; those remain separate steps above. The devcontainer already
provides the host prerequisites.

See [DEVELOPMENT.md](https://github.com/jackc/pgx/blob/v5.11.0/DEVELOPMENT.md) for the full setup, and
[CONTRIBUTING.md](https://github.com/jackc/pgx/blob/v5.11.0/CONTRIBUTING.md) for how to contribute — including how to run the tests against
a PostgreSQL server you already have, without any of the above.

#### Architecture

See the presentation at Golang Estonia, [PGX Top to Bottom](https://www.youtube.com/watch?v=sXMSWhcHCf8) for a description of pgx architecture.

#### Supported Go and PostgreSQL Versions

pgx supports the same versions of Go and PostgreSQL that are supported by their respective teams. For [Go](https://golang.org/doc/devel/release.html#policy) that is the two most recent major releases and for [PostgreSQL](https://www.postgresql.org/support/versioning/) the major releases in the last 5 years. This means pgx supports Go 1.25 and higher and PostgreSQL 14 and higher. pgx also is tested against the latest version of [CockroachDB](https://www.cockroachlabs.com/product/).

#### Version Policy

pgx follows semantic versioning for the documented public API on stable releases. `v5` is the latest stable major version.

#### PGX Family Libraries

##### [github.com/jackc/pglogrepl](https://github.com/jackc/pglogrepl)

pglogrepl provides functionality to act as a client for PostgreSQL logical replication.

##### [github.com/jackc/pgmock](https://github.com/jackc/pgmock)

pgmock offers the ability to create a server that mocks the PostgreSQL wire protocol. This is used internally to test pgx by purposely inducing unusual errors. pgproto3 and pgmock together provide most of the foundational tooling required to implement a PostgreSQL proxy or MitM (such as for a custom connection pooler).

##### [github.com/jackc/tern](https://github.com/jackc/tern)

tern is a stand-alone SQL migration system.

##### [github.com/jackc/pgerrcode](https://github.com/jackc/pgerrcode)

pgerrcode contains constants for the PostgreSQL error codes.

#### Adapters for 3rd Party Types

- [github.com/jackc/pgx-gofrs-uuid](https://github.com/jackc/pgx-gofrs-uuid)
- [github.com/jackc/pgx-shopspring-decimal](https://github.com/jackc/pgx-shopspring-decimal)
- [github.com/ColeBurch/pgx-govalues-decimal](https://github.com/ColeBurch/pgx-govalues-decimal)
- [github.com/twpayne/pgx-geos](https://github.com/twpayne/pgx-geos) ( [PostGIS](https://postgis.net/) and [GEOS](https://libgeos.org/) via [go-geos](https://github.com/twpayne/go-geos))
- [github.com/vgarvardt/pgx-google-uuid](https://github.com/vgarvardt/pgx-google-uuid)

#### Adapters for 3rd Party Tracers

- [github.com/jackhopner/pgx-xray-tracer](https://github.com/jackhopner/pgx-xray-tracer)
- [github.com/exaring/otelpgx](https://github.com/exaring/otelpgx)

#### Adapters for 3rd Party Loggers

These adapters can be used with the tracelog package.

- [github.com/jackc/pgx-go-kit-log](https://github.com/jackc/pgx-go-kit-log)
- [github.com/jackc/pgx-log15](https://github.com/jackc/pgx-log15)
- [github.com/jackc/pgx-logrus](https://github.com/jackc/pgx-logrus)
- [github.com/jackc/pgx-zap](https://github.com/jackc/pgx-zap)
- [github.com/jackc/pgx-zerolog](https://github.com/jackc/pgx-zerolog)
- [github.com/mcosta74/pgx-slog](https://github.com/mcosta74/pgx-slog)
- [github.com/kataras/pgx-golog](https://github.com/kataras/pgx-golog)

#### 3rd Party Libraries with PGX Support

##### [github.com/pashagolub/pgxmock](https://github.com/pashagolub/pgxmock)

pgxmock is a mock library implementing pgx interfaces.
pgxmock has one and only purpose - to simulate pgx behavior in tests, without needing a real database connection.

##### [github.com/georgysavva/scany](https://github.com/georgysavva/scany)

Library for scanning data from a database into Go structs and more.

##### [github.com/vingarcia/ksql](https://github.com/vingarcia/ksql)

A carefully designed SQL client for making using SQL easier,
more productive, and less error-prone on Golang.

##### [github.com/otan/gopgkrb5](https://github.com/otan/gopgkrb5)

Adds GSSAPI / Kerberos authentication support.

##### [github.com/wcamarao/pmx](https://github.com/wcamarao/pmx)

Explicit data mapping and scanning library for Go structs and slices.

##### [github.com/stephenafamo/scan](https://github.com/stephenafamo/scan)

Type safe and flexible package for scanning database data into Go types.
Supports, structs, maps, slices and custom mapping functions.

##### [github.com/z0ne-dev/mgx](https://github.com/z0ne-dev/mgx)

Code first migration library for native pgx (no database/sql abstraction).

##### [github.com/amirsalarsafaei/sqlc-pgx-monitoring](https://github.com/amirsalarsafaei/sqlc-pgx-monitoring)

A database monitoring/metrics library for pgx and sqlc. Trace, log and monitor your sqlc query performance using OpenTelemetry.

##### [https://github.com/nikolayk812/pgx-outbox](https://github.com/nikolayk812/pgx-outbox)

Simple Golang implementation for transactional outbox pattern for PostgreSQL using jackc/pgx driver.

##### [https://github.com/Arlandaren/pgxWrappy](https://github.com/Arlandaren/pgxWrappy)

Simplifies working with the pgx library, providing convenient scanning of nested structures.

##### [https://github.com/KoNekoD/pgx-colon-query-rewriter](https://github.com/KoNekoD/pgx-colon-query-rewriter)

Implementation of the pgx query rewriter to use ':' instead of '@' in named query parameters.

Expand ▾Collapse ▴

## ![](https://pkg.go.dev/static/shared/icon/code_gm_grey_24dp.svg)  Documentation  [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#section-documentation "Go to Documentation")

### Overview [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#pkg-overview "Go to Overview")

- [Establishing a Connection](https://pkg.go.dev/github.com/jackc/pgx/v5#hdr-Establishing_a_Connection)
- [Connection Pool](https://pkg.go.dev/github.com/jackc/pgx/v5#hdr-Connection_Pool)
- [Query Interface](https://pkg.go.dev/github.com/jackc/pgx/v5#hdr-Query_Interface)
- [PostgreSQL Data Types](https://pkg.go.dev/github.com/jackc/pgx/v5#hdr-PostgreSQL_Data_Types)
- [Transactions](https://pkg.go.dev/github.com/jackc/pgx/v5#hdr-Transactions)
- [Prepared Statements](https://pkg.go.dev/github.com/jackc/pgx/v5#hdr-Prepared_Statements)
- [Copy Protocol](https://pkg.go.dev/github.com/jackc/pgx/v5#hdr-Copy_Protocol)
- [Listen and Notify](https://pkg.go.dev/github.com/jackc/pgx/v5#hdr-Listen_and_Notify)
- [Tracing and Logging](https://pkg.go.dev/github.com/jackc/pgx/v5#hdr-Tracing_and_Logging)
- [Lower Level PostgreSQL Functionality](https://pkg.go.dev/github.com/jackc/pgx/v5#hdr-Lower_Level_PostgreSQL_Functionality)
- [PgBouncer](https://pkg.go.dev/github.com/jackc/pgx/v5#hdr-PgBouncer)

Package pgx is a PostgreSQL database driver.

pgx provides a native PostgreSQL driver and can act as a [database/sql/driver](https://pkg.go.dev/database/sql/driver). The native PostgreSQL interface is similar
to the [database/sql](https://pkg.go.dev/database/sql) interface while providing better speed and access to PostgreSQL specific features. Use
[github.com/jackc/pgx/v5/stdlib](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/stdlib) to use pgx as a database/sql compatible driver. See that package's documentation for
details.

#### Establishing a Connection [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#hdr-Establishing_a_Connection "Go to Establishing a Connection")

The primary way of establishing a connection is with [pgx.Connect](https://pkg.go.dev/github.com/jackc/pgx/v5#Connect):

```
conn, err := pgx.Connect(context.Background(), os.Getenv("DATABASE_URL"))
```

The database connection string can be in URL or key/value format. Both PostgreSQL settings and pgx settings can be
specified here. In addition, a config struct can be created by [ParseConfig](https://pkg.go.dev/github.com/jackc/pgx/v5#ParseConfig) and modified before establishing the
connection with [ConnectConfig](https://pkg.go.dev/github.com/jackc/pgx/v5#ConnectConfig) to configure settings such as tracing that cannot be configured with a connection
string.

#### Connection Pool [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#hdr-Connection_Pool "Go to Connection Pool")

[\*pgx.Conn](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn) represents a single connection to the database and is not concurrency safe. Use package
[github.com/jackc/pgx/v5/pgxpool](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgxpool) for a concurrency safe connection pool.

#### Query Interface [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#hdr-Query_Interface "Go to Query Interface")

pgx implements [Conn.Query](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Query) in the familiar database/sql style. However, pgx provides generic functions such as [CollectRows](https://pkg.go.dev/github.com/jackc/pgx/v5#CollectRows) and
[ForEachRow](https://pkg.go.dev/github.com/jackc/pgx/v5#ForEachRow) that are a simpler and safer way of processing rows than manually calling defer [Rows.Close](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows.Close), [Rows.Next](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows.Next),
[Rows.Scan](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows.Scan), and [Rows.Err](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows.Err).

[CollectRows](https://pkg.go.dev/github.com/jackc/pgx/v5#CollectRows) can be used collect all returned rows into a slice.

```
rows, _ := conn.Query(context.Background(), "select generate_series(1,$1)", 5)
numbers, err := pgx.CollectRows(rows, pgx.RowTo[int32])
if err != nil {
  return err
}
// numbers => [1 2 3 4 5]
```

[ForEachRow](https://pkg.go.dev/github.com/jackc/pgx/v5#ForEachRow) can be used to execute a callback function for every row. This is often easier than iterating over rows
directly.

```
var sum, n int32
rows, _ := conn.Query(context.Background(), "select generate_series(1,$1)", 10)
_, err := pgx.ForEachRow(rows, []any{&n}, func() error {
  sum += n
  return nil
})
if err != nil {
  return err
}
```

pgx also implements [Conn.QueryRow](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.QueryRow) in the same style as database/sql.

```
var name string
var weight int64
err := conn.QueryRow(context.Background(), "select name, weight from widgets where id=$1", 42).Scan(&name, &weight)
if err != nil {
    return err
}
```

Use [Conn.Exec](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Exec) to execute a query that does not return a result set.

```
commandTag, err := conn.Exec(context.Background(), "delete from widgets where id=$1", 42)
if err != nil {
    return err
}
if commandTag.RowsAffected() != 1 {
    return errors.New("No row found to delete")
}
```

#### PostgreSQL Data Types [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#hdr-PostgreSQL_Data_Types "Go to PostgreSQL Data Types")

pgx uses the [pgtype](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgtype) package to converting Go values to and from PostgreSQL values. It supports many PostgreSQL types
directly and is customizable and extendable. User defined data types such as enums, domains, and composite types may
require type registration. See that package's documentation for details.

PostgreSQL arrays (including results from set-returning aggregates such as array\_agg)
can be scanned directly into a matching Go slice. For scalar columns, pass the slice
as the scan destination:

```
var ids []int64
err := conn.QueryRow(ctx, "select array_agg(id) from things").Scan(&ids)
```

For a column that is part of a row, combine the slice with the usual row-to-struct
helpers. A struct field of slice type will pick up the array\_agg column when
collected via [CollectRows](https://pkg.go.dev/github.com/jackc/pgx/v5#CollectRows) and [RowToStructByName](https://pkg.go.dev/github.com/jackc/pgx/v5#RowToStructByName) (or
[RowToAddrOfStructByPos](https://pkg.go.dev/github.com/jackc/pgx/v5#RowToAddrOfStructByPos)):

```
type ThingEntry struct {
    GroupID  int64
    ThingIDs []int64 `db:"thing_ids"`
}

rows, _ := conn.Query(ctx,
    "select group_id, array_agg(thing_id) as thing_ids from things group by group_id")
entries, err := pgx.CollectRows(rows, pgx.RowToStructByName[ThingEntry])
```

#### Transactions [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#hdr-Transactions "Go to Transactions")

Transactions are started by calling [Conn.Begin](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Begin).

```
tx, err := conn.Begin(context.Background())
if err != nil {
    return err
}
// Rollback is safe to call even if the tx is already closed, so if
// the tx commits successfully, this is a no-op
defer tx.Rollback(context.Background())

_, err = tx.Exec(context.Background(), "insert into foo(id) values (1)")
if err != nil {
    return err
}

err = tx.Commit(context.Background())
if err != nil {
    return err
}
```

The [Tx](https://pkg.go.dev/github.com/jackc/pgx/v5#Tx) returned from [Conn.Begin](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Begin) also implements the [Tx.Begin](https://pkg.go.dev/github.com/jackc/pgx/v5#Tx.Begin) method. This can be used to implement pseudo nested transactions.
These are internally implemented with savepoints.

Use [Conn.BeginTx](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.BeginTx) to control the transaction mode. [Conn.BeginTx](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.BeginTx) also can be used to ensure a new transaction is created instead of
a pseudo nested transaction.

[BeginFunc](https://pkg.go.dev/github.com/jackc/pgx/v5#BeginFunc) and [BeginTxFunc](https://pkg.go.dev/github.com/jackc/pgx/v5#BeginTxFunc) are functions that begin a transaction, execute a function, and commit or rollback the
transaction depending on the return value of the function. These can be simpler and less error prone to use.

```
err = pgx.BeginFunc(context.Background(), conn, func(tx pgx.Tx) error {
    _, err := tx.Exec(context.Background(), "insert into foo(id) values (1)")
    return err
})
if err != nil {
    return err
}
```

#### Prepared Statements [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#hdr-Prepared_Statements "Go to Prepared Statements")

Prepared statements can be manually created with the [Conn.Prepare](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Prepare) method. However, this is rarely necessary because pgx
includes an automatic statement cache by default. Queries run through the normal [Conn.Query](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Query), [Conn.QueryRow](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.QueryRow), and [Conn.Exec](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Exec)
functions are automatically prepared on first execution and the prepared statement is reused on subsequent executions.
See [ParseConfig](https://pkg.go.dev/github.com/jackc/pgx/v5#ParseConfig) for information on how to customize or disable the statement cache.

#### Copy Protocol [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#hdr-Copy_Protocol "Go to Copy Protocol")

Use [Conn.CopyFrom](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.CopyFrom) to efficiently insert multiple rows at a time using the PostgreSQL copy protocol. [Conn.CopyFrom](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.CopyFrom) accepts a
[CopyFromSource](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromSource) interface. If the data is already in a \[\]\[\]any use [CopyFromRows](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromRows) to wrap it in a [CopyFromSource](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromSource) interface.
Or implement [CopyFromSource](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromSource) to avoid buffering the entire data set in memory.

```
rows := [][]any{
    {"John", "Smith", int32(36)},
    {"Jane", "Doe", int32(29)},
}

copyCount, err := conn.CopyFrom(
    context.Background(),
    pgx.Identifier{"people"},
    []string{"first_name", "last_name", "age"},
    pgx.CopyFromRows(rows),
)
```

When you already have a typed array using [CopyFromSlice](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromSlice) can be more convenient.

```
rows := []User{
    {"John", "Smith", 36},
    {"Jane", "Doe", 29},
}

copyCount, err := conn.CopyFrom(
    context.Background(),
    pgx.Identifier{"people"},
    []string{"first_name", "last_name", "age"},
    pgx.CopyFromSlice(len(rows), func(i int) ([]any, error) {
        return []any{rows[i].FirstName, rows[i].LastName, rows[i].Age}, nil
    }),
)
```

CopyFrom can be faster than an insert with as few as 5 rows.

#### Listen and Notify [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#hdr-Listen_and_Notify "Go to Listen and Notify")

pgx can listen to the PostgreSQL notification system with the [Conn.WaitForNotification](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.WaitForNotification) method. It blocks until a
notification is received or the context is canceled.

```
_, err := conn.Exec(context.Background(), "listen channelname")
if err != nil {
    return err
}

notification, err := conn.WaitForNotification(context.Background())
if err != nil {
    return err
}
// do something with notification
```

#### Tracing and Logging [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#hdr-Tracing_and_Logging "Go to Tracing and Logging")

pgx supports tracing by setting [ConnConfig.Tracer](https://pkg.go.dev/github.com/jackc/pgx/v5#ConnConfig.Tracer). To combine several tracers you can use the [github.com/jackc/pgx/v5/multitracer.Tracer](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/multitracer#Tracer).

In addition, the [github.com/jackc/pgx/v5/tracelog](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/tracelog) package provides the [github.com/jackc/pgx/v5/tracelog.TraceLog](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/tracelog#TraceLog) type which lets a
traditional logger act as a [QueryTracer](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryTracer).

For debug tracing of the actual PostgreSQL wire protocol messages see [github.com/jackc/pgx/v5/pgproto3](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgproto3).

#### Lower Level PostgreSQL Functionality [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#hdr-Lower_Level_PostgreSQL_Functionality "Go to Lower Level PostgreSQL Functionality")

[github.com/jackc/pgx/v5/pgconn](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgconn) contains a lower level PostgreSQL driver roughly at the level of libpq. [Conn](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn) is
implemented on top of [pgconn.PgConn](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgconn#PgConn). The [Conn.PgConn](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.PgConn) method can be used to access this lower layer.

#### PgBouncer [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#hdr-PgBouncer "Go to PgBouncer")

By default pgx automatically uses protocol-level named prepared statements. PgBouncer 1.21.0 and newer can use these
prepared statements in transaction and statement pooling modes when its max\_prepared\_statements setting is greater than
zero. In this configuration the default [QueryExecModeCacheStatement](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryExecModeCacheStatement) mode may be used. See the PgBouncer documentation
for limitations and configuration details: [https://www.pgbouncer.org/config.html#max\_prepared\_statements](https://www.pgbouncer.org/config.html#max_prepared_statements).

When using an older PgBouncer version or when prepared statement support is disabled, set
[ConnConfig.DefaultQueryExecMode](https://pkg.go.dev/github.com/jackc/pgx/v5#ConnConfig.DefaultQueryExecMode) to [QueryExecModeExec](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryExecModeExec). [QueryExecModeCacheDescribe](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryExecModeCacheDescribe) and
[QueryExecModeSimpleProtocol](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryExecModeSimpleProtocol) are also compatible with PgBouncer. Prefer [QueryExecModeExec](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryExecModeExec) over
[QueryExecModeSimpleProtocol](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryExecModeSimpleProtocol) whenever possible. Do not use [QueryExecModeDescribeExec](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryExecModeDescribeExec) with transaction pooling because
PgBouncer may assign a different server connection between the describe and execute steps.

SQL-level prepared statements created with PREPARE are not supported by PgBouncer in transaction pooling mode.

### Index [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#pkg-index "Go to Index")

- [Constants](https://pkg.go.dev/github.com/jackc/pgx/v5#pkg-constants)
- [Variables](https://pkg.go.dev/github.com/jackc/pgx/v5#pkg-variables)
- [func AppendRows\[T any, S ~\[\]T\](slice S, rows Rows, fn RowToFunc\[T\]) (S, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#AppendRows)
- [func BeginFunc(ctx context.Context, db interface{ ... }, fn func(Tx) error) (err error)](https://pkg.go.dev/github.com/jackc/pgx/v5#BeginFunc)
- [func BeginTxFunc(ctx context.Context, db interface{ ... }, txOptions TxOptions, ...) (err error)](https://pkg.go.dev/github.com/jackc/pgx/v5#BeginTxFunc)
- [func CollectExactlyOneRow\[T any\](rows Rows, fn RowToFunc\[T\]) (T, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#CollectExactlyOneRow)
- [func CollectOneRow\[T any\](rows Rows, fn RowToFunc\[T\]) (T, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#CollectOneRow)
- [func CollectRows\[T any\](rows Rows, fn RowToFunc\[T\]) (\[\]T, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#CollectRows)
- [func ForEachRow(rows Rows, scans \[\]any, fn func() error) (pgconn.CommandTag, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#ForEachRow)
- [func RowTo\[T any\](row CollectableRow) (T, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#RowTo)
- [func RowToAddrOf\[T any\](row CollectableRow) (\*T, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#RowToAddrOf)
- [func RowToAddrOfStructByName\[T any\](row CollectableRow) (\*T, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#RowToAddrOfStructByName)
- [func RowToAddrOfStructByNameLax\[T any\](row CollectableRow) (\*T, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#RowToAddrOfStructByNameLax)
- [func RowToAddrOfStructByPos\[T any\](row CollectableRow) (\*T, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#RowToAddrOfStructByPos)
- [func RowToMap(row CollectableRow) (map\[string\]any, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#RowToMap)
- [func RowToStructByName\[T any\](row CollectableRow) (T, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#RowToStructByName)
- [func RowToStructByNameLax\[T any\](row CollectableRow) (T, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#RowToStructByNameLax)
- [func RowToStructByPos\[T any\](row CollectableRow) (T, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#RowToStructByPos)
- [func ScanRow(typeMap \*pgtype.Map, fieldDescriptions \[\]pgconn.FieldDescription, ...) error](https://pkg.go.dev/github.com/jackc/pgx/v5#ScanRow)
- [type Batch](https://pkg.go.dev/github.com/jackc/pgx/v5#Batch)
  - [func (b \*Batch) Len() int](https://pkg.go.dev/github.com/jackc/pgx/v5#Batch.Len)
  - [func (b \*Batch) Queue(query string, arguments ...any) \*QueuedQuery](https://pkg.go.dev/github.com/jackc/pgx/v5#Batch.Queue)
- [type BatchResults](https://pkg.go.dev/github.com/jackc/pgx/v5#BatchResults)
- [type BatchTracer](https://pkg.go.dev/github.com/jackc/pgx/v5#BatchTracer)
- [type CollectableRow](https://pkg.go.dev/github.com/jackc/pgx/v5#CollectableRow)
- [type Conn](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn)
  - [func Connect(ctx context.Context, connString string) (\*Conn, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#Connect)
  - [func ConnectConfig(ctx context.Context, connConfig \*ConnConfig) (\*Conn, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#ConnectConfig)
  - [func ConnectWithOptions(ctx context.Context, connString string, options ParseConfigOptions) (\*Conn, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#ConnectWithOptions)
  - [func (c \*Conn) Begin(ctx context.Context) (Tx, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Begin)
  - [func (c \*Conn) BeginTx(ctx context.Context, txOptions TxOptions) (Tx, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.BeginTx)
  - [func (c \*Conn) Close(ctx context.Context) error](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Close)
  - [func (c \*Conn) Config() \*ConnConfig](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Config)
  - [func (c \*Conn) CopyFrom(ctx context.Context, tableName Identifier, columnNames \[\]string, ...) (int64, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.CopyFrom)
  - [func (c \*Conn) Deallocate(ctx context.Context, name string) error](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Deallocate)
  - [func (c \*Conn) DeallocateAll(ctx context.Context) error](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.DeallocateAll)
  - [func (c \*Conn) Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Exec)
  - [func (c \*Conn) IsClosed() bool](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.IsClosed)
  - [func (c \*Conn) LoadType(ctx context.Context, typeName string) (\*pgtype.Type, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.LoadType)
  - [func (c \*Conn) LoadTypes(ctx context.Context, typeNames \[\]string) (\[\]\*pgtype.Type, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.LoadTypes)
  - [func (c \*Conn) PgConn() \*pgconn.PgConn](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.PgConn)
  - [func (c \*Conn) Ping(ctx context.Context) error](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Ping)
  - [func (c \*Conn) Prepare(ctx context.Context, name, sql string) (sd \*pgconn.StatementDescription, err error)](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Prepare)
  - [func (c \*Conn) Query(ctx context.Context, sql string, args ...any) (Rows, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Query)
  - [func (c \*Conn) QueryRow(ctx context.Context, sql string, args ...any) Row](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.QueryRow)
  - [func (c \*Conn) SendBatch(ctx context.Context, b \*Batch) (br BatchResults)](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.SendBatch)
  - [func (c \*Conn) TypeMap() \*pgtype.Map](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.TypeMap)
  - [func (c \*Conn) WaitForNotification(ctx context.Context) (\*pgconn.Notification, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.WaitForNotification)
- [type ConnConfig](https://pkg.go.dev/github.com/jackc/pgx/v5#ConnConfig)
  - [func ParseConfig(connString string) (\*ConnConfig, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#ParseConfig)
  - [func ParseConfigWithOptions(connString string, options ParseConfigOptions) (\*ConnConfig, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#ParseConfigWithOptions)
  - [func (cc \*ConnConfig) ConnString() string](https://pkg.go.dev/github.com/jackc/pgx/v5#ConnConfig.ConnString)
  - [func (cc \*ConnConfig) Copy() \*ConnConfig](https://pkg.go.dev/github.com/jackc/pgx/v5#ConnConfig.Copy)
- [type ConnectTracer](https://pkg.go.dev/github.com/jackc/pgx/v5#ConnectTracer)
- [type CopyFromSource](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromSource)
  - [func CopyFromFunc(nxtf func() (row \[\]any, err error)) CopyFromSource](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromFunc)
  - [func CopyFromRows(rows \[\]\[\]any) CopyFromSource](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromRows)
  - [func CopyFromSlice(length int, next func(int) (\[\]any, error)) CopyFromSource](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromSlice)
- [type CopyFromTracer](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromTracer)
- [type ErrPreprocessingBatch](https://pkg.go.dev/github.com/jackc/pgx/v5#ErrPreprocessingBatch)
  - [func (e ErrPreprocessingBatch) Error() string](https://pkg.go.dev/github.com/jackc/pgx/v5#ErrPreprocessingBatch.Error)
  - [func (e ErrPreprocessingBatch) SQL() string](https://pkg.go.dev/github.com/jackc/pgx/v5#ErrPreprocessingBatch.SQL)
  - [func (e ErrPreprocessingBatch) Unwrap() error](https://pkg.go.dev/github.com/jackc/pgx/v5#ErrPreprocessingBatch.Unwrap)
- [type ExtendedQueryBuilder](https://pkg.go.dev/github.com/jackc/pgx/v5#ExtendedQueryBuilder)
  - [func (eqb \*ExtendedQueryBuilder) Build(m \*pgtype.Map, sd \*pgconn.StatementDescription, args \[\]any) error](https://pkg.go.dev/github.com/jackc/pgx/v5#ExtendedQueryBuilder.Build)
- [type Identifier](https://pkg.go.dev/github.com/jackc/pgx/v5#Identifier)
  - [func (ident Identifier) Sanitize() string](https://pkg.go.dev/github.com/jackc/pgx/v5#Identifier.Sanitize)
- [type LargeObject](https://pkg.go.dev/github.com/jackc/pgx/v5#LargeObject)
  - [func (o \*LargeObject) Close() error](https://pkg.go.dev/github.com/jackc/pgx/v5#LargeObject.Close)
  - [func (o \*LargeObject) Read(p \[\]byte) (int, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#LargeObject.Read)
  - [func (o \*LargeObject) Seek(offset int64, whence int) (n int64, err error)](https://pkg.go.dev/github.com/jackc/pgx/v5#LargeObject.Seek)
  - [func (o \*LargeObject) Tell() (n int64, err error)](https://pkg.go.dev/github.com/jackc/pgx/v5#LargeObject.Tell)
  - [func (o \*LargeObject) Truncate(size int64) (err error)](https://pkg.go.dev/github.com/jackc/pgx/v5#LargeObject.Truncate)
  - [func (o \*LargeObject) Write(p \[\]byte) (int, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#LargeObject.Write)
- [type LargeObjectMode](https://pkg.go.dev/github.com/jackc/pgx/v5#LargeObjectMode)
- [type LargeObjects](https://pkg.go.dev/github.com/jackc/pgx/v5#LargeObjects)
  - [func (o \*LargeObjects) Create(ctx context.Context, oid uint32) (uint32, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#LargeObjects.Create)
  - [func (o \*LargeObjects) Open(ctx context.Context, oid uint32, mode LargeObjectMode) (\*LargeObject, error)](https://pkg.go.dev/github.com/jackc/pgx/v5#LargeObjects.Open)
  - [func (o \*LargeObjects) Unlink(ctx context.Context, oid uint32) error](https://pkg.go.dev/github.com/jackc/pgx/v5#LargeObjects.Unlink)
- [type NamedArgs](https://pkg.go.dev/github.com/jackc/pgx/v5#NamedArgs)
  - [func (na NamedArgs) RewriteQuery(ctx context.Context, conn \*Conn, sql string, args \[\]any) (newSQL string, newArgs \[\]any, err error)](https://pkg.go.dev/github.com/jackc/pgx/v5#NamedArgs.RewriteQuery)
- [type ParseConfigOptions](https://pkg.go.dev/github.com/jackc/pgx/v5#ParseConfigOptions)
- [type PrepareTracer](https://pkg.go.dev/github.com/jackc/pgx/v5#PrepareTracer)
- [type QueryExecMode](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryExecMode)
  - [func (m QueryExecMode) String() string](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryExecMode.String)
- [type QueryResultFormats](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryResultFormats)
- [type QueryResultFormatsByOID](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryResultFormatsByOID)
- [type QueryRewriter](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryRewriter)
  - [func StrictStructArgs(sa any) QueryRewriter](https://pkg.go.dev/github.com/jackc/pgx/v5#StrictStructArgs)
  - [func StructArgs(sa any) QueryRewriter](https://pkg.go.dev/github.com/jackc/pgx/v5#StructArgs)
- [type QueryTracer](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryTracer)
- [type QueuedQuery](https://pkg.go.dev/github.com/jackc/pgx/v5#QueuedQuery)
  - [func (qq \*QueuedQuery) Exec(fn func(ct pgconn.CommandTag) error)](https://pkg.go.dev/github.com/jackc/pgx/v5#QueuedQuery.Exec)
  - [func (qq \*QueuedQuery) Query(fn func(rows Rows) error)](https://pkg.go.dev/github.com/jackc/pgx/v5#QueuedQuery.Query)
  - [func (qq \*QueuedQuery) QueryRow(fn func(row Row) error)](https://pkg.go.dev/github.com/jackc/pgx/v5#QueuedQuery.QueryRow)
- [type Row](https://pkg.go.dev/github.com/jackc/pgx/v5#Row)
- [type RowScanner](https://pkg.go.dev/github.com/jackc/pgx/v5#RowScanner)
- [type RowToFunc](https://pkg.go.dev/github.com/jackc/pgx/v5#RowToFunc)
- [type Rows](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows)
  - [func RowsFromResultReader(typeMap \*pgtype.Map, resultReader \*pgconn.ResultReader) Rows](https://pkg.go.dev/github.com/jackc/pgx/v5#RowsFromResultReader)
- [type ScanArgError](https://pkg.go.dev/github.com/jackc/pgx/v5#ScanArgError)
  - [func (e ScanArgError) Error() string](https://pkg.go.dev/github.com/jackc/pgx/v5#ScanArgError.Error)
  - [func (e ScanArgError) Unwrap() error](https://pkg.go.dev/github.com/jackc/pgx/v5#ScanArgError.Unwrap)
- [type StrictNamedArgs](https://pkg.go.dev/github.com/jackc/pgx/v5#StrictNamedArgs)
  - [func (sna StrictNamedArgs) RewriteQuery(ctx context.Context, conn \*Conn, sql string, args \[\]any) (newSQL string, newArgs \[\]any, err error)](https://pkg.go.dev/github.com/jackc/pgx/v5#StrictNamedArgs.RewriteQuery)
- [type TraceBatchEndData](https://pkg.go.dev/github.com/jackc/pgx/v5#TraceBatchEndData)
- [type TraceBatchQueryData](https://pkg.go.dev/github.com/jackc/pgx/v5#TraceBatchQueryData)
- [type TraceBatchStartData](https://pkg.go.dev/github.com/jackc/pgx/v5#TraceBatchStartData)
- [type TraceConnectEndData](https://pkg.go.dev/github.com/jackc/pgx/v5#TraceConnectEndData)
- [type TraceConnectStartData](https://pkg.go.dev/github.com/jackc/pgx/v5#TraceConnectStartData)
- [type TraceCopyFromEndData](https://pkg.go.dev/github.com/jackc/pgx/v5#TraceCopyFromEndData)
- [type TraceCopyFromStartData](https://pkg.go.dev/github.com/jackc/pgx/v5#TraceCopyFromStartData)
- [type TracePrepareEndData](https://pkg.go.dev/github.com/jackc/pgx/v5#TracePrepareEndData)
- [type TracePrepareStartData](https://pkg.go.dev/github.com/jackc/pgx/v5#TracePrepareStartData)
- [type TraceQueryEndData](https://pkg.go.dev/github.com/jackc/pgx/v5#TraceQueryEndData)
- [type TraceQueryStartData](https://pkg.go.dev/github.com/jackc/pgx/v5#TraceQueryStartData)
- [type Tx](https://pkg.go.dev/github.com/jackc/pgx/v5#Tx)
- [type TxAccessMode](https://pkg.go.dev/github.com/jackc/pgx/v5#TxAccessMode)
- [type TxDeferrableMode](https://pkg.go.dev/github.com/jackc/pgx/v5#TxDeferrableMode)
- [type TxIsoLevel](https://pkg.go.dev/github.com/jackc/pgx/v5#TxIsoLevel)
- [type TxOptions](https://pkg.go.dev/github.com/jackc/pgx/v5#TxOptions)

### Examples [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#pkg-examples "Go to Examples")

- [CollectRows](https://pkg.go.dev/github.com/jackc/pgx/v5#example-CollectRows)
- [Conn.Query](https://pkg.go.dev/github.com/jackc/pgx/v5#example-Conn.Query)
- [Conn.SendBatch](https://pkg.go.dev/github.com/jackc/pgx/v5#example-Conn.SendBatch)
- [ForEachRow](https://pkg.go.dev/github.com/jackc/pgx/v5#example-ForEachRow)
- [RowTo](https://pkg.go.dev/github.com/jackc/pgx/v5#example-RowTo)
- [RowToAddrOf](https://pkg.go.dev/github.com/jackc/pgx/v5#example-RowToAddrOf)
- [RowToStructByName](https://pkg.go.dev/github.com/jackc/pgx/v5#example-RowToStructByName)
- [RowToStructByNameLax](https://pkg.go.dev/github.com/jackc/pgx/v5#example-RowToStructByNameLax)
- [RowToStructByPos](https://pkg.go.dev/github.com/jackc/pgx/v5#example-RowToStructByPos)

### Constants [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#pkg-constants "Go to Constants")

[View Source](https://github.com/jackc/pgx/blob/v5.11.0/values.go#L11)

```
const (
	TextFormatCode   = 0
	BinaryFormatCode = 1
)
```

PostgreSQL format codes

### Variables [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#pkg-variables "Go to Variables")

[View Source](https://github.com/jackc/pgx/blob/v5.11.0/conn.go#L106)

```
var (
	// ErrNoRows occurs when rows are expected but none are returned.
	ErrNoRows = newProxyErr(sql.ErrNoRows, "no rows in result set")
	// ErrTooManyRows occurs when more rows than expected are returned.
	ErrTooManyRows = errors.New("too many rows in result set")
)
```

[View Source](https://github.com/jackc/pgx/blob/v5.11.0/tx.go#L85)

```
var ErrTxClosed = errors.New("tx is closed")
```

[View Source](https://github.com/jackc/pgx/blob/v5.11.0/tx.go#L90)

```
var ErrTxCommitRollback = errors.New("commit unexpectedly resulted in rollback")
```

ErrTxCommitRollback occurs when an error has occurred in a transaction and
Commit() is called. PostgreSQL accepts COMMIT on aborted transactions, but
it is treated as ROLLBACK.

### Functions [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#pkg-functions "Go to Functions")

#### func [AppendRows](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L463) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#AppendRows "Go to AppendRows")added inv5.5.3

```
func AppendRows[T any, S ~[]T](slice S, rows Rows, fn RowToFunc[T]) (S, error)
```

AppendRows iterates through rows, calling fn for each row, and appending the results into a slice of T.

This function closes the rows automatically on return.

#### func [BeginFunc](https://github.com/jackc/pgx/blob/v5.11.0/tx.go\#L402) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#BeginFunc "Go to BeginFunc")

```
func BeginFunc(
	ctx context.Context,
	db interface {
		Begin(ctx context.Context) (Tx, error)
	},
	fn func(Tx) error,
) (err error)
```

BeginFunc calls Begin on db and then calls fn. If fn does not return an error then it calls [Tx.Commit](https://pkg.go.dev/github.com/jackc/pgx/v5#Tx.Commit) on db. If fn
returns an error it calls [Tx.Rollback](https://pkg.go.dev/github.com/jackc/pgx/v5#Tx.Rollback) on db. The context will be used when executing the transaction control statements
(BEGIN, ROLLBACK, and COMMIT) but does not otherwise affect the execution of fn.

#### func [BeginTxFunc](https://github.com/jackc/pgx/blob/v5.11.0/tx.go\#L421) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#BeginTxFunc "Go to BeginTxFunc")

```
func BeginTxFunc(
	ctx context.Context,
	db interface {
		BeginTx(ctx context.Context, txOptions TxOptions) (Tx, error)
	},
	txOptions TxOptions,
	fn func(Tx) error,
) (err error)
```

BeginTxFunc calls BeginTx on db and then calls fn. If fn does not return an error then it calls [Tx.Commit](https://pkg.go.dev/github.com/jackc/pgx/v5#Tx.Commit) on db. If fn
returns an error it calls [Tx.Rollback](https://pkg.go.dev/github.com/jackc/pgx/v5#Tx.Rollback) on db. The context will be used when executing the transaction control statements
(BEGIN, ROLLBACK, and COMMIT) but does not otherwise affect the execution of fn.

#### func [CollectExactlyOneRow](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L521) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#CollectExactlyOneRow "Go to CollectExactlyOneRow")added inv5.5.0

```
func CollectExactlyOneRow[T any](rows Rows, fn RowToFunc[T]) (T, error)
```

CollectExactlyOneRow calls fn for the first row in rows and returns the result.

- If no rows are found returns an error where errors.Is(ErrNoRows) is true.
- If more than 1 row is found returns an error where errors.Is(ErrTooManyRows) is true.

This function closes the rows automatically on return.

#### func [CollectOneRow](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L492) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#CollectOneRow "Go to CollectOneRow")

```
func CollectOneRow[T any](rows Rows, fn RowToFunc[T]) (T, error)
```

CollectOneRow calls fn for the first row in rows and returns the result. If no rows are found returns an error where errors.Is(ErrNoRows) is true.
CollectOneRow is to [CollectRows](https://pkg.go.dev/github.com/jackc/pgx/v5#CollectRows) as [Conn.QueryRow](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.QueryRow) is to [Conn.Query](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Query).

This function closes the rows automatically on return.

#### func [CollectRows](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L484) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#CollectRows "Go to CollectRows")

```
func CollectRows[T any](rows Rows, fn RowToFunc[T]) ([]T, error)
```

CollectRows iterates through rows, calling fn for each row, and collecting the results into a slice of T.

This function closes the rows automatically on return.

Example [¶](https://pkg.go.dev/github.com/jackc/pgx/v5#example-CollectRows "Go to Example")

This example uses CollectRows with a manually written collector function. In most cases RowTo, RowToAddrOf,
RowToStructByPos, RowToAddrOfStructByPos, or another generic function would be used.

```
Output:
[1 2 3 4 5]
```

ShareFormatRun

#### func [ForEachRow](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L427) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ForEachRow "Go to ForEachRow")

```
func ForEachRow(rows Rows, scans []any, fn func() error) (pgconn.CommandTag, error)
```

ForEachRow iterates through rows. For each row it scans into the elements of scans and calls fn. If any row
fails to scan or fn returns an error the query will be aborted and the error will be returned. Rows will be closed
when ForEachRow returns.

Example [¶](https://pkg.go.dev/github.com/jackc/pgx/v5#example-ForEachRow "Go to Example")

```
Output:
1, 2
2, 4
3, 6
```

ShareFormatRun

#### func [RowTo](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L552) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#RowTo "Go to RowTo")

```
func RowTo[T any](row CollectableRow) (T, error)
```

RowTo returns a T scanned from row.

Example [¶](https://pkg.go.dev/github.com/jackc/pgx/v5#example-RowTo "Go to Example")

```
Output:
[1 2 3 4 5]
```

ShareFormatRun

#### func [RowToAddrOf](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L559) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#RowToAddrOf "Go to RowToAddrOf")

```
func RowToAddrOf[T any](row CollectableRow) (*T, error)
```

RowToAddrOf returns the address of a T scanned from row.

Example [¶](https://pkg.go.dev/github.com/jackc/pgx/v5#example-RowToAddrOf "Go to Example")

```
Output:
1
2
3
4
5
```

ShareFormatRun

#### func [RowToAddrOfStructByName](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L680) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#RowToAddrOfStructByName "Go to RowToAddrOfStructByName")added inv5.1.0

```
func RowToAddrOfStructByName[T any](row CollectableRow) (*T, error)
```

RowToAddrOfStructByName returns the address of a T scanned from row. T must be a struct. T must have the same number
of named public fields as row has fields. The row and T fields will be matched by name. The match is
case-insensitive. The database column name can be overridden with a "db" struct tag. If the "db" struct tag is "-"
then the field will be ignored.

#### func [RowToAddrOfStructByNameLax](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L699) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#RowToAddrOfStructByNameLax "Go to RowToAddrOfStructByNameLax")added inv5.4.0

```
func RowToAddrOfStructByNameLax[T any](row CollectableRow) (*T, error)
```

RowToAddrOfStructByNameLax returns the address of a T scanned from row. T must be a struct. T must have greater than or
equal number of named public fields as row has fields. The row and T fields will be matched by name. The match is
case-insensitive. The database column name can be overridden with a "db" struct tag. If the "db" struct tag is "-"
then the field will be ignored.

#### func [RowToAddrOfStructByPos](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L601) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#RowToAddrOfStructByPos "Go to RowToAddrOfStructByPos")

```
func RowToAddrOfStructByPos[T any](row CollectableRow) (*T, error)
```

RowToAddrOfStructByPos returns the address of a T scanned from row. T must be a struct. T must have the same number a
public fields as row has fields. The row and T fields will be matched by position. If the "db" struct tag is "-" then
the field will be ignored.

#### func [RowToMap](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L566) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#RowToMap "Go to RowToMap")

```
func RowToMap(row CollectableRow) (map[string]any, error)
```

RowToMap returns a map scanned from row.

#### func [RowToStructByName](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L670) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#RowToStructByName "Go to RowToStructByName")added inv5.1.0

```
func RowToStructByName[T any](row CollectableRow) (T, error)
```

RowToStructByName returns a T scanned from row. T must be a struct. T must have the same number of named public
fields as row has fields. The row and T fields will be matched by name. The match is case-insensitive. The database
column name can be overridden with a "db" struct tag. If the "db" struct tag is "-" then the field will be ignored.

Example [¶](https://pkg.go.dev/github.com/jackc/pgx/v5#example-RowToStructByName "Go to Example")

```
Output:
Cheeseburger: $10
Fries: $5
Soft Drink: $3
```

ShareFormatRun

#### func [RowToStructByNameLax](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L689) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#RowToStructByNameLax "Go to RowToStructByNameLax")added inv5.4.0

```
func RowToStructByNameLax[T any](row CollectableRow) (T, error)
```

RowToStructByNameLax returns a T scanned from row. T must be a struct. T must have greater than or equal number of named public
fields as row has fields. The row and T fields will be matched by name. The match is case-insensitive. The database
column name can be overridden with a "db" struct tag. If the "db" struct tag is "-" then the field will be ignored.

Example [¶](https://pkg.go.dev/github.com/jackc/pgx/v5#example-RowToStructByNameLax "Go to Example")

```
Output:
Cheeseburger: $10
Fries: $5
Soft Drink: $3
```

ShareFormatRun

#### func [RowToStructByPos](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L592) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#RowToStructByPos "Go to RowToStructByPos")

```
func RowToStructByPos[T any](row CollectableRow) (T, error)
```

RowToStructByPos returns a T scanned from row. T must be a struct. T must have the same number of public fields as row
has fields. The row and T fields will be matched by position. If the "db" struct tag is "-" then the field will be
ignored.

Example [¶](https://pkg.go.dev/github.com/jackc/pgx/v5#example-RowToStructByPos "Go to Example")

```
Output:
Cheeseburger: $10
Fries: $5
Soft Drink: $3
```

ShareFormatRun

#### func [ScanRow](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L393) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ScanRow "Go to ScanRow")

```
func ScanRow(typeMap *pgtype.Map, fieldDescriptions []pgconn.FieldDescription, values [][]byte, dest ...any) error
```

ScanRow decodes raw row data into dest. It can be used to scan rows read from the lower level [pgconn](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgconn) interface.

typeMap - OID to Go type mapping.
fieldDescriptions - OID and format of values
values - the raw data as returned from the PostgreSQL server
dest - the destination that values will be decoded into

### Types [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#pkg-types "Go to Types")

#### type [Batch](https://github.com/jackc/pgx/blob/v5.11.0/batch.go\#L63) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Batch "Go to Batch")

```
type Batch struct {
	QueuedQueries []*QueuedQuery
}
```

Batch queries are a way of bundling multiple queries together to avoid
unnecessary network round trips. A Batch must only be sent once.

#### func (\*Batch) [Len](https://github.com/jackc/pgx/blob/v5.11.0/batch.go\#L85) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Batch.Len "Go to Batch.Len")

```
func (b *Batch) Len() int
```

Len returns number of queries that have been queued so far.

#### func (\*Batch) [Queue](https://github.com/jackc/pgx/blob/v5.11.0/batch.go\#L75) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Batch.Queue "Go to Batch.Queue")

```
func (b *Batch) Queue(query string, arguments ...any) *QueuedQuery
```

Queue queues a query to batch b. query can be an SQL query or the name of a prepared statement. The only pgx option
argument that is supported is [QueryRewriter](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryRewriter). Queries are executed using the connection's DefaultQueryExecMode
(see [ConnConfig.DefaultQueryExecMode](https://pkg.go.dev/github.com/jackc/pgx/v5#ConnConfig.DefaultQueryExecMode)).

While query can contain multiple statements if the connection's DefaultQueryExecMode is [QueryExecModeSimpleProtocol](https://pkg.go.dev/github.com/jackc/pgx/v5#QueryExecModeSimpleProtocol),
this should be avoided. QueuedQuery.Fn must not be set as it will only be called for the first query. That is,
[QueuedQuery.Query](https://pkg.go.dev/github.com/jackc/pgx/v5#QueuedQuery.Query), [QueuedQuery.QueryRow](https://pkg.go.dev/github.com/jackc/pgx/v5#QueuedQuery.QueryRow), and [QueuedQuery.Exec](https://pkg.go.dev/github.com/jackc/pgx/v5#QueuedQuery.Exec) must not be called. In addition, any error
messages or tracing that include the current query may reference the wrong query.

#### type [BatchResults](https://github.com/jackc/pgx/blob/v5.11.0/batch.go\#L89) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#BatchResults "Go to BatchResults")

```
type BatchResults interface {
	// Exec reads the results from the next query in the batch as if the query has been sent with [Conn.Exec]. Prefer
	// calling Exec on the QueuedQuery, or just calling Close.
	Exec() (pgconn.CommandTag, error)

	// Query reads the results from the next query in the batch as if the query has been sent with [Conn.Query]. Prefer
	// calling [QueuedQuery.Query].
	Query() (Rows, error)

	// QueryRow reads the results from the next query in the batch as if the query has been sent with [Conn.QueryRow].
	// Prefer calling [QueuedQuery.QueryRow].
	QueryRow() Row

	// Close closes the batch operation. All unread results are read and any callback functions registered with
	// [QueuedQuery.Query], [QueuedQuery.QueryRow], or [QueuedQuery.Exec] will be called. If a callback function returns an
	// error or the batch encounters an error subsequent callback functions will not be called.
	//
	// For simple batch inserts inside a transaction or similar queries, it's sufficient to not set any callbacks,
	// and just handle the return value of Close.
	//
	// Close must be called before the underlying connection can be used again. Any error that occurred during a batch
	// operation may have made it impossible to resyncronize the connection with the server. In this case the underlying
	// connection will have been closed.
	//
	// Close is safe to call multiple times. If it returns an error subsequent calls will return the same error. Callback
	// functions will not be rerun.
	Close() error
}
```

#### type [BatchTracer](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L29) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#BatchTracer "Go to BatchTracer")

```
type BatchTracer interface {
	// TraceBatchStart is called at the beginning of SendBatch calls. The returned context is used for the
	// rest of the call and will be passed to TraceBatchQuery and TraceBatchEnd.
	TraceBatchStart(ctx context.Context, conn *Conn, data TraceBatchStartData) context.Context

	TraceBatchQuery(ctx context.Context, conn *Conn, data TraceBatchQueryData)
	TraceBatchEnd(ctx context.Context, conn *Conn, data TraceBatchEndData)
}
```

BatchTracer traces SendBatch.

#### type [CollectableRow](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L450) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#CollectableRow "Go to CollectableRow")

```
type CollectableRow interface {
	FieldDescriptions() []pgconn.FieldDescription
	Scan(dest ...any) error
	Values() ([]any, error)
	RawValues() [][]byte
}
```

CollectableRow is the subset of Rows methods that a RowToFunc is allowed to call.

#### type [Conn](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L68) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn "Go to Conn")

```
type Conn struct {
	// contains filtered or unexported fields
}
```

Conn is a PostgreSQL connection handle. It is not safe for concurrent usage. Use a connection pool to manage access
to multiple database connections from multiple goroutines.

#### func [Connect](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L136) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Connect "Go to Connect")

```
func Connect(ctx context.Context, connString string) (*Conn, error)
```

Connect establishes a connection with a PostgreSQL server with a connection string. See
[pgconn.Connect](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgconn#Connect) for details.

#### func [ConnectConfig](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L156) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ConnectConfig "Go to ConnectConfig")

```
func ConnectConfig(ctx context.Context, connConfig *ConnConfig) (*Conn, error)
```

ConnectConfig establishes a connection with a PostgreSQL server with a configuration struct.
connConfig must have been created by [ParseConfig](https://pkg.go.dev/github.com/jackc/pgx/v5#ParseConfig).

#### func [ConnectWithOptions](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L146) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ConnectWithOptions "Go to ConnectWithOptions")added inv5.1.0

```
func ConnectWithOptions(ctx context.Context, connString string, options ParseConfigOptions) (*Conn, error)
```

ConnectWithOptions behaves exactly like Connect with the addition of options. At the present options is only used to
provide a [pgconn.GetSSLPasswordFunc](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgconn#GetSSLPasswordFunc) function.

#### func (\*Conn) [Begin](https://github.com/jackc/pgx/blob/v5.11.0/tx.go\#L94) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.Begin "Go to Conn.Begin")

```
func (c *Conn) Begin(ctx context.Context) (Tx, error)
```

Begin starts a transaction. Unlike [database/sql](https://pkg.go.dev/database/sql), the context only affects the begin command. i.e. there is no
auto-rollback on context cancellation.

#### func (\*Conn) [BeginTx](https://github.com/jackc/pgx/blob/v5.11.0/tx.go\#L100) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.BeginTx "Go to Conn.BeginTx")

```
func (c *Conn) BeginTx(ctx context.Context, txOptions TxOptions) (Tx, error)
```

BeginTx starts a transaction with txOptions determining the transaction mode. Unlike [database/sql](https://pkg.go.dev/database/sql), the context only
affects the begin command. i.e. there is no auto-rollback on context cancellation.

#### func (\*Conn) [Close](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L302) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.Close "Go to Conn.Close")

```
func (c *Conn) Close(ctx context.Context) error
```

Close closes a connection. It is safe to call Close on an already closed
connection.

#### func (\*Conn) [Config](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L474) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.Config "Go to Conn.Config")

```
func (c *Conn) Config() *ConnConfig
```

Config returns a copy of config that was used to establish this connection.

#### func (\*Conn) [CopyFrom](https://github.com/jackc/pgx/blob/v5.11.0/copy_from.go\#L265) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.CopyFrom "Go to Conn.CopyFrom")

```
func (c *Conn) CopyFrom(ctx context.Context, tableName Identifier, columnNames []string, rowSrc CopyFromSource) (int64, error)
```

CopyFrom uses the PostgreSQL copy protocol to perform bulk data insertion. It returns the number of rows copied and
an error.

CopyFrom requires all values use the binary format. A pgtype.Type that supports the binary format must be registered
for the type of each column. Almost all types implemented by pgx support the binary format.

Even though enum types appear to be strings they still must be registered to use with [Conn.CopyFrom](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.CopyFrom). This can be done with
[Conn.LoadType](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.LoadType) and [pgtype.Map.RegisterType](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgtype#Map.RegisterType).

#### func (\*Conn) [Deallocate](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L381) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.Deallocate "Go to Conn.Deallocate")

```
func (c *Conn) Deallocate(ctx context.Context, name string) error
```

Deallocate releases a prepared statement. Calling Deallocate on a non-existent prepared statement will succeed.

#### func (\*Conn) [DeallocateAll](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L403) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.DeallocateAll "Go to Conn.DeallocateAll")added inv5.1.0

```
func (c *Conn) DeallocateAll(ctx context.Context) error
```

DeallocateAll releases all previously prepared statements from the server and client, where it also resets the statement and description cache.

#### func (\*Conn) [Exec](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L478) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.Exec "Go to Conn.Exec")

```
func (c *Conn) Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
```

Exec executes sql. sql can be either a prepared statement name or an SQL string. arguments should be referenced
positionally from the sql string as $1, $2, etc.

#### func (\*Conn) [IsClosed](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L440) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.IsClosed "Go to Conn.IsClosed")

```
func (c *Conn) IsClosed() bool
```

IsClosed reports if the connection has been closed.

#### func (\*Conn) [LoadType](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L1299) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.LoadType "Go to Conn.LoadType")

```
func (c *Conn) LoadType(ctx context.Context, typeName string) (*pgtype.Type, error)
```

LoadType inspects the database for typeName and produces a [pgtype.Type](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgtype#Type) suitable for registration. typeName must be
the name of a type where the underlying type(s) is already understood by pgx. It is for derived types. In particular,
typeName must be one of the following:

- An array type name of a type that is already registered. e.g. "\_foo" when "foo" is registered.
- A composite type name where all field types are already registered.
- A domain type name where the base type is already registered.
- An enum type name.
- A range type name where the element type is already registered.
- A multirange type name where the element type is already registered.

#### func (\*Conn) [LoadTypes](https://github.com/jackc/pgx/blob/v5.11.0/derived_types.go\#L177) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.LoadTypes "Go to Conn.LoadTypes")added inv5.7.0

```
func (c *Conn) LoadTypes(ctx context.Context, typeNames []string) ([]*pgtype.Type, error)
```

LoadTypes performs a single (complex) query, returning all the required
information to register the named types, as well as any other types directly
or indirectly required to complete the registration.
The result of this call can be passed into RegisterTypes to complete the process.

#### func (\*Conn) [PgConn](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L468) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.PgConn "Go to Conn.PgConn")

```
func (c *Conn) PgConn() *pgconn.PgConn
```

PgConn returns the underlying \*pgconn.PgConn. This is an escape hatch method that allows lower level access to the
PostgreSQL connection than pgx exposes.

It is strongly recommended that the connection be idle (no in-progress queries) before the underlying \*pgconn.PgConn
is used and the connection must be returned to the same state before any \*pgx.Conn methods are again used.

#### func (\*Conn) [Ping](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L459) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.Ping "Go to Conn.Ping")

```
func (c *Conn) Ping(ctx context.Context) error
```

Ping delegates to the underlying \*pgconn.PgConn.Ping.

#### func (\*Conn) [Prepare](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L320) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.Prepare "Go to Conn.Prepare")

```
func (c *Conn) Prepare(ctx context.Context, name, sql string) (sd *pgconn.StatementDescription, err error)
```

Prepare creates a prepared statement with name and sql. sql can contain placeholders for bound parameters. These
placeholders are referenced positionally as $1, $2, etc. name can be used instead of sql with [Conn.Query](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Query),
[Conn.QueryRow](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.QueryRow), and [Conn.Exec](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Exec) to execute the statement. It can also be used with [Batch.Queue](https://pkg.go.dev/github.com/jackc/pgx/v5#Batch.Queue).

The underlying PostgreSQL identifier for the prepared statement will be name if name != sql or a digest of sql if
name == sql.

Prepare is idempotent; i.e. it is safe to call Prepare multiple times with the same name and sql arguments. This
allows a code path to Prepare and Query/Exec without concern for if the statement has already been prepared.

#### func (\*Conn) [Query](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L760) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.Query "Go to Conn.Query")

```
func (c *Conn) Query(ctx context.Context, sql string, args ...any) (Rows, error)
```

Query sends a query to the server and returns a Rows to read the results. Only errors encountered sending the query
and initializing Rows will be returned. Err() on the returned Rows must be checked after the Rows is closed to
determine if the query executed successfully.

The returned Rows must be closed before the connection can be used again. It is safe to attempt to read from the
returned Rows even if an error is returned. The error will be the available in rows.Err() after rows are closed. It
is allowed to ignore the error returned from Query and handle it in Rows.

It is possible for a call of FieldDescriptions on the returned Rows to return nil even if the Query call did not
return an error.

It is possible for a query to return one or more rows before encountering an error. In most cases the rows should be
collected before processing rather than processed while receiving each row. This avoids the possibility of the
application processing rows from a query that the server rejected. The CollectRows function is useful here.

An implementer of QueryRewriter may be passed as the first element of args. It can rewrite the sql and change or
replace args. For example, NamedArgs is QueryRewriter that implements named arguments.

For extra control over how the query is executed, the types QueryExecMode, QueryResultFormats, and
QueryResultFormatsByOID may be used as the first args to control exactly how the query is executed. This is rarely
needed. See the documentation for those types for details.

Example [¶](https://pkg.go.dev/github.com/jackc/pgx/v5#example-Conn.Query "Go to Example")

This example uses Query without using any helpers to read the results. Normally CollectRows, ForEachRow, or another
helper function should be used.

```
Output:
Cheeseburger: $10
Fries: $5
Soft Drink: $3
```

ShareFormatRun

#### func (\*Conn) [QueryRow](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L940) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.QueryRow "Go to Conn.QueryRow")

```
func (c *Conn) QueryRow(ctx context.Context, sql string, args ...any) Row
```

QueryRow is a convenience wrapper over Query. Any error that occurs while
querying is deferred until calling Scan on the returned Row. That Row will
error with ErrNoRows if no rows are returned.

#### func (\*Conn) [SendBatch](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L951) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.SendBatch "Go to Conn.SendBatch")

```
func (c *Conn) SendBatch(ctx context.Context, b *Batch) (br BatchResults)
```

SendBatch sends all queued queries to the server at once. All queries are run in an implicit transaction unless
explicit transaction control statements are executed. The returned [BatchResults](https://pkg.go.dev/github.com/jackc/pgx/v5#BatchResults) must be closed before the connection
is used again.

Depending on the QueryExecMode, all queries may be prepared before any are executed. This means that creating a table
and using it in a subsequent query in the same batch can fail.

Example [¶](https://pkg.go.dev/github.com/jackc/pgx/v5#example-Conn.SendBatch "Go to Example")

```
Output:
2
3
5
```

ShareFormatRun

#### func (\*Conn) [TypeMap](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L471) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.TypeMap "Go to Conn.TypeMap")

```
func (c *Conn) TypeMap() *pgtype.Map
```

TypeMap returns the connection info used for this connection.

#### func (\*Conn) [WaitForNotification](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L421) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Conn.WaitForNotification "Go to Conn.WaitForNotification")

```
func (c *Conn) WaitForNotification(ctx context.Context) (*pgconn.Notification, error)
```

WaitForNotification waits for a PostgreSQL notification. It wraps the underlying pgconn notification system in a
slightly more convenient form.

#### type [ConnConfig](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L22) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ConnConfig "Go to ConnConfig")

```
type ConnConfig struct {
	pgconn.Config

	Tracer QueryTracer

	// StatementCacheCapacity is maximum size of the statement cache used when executing a query with "cache_statement"
	// query exec mode.
	StatementCacheCapacity int

	// DescriptionCacheCapacity is the maximum size of the description cache used when executing a query with
	// "cache_describe" query exec mode.
	DescriptionCacheCapacity int

	// DefaultQueryExecMode controls the default mode for executing queries. By default pgx uses the extended protocol
	// and automatically prepares and caches prepared statements. This may be incompatible with proxies such as PgBouncer
	// unless they are configured to support protocol-level prepared statements. In an incompatible configuration it may
	// be preferable to use [QueryExecModeExec] or [QueryExecModeSimpleProtocol]. The same functionality can be controlled
	// on a per query basis by passing a [QueryExecMode] as the first query argument.
	DefaultQueryExecMode QueryExecMode
	// contains filtered or unexported fields
}
```

ConnConfig contains all the options used to establish a connection. It must be created by [ParseConfig](https://pkg.go.dev/github.com/jackc/pgx/v5#ParseConfig) and
then it can be modified. A manually initialized ConnConfig will cause [ConnectConfig](https://pkg.go.dev/github.com/jackc/pgx/v5#ConnectConfig) to panic.

#### func [ParseConfig](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L239) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ParseConfig "Go to ParseConfig")

```
func ParseConfig(connString string) (*ConnConfig, error)
```

ParseConfig creates a ConnConfig from a connection string. ParseConfig handles all options that [pgconn.ParseConfig](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgconn#ParseConfig)
does. In addition, it accepts the following options:

- default\_query\_exec\_mode.
Possible values: "cache\_statement", "cache\_describe", "describe\_exec", "exec", and "simple\_protocol". See
QueryExecMode constant documentation for the meaning of these values. Default: "cache\_statement".

- statement\_cache\_capacity.
The maximum size of the statement cache used when executing a query with "cache\_statement" query exec mode.
Default: 512.

- description\_cache\_capacity.
The maximum size of the description cache used when executing a query with "cache\_describe" query exec mode.
Default: 512.


#### func [ParseConfigWithOptions](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L166) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ParseConfigWithOptions "Go to ParseConfigWithOptions")added inv5.1.0

```
func ParseConfigWithOptions(connString string, options ParseConfigOptions) (*ConnConfig, error)
```

ParseConfigWithOptions behaves exactly as [ParseConfig](https://pkg.go.dev/github.com/jackc/pgx/v5#ParseConfig) does with the addition of options. At the present options is
only used to provide a [pgconn.GetSSLPasswordFunc](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgconn#GetSSLPasswordFunc) function.

#### func (\*ConnConfig) [ConnString](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L64) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ConnConfig.ConnString "Go to ConnConfig.ConnString")

```
func (cc *ConnConfig) ConnString() string
```

ConnString returns the connection string as parsed by pgx.ParseConfig into pgx.ConnConfig.

#### func (\*ConnConfig) [Copy](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L56) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ConnConfig.Copy "Go to ConnConfig.Copy")

```
func (cc *ConnConfig) Copy() *ConnConfig
```

Copy returns a deep copy of the config that is safe to use and modify.
The only exception is the tls.Config:
according to the tls.Config docs it must not be modified after creation.

#### type [ConnectTracer](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L92) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ConnectTracer "Go to ConnectTracer")

```
type ConnectTracer interface {
	// TraceConnectStart is called at the beginning of Connect and ConnectConfig calls. The returned context is used for
	// the rest of the call and will be passed to TraceConnectEnd.
	TraceConnectStart(ctx context.Context, data TraceConnectStartData) context.Context

	TraceConnectEnd(ctx context.Context, data TraceConnectEndData)
}
```

ConnectTracer traces Connect and ConnectConfig.

#### type [CopyFromSource](https://github.com/jackc/pgx/blob/v5.11.0/copy_from.go\#L95) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#CopyFromSource "Go to CopyFromSource")

```
type CopyFromSource interface {
	// Next returns true if there is another row and makes the next row data
	// available to Values(). When there are no more rows available or an error
	// has occurred it returns false.
	Next() bool

	// Values returns the values for the current row.
	Values() ([]any, error)

	// Err returns any error that has been encountered by the CopyFromSource. If
	// this is not nil *Conn.CopyFrom will abort the copy.
	Err() error
}
```

CopyFromSource is the interface used by [Conn.CopyFrom](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.CopyFrom) as the source for copy data.

#### func [CopyFromFunc](https://github.com/jackc/pgx/blob/v5.11.0/copy_from.go\#L70) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#CopyFromFunc "Go to CopyFromFunc")added inv5.5.1

```
func CopyFromFunc(nxtf func() (row []any, err error)) CopyFromSource
```

CopyFromFunc returns a [CopyFromSource](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromSource) interface that relies on nxtf for values.
nxtf returns rows until it either signals an 'end of data' by returning row=nil and err=nil,
or it returns an error. If nxtf returns an error, the copy is aborted.

#### func [CopyFromRows](https://github.com/jackc/pgx/blob/v5.11.0/copy_from.go\#L15) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#CopyFromRows "Go to CopyFromRows")

```
func CopyFromRows(rows [][]any) CopyFromSource
```

CopyFromRows returns a [CopyFromSource](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromSource) interface over the provided rows slice
making it usable by [Conn.CopyFrom](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.CopyFrom).

#### func [CopyFromSlice](https://github.com/jackc/pgx/blob/v5.11.0/copy_from.go\#L39) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#CopyFromSlice "Go to CopyFromSlice")

```
func CopyFromSlice(length int, next func(int) ([]any, error)) CopyFromSource
```

CopyFromSlice returns a [CopyFromSource](https://pkg.go.dev/github.com/jackc/pgx/v5#CopyFromSource) interface over a dynamic func
making it usable by [Conn.CopyFrom](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.CopyFrom).

#### type [CopyFromTracer](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L54) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#CopyFromTracer "Go to CopyFromTracer")

```
type CopyFromTracer interface {
	// TraceCopyFromStart is called at the beginning of CopyFrom calls. The returned context is used for the
	// rest of the call and will be passed to TraceCopyFromEnd.
	TraceCopyFromStart(ctx context.Context, conn *Conn, data TraceCopyFromStartData) context.Context

	TraceCopyFromEnd(ctx context.Context, conn *Conn, data TraceCopyFromEndData)
}
```

CopyFromTracer traces CopyFrom.

#### type [ErrPreprocessingBatch](https://github.com/jackc/pgx/blob/v5.11.0/batch.go\#L514) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ErrPreprocessingBatch "Go to ErrPreprocessingBatch")added inv5.9.0

```
type ErrPreprocessingBatch struct {
	// contains filtered or unexported fields
}
```

ErrPreprocessingBatch occurs when an error is encountered while preprocessing a batch.
The two preprocessing steps are "prepare" (server-side SQL parse/plan) and
"build" (client-side argument encoding).

#### func (ErrPreprocessingBatch) [Error](https://github.com/jackc/pgx/blob/v5.11.0/batch.go\#L524) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ErrPreprocessingBatch.Error "Go to ErrPreprocessingBatch.Error")added inv5.9.0

```
func (e ErrPreprocessingBatch) Error() string
```

#### func (ErrPreprocessingBatch) [SQL](https://github.com/jackc/pgx/blob/v5.11.0/batch.go\#L535) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ErrPreprocessingBatch.SQL "Go to ErrPreprocessingBatch.SQL")added inv5.9.0

```
func (e ErrPreprocessingBatch) SQL() string
```

#### func (ErrPreprocessingBatch) [Unwrap](https://github.com/jackc/pgx/blob/v5.11.0/batch.go\#L531) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ErrPreprocessingBatch.Unwrap "Go to ErrPreprocessingBatch.Unwrap")added inv5.9.0

```
func (e ErrPreprocessingBatch) Unwrap() error
```

#### type [ExtendedQueryBuilder](https://github.com/jackc/pgx/blob/v5.11.0/extended_query_builder.go\#L12) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ExtendedQueryBuilder "Go to ExtendedQueryBuilder")

```
type ExtendedQueryBuilder struct {
	ParamValues [][]byte

	ParamFormats  []int16
	ResultFormats []int16
	// contains filtered or unexported fields
}
```

ExtendedQueryBuilder is used to choose the parameter formats, to format the parameters and to choose the result
formats for an extended query.

#### func (\*ExtendedQueryBuilder) [Build](https://github.com/jackc/pgx/blob/v5.11.0/extended_query_builder.go\#L21) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ExtendedQueryBuilder.Build "Go to ExtendedQueryBuilder.Build")

```
func (eqb *ExtendedQueryBuilder) Build(m *pgtype.Map, sd *pgconn.StatementDescription, args []any) error
```

Build sets ParamValues, ParamFormats, and ResultFormats for use with \*PgConn.ExecParams or \*PgConn.ExecPrepared. If
sd is nil then QueryExecModeExec behavior will be used.

#### type [Identifier](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L94) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Identifier "Go to Identifier")

```
type Identifier []string
```

Identifier a PostgreSQL identifier or name. Identifiers can be composed of
multiple parts such as \["schema", "table"\] or \["table", "column"\].

#### func (Identifier) [Sanitize](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L97) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Identifier.Sanitize "Go to Identifier.Sanitize")

```
func (ident Identifier) Sanitize() string
```

Sanitize returns a sanitized string safe for SQL interpolation.

#### type [LargeObject](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go\#L70) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#LargeObject "Go to LargeObject")

```
type LargeObject struct {
	// contains filtered or unexported fields
}
```

A LargeObject is a large object stored on the server. It is only valid within the transaction that it was initialized
in. It uses the context it was initialized with for all operations. It implements these interfaces:

```
io.Writer
io.Reader
io.Seeker
io.Closer
```

#### func (\*LargeObject) [Close](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go\#L158) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#LargeObject.Close "Go to LargeObject.Close")

```
func (o *LargeObject) Close() error
```

Close the large object descriptor.

#### func (\*LargeObject) [Read](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go\#L110) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#LargeObject.Read "Go to LargeObject.Read")

```
func (o *LargeObject) Read(p []byte) (int, error)
```

Read reads up to len(p) bytes into p returning the number of bytes read.

#### func (\*LargeObject) [Seek](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go\#L140) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#LargeObject.Seek "Go to LargeObject.Seek")

```
func (o *LargeObject) Seek(offset int64, whence int) (n int64, err error)
```

Seek moves the current location pointer to the new location specified by offset.

#### func (\*LargeObject) [Tell](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go\#L146) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#LargeObject.Tell "Go to LargeObject.Tell")

```
func (o *LargeObject) Tell() (n int64, err error)
```

Tell returns the current read or write location of the large object descriptor.

#### func (\*LargeObject) [Truncate](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go\#L152) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#LargeObject.Truncate "Go to LargeObject.Truncate")

```
func (o *LargeObject) Truncate(size int64) (err error)
```

Truncate the large object to size.

#### func (\*LargeObject) [Write](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go\#L77) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#LargeObject.Write "Go to LargeObject.Write")

```
func (o *LargeObject) Write(p []byte) (int, error)
```

Write writes p to the large object and returns the number of bytes written and an error if not all of p was written.

#### type [LargeObjectMode](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go\#L24) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#LargeObjectMode "Go to LargeObjectMode")

```
type LargeObjectMode int32
```

```
const (
	LargeObjectModeWrite LargeObjectMode = 0x20000
	LargeObjectModeRead  LargeObjectMode = 0x40000
)
```

#### type [LargeObjects](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go\#L20) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#LargeObjects "Go to LargeObjects")

```
type LargeObjects struct {
	// contains filtered or unexported fields
}
```

LargeObjects is a structure used to access the large objects API. It is only valid within the transaction where it
was created.

For more details see: [http://www.postgresql.org/docs/current/static/largeobjects.html](http://www.postgresql.org/docs/current/static/largeobjects.html)

#### func (\*LargeObjects) [Create](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go\#L32) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#LargeObjects.Create "Go to LargeObjects.Create")

```
func (o *LargeObjects) Create(ctx context.Context, oid uint32) (uint32, error)
```

Create creates a new large object. If oid is zero, the server assigns an unused OID.

#### func (\*LargeObjects) [Open](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go\#L39) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#LargeObjects.Open "Go to LargeObjects.Open")

```
func (o *LargeObjects) Open(ctx context.Context, oid uint32, mode LargeObjectMode) (*LargeObject, error)
```

Open opens an existing large object with the given mode. ctx will also be used for all operations on the opened large
object.

#### func (\*LargeObjects) [Unlink](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go\#L49) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#LargeObjects.Unlink "Go to LargeObjects.Unlink")

```
func (o *LargeObjects) Unlink(ctx context.Context, oid uint32) error
```

Unlink removes a large object from the database.

#### type [NamedArgs](https://github.com/jackc/pgx/blob/v5.11.0/named_args.go\#L23) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#NamedArgs "Go to NamedArgs")

```
type NamedArgs map[string]any
```

#### func (NamedArgs) [RewriteQuery](https://github.com/jackc/pgx/blob/v5.11.0/named_args.go\#L26) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#NamedArgs.RewriteQuery "Go to NamedArgs.RewriteQuery")

```
func (na NamedArgs) RewriteQuery(ctx context.Context, conn *Conn, sql string, args []any) (newSQL string, newArgs []any, err error)
```

RewriteQuery implements the QueryRewriter interface.

#### type [ParseConfigOptions](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L49) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ParseConfigOptions "Go to ParseConfigOptions")added inv5.1.0

```
type ParseConfigOptions struct {
	pgconn.ParseConfigOptions
}
```

ParseConfigOptions contains options that control how a config is built such as getsslpassword.

#### type [PrepareTracer](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L73) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#PrepareTracer "Go to PrepareTracer")

```
type PrepareTracer interface {
	// TracePrepareStart is called at the beginning of Prepare calls. The returned context is used for the
	// rest of the call and will be passed to TracePrepareEnd.
	TracePrepareStart(ctx context.Context, conn *Conn, data TracePrepareStartData) context.Context

	TracePrepareEnd(ctx context.Context, conn *Conn, data TracePrepareEndData)
}
```

PrepareTracer traces Prepare.

#### type [QueryExecMode](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L652) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#QueryExecMode "Go to QueryExecMode")

```
type QueryExecMode int32
```

```
const (

	// Automatically prepare and cache statements. This uses the extended protocol. Queries are executed in a single round
	// trip after the statement is cached. This is the default. If the database schema is modified or the search_path is
	// changed after a statement is cached then the first execution of a previously cached query may fail. e.g. If the
	// number of columns returned by a "SELECT *" changes or the type of a column is changed.
	QueryExecModeCacheStatement QueryExecMode

	// Cache statement descriptions (i.e. argument and result types) and assume they do not change. This uses the extended
	// protocol. Queries are executed in a single round trip after the description is cached. If the database schema is
	// modified or the search_path is changed after a statement is cached then the first execution of a previously cached
	// query may fail. e.g. If the number of columns returned by a "SELECT *" changes or the type of a column is changed.
	QueryExecModeCacheDescribe

	// Get the statement description on every execution. This uses the extended protocol. Queries require two round trips
	// to execute. It does not use named prepared statements. But it does use the unnamed prepared statement to get the
	// statement description on the first round trip and then uses it to execute the query on the second round trip. This
	// may cause problems with connection poolers that switch the underlying connection between round trips. It is safe
	// even when the database schema is modified concurrently.
	QueryExecModeDescribeExec

	// Assume the PostgreSQL query parameter types based on the Go type of the arguments. This uses the extended protocol
	// with text formatted parameters and results. Queries are executed in a single round trip. Type mappings can be
	// registered with pgtype.Map.RegisterDefaultPgType. Queries will be rejected that have arguments that are
	// unregistered or ambiguous. e.g. A map[string]string may have the PostgreSQL type json or hstore. Modes that know
	// the PostgreSQL type can use a map[string]string directly as an argument. This mode cannot.
	//
	// On rare occasions user defined types may behave differently when encoded in the text format instead of the binary
	// format. For example, this could happen if a "type RomanNumeral int32" implements fmt.Stringer to format integers as
	// Roman numerals (e.g. 7 is VII). The binary format would properly encode the integer 7 as the binary value for 7.
	// But the text format would encode the integer 7 as the string "VII". As QueryExecModeExec uses the text format, it
	// is possible that changing query mode from another mode to QueryExecModeExec could change the behavior of the query.
	// This should not occur with types pgx supports directly and can be avoided by registering the types with
	// pgtype.Map.RegisterDefaultPgType and implementing the appropriate type interfaces. In the cas of RomanNumeral, it
	// should implement pgtype.Int64Valuer.
	QueryExecModeExec

	// Use the simple protocol. Assume the PostgreSQL query parameter types based on the Go type of the arguments. This is
	// especially significant for []byte values. []byte values are encoded as PostgreSQL bytea. string must be used
	// instead for text type values including json and jsonb. Type mappings can be registered with
	// pgtype.Map.RegisterDefaultPgType. Queries will be rejected that have arguments that are unregistered or ambiguous.
	// e.g. A map[string]string may have the PostgreSQL type json or hstore. Modes that know the PostgreSQL type can use a
	// map[string]string directly as an argument. This mode cannot. Queries are executed in a single round trip.
	//
	// QueryExecModeSimpleProtocol should have the user application visible behavior as QueryExecModeExec. This includes
	// the warning regarding differences in text format and binary format encoding with user defined types. There may be
	// other minor exceptions such as behavior when multiple result returning queries are erroneously sent in a single
	// string.
	//
	// QueryExecModeSimpleProtocol uses client side parameter interpolation. All values are quoted and escaped. Prefer
	// QueryExecModeExec over QueryExecModeSimpleProtocol whenever possible. In general QueryExecModeSimpleProtocol should
	// only be used if connecting to a proxy server, connection pool server, or non-PostgreSQL server that does not
	// support the extended protocol.
	QueryExecModeSimpleProtocol
)
```

#### func (QueryExecMode) [String](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L711) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#QueryExecMode.String "Go to QueryExecMode.String")

```
func (m QueryExecMode) String() string
```

#### type [QueryResultFormats](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L729) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#QueryResultFormats "Go to QueryResultFormats")

```
type QueryResultFormats []int16
```

QueryResultFormats controls the result format (text=0, binary=1) of a query by result column position.

#### type [QueryResultFormatsByOID](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L732) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#QueryResultFormatsByOID "Go to QueryResultFormatsByOID")

```
type QueryResultFormatsByOID map[uint32]int16
```

QueryResultFormatsByOID controls the result format (text=0, binary=1) of a query by the result column OID.

#### type [QueryRewriter](https://github.com/jackc/pgx/blob/v5.11.0/conn.go\#L735) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#QueryRewriter "Go to QueryRewriter")

```
type QueryRewriter interface {
	RewriteQuery(ctx context.Context, conn *Conn, sql string, args []any) (newSQL string, newArgs []any, err error)
}
```

QueryRewriter rewrites a query when used as the first arguments to a query method.

#### func [StrictStructArgs](https://github.com/jackc/pgx/blob/v5.11.0/named_args.go\#L66) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#StrictStructArgs "Go to StrictStructArgs")added inv5.10.0

```
func StrictStructArgs(sa any) QueryRewriter
```

StrictStructArgs is like StructArgs but uses StrictNamedArgs rewriting
semantics (i.e. errors if the SQL query references missing arguments or if
extra arguments are provided).

#### func [StructArgs](https://github.com/jackc/pgx/blob/v5.11.0/named_args.go\#L55) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#StructArgs "Go to StructArgs")added inv5.10.0

```
func StructArgs(sa any) QueryRewriter
```

StructArgs converts exported fields of a struct into a QueryRewriter so it can
be used as the first argument to a query method (e.g. "where id=@id").

Field names are taken from the \`db\` struct tag if present. Tag values may
include comma-separated options (e.g. \`db:"id,omitempty"\`). A \`db:"-"\` field is
ignored. If no \`db\` tag is present, the Go field name is used.

sa may be a struct or a pointer to a struct.

#### type [QueryTracer](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L10) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#QueryTracer "Go to QueryTracer")

```
type QueryTracer interface {
	// TraceQueryStart is called at the beginning of Query, QueryRow, and Exec calls. The returned context is used for the
	// rest of the call and will be passed to TraceQueryEnd.
	TraceQueryStart(ctx context.Context, conn *Conn, data TraceQueryStartData) context.Context

	TraceQueryEnd(ctx context.Context, conn *Conn, data TraceQueryEndData)
}
```

QueryTracer traces Query, QueryRow, and Exec.

#### type [QueuedQuery](https://github.com/jackc/pgx/blob/v5.11.0/batch.go\#L12) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#QueuedQuery "Go to QueuedQuery")

```
type QueuedQuery struct {
	SQL       string
	Arguments []any
	Fn        batchItemFunc
	// contains filtered or unexported fields
}
```

QueuedQuery is a query that has been queued for execution via a [Batch](https://pkg.go.dev/github.com/jackc/pgx/v5#Batch).

#### func (\*QueuedQuery) [Exec](https://github.com/jackc/pgx/blob/v5.11.0/batch.go\#L50) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#QueuedQuery.Exec "Go to QueuedQuery.Exec")

```
func (qq *QueuedQuery) Exec(fn func(ct pgconn.CommandTag) error)
```

Exec sets fn to be called when the response to qq is received.

Note: for simple batch insert uses where it is not required to handle
each potential error individually, it's sufficient to not set any callbacks,
and just handle the return value of [BatchResults.Close](https://pkg.go.dev/github.com/jackc/pgx/v5#BatchResults.Close).

#### func (\*QueuedQuery) [Query](https://github.com/jackc/pgx/blob/v5.11.0/batch.go\#L22) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#QueuedQuery.Query "Go to QueuedQuery.Query")

```
func (qq *QueuedQuery) Query(fn func(rows Rows) error)
```

Query sets fn to be called when the response to qq is received.

#### func (\*QueuedQuery) [QueryRow](https://github.com/jackc/pgx/blob/v5.11.0/batch.go\#L38) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#QueuedQuery.QueryRow "Go to QueuedQuery.QueryRow")

```
func (qq *QueuedQuery) QueryRow(fn func(row Row) error)
```

Query sets fn to be called when the response to qq is received.

#### type [Row](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L87) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Row "Go to Row")

```
type Row interface {
	// Scan works the same as Rows. with the following exceptions. If no
	// rows were found it returns ErrNoRows. If multiple rows are returned it
	// ignores all but the first.
	Scan(dest ...any) error
}
```

Row is a convenience wrapper over [Rows](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows) that is returned by [Conn.QueryRow](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.QueryRow).

Row is an interface instead of a struct to allow tests to mock QueryRow. However,
adding a method to an interface is technically a breaking change. Because of this
the Row interface is partially excluded from semantic version requirements.
Methods will not be removed or changed, but new methods may be added.

#### type [RowScanner](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L109) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#RowScanner "Go to RowScanner")

```
type RowScanner interface {
	// ScanRows scans the row.
	ScanRow(rows Rows) error
}
```

RowScanner scans an entire row at a time into the RowScanner. It is only used when it is the sole destination passed
to [Rows.Scan](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows.Scan) or [Row.Scan](https://pkg.go.dev/github.com/jackc/pgx/v5#Row.Scan). When passed alongside other destinations it is scanned as an ordinary single value.

ScanRow always takes precedence over the destination's other scanning interfaces, such as
[pgtype.CompositeIndexScanner](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgtype#CompositeIndexScanner). A type implementing both must therefore dispatch within ScanRow, because the number of
columns is not known until the row arrives:

```
func (p *Person) ScanRow(rows pgx.Rows) error {
	if fds := rows.FieldDescriptions(); len(fds) == 1 {
		// Scan the single column via p's pgtype.CompositeIndexScanner implementation. rows.Scan(p) would
		// call ScanRow again.
		return rows.TypeMap().Scan(fds[0].DataTypeOID, fds[0].Format, rows.RawValues()[0], p)
	}
	return rows.Scan(&p.Name, &p.Age)
}
```

#### type [RowToFunc](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L458) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#RowToFunc "Go to RowToFunc")

```
type RowToFunc[T any] func(row CollectableRow) (T, error)
```

RowToFunc is a function that scans or otherwise converts row to a T.

#### type [Rows](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L27) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Rows "Go to Rows")

```
type Rows interface {
	// Close closes the rows, making the connection ready for use again. It is safe
	// to call Close after rows is already closed.
	Close()

	// Err returns any error that occurred while executing a query or reading its results. Err must be called after the
	// Rows is closed (either by calling Close or by Next returning false) to check if the query was successful. If it is
	// called before the Rows is closed it may return nil even if the query failed on the server.
	Err() error

	// CommandTag returns the command tag from this query. It is only available after Rows is closed.
	CommandTag() pgconn.CommandTag

	// FieldDescriptions returns the field descriptions of the columns. It may return nil. In particular this can occur
	// when there was an error executing the query.
	FieldDescriptions() []pgconn.FieldDescription

	// Next prepares the next row for reading. It returns true if there is another row and false if no more rows are
	// available or a fatal error has occurred. It automatically closes rows upon returning false (whether due to all rows
	// having been read or due to an error).
	//
	// Callers should check rows.Err() after rows.Next() returns false to detect whether result-set reading ended
	// prematurely due to an error. See [Conn.Query] for details.
	//
	// For simpler error handling, consider using the higher-level pgx v5 [CollectRows()] and [ForEachRow()] helpers instead.
	Next() bool

	// Scan reads the values from the current row into dest values positionally. dest can include pointers to core types,
	// values implementing the Scanner interface, and nil. nil will skip the value entirely. It is an error to call Scan
	// without first calling Next() and checking that it returned true. Rows is automatically closed upon error.
	//
	// As a special case, if dest is a single value implementing [RowScanner], the whole row is given to its ScanRow
	// method instead of being scanned positionally.
	Scan(dest ...any) error

	// Values returns the decoded row values. As with Scan(), it is an error to
	// call Values without first calling Next() and checking that it returned
	// true.
	Values() ([]any, error)

	// RawValues returns the unparsed bytes of the row values. The returned data is only valid until the next Next
	// call or the Rows is closed.
	RawValues() [][]byte

	// Conn returns the underlying *Conn on which the query was executed. This may return nil if Rows did not come from a
	// *Conn (e.g. if it was created by RowsFromResultReader)
	Conn() *Conn

	// TypeMap returns the [pgtype.Map] the values of this Rows are decoded with. It is available even when [Rows.Conn]
	// is nil, such as for a Rows created by [RowsFromResultReader]. It may return nil if the Rows carries no values,
	// such as one representing only an error.
	TypeMap() *pgtype.Map
}
```

Rows is the result set returned from [Conn.Query](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn.Query). Rows must be closed before
the [Conn](https://pkg.go.dev/github.com/jackc/pgx/v5#Conn) can be used again. Rows are closed by explicitly calling [Rows.Close](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows.Close),
calling [Rows.Next](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows.Next) until it returns false, or when a fatal error occurs.

Once a Rows is closed the only methods that may be called are [Rows.Close](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows.Close), [Rows.Err](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows.Err),
and [Rows.CommandTag](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows.CommandTag).

Rows is an interface instead of a struct to allow tests to mock Query. However,
adding a method to an interface is technically a breaking change. Because of this
the Rows interface is partially excluded from semantic version requirements.
Methods will not be removed or changed, but new methods may be added.

#### func [RowsFromResultReader](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L417) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#RowsFromResultReader "Go to RowsFromResultReader")

```
func RowsFromResultReader(typeMap *pgtype.Map, resultReader *pgconn.ResultReader) Rows
```

RowsFromResultReader returns a [Rows](https://pkg.go.dev/github.com/jackc/pgx/v5#Rows) that will read from values resultReader and decode with typeMap. It can be used
to read from the lower level [pgconn](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgconn) interface.

#### type [ScanArgError](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L369) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ScanArgError "Go to ScanArgError")

```
type ScanArgError struct {
	ColumnIndex int
	FieldName   string
	Err         error
}
```

#### func (ScanArgError) [Error](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L375) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ScanArgError.Error "Go to ScanArgError.Error")

```
func (e ScanArgError) Error() string
```

#### func (ScanArgError) [Unwrap](https://github.com/jackc/pgx/blob/v5.11.0/rows.go\#L383) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#ScanArgError.Unwrap "Go to ScanArgError.Unwrap")

```
func (e ScanArgError) Unwrap() error
```

#### type [StrictNamedArgs](https://github.com/jackc/pgx/blob/v5.11.0/named_args.go\#L32) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#StrictNamedArgs "Go to StrictNamedArgs")added inv5.6.0

```
type StrictNamedArgs map[string]any
```

StrictNamedArgs can be used in the same way as NamedArgs, but provided arguments are also checked to include all
named arguments that the sql query uses, and no extra arguments.

#### func (StrictNamedArgs) [RewriteQuery](https://github.com/jackc/pgx/blob/v5.11.0/named_args.go\#L35) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#StrictNamedArgs.RewriteQuery "Go to StrictNamedArgs.RewriteQuery")added inv5.6.0

```
func (sna StrictNamedArgs) RewriteQuery(ctx context.Context, conn *Conn, sql string, args []any) (newSQL string, newArgs []any, err error)
```

RewriteQuery implements the QueryRewriter interface.

#### type [TraceBatchEndData](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L49) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TraceBatchEndData "Go to TraceBatchEndData")

```
type TraceBatchEndData struct {
	Err error
}
```

#### type [TraceBatchQueryData](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L42) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TraceBatchQueryData "Go to TraceBatchQueryData")

```
type TraceBatchQueryData struct {
	SQL        string
	Args       []any
	CommandTag pgconn.CommandTag
	Err        error
}
```

#### type [TraceBatchStartData](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L38) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TraceBatchStartData "Go to TraceBatchStartData")

```
type TraceBatchStartData struct {
	Batch *Batch
}
```

#### type [TraceConnectEndData](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L104) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TraceConnectEndData "Go to TraceConnectEndData")

```
type TraceConnectEndData struct {
	Conn *Conn
	Err  error
}
```

#### type [TraceConnectStartData](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L100) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TraceConnectStartData "Go to TraceConnectStartData")

```
type TraceConnectStartData struct {
	ConnConfig *ConnConfig
}
```

#### type [TraceCopyFromEndData](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L67) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TraceCopyFromEndData "Go to TraceCopyFromEndData")

```
type TraceCopyFromEndData struct {
	CommandTag pgconn.CommandTag
	Err        error
}
```

#### type [TraceCopyFromStartData](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L62) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TraceCopyFromStartData "Go to TraceCopyFromStartData")

```
type TraceCopyFromStartData struct {
	TableName   Identifier
	ColumnNames []string
}
```

#### type [TracePrepareEndData](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L86) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TracePrepareEndData "Go to TracePrepareEndData")

```
type TracePrepareEndData struct {
	AlreadyPrepared bool
	Err             error
}
```

#### type [TracePrepareStartData](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L81) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TracePrepareStartData "Go to TracePrepareStartData")

```
type TracePrepareStartData struct {
	Name string
	SQL  string
}
```

#### type [TraceQueryEndData](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L23) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TraceQueryEndData "Go to TraceQueryEndData")

```
type TraceQueryEndData struct {
	CommandTag pgconn.CommandTag
	Err        error
}
```

#### type [TraceQueryStartData](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go\#L18) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TraceQueryStartData "Go to TraceQueryStartData")

```
type TraceQueryStartData struct {
	SQL  string
	Args []any
}
```

#### type [Tx](https://github.com/jackc/pgx/blob/v5.11.0/tx.go\#L133) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#Tx "Go to Tx")

```
type Tx interface {
	// Begin starts a pseudo nested transaction.
	Begin(ctx context.Context) (Tx, error)

	// Commit commits the transaction if this is a real transaction or releases the savepoint if this is a pseudo nested
	// transaction. Commit will return an error where errors.Is(ErrTxClosed) is true if the Tx is already closed, but is
	// otherwise safe to call multiple times. If the commit fails with a rollback status (e.g. the transaction was already
	// in a broken state) then an error where errors.Is(ErrTxCommitRollback) is true will be returned.
	Commit(ctx context.Context) error

	// Rollback rolls back the transaction if this is a real transaction or rolls back to the savepoint if this is a
	// pseudo nested transaction. Rollback will return an error where errors.Is(ErrTxClosed) is true if the Tx is already
	// closed, but is otherwise safe to call multiple times. Hence, a defer tx.Rollback() is safe even if tx.Commit() will
	// be called first in a non-error condition. Any other failure of a real transaction will result in the connection
	// being closed.
	Rollback(ctx context.Context) error

	CopyFrom(ctx context.Context, tableName Identifier, columnNames []string, rowSrc CopyFromSource) (int64, error)
	SendBatch(ctx context.Context, b *Batch) BatchResults
	LargeObjects() LargeObjects

	Prepare(ctx context.Context, name, sql string) (*pgconn.StatementDescription, error)

	Exec(ctx context.Context, sql string, arguments ...any) (commandTag pgconn.CommandTag, err error)
	Query(ctx context.Context, sql string, args ...any) (Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) Row

	// Conn returns the underlying *Conn that on which this transaction is executing.
	Conn() *Conn
}
```

Tx represents a database transaction.

Tx is an interface instead of a struct to enable connection pools to be implemented without relying on internal pgx
state, to support pseudo-nested transactions with savepoints, and to allow tests to mock transactions. However,
adding a method to an interface is technically a breaking change. If new methods are added to Conn it may be
desirable to add them to Tx as well. Because of this the Tx interface is partially excluded from semantic version
requirements. Methods will not be removed or changed, but new methods may be added.

#### type [TxAccessMode](https://github.com/jackc/pgx/blob/v5.11.0/tx.go\#L24) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TxAccessMode "Go to TxAccessMode")

```
type TxAccessMode string
```

TxAccessMode is the transaction access mode (read write or read only)

```
const (
	ReadWrite TxAccessMode = "read write"
	ReadOnly  TxAccessMode = "read only"
)
```

Transaction access modes

#### type [TxDeferrableMode](https://github.com/jackc/pgx/blob/v5.11.0/tx.go\#L33) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TxDeferrableMode "Go to TxDeferrableMode")

```
type TxDeferrableMode string
```

TxDeferrableMode is the transaction deferrable mode (deferrable or not deferrable)

```
const (
	Deferrable    TxDeferrableMode = "deferrable"
	NotDeferrable TxDeferrableMode = "not deferrable"
)
```

Transaction deferrable modes

#### type [TxIsoLevel](https://github.com/jackc/pgx/blob/v5.11.0/tx.go\#L13) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TxIsoLevel "Go to TxIsoLevel")

```
type TxIsoLevel string
```

TxIsoLevel is the transaction isolation level (serializable, repeatable read, read committed or read uncommitted)

```
const (
	Serializable    TxIsoLevel = "serializable"
	RepeatableRead  TxIsoLevel = "repeatable read"
	ReadCommitted   TxIsoLevel = "read committed"
	ReadUncommitted TxIsoLevel = "read uncommitted"
)
```

Transaction isolation levels

#### type [TxOptions](https://github.com/jackc/pgx/blob/v5.11.0/tx.go\#L42) [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#TxOptions "Go to TxOptions")

```
type TxOptions struct {
	IsoLevel       TxIsoLevel
	AccessMode     TxAccessMode
	DeferrableMode TxDeferrableMode

	// BeginQuery is the SQL query that will be executed to begin the transaction. This allows using non-standard syntax
	// such as BEGIN PRIORITY HIGH with CockroachDB. If set this will override the other settings.
	BeginQuery string
	// CommitQuery is the SQL query that will be executed to commit the transaction.
	CommitQuery string
}
```

TxOptions are transaction modes within a transaction block

## ![](https://pkg.go.dev/static/shared/icon/insert_drive_file_gm_grey_24dp.svg)  Source Files  [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#section-sourcefiles "Go to Source Files")

[View all Source files](https://github.com/jackc/pgx/tree/v5.11.0)

- [batch.go](https://github.com/jackc/pgx/blob/v5.11.0/batch.go "batch.go")
- [conn.go](https://github.com/jackc/pgx/blob/v5.11.0/conn.go "conn.go")
- [copy\_from.go](https://github.com/jackc/pgx/blob/v5.11.0/copy_from.go "copy_from.go")
- [derived\_types.go](https://github.com/jackc/pgx/blob/v5.11.0/derived_types.go "derived_types.go")
- [doc.go](https://github.com/jackc/pgx/blob/v5.11.0/doc.go "doc.go")
- [extended\_query\_builder.go](https://github.com/jackc/pgx/blob/v5.11.0/extended_query_builder.go "extended_query_builder.go")
- [large\_objects.go](https://github.com/jackc/pgx/blob/v5.11.0/large_objects.go "large_objects.go")
- [named\_args.go](https://github.com/jackc/pgx/blob/v5.11.0/named_args.go "named_args.go")
- [rows.go](https://github.com/jackc/pgx/blob/v5.11.0/rows.go "rows.go")
- [tracer.go](https://github.com/jackc/pgx/blob/v5.11.0/tracer.go "tracer.go")
- [tx.go](https://github.com/jackc/pgx/blob/v5.11.0/tx.go "tx.go")
- [values.go](https://github.com/jackc/pgx/blob/v5.11.0/values.go "values.go")

## ![](https://pkg.go.dev/static/shared/icon/folder_gm_grey_24dp.svg)  Directories  [¶](https://pkg.go.dev/github.com/jackc/pgx/v5\#section-directories "Go to Directories")

Show internal
Expand all

| Path | Synopsis |
| --- | --- |
| ![](https://pkg.go.dev/static/shared/icon/arrow_right_gm_grey_24dp.svg)examples |  |
| [chat](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/examples/chat) command |  |
| [todo](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/examples/todo) command |  |
| [url\_shortener](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/examples/url_shortener) command |  |
| ![](https://pkg.go.dev/static/shared/icon/arrow_right_gm_grey_24dp.svg)internal |  |
| [faultyconn](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/internal/faultyconn) |  |
| [iobufpool](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/internal/iobufpool)<br>Package iobufpool implements a global segregated-fit pool of buffers for IO. | Package iobufpool implements a global segregated-fit pool of buffers for IO. |
| [pgdatetime](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/internal/pgdatetime)<br>Package pgdatetime writes PostgreSQL's ISO date/time text format. | Package pgdatetime writes PostgreSQL's ISO date/time text format. |
| [pgio](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/internal/pgio)<br>Package pgio is a low-level toolkit for building and parsing messages in the PostgreSQL wire protocol. | Package pgio is a low-level toolkit for building and parsing messages in the PostgreSQL wire protocol. |
| [pgmock](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/internal/pgmock)<br>Package pgmock provides the ability to mock a PostgreSQL server. | Package pgmock provides the ability to mock a PostgreSQL server. |
| [sanitize](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/internal/sanitize) |  |
| [stmtcache](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/internal/stmtcache)<br>Package stmtcache is a cache for statement descriptions. | Package stmtcache is a cache for statement descriptions. |
| ![](https://pkg.go.dev/static/shared/icon/arrow_right_gm_grey_24dp.svg)log |  |
| [testingadapter](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/log/testingadapter)<br>Package testingadapter provides a logger that writes to a test or benchmark log. | Package testingadapter provides a logger that writes to a test or benchmark log. |
| [multitracer](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/multitracer)<br>Package multitracer provides a Tracer that can combine several tracers into one. | Package multitracer provides a Tracer that can combine several tracers into one. |
| ![](https://pkg.go.dev/static/shared/icon/arrow_right_gm_grey_24dp.svg)[pgconn](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgconn)<br>Package pgconn is a low-level PostgreSQL database driver. | Package pgconn is a low-level PostgreSQL database driver. |
| [ctxwatch](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgconn/ctxwatch) |  |
| [internal/bgreader](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgconn/internal/bgreader)<br>Package bgreader provides a io.Reader that can optionally buffer reads in the background. | Package bgreader provides a io.Reader that can optionally buffer reads in the background. |
| ![](https://pkg.go.dev/static/shared/icon/arrow_right_gm_grey_24dp.svg)[pgproto3](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgproto3)<br>Package pgproto3 is an encoder and decoder of the PostgreSQL wire protocol version 3. | Package pgproto3 is an encoder and decoder of the PostgreSQL wire protocol version 3. |
| [example/pgfortune](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgproto3/example/pgfortune) command |  |
| ![](https://pkg.go.dev/static/shared/icon/arrow_right_gm_grey_24dp.svg)[pgtype](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgtype)<br>Package pgtype converts between Go and PostgreSQL values. | Package pgtype converts between Go and PostgreSQL values. |
| [zeronull](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgtype/zeronull)<br>Package zeronull contains types that automatically convert between database NULLs and Go zero values. | Package zeronull contains types that automatically convert between database NULLs and Go zero values. |
| [pgxpool](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgxpool)<br>Package pgxpool is a concurrency-safe connection pool for pgx. | Package pgxpool is a concurrency-safe connection pool for pgx. |
| [pgxtest](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/pgxtest)<br>Package pgxtest provides utilities for testing pgx and packages that integrate with pgx. | Package pgxtest provides utilities for testing pgx and packages that integrate with pgx. |
| [stdlib](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/stdlib)<br>Package stdlib is the compatibility layer from pgx to database/sql. | Package stdlib is the compatibility layer from pgx to database/sql. |
| [testsetup](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/testsetup) |  |
| [tracelog](https://pkg.go.dev/github.com/jackc/pgx/v5@v5.11.0/tracelog)<br>Package tracelog provides a tracer that acts as a traditional logger. | Package tracelog provides a tracer that acts as a traditional logger. |

Click to show internal directories.

Click to hide internal directories.

## Jump to

![](https://pkg.go.dev/static/shared/icon/close_gm_grey_24dp.svg)

Close

## Keyboard shortcuts

![](https://pkg.go.dev/static/shared/icon/close_gm_grey_24dp.svg)

|     |     |
| --- | --- |
| **?** | : This menu |
| **/** | : Search site |
| **f** or **F** | : Jump to |
| **y** or **Y** | : Canonical URL |

Close

go.dev uses cookies from Google to deliver and enhance the quality of its services and to
analyze traffic. [Learn more.](https://policies.google.com/technologies/cookies)

Okay