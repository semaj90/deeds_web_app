September 24, 2026: [PostgreSQL 19 Beta 4 Released!](https://www.postgresql.org/about/news/postgresql-19-beta-4-released-3386/)

[Documentation](https://www.postgresql.org/docs/ "Documentation") → [PostgreSQL 18](https://www.postgresql.org/docs/18/index.html)

Supported Versions:



[Current](https://www.postgresql.org/docs/current/index.html "PostgreSQL 18 - PostgreSQL 18.6 Documentation")
( [18](https://www.postgresql.org/docs/18/index.html "PostgreSQL 18 - PostgreSQL 18.6 Documentation"))


/

[17](https://www.postgresql.org/docs/17/index.html "PostgreSQL 17 - PostgreSQL 18.6 Documentation")


/

[16](https://www.postgresql.org/docs/16/index.html "PostgreSQL 16 - PostgreSQL 18.6 Documentation")


/

[15](https://www.postgresql.org/docs/15/index.html "PostgreSQL 15 - PostgreSQL 18.6 Documentation")


/

[14](https://www.postgresql.org/docs/14/index.html "PostgreSQL 14 - PostgreSQL 18.6 Documentation")

Development Versions:


[19](https://www.postgresql.org/docs/19/index.html "PostgreSQL 19 - PostgreSQL 18.6 Documentation")

/
[devel](https://www.postgresql.org/docs/devel/index.html "PostgreSQL devel - PostgreSQL 18.6 Documentation")

Unsupported versions:


[13](https://www.postgresql.org/docs/13/index.html "PostgreSQL 13 - PostgreSQL 18.6 Documentation")

/
[12](https://www.postgresql.org/docs/12/index.html "PostgreSQL 12 - PostgreSQL 18.6 Documentation")

/
[11](https://www.postgresql.org/docs/11/index.html "PostgreSQL 11 - PostgreSQL 18.6 Documentation")

/
[10](https://www.postgresql.org/docs/10/index.html "PostgreSQL 10 - PostgreSQL 18.6 Documentation")

/
[9.6](https://www.postgresql.org/docs/9.6/index.html "PostgreSQL 9.6 - PostgreSQL 18.6 Documentation")

/
[9.5](https://www.postgresql.org/docs/9.5/index.html "PostgreSQL 9.5 - PostgreSQL 18.6 Documentation")

/
[9.4](https://www.postgresql.org/docs/9.4/index.html "PostgreSQL 9.4 - PostgreSQL 18.6 Documentation")

/
[9.3](https://www.postgresql.org/docs/9.3/index.html "PostgreSQL 9.3 - PostgreSQL 18.6 Documentation")

/
[9.2](https://www.postgresql.org/docs/9.2/index.html "PostgreSQL 9.2 - PostgreSQL 18.6 Documentation")

/
[9.1](https://www.postgresql.org/docs/9.1/index.html "PostgreSQL 9.1 - PostgreSQL 18.6 Documentation")

/
[9.0](https://www.postgresql.org/docs/9.0/index.html "PostgreSQL 9.0 - PostgreSQL 18.6 Documentation")

/
[8.4](https://www.postgresql.org/docs/8.4/index.html "PostgreSQL 8.4 - PostgreSQL 18.6 Documentation")

/
[8.3](https://www.postgresql.org/docs/8.3/index.html "PostgreSQL 8.3 - PostgreSQL 18.6 Documentation")

/
[8.2](https://www.postgresql.org/docs/8.2/index.html "PostgreSQL 8.2 - PostgreSQL 18.6 Documentation")

/
[8.1](https://www.postgresql.org/docs/8.1/index.html "PostgreSQL 8.1 - PostgreSQL 18.6 Documentation")

/
[8.0](https://www.postgresql.org/docs/8.0/index.html "PostgreSQL 8.0 - PostgreSQL 18.6 Documentation")

/
[7.4](https://www.postgresql.org/docs/7.4/index.html "PostgreSQL 7.4 - PostgreSQL 18.6 Documentation")

/
[7.3](https://www.postgresql.org/docs/7.3/index.html "PostgreSQL 7.3 - PostgreSQL 18.6 Documentation")

/
[7.2](https://www.postgresql.org/docs/7.2/index.html "PostgreSQL 7.2 - PostgreSQL 18.6 Documentation")

| PostgreSQL 18.6 Documentation |
| :-: |
|  |  |  |  | [Next](https://www.postgresql.org/docs/18/preface.html "Preface") |

* * *

# PostgreSQL 18.6 Documentation

### The PostgreSQL Global Development Group

Copyright © 1996–2026 The PostgreSQL Global Development Group

[Legal Notice](https://www.postgresql.org/docs/18/legalnotice.html)

* * *

**Table of Contents**

[Preface](https://www.postgresql.org/docs/18/preface.html)[1\. What Is PostgreSQL?](https://www.postgresql.org/docs/18/intro-whatis.html)[2\. A Brief History of PostgreSQL](https://www.postgresql.org/docs/18/history.html)[3\. Conventions](https://www.postgresql.org/docs/18/notation.html)[4\. Further Information](https://www.postgresql.org/docs/18/resources.html)[5\. Bug Reporting Guidelines](https://www.postgresql.org/docs/18/bug-reporting.html)[I. Tutorial](https://www.postgresql.org/docs/18/tutorial.html)[1\. Getting Started](https://www.postgresql.org/docs/18/tutorial-start.html)[2\. The SQL Language](https://www.postgresql.org/docs/18/tutorial-sql.html)[3\. Advanced Features](https://www.postgresql.org/docs/18/tutorial-advanced.html)[II. The SQL Language](https://www.postgresql.org/docs/18/sql.html)[4\. SQL Syntax](https://www.postgresql.org/docs/18/sql-syntax.html)[5\. Data Definition](https://www.postgresql.org/docs/18/ddl.html)[6\. Data Manipulation](https://www.postgresql.org/docs/18/dml.html)[7\. Queries](https://www.postgresql.org/docs/18/queries.html)[8\. Data Types](https://www.postgresql.org/docs/18/datatype.html)[9\. Functions and Operators](https://www.postgresql.org/docs/18/functions.html)[10\. Type Conversion](https://www.postgresql.org/docs/18/typeconv.html)[11\. Indexes](https://www.postgresql.org/docs/18/indexes.html)[12\. Full Text Search](https://www.postgresql.org/docs/18/textsearch.html)[13\. Concurrency Control](https://www.postgresql.org/docs/18/mvcc.html)[14\. Performance Tips](https://www.postgresql.org/docs/18/performance-tips.html)[15\. Parallel Query](https://www.postgresql.org/docs/18/parallel-query.html)[III. Server Administration](https://www.postgresql.org/docs/18/admin.html)[16\. Installation from Binaries](https://www.postgresql.org/docs/18/install-binaries.html)[17\. Installation from Source Code](https://www.postgresql.org/docs/18/installation.html)[18\. Server Setup and Operation](https://www.postgresql.org/docs/18/runtime.html)[19\. Server Configuration](https://www.postgresql.org/docs/18/runtime-config.html)[20\. Client Authentication](https://www.postgresql.org/docs/18/client-authentication.html)[21\. Database Roles](https://www.postgresql.org/docs/18/user-manag.html)[22\. Managing Databases](https://www.postgresql.org/docs/18/managing-databases.html)[23\. Localization](https://www.postgresql.org/docs/18/charset.html)[24\. Routine Database Maintenance Tasks](https://www.postgresql.org/docs/18/maintenance.html)[25\. Backup and Restore](https://www.postgresql.org/docs/18/backup.html)[26\. High Availability, Load Balancing, and Replication](https://www.postgresql.org/docs/18/high-availability.html)[27\. Monitoring Database Activity](https://www.postgresql.org/docs/18/monitoring.html)[28\. Reliability and the Write-Ahead Log](https://www.postgresql.org/docs/18/wal.html)[29\. Logical Replication](https://www.postgresql.org/docs/18/logical-replication.html)[30\. Just-in-Time Compilation (JIT)](https://www.postgresql.org/docs/18/jit.html)[31\. Regression Tests](https://www.postgresql.org/docs/18/regress.html)[IV. Client Interfaces](https://www.postgresql.org/docs/18/client-interfaces.html)[32\. libpq — C Library](https://www.postgresql.org/docs/18/libpq.html)[33\. Large Objects](https://www.postgresql.org/docs/18/largeobjects.html)[34\. ECPG — Embedded SQL in C](https://www.postgresql.org/docs/18/ecpg.html)[35\. The Information Schema](https://www.postgresql.org/docs/18/information-schema.html)[V. Server Programming](https://www.postgresql.org/docs/18/server-programming.html)[36\. Extending SQL](https://www.postgresql.org/docs/18/extend.html)[37\. Triggers](https://www.postgresql.org/docs/18/triggers.html)[38\. Event Triggers](https://www.postgresql.org/docs/18/event-triggers.html)[39\. The Rule System](https://www.postgresql.org/docs/18/rules.html)[40\. Procedural Languages](https://www.postgresql.org/docs/18/xplang.html)[41\. PL/pgSQL — SQL Procedural Language](https://www.postgresql.org/docs/18/plpgsql.html)[42\. PL/Tcl — Tcl Procedural Language](https://www.postgresql.org/docs/18/pltcl.html)[43\. PL/Perl — Perl Procedural Language](https://www.postgresql.org/docs/18/plperl.html)[44\. PL/Python — Python Procedural Language](https://www.postgresql.org/docs/18/plpython.html)[45\. Server Programming Interface](https://www.postgresql.org/docs/18/spi.html)[46\. Background Worker Processes](https://www.postgresql.org/docs/18/bgworker.html)[47\. Logical Decoding](https://www.postgresql.org/docs/18/logicaldecoding.html)[48\. Replication Progress Tracking](https://www.postgresql.org/docs/18/replication-origins.html)[49\. Archive Modules](https://www.postgresql.org/docs/18/archive-modules.html)[50\. OAuth Validator Modules](https://www.postgresql.org/docs/18/oauth-validators.html)[VI. Reference](https://www.postgresql.org/docs/18/reference.html)[I. SQL Commands](https://www.postgresql.org/docs/18/sql-commands.html)[II. PostgreSQL Client Applications](https://www.postgresql.org/docs/18/reference-client.html)[III. PostgreSQL Server Applications](https://www.postgresql.org/docs/18/reference-server.html)[VII. Internals](https://www.postgresql.org/docs/18/internals.html)[51\. Overview of PostgreSQL Internals](https://www.postgresql.org/docs/18/overview.html)[52\. System Catalogs](https://www.postgresql.org/docs/18/catalogs.html)[53\. System Views](https://www.postgresql.org/docs/18/views.html)[54\. Frontend/Backend Protocol](https://www.postgresql.org/docs/18/protocol.html)[55\. PostgreSQL Coding Conventions](https://www.postgresql.org/docs/18/source.html)[56\. Native Language Support](https://www.postgresql.org/docs/18/nls.html)[57\. Writing a Procedural Language Handler](https://www.postgresql.org/docs/18/plhandler.html)[58\. Writing a Foreign Data Wrapper](https://www.postgresql.org/docs/18/fdwhandler.html)[59\. Writing a Table Sampling Method](https://www.postgresql.org/docs/18/tablesample-method.html)[60\. Writing a Custom Scan Provider](https://www.postgresql.org/docs/18/custom-scan.html)[61\. Genetic Query Optimizer](https://www.postgresql.org/docs/18/geqo.html)[62\. Table Access Method Interface Definition](https://www.postgresql.org/docs/18/tableam.html)[63\. Index Access Method Interface Definition](https://www.postgresql.org/docs/18/indexam.html)[64\. Write Ahead Logging for Extensions](https://www.postgresql.org/docs/18/wal-for-extensions.html)[65\. Built-in Index Access Methods](https://www.postgresql.org/docs/18/indextypes.html)[66\. Database Physical Storage](https://www.postgresql.org/docs/18/storage.html)[67\. Transaction Processing](https://www.postgresql.org/docs/18/transactions.html)[68\. System Catalog Declarations and Initial Contents](https://www.postgresql.org/docs/18/bki.html)[69\. How the Planner Uses Statistics](https://www.postgresql.org/docs/18/planner-stats-details.html)[70\. Backup Manifest Format](https://www.postgresql.org/docs/18/backup-manifest-format.html)[VIII. Appendixes](https://www.postgresql.org/docs/18/appendixes.html)[A. PostgreSQL Error Codes](https://www.postgresql.org/docs/18/errcodes-appendix.html)[B. Date/Time Support](https://www.postgresql.org/docs/18/datetime-appendix.html)[C. SQL Key Words](https://www.postgresql.org/docs/18/sql-keywords-appendix.html)[D. SQL Conformance](https://www.postgresql.org/docs/18/features.html)[E. Release Notes](https://www.postgresql.org/docs/18/release.html)[F. Additional Supplied Modules and Extensions](https://www.postgresql.org/docs/18/contrib.html)[G. Additional Supplied Programs](https://www.postgresql.org/docs/18/contrib-prog.html)[H. External Projects](https://www.postgresql.org/docs/18/external-projects.html)[I. The Source Code Repository](https://www.postgresql.org/docs/18/sourcerepo.html)[J. Documentation](https://www.postgresql.org/docs/18/docguide.html)[K. PostgreSQL Limits](https://www.postgresql.org/docs/18/limits.html)[L. Acronyms](https://www.postgresql.org/docs/18/acronyms.html)[M. Glossary](https://www.postgresql.org/docs/18/glossary.html)[N. Color Support](https://www.postgresql.org/docs/18/color.html)[O. Obsolete or Renamed Features](https://www.postgresql.org/docs/18/appendix-obsolete.html)[Bibliography](https://www.postgresql.org/docs/18/biblio.html)[Index](https://www.postgresql.org/docs/18/bookindex.html)

* * *

|     |     |     |
| --- | --- | --- |
|  |  | [Next](https://www.postgresql.org/docs/18/preface.html "Preface") |
|  |  | Preface |

## Submit correction

If you see anything in the documentation that is not correct, does not match
your experience with the particular feature or requires further clarification,
please use
[this form](https://www.postgresql.org/account/comments/new/18/index.html/)
to report a documentation issue.