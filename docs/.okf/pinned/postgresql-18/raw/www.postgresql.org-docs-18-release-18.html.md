Home
About
Download
Documentation
Community
Developers
Support
Donate
Your account
August 13, 2026:
PostgreSQL 18.6, 17.11, 16.15, 15.19, 14.24 and 19 Beta 3 Released!
Documentation
→
PostgreSQL 18
Supported Versions:
Current
(
18
)
E.6. Release 18
Prev | Up | Appendix E. Release Notes | Home | Next
## E.6. Release 18 #
E.6.1. Overview
E.6.2. Migration to Version 18
E.6.3. Changes
E.6.4. Acknowledgments
Release date:
2025-09-25
### E.6.1. Overview #
PostgreSQL
18 contains many new features and enhancements, including:
An asynchronous I/O (AIO) subsystem that can improve performance of sequential scans, bitmap heap scans, vacuums, and other operations.
pg_upgrade
now retains optimizer statistics.
Support for "skip scan" lookups that allow using
multicolumn B-tree indexes
in more cases.
`uuidv7()`
function for generating timestamp-ordered
UUIDs
.
Virtual
generated columns
that compute their values during read operations. This is now the default for generated columns.
OAuth authentication
support.
`OLD`
and
`NEW`
support for
`RETURNING`
clauses in
INSERT
,
UPDATE
,
DELETE
, and
MERGE
commands.
Temporal constraints, or constraints over ranges, for
PRIMARY KEY
,
UNIQUE
, and
FOREIGN KEY
constraints.
The above items and other new features of
PostgreSQL
18 are explained in more detail in the sections below.
### E.6.2. Migration to Version 18 #
A dump/restore using
pg_dumpall
or use of
pg_upgrade
or logical replication is required for those wishing to migrate data from any previous release. See
Section 18.6
for general information on migrating to new major releases.
Version 18 contains a number of changes that may affect compatibility with previous releases. Observe the following incompatibilities:
Change
initdb
default to enable data checksums (Greg Sabino Mullane)
§
Checksums can be disabled with the new
initdb
option
`--no-data-checksums`
.
pg_upgrade
requires matching cluster checksum settings, so this new option can be useful to upgrade non-checksum old clusters.
Change time zone abbreviation handling (Tom Lane)
§
The system will now favor the current session's time zone abbreviations before checking the server variable
timezone_abbreviations
. Previously
`timezone_abbreviations`
was checked first.
Deprecate
MD5 password
authentication (Nathan Bossart)
§
Support for MD5 passwords will be removed in a future major version release.
CREATE ROLE
and
ALTER ROLE
now emit deprecation warnings when setting MD5 passwords. These warnings can be disabled by setting the
md5_password_warnings
parameter to
`off`
.
Change
VACUUM
and
ANALYZE
to process the inheritance children of a parent (Michael Harris)
§
The previous behavior can be performed by using the new
`ONLY`
option.
Prevent
`COPY FROM`
from treating
`\.`
as an end-of-file marker when reading
CSV
files (Daniel Vérité, Tom Lane)
§
§
psql
will still treat
`\.`
as an end-of-file marker when reading
CSV
files from
`STDIN`
. Older
psql
clients connecting to
PostgreSQL
18 servers might experience
`\copy`
problems. This release also enforces that
`\.`
must appear alone on a line.
Disallow unlogged partitioned tables (Michael Paquier)
§
Previously
`ALTER TABLE SET [UN]LOGGED`
did nothing, and the creation of an unlogged partitioned table did not cause its children to be unlogged.
Execute
`AFTER`
triggers
as the role that was active when trigger events were queued (Laurenz Albe)
§
Previously such triggers were run as the role that was active at trigger execution time (e.g., at
COMMIT
). This is significant for cases where the role is changed between queue time and transaction commit.
Remove non-functional support for rule privileges in
GRANT
/
REVOKE
(Fujii Masao)
§
These have been non-functional since
PostgreSQL
8.2.
Remove column
`pg_backend_memory_contexts`
.
`parent`
(Melih Mutlu)
§
This is no longer needed since
`pg_backend_memory_contexts`
.
`path`
was added.
Change
`pg_backend_memory_contexts`
.
`level`
and
`pg_log_backend_memory_contexts()`
to be one-based (Melih Mutlu, Atsushi Torikoshi, David Rowley, Fujii Masao)
§
§
§
These were previously zero-based.
Change
full text search
to use the default collation provider of the cluster to read configuration files and dictionaries, rather than always using libc (Peter Eisentraut)
§
Clusters that default to non-libc collation providers (e.g., ICU, builtin) that behave differently than libc for characters processed by LC_CTYPE could observe changes in behavior of some full-text search functions, as well as the
pg_trgm
extension. When upgrading such clusters using
pg_upgrade
, it is recommended to reindex all indexes related to full-text search and
pg_trgm
after the upgrade.
### E.6.3. Changes #
Below you will find a detailed account of the changes between
PostgreSQL
18 and the previous major release.
#### E.6.3.1. Server #
##### E.6.3.1.1. Optimizer #
Automatically remove some unnecessary table self-joins (Andrey Lepikhov, Alexander Kuzmenkov, Alexander Korotkov, Alena Rybakina)
§
This optimization can be disabled using server variable
enable_self_join_elimination
.
Convert some
`IN (VALUES ...)`
to
`x = ANY ...`
for better optimizer statistics (Alena Rybakina, Andrei Lepikhov)
§
Allow transforming
`OR`
-clauses to arrays for faster index processing (Alexander Korotkov, Andrey Lepikhov)
§
Speed up the processing of
`INTERSECT`
,
`EXCEPT`
,
window aggregates
, and
view column aliases
(Tom Lane, David Rowley)
§
§
§
§
Allow the keys of
`SELECT DISTINCT`
to be internally reordered to avoid sorting (Richard Guo)
§
This optimization can be disabled using
enable_distinct_reordering
.
Ignore
`GROUP BY`
columns that are functionally dependent on other columns (Zhang Mingli, Jian He, David Rowley)
§
If a
`GROUP BY`
clause includes all columns of a unique index, as well as other columns of the same table, those other columns are redundant and can be dropped from the grouping. This was already true for non-deferred primary keys.
Allow some
`HAVING`
clauses on
`GROUPING SETS`
to be pushed to
`WHERE`
clauses (Richard Guo)
§
§
§
§
This allows earlier row filtering. This release also fixes some
`GROUPING SETS`
queries that used to return incorrect results.
Improve row estimates for
`generate_series()`
using
`numeric`
and
`timestamp`
values (David Rowley, Song Jinzhou)
§
§
Allow the optimizer to use
`Right Semi Join`
plans (Richard Guo)
§
Semi-joins are used when needing to find if there is at least one match.
Allow merge joins to use
incremental sorts
(Richard Guo)
§
Improve the efficiency of planning queries accessing many partitions (Ashutosh Bapat, Yuya Watari, David Rowley)
§
§
Allow
partitionwise joins
in more cases, and reduce its memory usage (Richard Guo, Tom Lane, Ashutosh Bapat)
§
§
Improve cost estimates of partition queries (Nikita Malakhov, Andrei Lepikhov)
§
Improve
SQL
-language function
plan caching (Alexander Pyhalov, Tom Lane)
§
§
Improve handling of disabled optimizer features (Robert Haas)
§
##### E.6.3.1.2. Indexes #
Allow skip scans of
btree
indexes (Peter Geoghegan)
§
§
This allows multi-column btree indexes to be used in more cases such as when there are no restrictions on the first or early indexed columns (or there are non-equality ones), and there are useful restrictions on later indexed columns.
Allow non-btree unique indexes to be used as partition keys and in materialized views (Mark Dilger)
§
§
The index type must still support equality.
Allow
`GIN`
indexes to be created in parallel (Tomas Vondra, Matthias van de Meent)
§
Allow values to be sorted to speed range-type
GiST
and
btree
index builds (Bernd Helmle)
§
##### E.6.3.1.3. General Performance #
Add an asynchronous I/O subsystem (Andres Freund, Thomas Munro, Nazir Bilal Yavuz, Melanie Plageman)
§
§
§
§
§
§
§
§
§
§
§
This feature allows backends to queue multiple read requests, which allows for more efficient sequential scans, bitmap heap scans, vacuums, etc. This is enabled by server variable
io_method
, with server variables
io_combine_limit
and
io_max_combine_limit
added to control it. This also enables
effective_io_concurrency
and
maintenance_io_concurrency
values greater than zero for systems without
`fadvise()`
support. The new system view
`pg_aios`
shows the file handles being used for asynchronous I/O.
Improve the locking performance of queries that access many relations (Tomas Vondra)
§
Improve the performance and reduce memory usage of hash joins and
`GROUP BY`
(David Rowley, Jeff Davis)
§
§
§
§
§
This also improves hash set operations used by
`EXCEPT`
, and hash lookups of subplan values.
Allow normal vacuums to freeze some pages, even though they are all-visible (Melanie Plageman)
§
§
This reduces the overhead of later full-relation freezing. The aggressiveness of this can be controlled by server variable and per-table setting
vacuum_max_eager_freeze_failure_rate
. Previously vacuum never processed all-visible pages until freezing was required.
Add server variable
vacuum_truncate
to control file truncation during
VACUUM
(Nathan Bossart, Gurjeet Singh)
§
A storage-level parameter with the same name and behavior already existed.
Increase server variables
effective_io_concurrency
's and
maintenance_io_concurrency
's default values to 16 (Melanie Plageman)
§
§
This more accurately reflects modern hardware.
##### E.6.3.1.4. Monitoring #
Increase the logging granularity of server variable
log_connections
(Melanie Plageman)
§
This server variable was previously only boolean, which is still supported.
Add
`log_connections`
option to report the duration of connection stages (Melanie Plageman)
§
Add
log_line_prefix
escape
`%L`
to output the client
IP
address (Greg Sabino Mullane)
§
Add server variable
log_lock_failures
to log lock acquisition failures (Yuki Seino, Fujii Masao)
§
§
Specifically it reports
`SELECT ... NOWAIT`
lock failures.
Modify
`pg_stat_all_tables`
and its variants to report the time spent in
VACUUM
,
ANALYZE
, and their
automatic
variants (Sami Imseih)
§
The new columns are
`total_vacuum_time`
,
`total_autovacuum_time`
,
`total_analyze_time`
, and
`total_autoanalyze_time`
.
Add delay time reporting to
VACUUM
and
ANALYZE
(Bertrand Drouvot, Nathan Bossart)
§
§
This information appears in the server log, the system views
`pg_stat_progress_vacuum`
and
`pg_stat_progress_analyze`
, and the output of
VACUUM
and
ANALYZE
when in
`VERBOSE`
mode; tracking must be enabled with the server variable
track_cost_delay_timing
.
Add
WAL
,
CPU
, and average read statistics output to
`ANALYZE VERBOSE`
(Anthonin Bonnefoy)
§
§
Add full
WAL
buffer count to
`VACUUM`
/
`ANALYZE (VERBOSE)`
and autovacuum log output (Bertrand Drouvot)
§
Add per-backend I/O statistics reporting (Bertrand Drouvot)
§
§
The statistics are accessed via
`pg_stat_get_backend_io()`
. Per-backend I/O statistics can be cleared via
`pg_stat_reset_backend_stats()`
.
Add
`pg_stat_io`
columns to report I/O activity in bytes (Nazir Bilal Yavuz)
§
The new columns are
`read_bytes`
,
`write_bytes`
, and
`extend_bytes`
. The
`op_bytes`
column, which always equaled
`BLCKSZ`
, has been removed.
Add
WAL
I/O activity rows to
`pg_stat_io`
(Nazir Bilal Yavuz, Bertrand Drouvot, Michael Paquier)
§
§
§
This includes
WAL
receiver activity and a wait event for such writes.
Change server variable
track_wal_io_timing
to control tracking
WAL
timing in
`pg_stat_io`
instead of
`pg_stat_wal`
(Bertrand Drouvot)
§
Remove read/sync columns from
`pg_stat_wal`
(Bertrand Drouvot)
§
§
This removes columns
`wal_write`
,
`wal_sync`
,
`wal_write_time`
, and
`wal_sync_time`
.
Add function
`pg_stat_get_backend_wal()`
to return per-backend
WAL
statistics (Bertrand Drouvot)
§
Per-backend
WAL
statistics can be cleared via
`pg_stat_reset_backend_stats()`
.
Add function
`pg_ls_summariesdir()`
to specifically list the contents of
`PGDATA`
/
`pg_wal/summaries`
(Yushi Ogiwara)
§
Add column
`pg_stat_checkpointer`
.
`num_done`
to report the number of completed checkpoints (Anton A. Melnikov)
§
Columns
`num_timed`
and
`num_requested`
count both completed and skipped checkpoints.
Add column
`pg_stat_checkpointer`
.
`slru_written`
to report
SLRU
buffers written (Nitin Jadhav)
§
Also, modify the checkpoint server log message to report separate shared buffer and
SLRU
buffer values.
Add columns to
`pg_stat_database`
to report parallel worker activity (Benoit Lobréau)
§
The new columns are
`parallel_workers_to_launch`
and
`parallel_workers_launched`
.
Have
query id
computation of constant lists consider only the first and last constants (Dmitry Dolgov, Sami Imseih)
§
§
§
Jumbling is used by
pg_stat_statements
.
Adjust query id computations to group together queries using the same relation name (Michael Paquier, Sami Imseih)
§
This is true even if the tables in different schemas have different column names.
Add column
`pg_backend_memory_contexts`
.
`type`
to report the type of memory context (David Rowley)
§
Add column
`pg_backend_memory_contexts`
.
`path`
to show memory context parents (Melih Mutlu)
§
##### E.6.3.1.5. Privileges #
Add function
`pg_get_acl()`
to retrieve database access control details (Joel Jacobson)
§
§
Add function
`has_largeobject_privilege()`
to check large object privileges (Yugo Nagata)
§
Allow
ALTER DEFAULT PRIVILEGES
to define large object default privileges (Takatsuka Haruka, Yugo Nagata, Laurenz Albe)
§
Add predefined role
`pg_signal_autovacuum_worker`
(Kirill Reshke)
§
This allows sending signals to autovacuum workers.
##### E.6.3.1.6. Server Configuration #
Add support for the
OAuth authentication method
(Jacob Champion, Daniel Gustafsson, Thomas Munro)
§
This adds an
`oauth`
authentication method to
`pg_hba.conf`
, libpq OAuth options, a server variable
oauth_validator_libraries
to load token validation libraries, and a configure flag
`--with-libcurl`
to add the required compile-time libraries.
Add server variable
ssl_tls13_ciphers
to allow specification of multiple colon-separated TLSv1.3 cipher suites (Erica Zhang, Daniel Gustafsson)
§
Change server variable
ssl_groups
's default to include elliptic curve X25519 (Daniel Gustafsson, Jacob Champion)
§
Rename server variable
`ssl_ecdh_curve`
to
ssl_groups
and allow multiple colon-separated
ECDH
curves to be specified (Erica Zhang, Daniel Gustafsson)
§
The previous name still works.
Make
cancel request keys
256 bits (Heikki Linnakangas, Jelte Fennema-Nio)
§
§
This is only possible when the server and client support wire protocol version 3.2, introduced in this release.
Add server variable
autovacuum_worker_slots
to specify the maximum number of background workers (Nathan Bossart)
§
With this variable set,
autovacuum_max_workers
can be adjusted at runtime up to this maximum without a server restart.
Allow specification of the fixed number of dead tuples that will trigger an
autovacuum
(Nathan Bossart, Frédéric Yhuel)
§
The server variable is
autovacuum_vacuum_max_threshold
. Percentages are still used for triggering.
Change server variable
max_files_per_process
to limit only files opened by a backend (Andres Freund)
§
Previously files opened by the postmaster were also counted toward this limit.
Add server variable
num_os_semaphores
to report the required number of semaphores (Nathan Bossart)
§
This is useful for operating system configuration.
Add server variable
extension_control_path
to specify the location of extension control files (Peter Eisentraut, Matheus Alcantara)
§
§
##### E.6.3.1.7. Streaming Replication and Recovery #
Allow inactive replication slots to be automatically invalidated using server variable
idle_replication_slot_timeout
(Nisha Moond, Bharath Rupireddy)
§
Add server variable
max_active_replication_origins
to control the maximum active replication origins (Euler Taveira)
§
This was previously controlled by
max_replication_slots
, but this new setting allows a higher origin count in cases where fewer slots are required.
##### E.6.3.1.8. Logical Replication #
Allow the values of
generated columns
to be logically replicated (Shubham Khanna, Vignesh C, Zhijie Hou, Shlok Kyal, Peter Smith)
§
§
§
§
If the publication specifies a column list, all specified columns, generated and non-generated, are published. Without a specified column list, publication option
`publish_generated_columns`
controls whether generated columns are published. Previously generated columns were not replicated and the subscriber had to compute the values if possible; this is particularly useful for non-
PostgreSQL
subscribers which lack such a capability.
Change the default
CREATE SUBSCRIPTION
streaming option from
`off`
to
`parallel`
(Vignesh C)
§
Allow
ALTER SUBSCRIPTION
to change the replication slot's two-phase commit behavior (Hayato Kuroda, Ajin Cherian, Amit Kapila, Zhijie Hou)
§
§
Log
conflicts
while applying logical replication changes (Zhijie Hou, Nisha Moond)
§
§
§
§
§
Also report in new columns of
`pg_stat_subscription_stats`
.
#### E.6.3.2. Utility Commands #
Allow
generated columns
to be virtual, and make them the default (Peter Eisentraut, Jian He, Richard Guo, Dean Rasheed)
§
§
§
Virtual generated columns generate their values when the columns are read, not written. The write behavior can still be specified via the
`STORED`
option.
Add
`OLD`
/
`NEW`
support to
`RETURNING`
in
DML
queries (Dean Rasheed)
§
Previously
`RETURNING`
only returned new values for
INSERT
and
UPDATE
, and old values for
DELETE
;
MERGE
would return the appropriate value for the internal query executed. This new syntax allows the
`RETURNING`
list of
`INSERT`
/
`UPDATE`
/
`DELETE`
/
`MERGE`
to explicitly return old and new values by using the special aliases
`old`
and
`new`
. These aliases can be renamed to avoid identifier conflicts.
Allow foreign tables to be created like existing local tables (Zhang Mingli)
§
The syntax is
`CREATE FOREIGN TABLE ... LIKE`
.
Allow
`LIKE`
with
nondeterministic collations
(Peter Eisentraut)
§
Allow text position search functions with nondeterministic collations (Peter Eisentraut)
§
These used to generate an error.
Add builtin collation provider
`PG_UNICODE_FAST`
(Jeff Davis)
§
This locale supports case mapping, but sorts in code point order, not natural language order.
Allow
VACUUM
and
ANALYZE
to process partitioned tables without processing their children (Michael Harris)
§
This is enabled with the new
`ONLY`
option. This is useful since autovacuum does not process partitioned tables, just its children.
Add functions to modify per-relation and per-column optimizer statistics (Corey Huinker)
§
§
§
The functions are
`pg_restore_relation_stats()`
,
`pg_restore_attribute_stats()`
,
`pg_clear_relation_stats()`
, and
`pg_clear_attribute_stats()`
.
Add server variable
file_copy_method
to control the file copying method (Nazir Bilal Yavuz)
§
This controls whether
`CREATE DATABASE ... STRATEGY=FILE_COPY`
and
`ALTER DATABASE ... SET TABLESPACE`
uses file copy or clone.
##### E.6.3.2.1. Constraints #
Allow the specification of non-overlapping
`PRIMARY KEY`
,
`UNIQUE`
, and
foreign key
constraints (Paul A. Jungwirth)
§
§
This is specified by
`WITHOUT OVERLAPS`
for
`PRIMARY KEY`
and
`UNIQUE`
, and by
`PERIOD`
for foreign keys, all applied to the last specified column.
Allow
`CHECK`
and
foreign key
constraints to be specified as
`NOT ENFORCED`
(Amul Sul)
§
§
This also adds column
`pg_constraint`
.
`conenforced`
.
Require
primary/foreign key
relationships to use either deterministic collations or the the same nondeterministic collations (Peter Eisentraut)
§
The restore of a
pg_dump
, also used by
pg_upgrade
, will fail if these requirements are not met; schema changes must be made for these upgrade methods to succeed.
Store column
`NOT NULL`
specifications in
`pg_constraint`
(Álvaro Herrera, Bernd Helmle)
§
§
This allows names to be specified for
`NOT NULL`
constraint. This also adds
`NOT NULL`
constraints to foreign tables and
`NOT NULL`
inheritance control to local tables.
Allow
ALTER TABLE
to set the
`NOT VALID`
attribute of
`NOT NULL`
constraints (Rushabh Lathia, Jian He)
§
Allow modification of the inheritability of
`NOT NULL`
constraints (Suraj Kharage, Álvaro Herrera)
§
§
The syntax is
`ALTER TABLE ... ALTER CONSTRAINT ... [NO] INHERIT`
.
Allow
`NOT VALID`
foreign key constraints on partitioned tables (Amul Sul)
§
Allow
dropping
of constraints
`ONLY`
on partitioned tables (Álvaro Herrera)
§
This was previously erroneously prohibited.
##### E.6.3.2.2. COPY #
Add
`REJECT_LIMIT`
to control the number of invalid rows
`COPY FROM`
can ignore (Atsushi Torikoshi)
§
This is available when
`ON_ERROR = 'ignore'`
.
Allow
`COPY TO`
to copy rows from populated materialized views (Jian He)
§
Add
`COPY`
`LOG_VERBOSITY`
level
`silent`
to suppress log output of ignored rows (Atsushi Torikoshi)
§
This new level suppresses output for discarded input rows when
`on_error = 'ignore'`
.
Disallow
`COPY FREEZE`
on foreign tables (Nathan Bossart)
§
Previously, the
`COPY`
worked but the
`FREEZE`
was ignored, so disallow this command.
##### E.6.3.2.3. EXPLAIN #
Automatically include
`BUFFERS`
output in
`EXPLAIN ANALYZE`
(Guillaume Lelarge, David Rowley)
§
Add full
WAL
buffer count to
`EXPLAIN (WAL)`
output (Bertrand Drouvot)
§
In
`EXPLAIN ANALYZE`
, report the number of index lookups used per index scan node (Peter Geoghegan)
§
Modify
`EXPLAIN`
to output fractional row counts (Ibrar Ahmed, Ilia Evdokimov, Robert Haas)
§
§
Add memory and disk usage details to
`Material`
,
`Window Aggregate`
, and common table expression nodes to
`EXPLAIN`
output (David Rowley, Tatsuo Ishii)
§
§
§
§
Add details about window function arguments to
`EXPLAIN`
output (Tom Lane)
§
Add
`Parallel Bitmap Heap Scan`
worker cache statistics to
`EXPLAIN ANALYZE`
(David Geier, Heikki Linnakangas, Donghang Lin, Alena Rybakina, David Rowley)
§
Indicate disabled nodes in
`EXPLAIN ANALYZE`
output (Robert Haas, David Rowley, Laurenz Albe)
§
§
§
#### E.6.3.3. Data Types #
Improve
Unicode
full case mapping and conversion (Jeff Davis)
§
§
This adds the ability to do conditional and title case mapping, and case map single characters to multiple characters.
Allow
`jsonb`
`null`
values to be cast to scalar types as
`NULL`
(Tom Lane)
§
Previously such casts generated an error.
Add optional parameter to
`json{b}_strip_nulls`
to allow removal of null array elements (Florents Tselai)
§
Add function
`array_sort()`
which sorts an array's first dimension (Junwang Zhao, Jian He)
§
Add function
`array_reverse()`
which reverses an array's first dimension (Aleksander Alekseev)
§
Add function
`reverse()`
to reverse bytea bytes (Aleksander Alekseev)
§
Allow casting between integer types and
`bytea`
(Aleksander Alekseev)
§
The integer values are stored as
`bytea`
two's complement values.
Update Unicode data to
Unicode
16.0.0 (Peter Eisentraut)
§
Add full text search
stemming
for Estonian (Tom Lane)
§
Improve the
`XML`
error codes to more closely match the
SQL
standard (Tom Lane)
§
These errors are reported via
`SQLSTATE`
.
#### E.6.3.4. Functions #
Add function
`casefold()`
to allow for more sophisticated case-insensitive matching (Jeff Davis)
§
This allows more accurate comparisons, i.e., a character can have multiple upper or lower case equivalents, or upper or lower case conversion changes the number of characters.
Allow
`MIN()`
/
`MAX()`
aggregates on arrays and composite types (Aleksander Alekseev, Marat Buharov)
§
§
Add a
`WEEK`
option to
`EXTRACT()`
(Tom Lane)
§
Improve the output
`EXTRACT(QUARTER ...)`
for negative values (Tom Lane)
§
Add roman numeral support to
`to_number()`
(Hunaid Sohail)
§
This is accessed via the
`RN`
pattern.
Add
`UUID`
version 7 generation function
`uuidv7()`
(Andrey Borodin)
§
This
`UUID`
value is temporally sortable. Function alias
`uuidv4()`
has been added to explicitly generate version 4 UUIDs.
Add functions
`crc32()`
and
`crc32c()`
to compute
CRC
values (Aleksander Alekseev)
§
Add math functions
`gamma()`
and
`lgamma()`
(Dean Rasheed)
§
Allow
`=>`
syntax for named cursor arguments in
PL/pgSQL
(Pavel Stehule)
§
We previously only accepted
`:=`
.
Allow
`regexp_match[es]()`
/
`regexp_like()`
/
`regexp_replace()`
/
`regexp_count()`
/
`regexp_instr()`
/
`regexp_substr()`
/
`regexp_split_to_table()`
/
`regexp_split_to_array()`
to use named arguments (Jian He)
§
#### E.6.3.5. Libpq #
Add function
`PQfullProtocolVersion()`
to report the full, including minor, protocol version number (Jacob Champion, Jelte Fennema-Nio)
§
Add libpq connection
parameters
and
environment variables
to specify the minimum and maximum acceptable protocol version for connections (Jelte Fennema-Nio)
§
§
Report
search_path
changes to the client (Alexander Kukushkin, Jelte Fennema-Nio, Tomas Vondra)
§
§
Add
`PQtrace()`
output for all message types, including authentication (Jelte Fennema-Nio)
§
§
§
§
§
Add libpq connection parameter
`sslkeylogfile`
which dumps out
SSL
key material (Abhishek Chanda, Daniel Gustafsson)
§
This is useful for debugging.
Modify some libpq function signatures to use
`int64_t`
(Thomas Munro)
§
These previously used
`pg_int64`
, which is now deprecated.
#### E.6.3.6. psql #
Allow
psql
to parse, bind, and close named prepared statements (Anthonin Bonnefoy, Michael Paquier)
§
§
This is accomplished with new commands
`\parse`
,
`\bind_named`
, and
`\close_prepared`
.
Add
psql
backslash commands to allowing issuance of pipeline queries (Anthonin Bonnefoy)
§
§
§
The new commands are
`\startpipeline`
,
`\syncpipeline`
,
`\sendpipeline`
,
`\endpipeline`
,
`\flushrequest`
,
`\flush`
, and
`\getresults`
.
Allow adding pipeline status to the
psql
prompt and add related state variables (Anthonin Bonnefoy)
§
The new prompt character is
`%P`
and the new
psql
variables are
`PIPELINE_SYNC_COUNT`
,
`PIPELINE_COMMAND_COUNT`
, and
`PIPELINE_RESULT_COUNT`
.
Allow adding the connection service name to the
psql
prompt or access it via
psql
variable (Michael Banck)
§
Add
psql
option to use expanded mode on all list commands (Dean Rasheed)
§
Adding backslash suffix
`x`
enables this.
Change
psql
's
`\conninfo`
to use tabular format and include more information (Álvaro Herrera, Maiquel Grassi, Hunaid Sohail)
§
Add function's leakproof indicator to
psql
's
`\df+`
,
`\do+`
,
`\dAo+`
, and
`\dC+`
outputs (Yugo Nagata)
§
Add access method details for partitioned relations in
`\dP+`
(Justin Pryzby)
§
Add
`default_version`
to the
psql
`\dx`
extension output (Magnus Hagander)
§
Add
psql
variable
`WATCH_INTERVAL`
to set the default
`\watch`
wait time (Daniel Gustafsson)
§
#### E.6.3.7. Server Applications #
Change
initdb
to default to enabling checksums (Greg Sabino Mullane)
§
§
The new
initdb
option
`--no-data-checksums`
disables checksums.
Add
initdb
option
`--no-sync-data-files`
to avoid syncing heap/index files (Nathan Bossart)
§
initdb
option
`--no-sync`
is still available to avoid syncing any files.
Add
vacuumdb
option
`--missing-stats-only`
to compute only missing optimizer statistics (Corey Huinker, Nathan Bossart)
§
§
This option can only be run by superusers and can only be used with options
`--analyze-only`
and
`--analyze-in-stages`
.
Add
pg_combinebackup
option
`-k`
/
`--link`
to enable hard linking (Israel Barth Rubio, Robert Haas)
§
Only some files can be hard linked. This should not be used if the backups will be used independently.
Allow
pg_verifybackup
to verify tar-format backups (Amul Sul)
§
If
pg_rewind
's
`--source-server`
specifies a database name, use it in
`--write-recovery-conf`
output (Masahiko Sawada)
§
Add
pg_resetwal
option
`--char-signedness`
to change the default
`char`
signedness (Masahiko Sawada)
§
##### E.6.3.7.1. pg_dump / pg_dumpall / pg_restore #
Add
pg_dump
option
`--statistics`
(Jeff Davis)
§
§
Add
pg_dump
and
pg_dumpall
option
`--sequence-data`
to dump sequence data that would normally be excluded (Nathan Bossart)
§
§
Add
pg_dump
,
pg_dumpall
, and
pg_restore
options
`--statistics-only`
,
`--no-statistics`
,
`--no-data`
, and
`--no-schema`
(Corey Huinker, Jeff Davis)
§
Add option
`--no-policies`
to disable row level security policy processing in
pg_dump
,
pg_dumpall
,
pg_restore
(Nikolay Samokhvalov)
§
This is useful for migrating to systems with different policies.
##### E.6.3.7.2. pg_upgrade #
Allow
pg_upgrade
to preserve optimizer statistics (Corey Huinker, Jeff Davis, Nathan Bossart)
§
§
§
§
Extended statistics are not preserved. Also add
pg_upgrade
option
`--no-statistics`
to disable statistics preservation.
Allow
pg_upgrade
to process database checks in parallel (Nathan Bossart)
§
§
§
§
§
§
§
§
§
§
§
This is controlled by the existing
`--jobs`
option.
Add
pg_upgrade
option
`--swap`
to swap directories rather than copy, clone, or link files (Nathan Bossart)
§
This mode is potentially the fastest.
Add
pg_upgrade
option
`--set-char-signedness`
to set the default
`char`
signedness of new cluster (Masahiko Sawada)
§
§
This is to handle cases where a pre-
PostgreSQL
18 cluster's default
CPU
signedness does not match the new cluster.
##### E.6.3.7.3. Logical Replication Applications #
Add
pg_createsubscriber
option
`--all`
to create logical replicas for all databases (Shubham Khanna)
§
Add
pg_createsubscriber
option
`--clean`
to remove publications (Shubham Khanna)
§
§
Add
pg_createsubscriber
option
`--enable-two-phase`
to enable prepared transactions (Shubham Khanna)
§
Add
pg_recvlogical
option
`--enable-failover`
to specify failover slots (Hayato Kuroda)
§
Also add option
`--enable-two-phase`
as a synonym for
`--two-phase`
, and deprecate the latter.
Allow
pg_recvlogical
`--drop-slot`
to work without
`--dbname`
(Hayato Kuroda)
§
#### E.6.3.8. Source Code #
Separate the loading and running of
injection points
(Michael Paquier, Heikki Linnakangas)
§
§
Injection points can now be created, but not run, via
`INJECTION_POINT_LOAD()`
, and such injection points can be run via
`INJECTION_POINT_CACHED()`
.
Support runtime arguments in injection points (Michael Paquier)
§
Allow inline injection point test code with
`IS_INJECTION_POINT_ATTACHED()`
(Heikki Linnakangas)
§
Improve the performance of processing long
`JSON`
strings using
SIMD
(Single Instruction Multiple Data) (David Rowley)
§
Speed up CRC32C calculations using x86
AVX
-512 instructions (Raghuveer Devulapalli, Paul Amonson)
§
Add
ARM
Neon and
SVE CPU
intrinsics for popcount (integer bit counting) (Chiranmoy Bhattacharya, Devanga Susmitha, Rama Malladi)
§
§
Improve the speed of numeric multiplication and division (Joel Jacobson, Dean Rasheed)
§
§
§
§
Add configure option
`--with-libnuma`
to enable
NUMA
awareness (Jakub Wartak, Bertrand Drouvot)
§
§
§
The function
`pg_numa_available()`
reports on
NUMA
awareness, and system views
`pg_shmem_allocations_numa`
and
`pg_buffercache_numa`
which report on shared memory distribution across
NUMA
nodes.
Add
TOAST
table to
`pg_index`
to allow for very large expression indexes (Nathan Bossart)
§
Remove column
`pg_attribute`
.
`attcacheoff`
(David Rowley)
§
Add column
`pg_class`
.
`relallfrozen`
(Melanie Plageman)
§
Add
`amgettreeheight`
,
`amconsistentequality`
, and
`amconsistentordering`
to the index access method
API
(Mark Dilger)
§
§
Add GiST support function
`stratnum()`
(Paul A. Jungwirth)
§
Record the default
CPU
signedness of
`char`
in
pg_controldata
(Masahiko Sawada)
§
Add support for Python "Limited
API
" in
PL/Python
(Peter Eisentraut)
§
§
This helps prevent problems caused by
Python
3.x version mismatches.
Change the minimum supported
Python
version to 3.6.8 (Jacob Champion)
§
Remove support for
OpenSSL
versions older than 1.1.1 (Daniel Gustafsson)
§
§
If
LLVM
is enabled, require version 14 or later (Thomas Munro)
§
Add macro
`PG_MODULE_MAGIC_EXT`
to allow extensions to report their name and version (Andrei Lepikhov)
§
This information can be access via the new function
`pg_get_loaded_modules()`
.
Document that
`SPI_connect()`
/
`SPI_connect_ext()`
always returns success (
`SPI_OK_CONNECT`
) (Stepan Neretin)
§
Errors are always reported via
`ereport()`
.
Add
documentation section
about
API
and
ABI
compatibility (David Wheeler, Peter Eisentraut)
§
Remove the experimental designation of
Meson
builds on
Windows
(Aleksander Alekseev)
§
Remove configure options
`--disable-spinlocks`
and
`--disable-atomics`
(Thomas Munro)
§
§
Thirty-two-bit atomic operations are now required.
Remove support for the
HPPA
/
PA-RISC
architecture (Tom Lane)
§
#### E.6.3.9. Additional Modules #
Add extension
pg_logicalinspect
to inspect logical snapshots (Bertrand Drouvot)
§
Add extension
pg_overexplain
which adds debug details to
`EXPLAIN`
output (Robert Haas)
§
Add output columns to
`postgres_fdw_get_connections()`
(Hayato Kuroda, Sagar Dilip Shedge)
§
§
§
§
New output column
`used_in_xact`
indicates if the foreign data wrapper is being used by a current transaction,
`closed`
indicates if it is closed,
`user_name`
indicates the user name, and
`remote_backend_pid`
indicates the remote backend process identifier.
Allow
SCRAM
authentication from the client to be passed to
postgres_fdw
servers (Matheus Alcantara, Peter Eisentraut)
§
This avoids storing
postgres_fdw
authentication information in the database, and is enabled with the
postgres_fdw
`use_scram_passthrough`
connection option. libpq uses new connection parameters
scram_client_key
and
scram_server_key
.
Allow
SCRAM
authentication from the client to be passed to
dblink
servers (Matheus Alcantara)
§
Add
`on_error`
and
`log_verbosity`
options to
file_fdw
(Atsushi Torikoshi)
§
These control how
file_fdw
handles and reports invalid file rows.
Add
`reject_limit`
to control the number of invalid rows
file_fdw
can ignore (Atsushi Torikoshi)
§
This is active when
`ON_ERROR = 'ignore'`
.
Add configurable variable
`min_password_length`
to
passwordcheck
(Emanuele Musella, Maurizio Boriani)
§
This controls the minimum password length.
Have
pgbench
report the number of failed, retried, or skipped transactions in per-script reports (Yugo Nagata)
§
Add
isn
server variable
`weak`
to control invalid check digit acceptance (Viktor Holmberg)
§
This was previously only controlled by function
`isn_weak()`
.
Allow values to be sorted to speed
btree_gist
index builds (Bernd Helmle, Andrey Borodin)
§
Add
amcheck
check function
`gin_index_check()`
to verify
`GIN`
indexes (Grigory Kryachko, Heikki Linnakangas, Andrey Borodin)
§
Add functions
`pg_buffercache_evict_relation()`
and
`pg_buffercache_evict_all()`
to evict unpinned shared buffers (Nazir Bilal Yavuz)
§
The existing function
`pg_buffercache_evict()`
now returns the buffer flush status.
Allow extensions to install custom
EXPLAIN
options (Robert Haas, Sami Imseih)
§
§
§
Allow extensions to use the server's cumulative statistics
API
(Michael Paquier)
§
§
##### E.6.3.9.1. pg_stat_statements #
Allow the queries of
CREATE TABLE AS
and
DECLARE
to be tracked by
pg_stat_statements
(Anthonin Bonnefoy)
§
They are also now assigned query ids.
Allow the parameterization of
SET
values in
pg_stat_statements
(Greg Sabino Mullane, Michael Paquier)
§
This reduces the bloat caused by
`SET`
statements with differing constants.
Add
`pg_stat_statements`
columns to report parallel activity (Guillaume Lelarge)
§
The new columns are
`parallel_workers_to_launch`
and
`parallel_workers_launched`
.
Add
`pg_stat_statements`
.
`wal_buffers_full`
to report full
WAL
buffers (Bertrand Drouvot)
§
##### E.6.3.9.2. pgcrypto #
Add
pgcrypto
algorithms
`sha256crypt`
and
`sha512crypt`
(Bernd Helmle)
§
Add
CFB
mode to
pgcrypto
encryption and decryption (Umar Hayat)
§
Add function
`fips_mode()`
to report the server's
FIPS
mode (Daniel Gustafsson)
§
Add
pgcrypto
server variable
`builtin_crypto_enabled`
to allow disabling builtin non-
FIPS
mode cryptographic functions (Daniel Gustafsson, Joe Conway)
§
This is useful for guaranteeing
FIPS
mode behavior.
### E.6.4. Acknowledgments #
The following individuals (in alphabetical order) have contributed to this release as patch authors, committers, reviewers, testers, or reporters of issues.
Abhishek Chanda
Adam Guo
Adam Rauch
Aidar Imamov
Ajin Cherian
Alastair Turner
Alec Cozens
Aleksander Alekseev
Alena Rybakina
Alex Friedman
Alex Richman
Alexander Alehin
Alexander Borisov
Alexander Korotkov
Alexander Kozhemyakin
Alexander Kukushkin
Alexander Kuzmenkov
Alexander Kuznetsov
Alexander Lakhin
Alexander Pyhalov
Alexandra Wang
Alexey Dvoichenkov
Alexey Makhmutov
Alexey Shishkin
Ali Akbar
Álvaro Herrera
Álvaro Mongil
Amit Kapila
Amit Langote
Amul Sul
Andreas Karlsson
Andreas Scherbaum
Andreas Ulbrich
Andrei Lepikhov
Andres Freund
Andrew
Andrew Bille
Andrew Dunstan
Andrew Jackson
Andrew Kane
Andrew Watkins
Andrey Borodin
Andrey Chudnovsky
Andrey Rachitskiy
Andrey Rudometov
Andy Alsup
Andy Fan
Anthonin Bonnefoy
Anthony Hsu
Anthony Leung
Anton Melnikov
Anton Voloshin
Antonin Houska
Antti Lampinen
Arseniy Mukhin
Artur Zakirov
Arun Thirupathi
Ashutosh Bapat
Asphator
Atsushi Torikoshi
Avi Weinberg
Aya Iwata
Ayush Tiwari
Ayush Vatsa
Bastien Roucariès
Ben Peachey Higdon
Benoit Lobréau
Bernd Helmle
Bernd Reiß
Bernhard Wiedemann
Bertrand Drouvot
Bertrand Mamasam
Bharath Rupireddy
Bogdan Grigorenko
Boyu Yang
Braulio Fdo Gonzalez
Bruce Momjian
Bykov Ivan
Cameron Vogt
Cary Huang
Cédric Villemain
Cees van Zeeland
ChangAo Chen
Chao Li
Chapman Flack
Charles Samborski
Chengwen Wu
Chengxi Sun
Chiranmoy Bhattacharya
Chris Gooch
Christian Charukiewicz
Christoph Berg
Christophe Courtois
Christopher Inokuchi
Clemens Ruck
Corey Huinker
Craig Milhiser
Crisp Lee
Dagfinn Ilmari Mannsåker
Daniel Elishakov
Daniel Gustafsson
Daniel Vérité
Daniel Westermann
Daniele Varrazzo
Daniil Davydov
Daria Shanina
Dave Cramer
Dave Page
David Benjamin
David Christensen
David Fiedler
David G. Johnston
David Geier
David Rowley
David Steele
David Wheeler
David Zhang
Davinder Singh
Dean Rasheed
Devanga Susmitha
Devrim Gündüz
Dian Fay
Dilip Kumar
Dimitrios Apostolou
Dipesh Dhameliya
Dmitrii Bondar
Dmitry Dolgov
Dmitry Koval
Dmitry Kovalenko
Dmitry Yurichev
Dominique Devienne
Donghang Lin
Dorjpalam Batbaatar
Drew Callahan
Duncan Sands
Dwayne Towell
Dzmitry Jachnik
Egor Chindyaskin
Egor Rogov
Emanuel Ionescu
Emanuele Musella
Emre Hasegeli
Eric Cyr
Erica Zhang
Erik Nordström
Erik Rijkers
Erik Wienhold
Erki Eessaar
Ethan Mertz
Etienne LAFARGE
Etsuro Fujita
Euler Taveira
Evan Si
Evgeniy Gorbanev
Fabio R. Sluzala
Fabrízio de Royes Mello
Feike Steenbergen
Feliphe Pozzer
Felix
Fire Emerald
Florents Tselai
Francesco Degrassi
Frank Streitzig
Frédéric Yhuel
Fredrik Widlert
Gabriele Bartolini
Gavin Panella
Geoff Winkless
George MacKerron
Gilles Darold
Grant Gryczan
Greg Burd
Greg Sabino Mullane
Greg Stark
Grigory Kryachko
Guillaume Lelarge
Gunnar Morling
Gunnar Wagner
Gurjeet Singh
Haifang Wang
Hajime Matsunaga
Hamid Akhtar
Hannu Krosing
Hari Krishna Sunder
Haruka Takatsuka
Hayato Kuroda
Heikki Linnakangas
Hironobu Suzuki
Holger Jakobs
Hubert Lubaczewski
Hugo Dubois
Hugo Zhang
Hunaid Sohail
Hywel Carver
Ian Barwick
Ibrar Ahmed
Igor Gnatyuk
Igor Korot
Ilia Evdokimov
Ilya Gladyshev
Ilyasov Ian
Imran Zaheer
Isaac Morland
Israel Barth Rubio
Ivan Kush
Jacob Brazeal
Jacob Champion
Jaime Casanova
Jakob Egger
Jakub Wartak
James Coleman
James Hunter
Jan Behrens
Japin Li
Jason Smith
Jayesh Dehankar
Jeevan Chalke
Jeff Davis
Jehan-Guillaume de Rorthais
Jelte Fennema-Nio
Jian He
Jianghua Yang
Jiao Shuntian
Jim Jones
Jim Nasby
Jingtang Zhang
Jingzhou Fu
Joe Conway
Joel Jacobson
John Hutchins
John Naylor
Jonathan Katz
Jorge Solórzano
José Villanova
Josef Šimánek
Joseph Koshakow
Julien Rouhaud
Junwang Zhao
Justin Pryzby
Kaido Vaikla
Kaimeh
Karina Litskevich
Karthik S
Kartyshov Ivan
Kashif Zeeshan
Keisuke Kuroda
Kevin Hale Boyes
Kevin K Biju
Kirill Reshke
Kirill Zdornyy
Koen De Groote
Koichi Suzuki
Koki Nakamura
Konstantin Knizhnik
Kouhei Sutou
Kuntal Ghosh
Kyotaro Horiguchi
Lakshmi Narayana Velayudam
Lars Kanis
Laurence Parry
Laurenz Albe
Lele Gaifax
Li Yong
Lilian Ontowhee
Lingbin Meng
Luboslav Špilák
Luca Vallisa
Lukas Fittl
Maciek Sakrejda
Magnus Hagander
Mahendra Singh Thalor
Mahendrakar Srinivasarao
Maiquel Grassi
Maksim Korotkov
Maksim Melnikov
Man Zeng
Marat Buharov
Marc Balmer
Marco Nenciarini
Marcos Pegoraro
Marina Polyakova
Mark Callaghan
Mark Dilger
Marlene Brandstaetter
Marlene Reiterer
Martin Rakhmanov
Masahiko Sawada
Masahiro Ikeda
Masao Fujii
Mason Mackaman
Mat Arye
Matheus Alcantara
Mats Kindahl
Matthew Gabeler-Lee
Matthew Kim
Matthew Sterrett
Matthew Woodcraft
Matthias van de Meent
Matthieu Denais
Maurizio Boriani
Max Johnson
Max Madden
Maxim Boguk
Maxim Orlov
Maximilian Chrzan
Melanie Plageman
Melih Mutlu
Mert Alev
Michael Banck
Michael Bondarenko
Michael Christofides
Michael Guissine
Michael Harris
Michaël Paquier
Michail Nikolaev
Michal Kleczek
Michel Pelletier
Mikaël Gourlaouen
Mikhail Gribkov
Mikhail Kot
Milosz Chmura
Muralikrishna Bandaru
Murat Efendioglu
Mutaamba Maasha
Naeem Akhter
Nat Makarevitch
Nathan Bossart
Navneet Kumar
Nazir Bilal Yavuz
Neil Conway
Niccolò Fei
Nick Davies
Nicolas Maus
Niek Brasa
Nikhil Raj
Nikita
Nikita Kalinin
Nikita Malakhov
Nikolay Samokhvalov
Nikolay Shaplov
Nisha Moond
Nitin Jadhav
Nitin Motiani
Noah Misch
Noboru Saito
Noriyoshi Shinoda
Ole Peder Brandtzæg
Oleg Sibiryakov
Oleg Tselebrovskiy
Olleg Samoylov
Onder Kalaci
Ondrej Navratil
Patrick Stählin
Paul Amonson
Paul Jungwirth
Paul Ramsey
Pavel Borisov
Pavel Luzanov
Pavel Nekrasov
Pavel Stehule
Peter Eisentraut
Peter Geoghegan
Peter Mittere
Peter Smith
Phil Eaton
Philipp Salvisberg
Philippe Beaudoin
Pierre Giraud
Pixian Shi
Polina Bungina
Przemyslaw Sztoch
Quynh Tran
Rafia Sabih
Raghuveer Devulapalli
Rahila Syed
Rama Malladi
Ran Benita
Ranier Vilela
Renan Alves Fonseca
Richard Guo
Richard Neill
Rintaro Ikeda
Robert Haas
Robert Treat
Robins Tharakan
Roman Zharkov
Ronald Cruz
Ronan Dunklau
Rui Zhao
Rushabh Lathia
Rustam Allakov
Ryo Kanbayashi
Ryohei Takahashi
RyotaK
Sagar Dilip Shedge
Salvatore Dipietro
Sam Gabrielsson
Sam James
Sameer Kumar
Sami Imseih
Samuel Thibault
Satyanarayana Narlapuram
Sebastian Skalacki
Senglee Choi
Sergei Kornilov
Sergey Belyashov
Sergey Dudoladov
Sergey Prokhorenko
Sergey Sargsyan
Sergey Soloviev
Sergey Tatarintsev
Shaik Mohammad Mujeeb
Shawn McCoy
Shenhao Wang
Shihao Zhong
Shinya Kato
Shlok Kyal
Shubham Khanna
Shveta Malik
Simon Riggs
Smolkin Grigory
Sofia Kopikova
Song Hongyu
Song Jinzhou
Soumyadeep Chakraborty
Sravan Kumar
Srinath Reddy
Stan Hu
Stepan Neretin
Stephen Fewer
Stephen Frost
Steve Chavez
Steven Niu
Suraj Kharage
Sven Klemm
Takamichi Osumi
Takeshi Ideriha
Tatsuo Ishii
Ted Yu
Tels
Tender Wang
Teodor Sigaev
Thom Brown
Thomas Baehler
Thomas Krennwallner
Thomas Munro
Tim Wood
Timur Magomedov
Tobias Wendorff
Todd Cook
Tofig Aliev
Tom Lane
Tomas Vondra
Tomasz Rybak
Tomasz Szypowski
Torsten Foertsch
Toshi Harada
Tristan Partin
Triveni N
Umar Hayat
Vallimaharajan G
Vasya Boytsov
Victor Yegorov
Vignesh C
Viktor Holmberg
Vinícius Abrahão
Vinod Sridharan
Virender Singla
Vitaly Davydov
Vladlen Popolitov
Vladyslav Nebozhyn
Walid Ibrahim
Webbo Han
Wenhui Qiu
Will Mortensen
Will Storey
Wolfgang Walther
Xin Zhang
Xing Guo
Xuneng Zhou
Yan Chengpen
Yang Lei
Yaroslav Saburov
Yaroslav Syrytsia
Yasir Hussain
Yasuo Honda
Yogesh Sharma
Yonghao Lee
Yoran Heling
Yu Liang
Yugo Nagata
Yuhang Qiu
Yuki Seino
Yura Sokolov
Yurii Rashkovskii
Yushi Ogiwara
Yusuke Sugie
Yuta Katsuragi
Yuto Sasaki
Yuuki Fujii
Yuya Watari
Zane Duffield
Zeyuan Hu
Zhang Mingli
Zhihong Yu
Zhijie Hou
Zsolt Parragi
Prev | Up | Next
E.5. Release 18.1 | Home | E.7. Prior Releases
## Submit correction
If you see anything in the documentation that is not correct, does not match
 your experience with the particular feature or requires further clarification,
 please use
this form
to report a documentation issue.
Policies
|
Code of Conduct
|
About PostgreSQL
|
Contact
Copyright © 1996-2026 The PostgreSQL Global Development Group