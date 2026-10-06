Search Shortcut cmd \+ k \| ctrl \+ k

- [Installation](https://duckdb.org/install/)
- Documentation



  - [Getting Started](https://duckdb.org/docs/current/index)
  - Connect

    - [Overview](https://duckdb.org/docs/current/connect/overview)
    - [Concurrency](https://duckdb.org/docs/current/connect/concurrency)

  - Data Import and Export

    - [Overview](https://duckdb.org/docs/current/data/overview)
    - [Data Sources](https://duckdb.org/docs/current/data/data_sources)
    - CSV Files

      - [Overview](https://duckdb.org/docs/current/data/csv/overview)
      - [Auto Detection](https://duckdb.org/docs/current/data/csv/auto_detection)
      - [Reading Faulty CSV Files](https://duckdb.org/docs/current/data/csv/reading_faulty_csv_files)
      - [Tips](https://duckdb.org/docs/current/data/csv/tips)

    - JSON Files

      - [Overview](https://duckdb.org/docs/current/data/json/overview)
      - [Creating JSON](https://duckdb.org/docs/current/data/json/creating_json)
      - [Loading JSON](https://duckdb.org/docs/current/data/json/loading_json)
      - [Writing JSON](https://duckdb.org/docs/current/data/json/writing_json)
      - [JSON Type](https://duckdb.org/docs/current/data/json/json_type)
      - [JSON Functions](https://duckdb.org/docs/current/data/json/json_functions)
      - [Format Settings](https://duckdb.org/docs/current/data/json/format_settings)
      - [Installing and Loading](https://duckdb.org/docs/current/data/json/installing_and_loading)
      - [SQL to / from JSON](https://duckdb.org/docs/current/data/json/sql_to_and_from_json)
      - [Caveats](https://duckdb.org/docs/current/data/json/caveats)

    - Multiple Files

      - [Overview](https://duckdb.org/docs/current/data/multiple_files/overview)
      - [Combining Schemas](https://duckdb.org/docs/current/data/multiple_files/combining_schemas)

    - Parquet Files

      - [Overview](https://duckdb.org/docs/current/data/parquet/overview)
      - [Metadata](https://duckdb.org/docs/current/data/parquet/metadata)
      - [Encryption](https://duckdb.org/docs/current/data/parquet/encryption)
      - [Tips](https://duckdb.org/docs/current/data/parquet/tips)

    - Partitioning

      - [Hive Partitioning](https://duckdb.org/docs/current/data/partitioning/hive_partitioning)
      - [Partitioned Writes](https://duckdb.org/docs/current/data/partitioning/partitioned_writes)

    - [Appender](https://duckdb.org/docs/current/data/appender)
    - [INSERT Statements](https://duckdb.org/docs/current/data/insert)

  - [Lakehouse Formats](https://duckdb.org/docs/current/lakehouse_formats)
  - Client APIs

    - [Overview](https://duckdb.org/docs/current/clients/overview)
    - [ADBC](https://duckdb.org/docs/current/clients/adbc)
    - C

      - [Overview](https://duckdb.org/docs/current/clients/c/overview)
      - [Startup](https://duckdb.org/docs/current/clients/c/connect)
      - [Configuration](https://duckdb.org/docs/current/clients/c/config)
      - [Query](https://duckdb.org/docs/current/clients/c/query)
      - [Data Chunks](https://duckdb.org/docs/current/clients/c/data_chunk)
      - [Vectors](https://duckdb.org/docs/current/clients/c/vector)
      - [Values](https://duckdb.org/docs/current/clients/c/value)
      - [Types](https://duckdb.org/docs/current/clients/c/types)
      - [Prepared Statements](https://duckdb.org/docs/current/clients/c/prepared)
      - [Appender](https://duckdb.org/docs/current/clients/c/appender)
      - [Table Functions](https://duckdb.org/docs/current/clients/c/table_functions)
      - [Replacement Scans](https://duckdb.org/docs/current/clients/c/replacement_scans)
      - [API Reference](https://duckdb.org/docs/current/clients/c/api)

    - [C++](https://duckdb.org/docs/current/clients/cpp)
    - CLI

      - [Overview](https://duckdb.org/docs/current/clients/cli/overview)
      - [Arguments](https://duckdb.org/docs/current/clients/cli/arguments)
      - [Dot Commands](https://duckdb.org/docs/current/clients/cli/dot_commands)
      - [Output Formats](https://duckdb.org/docs/current/clients/cli/output_formats)
      - [Editing](https://duckdb.org/docs/current/clients/cli/editing)
      - [Friendly CLI](https://duckdb.org/docs/current/clients/cli/friendly_cli)
      - [Safe Mode](https://duckdb.org/docs/current/clients/cli/safe_mode)
      - [Autocomplete](https://duckdb.org/docs/current/clients/cli/autocomplete)
      - [Syntax Highlighting](https://duckdb.org/docs/current/clients/cli/syntax_highlighting)
      - [Known Issues](https://duckdb.org/docs/current/clients/cli/known_issues)

    - Go

      - [Overview](https://duckdb.org/docs/current/clients/go/overview)
      - [Connect](https://duckdb.org/docs/current/clients/go/connecting)
      - [Import Data](https://duckdb.org/docs/current/clients/go/data_import)
      - [Run Queries](https://duckdb.org/docs/current/clients/go/querying)
      - [Handle Results](https://duckdb.org/docs/current/clients/go/result_handling)
      - [Write User Defined Functions](https://duckdb.org/docs/current/clients/go/functions)
      - [Profile and Monitor](https://duckdb.org/docs/current/clients/go/profiling)
      - [Troubleshoot](https://duckdb.org/docs/current/clients/go/troubleshoot)

    - Java (JDBC)

      - [Overview](https://duckdb.org/docs/current/clients/java/overview)
      - [Connect](https://duckdb.org/docs/current/clients/java/connecting)
      - [Import Data](https://duckdb.org/docs/current/clients/java/data_import)
      - [Run Queries](https://duckdb.org/docs/current/clients/java/querying)
      - [Handle Results](https://duckdb.org/docs/current/clients/java/result_handling)
      - [Write User Defined Functions](https://duckdb.org/docs/current/clients/java/functions)
      - [Profile and Monitor](https://duckdb.org/docs/current/clients/java/profiling)
      - [Deploy as Native Image](https://duckdb.org/docs/current/clients/java/deploy_native_image)
      - [Troubleshoot](https://duckdb.org/docs/current/clients/java/troubleshoot)

    - Node.js (Neo)

      - [Overview](https://duckdb.org/docs/current/clients/node_neo/overview)

    - ODBC

      - [Overview](https://duckdb.org/docs/current/clients/odbc/overview)
      - [Linux Setup](https://duckdb.org/docs/current/clients/odbc/linux)
      - [Windows Setup](https://duckdb.org/docs/current/clients/odbc/windows)
      - [macOS Setup](https://duckdb.org/docs/current/clients/odbc/macos)
      - [Configuration](https://duckdb.org/docs/current/clients/odbc/configuration)

    - Python

      - [Overview](https://duckdb.org/docs/current/clients/python/overview)
      - [Data Ingestion](https://duckdb.org/docs/current/clients/python/data_ingestion)
      - [Conversion between DuckDB and Python](https://duckdb.org/docs/current/clients/python/conversion)
      - [DB API](https://duckdb.org/docs/current/clients/python/dbapi)
      - [Relational API](https://duckdb.org/docs/current/clients/python/relational_api)
      - [Function API](https://duckdb.org/docs/current/clients/python/function)
      - [Types API](https://duckdb.org/docs/current/clients/python/types)
      - [Expression API](https://duckdb.org/docs/current/clients/python/expression)
      - [Spark API](https://duckdb.org/docs/current/clients/python/spark_api)
      - [API Reference](https://duckdb.org/docs/current/clients/python/reference)
      - [Known Python Issues](https://duckdb.org/docs/current/clients/python/known_issues)

    - [R](https://duckdb.org/docs/current/clients/r)
    - Rust

      - [Overview](https://duckdb.org/docs/current/clients/rust/overview)
      - [Connect](https://duckdb.org/docs/current/clients/rust/connecting)
      - [Import Data](https://duckdb.org/docs/current/clients/rust/data_import)
      - [Run Queries](https://duckdb.org/docs/current/clients/rust/querying)
      - [Handle Results](https://duckdb.org/docs/current/clients/rust/result_handling)
      - [Write User Defined Functions](https://duckdb.org/docs/current/clients/rust/functions)
      - [Profile and Monitor](https://duckdb.org/docs/current/clients/rust/profiling)
      - [Troubleshoot](https://duckdb.org/docs/current/clients/rust/troubleshoot)

    - Wasm

      - [Overview](https://duckdb.org/docs/current/clients/wasm/overview)
      - [Instantiate](https://duckdb.org/docs/current/clients/wasm/instantiation)
      - [Import Data](https://duckdb.org/docs/current/clients/wasm/data_ingestion)
      - [Run Queries](https://duckdb.org/docs/current/clients/wasm/query)
      - [Load Extensions](https://duckdb.org/docs/current/clients/wasm/extensions)
      - [Deploy](https://duckdb.org/docs/current/clients/wasm/deploying_duckdb_wasm)
      - [Troubleshoot](https://duckdb.org/docs/current/clients/wasm/troubleshoot)

    - Tertiary Clients
      - [Overview](https://duckdb.org/docs/current/clients/tertiary_clients/overview)
      - [Dart](https://duckdb.org/docs/current/clients/tertiary_clients/dart)
      - [Julia](https://duckdb.org/docs/current/clients/tertiary_clients/julia)
      - [PHP](https://duckdb.org/docs/current/clients/tertiary_clients/php)
      - [PHP (PDO)](https://duckdb.org/docs/current/clients/tertiary_clients/php_pdo)
      - [Swift](https://duckdb.org/docs/current/clients/tertiary_clients/swift)

  - SQL

    - [Introduction](https://duckdb.org/docs/current/sql/introduction)
    - Statements

      - [Overview](https://duckdb.org/docs/current/sql/statements/overview)
      - [ANALYZE](https://duckdb.org/docs/current/sql/statements/analyze)
      - [ALTER TABLE](https://duckdb.org/docs/current/sql/statements/alter_table)
      - [ALTER VIEW](https://duckdb.org/docs/current/sql/statements/alter_view)
      - [ATTACH and DETACH](https://duckdb.org/docs/current/sql/statements/attach)
      - [CALL](https://duckdb.org/docs/current/sql/statements/call)
      - [CHECKPOINT](https://duckdb.org/docs/current/sql/statements/checkpoint)
      - [COMMENT ON](https://duckdb.org/docs/current/sql/statements/comment_on)
      - [COPY](https://duckdb.org/docs/current/sql/statements/copy)
      - [CREATE INDEX](https://duckdb.org/docs/current/sql/statements/create_index)
      - [CREATE MACRO](https://duckdb.org/docs/current/sql/statements/create_macro)
      - [CREATE SCHEMA](https://duckdb.org/docs/current/sql/statements/create_schema)
      - [CREATE SECRET](https://duckdb.org/docs/current/sql/statements/create_secret)
      - [CREATE SEQUENCE](https://duckdb.org/docs/current/sql/statements/create_sequence)
      - [CREATE TABLE](https://duckdb.org/docs/current/sql/statements/create_table)
      - [CREATE VIEW](https://duckdb.org/docs/current/sql/statements/create_view)
      - [CREATE TYPE](https://duckdb.org/docs/current/sql/statements/create_type)
      - [DELETE](https://duckdb.org/docs/current/sql/statements/delete)
      - [DESCRIBE](https://duckdb.org/docs/current/sql/statements/describe)
      - [DROP](https://duckdb.org/docs/current/sql/statements/drop)
      - [EXPORT and IMPORT DATABASE](https://duckdb.org/docs/current/sql/statements/export)
      - [INSERT](https://duckdb.org/docs/current/sql/statements/insert)
      - [LOAD / INSTALL](https://duckdb.org/docs/current/sql/statements/load_and_install)
      - [MERGE INTO](https://duckdb.org/docs/current/sql/statements/merge_into)
      - [PIVOT](https://duckdb.org/docs/current/sql/statements/pivot)
      - [Profiling](https://duckdb.org/docs/current/sql/statements/profiling)
      - [PREPARE, EXECUTE, and DEALLOCATE](https://duckdb.org/docs/current/sql/statements/prepare)
      - [SELECT](https://duckdb.org/docs/current/sql/statements/select)
      - [SET / RESET](https://duckdb.org/docs/current/sql/statements/set)
      - [SET VARIABLE](https://duckdb.org/docs/current/sql/statements/set_variable)
      - [SHOW and SHOW DATABASES](https://duckdb.org/docs/current/sql/statements/show)
      - [SUMMARIZE](https://duckdb.org/docs/current/sql/statements/summarize)
      - [Transaction Management](https://duckdb.org/docs/current/sql/statements/transactions)
      - [UNPIVOT](https://duckdb.org/docs/current/sql/statements/unpivot)
      - [UPDATE](https://duckdb.org/docs/current/sql/statements/update)
      - [USE](https://duckdb.org/docs/current/sql/statements/use)
      - [VACUUM](https://duckdb.org/docs/current/sql/statements/vacuum)

    - Query Syntax

      - [SELECT](https://duckdb.org/docs/current/sql/query_syntax/select)
      - [FROM and JOIN](https://duckdb.org/docs/current/sql/query_syntax/from)
      - [WHERE](https://duckdb.org/docs/current/sql/query_syntax/where)
      - [GROUP BY](https://duckdb.org/docs/current/sql/query_syntax/groupby)
      - [GROUPING SETS](https://duckdb.org/docs/current/sql/query_syntax/grouping_sets)
      - [HAVING](https://duckdb.org/docs/current/sql/query_syntax/having)
      - [ORDER BY](https://duckdb.org/docs/current/sql/query_syntax/orderby)
      - [LIMIT and OFFSET](https://duckdb.org/docs/current/sql/query_syntax/limit)
      - [SAMPLE](https://duckdb.org/docs/current/sql/query_syntax/sample)
      - [Unnesting](https://duckdb.org/docs/current/sql/query_syntax/unnest)
      - [WITH](https://duckdb.org/docs/current/sql/query_syntax/with)
      - [WINDOW](https://duckdb.org/docs/current/sql/query_syntax/window)
      - [QUALIFY](https://duckdb.org/docs/current/sql/query_syntax/qualify)
      - [VALUES](https://duckdb.org/docs/current/sql/query_syntax/values)
      - [FILTER](https://duckdb.org/docs/current/sql/query_syntax/filter)
      - [Set Operations](https://duckdb.org/docs/current/sql/query_syntax/setops)
      - [Prepared Statements](https://duckdb.org/docs/current/sql/query_syntax/prepared_statements)

    - Data Types

      - [Overview](https://duckdb.org/docs/current/sql/data_types/overview)
      - [Array](https://duckdb.org/docs/current/sql/data_types/array)
      - [Bitstring](https://duckdb.org/docs/current/sql/data_types/bitstring)
      - [Blob](https://duckdb.org/docs/current/sql/data_types/blob)
      - [Boolean](https://duckdb.org/docs/current/sql/data_types/boolean)
      - [Date](https://duckdb.org/docs/current/sql/data_types/date)
      - [Enum](https://duckdb.org/docs/current/sql/data_types/enum)
      - [Geometry](https://duckdb.org/docs/current/sql/data_types/geometry)
      - [Interval](https://duckdb.org/docs/current/sql/data_types/interval)
      - [List](https://duckdb.org/docs/current/sql/data_types/list)
      - [Literal Types](https://duckdb.org/docs/current/sql/data_types/literal_types)
      - [Map](https://duckdb.org/docs/current/sql/data_types/map)
      - [NULL Values](https://duckdb.org/docs/current/sql/data_types/nulls)
      - [Numeric](https://duckdb.org/docs/current/sql/data_types/numeric)
      - [Struct](https://duckdb.org/docs/current/sql/data_types/struct)
      - [Text](https://duckdb.org/docs/current/sql/data_types/text)
      - [Time](https://duckdb.org/docs/current/sql/data_types/time)
      - [Timestamp](https://duckdb.org/docs/current/sql/data_types/timestamp)
      - [Time Zones](https://duckdb.org/docs/current/sql/data_types/timezones)
      - [Union](https://duckdb.org/docs/current/sql/data_types/union)
      - [Typecasting](https://duckdb.org/docs/current/sql/data_types/typecasting)
      - [Variant](https://duckdb.org/docs/current/sql/data_types/variant)

    - Expressions

      - [Overview](https://duckdb.org/docs/current/sql/expressions/overview)
      - [CASE Expression](https://duckdb.org/docs/current/sql/expressions/case)
      - [Casting](https://duckdb.org/docs/current/sql/expressions/cast)
      - [Collations](https://duckdb.org/docs/current/sql/expressions/collations)
      - [Comparisons](https://duckdb.org/docs/current/sql/expressions/comparison_operators)
      - [IN Operator](https://duckdb.org/docs/current/sql/expressions/in)
      - [Logical Operators](https://duckdb.org/docs/current/sql/expressions/logical_operators)
      - [Star Expression](https://duckdb.org/docs/current/sql/expressions/star)
      - [Subqueries](https://duckdb.org/docs/current/sql/expressions/subqueries)
      - [TRY](https://duckdb.org/docs/current/sql/expressions/try)

    - Functions

      - [Overview](https://duckdb.org/docs/current/sql/functions/overview)
      - [Aggregate Functions](https://duckdb.org/docs/current/sql/functions/aggregates)
      - [Array Functions](https://duckdb.org/docs/current/sql/functions/array)
      - [Bitstring Functions](https://duckdb.org/docs/current/sql/functions/bitstring)
      - [Blob Functions](https://duckdb.org/docs/current/sql/functions/blob)
      - [Date Format Functions](https://duckdb.org/docs/current/sql/functions/dateformat)
      - [Date Functions](https://duckdb.org/docs/current/sql/functions/date)
      - [Date Part Functions](https://duckdb.org/docs/current/sql/functions/datepart)
      - [Enum Functions](https://duckdb.org/docs/current/sql/functions/enum)
      - [Geometry Functions](https://duckdb.org/docs/current/sql/functions/geometry)
      - [Interval Functions](https://duckdb.org/docs/current/sql/functions/interval)
      - [Lambda Functions](https://duckdb.org/docs/current/sql/functions/lambda)
      - [List Functions](https://duckdb.org/docs/current/sql/functions/list)
      - [Map Functions](https://duckdb.org/docs/current/sql/functions/map)
      - [Nested Functions](https://duckdb.org/docs/current/sql/functions/nested)
      - [Numeric Functions](https://duckdb.org/docs/current/sql/functions/numeric)
      - [Pattern Matching](https://duckdb.org/docs/current/sql/functions/pattern_matching)
      - [Regular Expressions](https://duckdb.org/docs/current/sql/functions/regular_expressions)
      - [Struct Functions](https://duckdb.org/docs/current/sql/functions/struct)
      - [Text Functions](https://duckdb.org/docs/current/sql/functions/text)
      - [Time Functions](https://duckdb.org/docs/current/sql/functions/time)
      - [Timestamp Functions](https://duckdb.org/docs/current/sql/functions/timestamp)
      - [Timestamp with Time Zone Functions](https://duckdb.org/docs/current/sql/functions/timestamptz)
      - [Union Functions](https://duckdb.org/docs/current/sql/functions/union)
      - [Utility Functions](https://duckdb.org/docs/current/sql/functions/utility)
      - [Window Functions](https://duckdb.org/docs/current/sql/functions/window_functions)

    - [Constraints](https://duckdb.org/docs/current/sql/constraints)
    - [Indexes](https://duckdb.org/docs/current/sql/indexes)
    - Meta Queries

      - [Information Schema](https://duckdb.org/docs/current/sql/meta/information_schema)
      - [Metadata Functions](https://duckdb.org/docs/current/sql/meta/duckdb_table_functions)

    - DuckDB's SQL Dialect

      - [Overview](https://duckdb.org/docs/current/sql/dialect/overview)
      - [Indexing](https://duckdb.org/docs/current/sql/dialect/indexing)
      - [Friendly SQL](https://duckdb.org/docs/current/sql/dialect/friendly_sql)
      - [Keywords and Identifiers](https://duckdb.org/docs/current/sql/dialect/keywords_and_identifiers)
      - [Order Preservation](https://duckdb.org/docs/current/sql/dialect/order_preservation)
      - [PostgreSQL Compatibility](https://duckdb.org/docs/current/sql/dialect/postgresql_compatibility)
      - [SQL Quirks](https://duckdb.org/docs/current/sql/dialect/sql_quirks)

    - [PEG Parser](https://duckdb.org/docs/current/sql/peg_parser)
    - [Samples](https://duckdb.org/docs/current/sql/samples)

  - Configuration

    - [Overview](https://duckdb.org/docs/current/configuration/overview)
    - [Pragmas](https://duckdb.org/docs/current/configuration/pragmas)
    - [Secrets Manager](https://duckdb.org/docs/current/configuration/secrets_manager)

  - Extensions

    - [Overview](https://duckdb.org/docs/current/extensions/overview)
    - [Installing Extensions](https://duckdb.org/docs/current/extensions/installing_extensions)
    - [Advanced Installation Methods](https://duckdb.org/docs/current/extensions/advanced_installation_methods)
    - [Distributing Extensions](https://duckdb.org/docs/current/extensions/extension_distribution)
    - [Versioning of Extensions](https://duckdb.org/docs/current/extensions/versioning_of_extensions)
    - [Troubleshooting of Extensions](https://duckdb.org/docs/current/extensions/troubleshooting)

  - Core Extensions

    - [Overview](https://duckdb.org/docs/current/core_extensions/overview)
    - [AutoComplete](https://duckdb.org/docs/current/core_extensions/autocomplete)
    - [Avro](https://duckdb.org/docs/current/core_extensions/avro)
    - [AWS](https://duckdb.org/docs/current/core_extensions/aws)
    - [Azure](https://duckdb.org/docs/current/core_extensions/azure)
    - [Delta](https://duckdb.org/docs/current/core_extensions/delta)
    - [DuckLake](https://duckdb.org/docs/current/core_extensions/ducklake)
    - [Encodings](https://duckdb.org/docs/current/core_extensions/encodings)
    - [Excel](https://duckdb.org/docs/current/core_extensions/excel)
    - [Full Text Search](https://duckdb.org/docs/current/core_extensions/full_text_search)
    - httpfs (HTTP and S3)

      - [Overview](https://duckdb.org/docs/current/core_extensions/httpfs/overview)
      - [HTTP(S) Support](https://duckdb.org/docs/current/core_extensions/httpfs/https)
      - [Hugging Face](https://duckdb.org/docs/current/core_extensions/httpfs/hugging_face)
      - [S3 API Support](https://duckdb.org/docs/current/core_extensions/httpfs/s3api)
      - [Legacy Authentication Scheme for S3 API](https://duckdb.org/docs/current/core_extensions/httpfs/s3api_legacy_authentication)

    - Iceberg

      - [Overview](https://duckdb.org/docs/current/core_extensions/iceberg/overview)
      - [Writing to Iceberg](https://duckdb.org/docs/current/core_extensions/iceberg/writing_to_iceberg)
      - [Iceberg Functions](https://duckdb.org/docs/current/core_extensions/iceberg/iceberg_functions)
      - [Iceberg Options](https://duckdb.org/docs/current/core_extensions/iceberg/iceberg_options)
      - [Iceberg REST Catalogs](https://duckdb.org/docs/current/core_extensions/iceberg/catalogs)
      - [Troubleshooting](https://duckdb.org/docs/current/core_extensions/iceberg/troubleshooting)

    - [ICU](https://duckdb.org/docs/current/core_extensions/icu)
    - [inet](https://duckdb.org/docs/current/core_extensions/inet)
    - [jemalloc](https://duckdb.org/docs/current/core_extensions/jemalloc)
    - [Lance](https://duckdb.org/docs/current/core_extensions/lance)
    - [MotherDuck](https://duckdb.org/docs/current/core_extensions/motherduck)
    - [MySQL](https://duckdb.org/docs/current/core_extensions/mysql)
    - ODBC

      - [Overview](https://duckdb.org/docs/current/core_extensions/odbc/overview)
      - [ODBC Functions](https://duckdb.org/docs/current/core_extensions/odbc/functions)

    - [Quack](https://duckdb.org/docs/current/core_extensions/quack)
    - PostgreSQL

      - [Overview](https://duckdb.org/docs/current/core_extensions/postgres/overview)
      - [Secrets](https://duckdb.org/docs/current/core_extensions/postgres/secrets)
      - [Connection Pool](https://duckdb.org/docs/current/core_extensions/postgres/connection_pool)
      - [Functions](https://duckdb.org/docs/current/core_extensions/postgres/functions)

    - Spatial

      - [Overview](https://duckdb.org/docs/current/core_extensions/spatial/overview)
      - [Function Reference](https://duckdb.org/docs/current/core_extensions/spatial/functions)
      - [R-Tree Indexes](https://duckdb.org/docs/current/core_extensions/spatial/r-tree_indexes)
      - [GDAL Integration](https://duckdb.org/docs/current/core_extensions/spatial/gdal)

    - [SQLite](https://duckdb.org/docs/current/core_extensions/sqlite)
    - [TPC-DS](https://duckdb.org/docs/current/core_extensions/tpcds)
    - [TPC-H](https://duckdb.org/docs/current/core_extensions/tpch)
    - [UI](https://duckdb.org/docs/current/core_extensions/ui)
    - [Unity Catalog](https://duckdb.org/docs/current/core_extensions/unity_catalog)
    - [Vortex](https://duckdb.org/docs/current/core_extensions/vortex)
    - [VSS](https://duckdb.org/docs/current/core_extensions/vss)

  - Quack Remote Protocol

    - [Overview](https://duckdb.org/docs/current/quack/overview)
    - [Reference](https://duckdb.org/docs/current/quack/reference)
    - [Security](https://duckdb.org/docs/current/quack/security)
    - Setup

      - [Overview](https://duckdb.org/docs/current/quack/setup/overview)
      - [Reverse Proxy](https://duckdb.org/docs/current/quack/setup/reverse_proxy)
      - [Deployment](https://duckdb.org/docs/current/quack/setup/deployment)
      - [Using from Wasm](https://duckdb.org/docs/current/quack/setup/quack_wasm)

    - [Troubleshooting](https://duckdb.org/docs/current/quack/troubleshooting)

  - Guides

    - [Overview](https://duckdb.org/docs/current/guides/overview)
    - Data Viewers

      - [Tableau](https://duckdb.org/docs/current/guides/data_viewers/tableau)
      - [CLI Charting with YouPlot](https://duckdb.org/docs/current/guides/data_viewers/youplot)

    - Database Integration

      - [Overview](https://duckdb.org/docs/current/guides/database_integration/overview)
      - [MySQL Import](https://duckdb.org/docs/current/guides/database_integration/mysql)
      - [PostgreSQL Import](https://duckdb.org/docs/current/guides/database_integration/postgres)
      - [SQLite Import](https://duckdb.org/docs/current/guides/database_integration/sqlite)
      - [Amazon RDS with IAM Authentication](https://duckdb.org/docs/current/guides/database_integration/rds_iam)

    - File Formats

      - [Overview](https://duckdb.org/docs/current/guides/file_formats/overview)
      - [CSV Import](https://duckdb.org/docs/current/guides/file_formats/csv_import)
      - [CSV Export](https://duckdb.org/docs/current/guides/file_formats/csv_export)
      - [Directly Reading Files](https://duckdb.org/docs/current/guides/file_formats/read_file)
      - [Directly Reading DuckDB Databases](https://duckdb.org/docs/current/guides/file_formats/read_duckdb)
      - [Excel Import](https://duckdb.org/docs/current/guides/file_formats/excel_import)
      - [Excel Export](https://duckdb.org/docs/current/guides/file_formats/excel_export)
      - [JSON Import](https://duckdb.org/docs/current/guides/file_formats/json_import)
      - [JSON Export](https://duckdb.org/docs/current/guides/file_formats/json_export)
      - [Parquet Import](https://duckdb.org/docs/current/guides/file_formats/parquet_import)
      - [Parquet Export](https://duckdb.org/docs/current/guides/file_formats/parquet_export)
      - [Querying Parquet Files](https://duckdb.org/docs/current/guides/file_formats/query_parquet)
      - [File Access with the file: Protocol](https://duckdb.org/docs/current/guides/file_formats/file_access)

    - Meta Queries

      - [Describe Table](https://duckdb.org/docs/current/guides/meta/describe)
      - [EXPLAIN: Inspect Query Plans](https://duckdb.org/docs/current/guides/meta/explain)
      - [EXPLAIN ANALYZE: Profile Queries](https://duckdb.org/docs/current/guides/meta/explain_analyze)
      - [List Tables](https://duckdb.org/docs/current/guides/meta/list_tables)
      - [Summarize](https://duckdb.org/docs/current/guides/meta/summarize)
      - [DuckDB Environment](https://duckdb.org/docs/current/guides/meta/duckdb_environment)

    - Network and Cloud Storage

      - [Overview](https://duckdb.org/docs/current/guides/network_cloud_storage/overview)
      - [HTTP Parquet Import](https://duckdb.org/docs/current/guides/network_cloud_storage/http_import)
      - [HTTP CSV Import](https://duckdb.org/docs/current/guides/network_cloud_storage/http_csv_import)
      - [S3 Parquet Import](https://duckdb.org/docs/current/guides/network_cloud_storage/s3_import)
      - [S3 Parquet Export](https://duckdb.org/docs/current/guides/network_cloud_storage/s3_export)
      - [S3 Iceberg Import](https://duckdb.org/docs/current/guides/network_cloud_storage/s3_iceberg_import)
      - [S3 Express One](https://duckdb.org/docs/current/guides/network_cloud_storage/s3_express_one)
      - [GCS Import](https://duckdb.org/docs/current/guides/network_cloud_storage/gcs_import)
      - [Cloudflare R2 Import](https://duckdb.org/docs/current/guides/network_cloud_storage/cloudflare_r2_import)
      - [DuckDB over HTTPS / S3](https://duckdb.org/docs/current/guides/network_cloud_storage/duckdb_over_https_or_s3)
      - [Fastly Object Storage Import](https://duckdb.org/docs/current/guides/network_cloud_storage/fastly_object_storage_import)
      - [SeaweedFS Import](https://duckdb.org/docs/current/guides/network_cloud_storage/seaweedfs_import)
      - [Tigris Import](https://duckdb.org/docs/current/guides/network_cloud_storage/tigris_import)

    - ODBC

      - [ODBC Guide](https://duckdb.org/docs/current/guides/odbc/general)

    - Performance

      - [Overview](https://duckdb.org/docs/current/guides/performance/overview)
      - [Environment](https://duckdb.org/docs/current/guides/performance/environment)
      - [Import](https://duckdb.org/docs/current/guides/performance/import)
      - [Schema](https://duckdb.org/docs/current/guides/performance/schema)
      - [Indexing](https://duckdb.org/docs/current/guides/performance/indexing)
      - [Join Operations](https://duckdb.org/docs/current/guides/performance/join_operations)
      - [File Formats](https://duckdb.org/docs/current/guides/performance/file_formats)
      - [How to Tune Workloads](https://duckdb.org/docs/current/guides/performance/how_to_tune_workloads)
      - [My Workload Is Slow](https://duckdb.org/docs/current/guides/performance/my_workload_is_slow)
      - [Out-of-Memory Issues](https://duckdb.org/docs/current/guides/performance/oom)
      - [Benchmarks](https://duckdb.org/docs/current/guides/performance/benchmarks)
      - [Working with Huge Databases](https://duckdb.org/docs/current/guides/performance/working_with_huge_databases)

    - Python

      - [Installation](https://duckdb.org/docs/current/guides/python/install)
      - [Executing SQL](https://duckdb.org/docs/current/guides/python/execute_sql)
      - [Jupyter Notebooks](https://duckdb.org/docs/current/guides/python/jupyter)
      - [marimo Notebooks](https://duckdb.org/docs/current/guides/python/marimo)
      - [SQL on Pandas](https://duckdb.org/docs/current/guides/python/sql_on_pandas)
      - [Import from Pandas](https://duckdb.org/docs/current/guides/python/import_pandas)
      - [Export to Pandas](https://duckdb.org/docs/current/guides/python/export_pandas)
      - [Import from Numpy](https://duckdb.org/docs/current/guides/python/import_numpy)
      - [Export to Numpy](https://duckdb.org/docs/current/guides/python/export_numpy)
      - [SQL on Arrow](https://duckdb.org/docs/current/guides/python/sql_on_arrow)
      - [Import from Arrow](https://duckdb.org/docs/current/guides/python/import_arrow)
      - [Export to Arrow](https://duckdb.org/docs/current/guides/python/export_arrow)
      - [Relational API on Pandas](https://duckdb.org/docs/current/guides/python/relational_api_pandas)
      - [Multiple Python Threads](https://duckdb.org/docs/current/guides/python/multiple_threads)
      - [Integration with Ibis](https://duckdb.org/docs/current/guides/python/ibis)
      - [Integration with Polars](https://duckdb.org/docs/current/guides/python/polars)
      - [Integration with PyTorch](https://duckdb.org/docs/current/guides/python/pytorch)
      - [Using fsspec Filesystems](https://duckdb.org/docs/current/guides/python/filesystems)

    - SQL Editors

      - [DBeaver SQL IDE](https://duckdb.org/docs/current/guides/sql_editors/dbeaver)

    - SQL Features

      - [AsOf Join](https://duckdb.org/docs/current/guides/sql_features/asof_join)
      - [Full-Text Search](https://duckdb.org/docs/current/guides/sql_features/full_text_search)
      - [Graph Queries](https://duckdb.org/docs/current/guides/sql_features/graph_queries)
      - [query and query\_table Functions](https://duckdb.org/docs/current/guides/sql_features/query_and_query_table_functions)
      - [Merge Statement for SCD Type 2](https://duckdb.org/docs/current/guides/sql_features/merge)
      - [Timestamp Issues](https://duckdb.org/docs/current/guides/sql_features/timestamps)

    - Snippets

      - [Creating Synthetic Data](https://duckdb.org/docs/current/guides/snippets/create_synthetic_data)
      - [Dutch Railway Datasets](https://duckdb.org/docs/current/guides/snippets/dutch_railway_datasets)
      - [Sharing Macros](https://duckdb.org/docs/current/guides/snippets/sharing_macros)
      - [Analyzing a Git Repository](https://duckdb.org/docs/current/guides/snippets/analyze_git_repository)
      - [Importing Duckbox Tables](https://duckdb.org/docs/current/guides/snippets/importing_duckbox_tables)
      - [Copying an In-Memory Database to a File](https://duckdb.org/docs/current/guides/snippets/copy_in-memory_database_to_file)
      - [Calculating a Database Checksum](https://duckdb.org/docs/current/guides/snippets/database_checksum)

    - Troubleshooting

      - [Command Line](https://duckdb.org/docs/current/guides/troubleshooting/command_line)
      - [Crashes](https://duckdb.org/docs/current/guides/troubleshooting/crashes)
      - [Out of Memory Errors](https://duckdb.org/docs/current/guides/troubleshooting/oom_errors)

    - [Glossary of Terms](https://duckdb.org/docs/current/guides/glossary)
    - [Browsing Offline](https://duckdb.org/docs/current/guides/offline-copy)

  - Operations Manual

    - [Overview](https://duckdb.org/docs/current/operations_manual/overview)
    - DuckDB's Footprint

      - [Files Created by DuckDB](https://duckdb.org/docs/current/operations_manual/footprint_of_duckdb/files_created_by_duckdb)
      - [Gitignore for DuckDB](https://duckdb.org/docs/current/operations_manual/footprint_of_duckdb/gitignore_for_duckdb)
      - [Reclaiming Space](https://duckdb.org/docs/current/operations_manual/footprint_of_duckdb/reclaiming_space)

    - Installing DuckDB

      - [Install Script](https://duckdb.org/docs/current/operations_manual/installing_duckdb/install_script)

    - Logging

      - [Overview](https://duckdb.org/docs/current/operations_manual/logging/overview)

    - [User Agents](https://duckdb.org/docs/current/operations_manual/user_agents)
    - Securing DuckDB

      - [Overview](https://duckdb.org/docs/current/operations_manual/securing_duckdb/overview)
      - [Embedding DuckDB](https://duckdb.org/docs/current/operations_manual/securing_duckdb/embedding_duckdb)
      - [Securing Extensions](https://duckdb.org/docs/current/operations_manual/securing_duckdb/securing_extensions)

    - [Non-Deterministic Behavior](https://duckdb.org/docs/current/operations_manual/non-deterministic_behavior)
    - [Limits](https://duckdb.org/docs/current/operations_manual/limits)
    - [DuckDB Docker Container](https://duckdb.org/docs/current/operations_manual/duckdb_docker)

  - Development

    - [DuckDB Repositories](https://duckdb.org/docs/current/dev/repositories)
    - [Release Cycle](https://duckdb.org/docs/current/dev/release_cycle)
    - [Metrics](https://duckdb.org/docs/current/dev/metrics)
    - [Profiling](https://duckdb.org/docs/current/dev/profiling)
    - Building DuckDB

      - [Overview](https://duckdb.org/docs/current/dev/building/overview)
      - [Build Configuration](https://duckdb.org/docs/current/dev/building/build_configuration)
      - [Building Extensions](https://duckdb.org/docs/current/dev/building/building_extensions)
      - [Android](https://duckdb.org/docs/current/dev/building/android)
      - [Linux](https://duckdb.org/docs/current/dev/building/linux)
      - [macOS](https://duckdb.org/docs/current/dev/building/macos)
      - [Raspberry Pi](https://duckdb.org/docs/current/dev/building/raspberry_pi)
      - [Windows](https://duckdb.org/docs/current/dev/building/windows)
      - [Python](https://duckdb.org/docs/current/dev/building/python)
      - [R](https://duckdb.org/docs/current/dev/building/r)
      - [Troubleshooting](https://duckdb.org/docs/current/dev/building/troubleshooting)
      - [Unofficial and Unsupported Platforms](https://duckdb.org/docs/current/dev/building/unofficial_and_unsupported_platforms)

    - [Benchmark Suite](https://duckdb.org/docs/current/dev/benchmark)
    - Testing
      - [Overview](https://duckdb.org/docs/current/dev/sqllogictest/overview)
      - [sqllogictest Introduction](https://duckdb.org/docs/current/dev/sqllogictest/intro)
      - [Writing Tests](https://duckdb.org/docs/current/dev/sqllogictest/writing_tests)
      - [Unit Tester Configuration](https://duckdb.org/docs/current/dev/sqllogictest/test_configuration)
      - [Debugging](https://duckdb.org/docs/current/dev/sqllogictest/debugging)
      - [Result Verification](https://duckdb.org/docs/current/dev/sqllogictest/result_verification)
      - [Persistent Testing](https://duckdb.org/docs/current/dev/sqllogictest/persistent_testing)
      - [Loops](https://duckdb.org/docs/current/dev/sqllogictest/loops)
      - [Multiple Connections](https://duckdb.org/docs/current/dev/sqllogictest/multiple_connections)
      - [Catch](https://duckdb.org/docs/current/dev/sqllogictest/catch)

  - Internals
    - [Overview](https://duckdb.org/docs/current/internals/overview)
    - [Storage Versions and Format](https://duckdb.org/docs/current/internals/storage)
    - [Execution Format](https://duckdb.org/docs/current/internals/vector)
    - [Jemalloc](https://duckdb.org/docs/current/internals/jemalloc)
    - [Pivot](https://duckdb.org/docs/current/internals/pivot)

- [Sitemap](https://duckdb.org/sitemap.html)
- [Live Demo](https://shell.duckdb.org/)

Copy Markdown

Reading and Writing Parquet Files

## [Examples](https://duckdb.org/docs/current/data/parquet/overview\#examples)

Read a single Parquet file:

```
SELECT * FROM 'test.parquet';
```

Figure out which columns/types are in a Parquet file:

```
DESCRIBE SELECT * FROM 'test.parquet';
```

Create a table from a Parquet file:

```
CREATE TABLE test AS
    SELECT * FROM 'test.parquet';
```

If the file does not end in `.parquet`, use the `read_parquet` function:

```
SELECT *
FROM read_parquet('test.parq');
```

Use list parameter to read three Parquet files and treat them as a single table:

```
SELECT *
FROM read_parquet(['file1.parquet', 'file2.parquet', 'file3.parquet']);
```

Read Parquet files from a local directory, including its subdirectories:

```
SELECT *
FROM read_parquet('test');
```

A directory path recursively reads files with the `.parquet` extension. To read only files directly inside the directory, use `test/*.parquet` instead. See [directory paths](https://duckdb.org/docs/current/data/multiple_files/overview.html#directory-paths) for details.

Read all files that match the glob pattern:

```
SELECT *
FROM 'test/*.parquet';
```

Read all files that match the glob pattern, and include the `filename` virtual column that specifies which file each row came from (this column is available by default without a configuration options since DuckDB v1.3.0):

```
SELECT *, filename
FROM read_parquet('test/*.parquet');
```

Use a list of globs to read all Parquet files from two specific folders:

```
SELECT *
FROM read_parquet(['folder1/*.parquet', 'folder2/*.parquet']);
```

Read over HTTPS:

```
SELECT *
FROM read_parquet('https://some.url/some_file.parquet');
```

Query the [metadata of a Parquet file](https://duckdb.org/docs/current/data/parquet/metadata.html#parquet-metadata):

```
SELECT *
FROM parquet_metadata('test.parquet');
```

Query the [file metadata of a Parquet file](https://duckdb.org/docs/current/data/parquet/metadata.html#parquet-file-metadata):

```
SELECT *
FROM parquet_file_metadata('test.parquet');
```

Query the [key-value metadata of a Parquet file](https://duckdb.org/docs/current/data/parquet/metadata.html#parquet-key-value-metadata):

```
SELECT *
FROM parquet_kv_metadata('test.parquet');
```

Query the [schema of a Parquet file](https://duckdb.org/docs/current/data/parquet/metadata.html#parquet-schema):

```
SELECT *
FROM parquet_schema('test.parquet');
```

Write the results of a query to a Parquet file using the default compression (Snappy):

```
COPY
    (SELECT * FROM tbl)
    TO 'result-snappy.parquet'
    (FORMAT parquet);
```

Write the results from a query to a Parquet file with specific compression and row group size:

```
COPY
    (FROM generate_series(100_000))
    TO 'test.parquet'
    (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 100_000);
```

Export the table contents of the entire database as parquet:

```
EXPORT DATABASE 'target_directory' (FORMAT parquet);
```

## [Parquet Files](https://duckdb.org/docs/current/data/parquet/overview\#parquet-files)

Parquet files are compressed columnar files that are efficient to load and process. DuckDB provides support for both reading and writing Parquet files in an efficient manner, as well as support for pushing filters and projections into the Parquet file scans.

> Note
>
> Parquet datasets differ based on the number of files, the size of individual files, the compression algorithm used, row group size, etc. These have a significant effect on performance. Please consult the [Performance Guide](https://duckdb.org/docs/current/guides/performance/file_formats.html) for details.

## [`read_parquet`Function](https://duckdb.org/docs/current/data/parquet/overview\#read_parquet-function)

| Function | Description | Example |
| --- | --- | --- |
| `read_parquet(path_or_list_of_paths)` | Read Parquet file(s) | `SELECT * FROM read_parquet('test.parquet');` |
| `parquet_scan(path_or_list_of_paths)` | Alias for `read_parquet` | `SELECT * FROM parquet_scan('test.parquet');` |

If your file ends in `.parquet`, the function syntax is optional. The system will automatically infer that you are reading a Parquet file:

```
SELECT * FROM 'test.parquet';
```

Multiple files can be read at once by providing a glob or a list of files. Refer to the [multiple files section](https://duckdb.org/docs/current/data/multiple_files/overview.html) for more information.

### [Parameters](https://duckdb.org/docs/current/data/parquet/overview\#parameters)

There are a number of options exposed that can be passed to the `read_parquet` function or the [`COPY` statement](https://duckdb.org/docs/current/sql/statements/copy.html).

| Name | Description | Type | Default |
| --- | --- | --- | --- |
| `binary_as_string` | Parquet files generated by legacy writers do not correctly set the `UTF8` flag for strings, causing string columns to be loaded as `BLOB` instead. Set this to true to load binary columns as strings. | `BOOL` | `false` |
| `can_have_nan` | Whether `FLOAT` and `DOUBLE` columns may contain `NaN` values. When set to true, the reader accounts for `NaN` when using a column's min/max statistics for filter pushdown, since `NaN` does not compare as ordered. | `BOOL` | `false` |
| `encryption_config` | Configuration for [Parquet encryption](https://duckdb.org/docs/current/data/parquet/encryption.html). | `STRUCT` | - |
| `filename` | Whether or not an extra `filename` column should be included in the result. Since DuckDB v1.3.0, the `filename` column is added automatically as a virtual column and this option is only kept for compatibility reasons. | `BOOL` | `false` |
| `file_row_number` | Whether or not to include the `file_row_number` column. | `BOOL` | `false` |
| `hive_partitioning` | Whether or not to interpret the path as a [Hive partitioned path](https://duckdb.org/docs/current/data/partitioning/hive_partitioning.html). | `BOOL` | (auto-detected) |
| `union_by_name` | Whether the columns of multiple schemas should be [unified by name](https://duckdb.org/docs/current/data/multiple_files/combining_schemas.html), rather than by position. | `BOOL` | `false` |
| `schema` | Allows you to read a Parquet file as if it has the supplied schema. Field IDs are required. | `MAP` | `NULL` |

## [Using the `schema`Parameter](https://duckdb.org/docs/current/data/parquet/overview\#using-the-schema-parameter)

The `schema` parameter allows you to read the Parquet file using a specific schema. This is useful for renaming, adding, deleting, reordering, or casting columns when reading Parquet files.

To use the `schema` parameter, field IDs are required. To make them available when creating the Parquet using DuckDB, use:

```
COPY (SELECT 42::INTEGER AS i) TO 'integers.parquet' (FIELD_IDS {i: 0});
```

Reading Parquet files:

```
SELECT *
FROM read_parquet('integers.parquet', schema = MAP {
                    0: {name: 'renamed_i', type: 'BIGINT', default_value: NULL},
                    1: {name: 'new_column', type: 'UTINYINT', default_value: 43}
                  });
```

```
┌───────────┬────────────┐
│ renamed_i │ new_column │
│   int64   │   uint8    │
├───────────┼────────────┤
│        42 │         43 │
└───────────┴────────────┘
```

> Note
>
> The `schema` parameter cannot be combined with `union_by_name = true`.

## [Partial Reading](https://duckdb.org/docs/current/data/parquet/overview\#partial-reading)

DuckDB supports projection pushdown into the Parquet file itself. That is to say, when querying a Parquet file, only the columns required for the query are read. This allows you to read only the part of the Parquet file that you are interested in. This will be done automatically by DuckDB.

DuckDB also supports filter pushdown into the Parquet reader. When you apply a filter to a column that is scanned from a Parquet file, the filter will be pushed down into the scan, and can even be used to skip parts of the file using the built-in zonemaps. Note that this will depend on whether or not your Parquet file contains zonemaps.

Filter and projection pushdown provide significant performance benefits. See [our blog post “Querying Parquet with Precision Using DuckDB”](https://duckdb.org/2021/06/25/querying-parquet.html) for more information.

## [Inserts and Views](https://duckdb.org/docs/current/data/parquet/overview\#inserts-and-views)

You can also insert the data into a table or create a table from the Parquet file directly. This will load the data from the Parquet file and insert it into the database:

Insert the data from the Parquet file in the table:

```
INSERT INTO people
    SELECT * FROM read_parquet('test.parquet');
```

Create a table directly from a Parquet file:

```
CREATE TABLE people AS
    SELECT * FROM read_parquet('test.parquet');
```

If you wish to keep the data stored inside the Parquet file, but want to query the Parquet file directly, you can create a view over the `read_parquet` function. You can then query the Parquet file as if it were a built-in table:

Create a view over the Parquet file:

```
CREATE VIEW people AS
    SELECT * FROM read_parquet('test.parquet');
```

Query the Parquet file:

```
SELECT * FROM people;
```

## [Writing to Parquet Files](https://duckdb.org/docs/current/data/parquet/overview\#writing-to-parquet-files)

DuckDB also has support for writing to Parquet files using the `COPY` statement syntax. See the [`COPY` Statement page](https://duckdb.org/docs/current/sql/statements/copy.html) for details, including all possible parameters for the `COPY` statement.

Write a query to a Snappy-compressed Parquet file:

```
COPY
    (SELECT * FROM tbl)
    TO 'result-snappy.parquet'
    (FORMAT parquet);
```

Write `tbl` to a zstd-compressed Parquet file:

```
COPY tbl
    TO 'result-zstd.parquet'
    (FORMAT parquet, COMPRESSION zstd);
```

Write `tbl` to a zstd-compressed Parquet file with the lowest compression level yielding the fastest compression:

```
COPY tbl
    TO 'result-zstd.parquet'
    (FORMAT parquet, COMPRESSION zstd, COMPRESSION_LEVEL 1);
```

Write to Parquet file with [key-value metadata](https://duckdb.org/docs/current/data/parquet/metadata.html#parquet-key-value-metadata):

```
COPY (
    SELECT
        42 AS number,
        true AS is_even
) TO 'kv_metadata.parquet' (
    FORMAT parquet,
    KV_METADATA {
        number: 'Answer to life, universe, and everything',
        is_even: 'not ''odd''' -- single quotes in values must be escaped
    }
);
```

Write to a Parquet v2 file:

```
COPY tbl
    TO 'result-v2.parquet'
    (FORMAT parquet, PARQUET_VERSION 'V2');
```

Write a CSV file to an uncompressed Parquet file:

```
COPY
    'test.csv'
    TO 'result-uncompressed.parquet'
    (FORMAT parquet, COMPRESSION uncompressed);
```

Write a query to a Parquet file with zstd-compression and row group size:

```
COPY
    (FROM generate_series(100_000))
    TO 'row-groups-zstd.parquet'
    (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 100_000);
```

Write data to an LZ4-compressed Parquet file:

```
COPY
    (FROM generate_series(100_000))
    TO 'result-lz4.parquet'
    (FORMAT parquet, COMPRESSION lz4);
```

Or, equivalently:

```
COPY
    (FROM generate_series(100_000))
    TO 'result-lz4.parquet'
    (FORMAT parquet, COMPRESSION lz4_raw);
```

Write data to a Brotli-compressed Parquet file:

```
COPY
    (FROM generate_series(100_000))
    TO 'result-brotli.parquet'
    (FORMAT parquet, COMPRESSION brotli);
```

To configure the page size of Parquet file's dictionary pages, use the `STRING_DICTIONARY_PAGE_SIZE_LIMIT` option (default: 1 MB):

```
COPY
    lineitem
    TO 'lineitem-with-custom-dictionary-size.parquet'
    (FORMAT parquet, STRING_DICTIONARY_PAGE_SIZE_LIMIT 100_000);
```

DuckDB's `EXPORT` command can be used to export an entire database to a series of Parquet files. See the [“`EXPORT` statement” page](https://duckdb.org/docs/current/sql/statements/export.html) for more details:

Export the table contents of the entire database as Parquet:

```
EXPORT DATABASE 'target_directory' (FORMAT parquet);
```

## [Encryption](https://duckdb.org/docs/current/data/parquet/overview\#encryption)

DuckDB supports reading and writing [encrypted Parquet files](https://duckdb.org/docs/current/data/parquet/encryption.html).

## [Supported Features](https://duckdb.org/docs/current/data/parquet/overview\#supported-features)

The list of supported Parquet features is available in the [Parquet documentation's “Implementation status” page](https://parquet.apache.org/docs/file-format/implementationstatus/) ⁠.

## [Installing and Loading the Parquet Extension](https://duckdb.org/docs/current/data/parquet/overview\#installing-and-loading-the-parquet-extension)

The support for Parquet files is enabled via extension. The `parquet` extension is bundled with almost all clients. However, if your client does not bundle the `parquet` extension, the extension must be installed separately:

```
INSTALL parquet;
```

## Pages in This Section

- [Metadata](https://duckdb.org/docs/current/data/parquet/metadata)
- [Encryption](https://duckdb.org/docs/current/data/parquet/encryption)
- [Tips](https://duckdb.org/docs/current/data/parquet/tips)

- [See this page as Markdown](https://raw.githubusercontent.com/duckdb/duckdb-web/refs/heads/main/docs/current/data/parquet/overview.md "See Markdown")
- [Edit this page on GitHub](https://github.com/duckdb/duckdb-web/edit/main/docs/current/data/parquet/overview.md "Go to GitHub")
- [Report content issue](https://github.com/duckdb/duckdb-web/issues/new?title=Issue%20found%20on%20page%20%27Reading%20and%20Writing%20Parquet%20Files%27&labels=issue%20found%20on%20page&body=%0A%3E%20Please%20describe%20the%20problem%20you%20encountered%20in%20the%20DuckDB%20documentation%20and%20include%20the%20%22Page%20URL%22%20link%20shown%20below.%0A%3E%20Note:%20only%20create%20an%20issue%20if%20you%20wish%20to%20report%20a%20problem%20with%20the%20DuckDB%20documentation.%20For%20questions%20about%20DuckDB%20or%20the%20use%20of%20certain%20DuckDB%20features,%20use%20[GitHub%20Discussions](https://github.com/duckdb/duckdb/discussions/),%20[Stack%20Overflow](https://stackoverflow.com/questions/tagged/duckdb),%20or%20[Discord](https://discord.duckdb.org/).%0A%0APage%20URL:%20%3Chttps://duckdb.org/docs/current/data/parquet/overview.html%3E%0A "Create GitHub issue")

© 2026 DuckDB Foundation, Amsterdam NL

[DuckDB Home](https://duckdb.org/) [Code of Conduct](https://duckdb.org/code_of_conduct.html) [Trademark Use](https://duckdb.org/trademark_guidelines.html) [Blog](https://duckdb.org/news/)