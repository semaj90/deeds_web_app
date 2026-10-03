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
Development Versions:
19
/
devel
53.2. pg_aios
Prev | Up | Chapter 53. System Views | Home | Next
## 53.2. pg_aios #
The
`pg_aios`
view lists all
Asynchronous
I/O
handles that are currently in-use. An I/O handle is used to reference an I/O operation that is being prepared, executed or is in the process of completing.
`pg_aios`
contains one row for each I/O handle.
This view is mainly useful for developers of
PostgreSQL
, but may also be useful when tuning
PostgreSQL
.
Table 53.2.
`pg_aios`
Columns
Column Type Description
pid int4 Process ID of the server process that is issuing this I/O.
io_id int4 Identifier of the I/O handle. Handles are reused once the I/O completed (or if the handle is released before I/O is started). On reuse pg_aios . io_generation is incremented.
io_generation int8 Generation of the I/O handle.
state text State of the I/O handle: HANDED_OUT , referenced by code but not yet used DEFINED , information necessary for execution is known STAGED , ready for execution SUBMITTED , submitted for execution COMPLETED_IO , finished, but result has not yet been processed COMPLETED_SHARED , shared completion processing completed COMPLETED_LOCAL , backend local completion processing completed
operation text Operation performed using the I/O handle: invalid , not yet known readv , a vectored read writev , a vectored write
off int8 Offset of the I/O operation.
length int8 Length of the I/O operation.
target text What kind of object is the I/O targeting: smgr , I/O on relations
handle_data_len int2 Length of the data associated with the I/O operation. For I/O to/from shared_buffers and temp_buffers , this indicates the number of buffers the I/O is operating on.
raw_result int4 Low-level result of the I/O operation, or NULL if the operation has not yet completed.
result text High-level result of the I/O operation: UNKNOWN means that the result of the operation is not yet known. OK means the I/O completed successfully. PARTIAL means that the I/O completed without error, but did not process all data. Commonly callers will need to retry and perform the remainder of the work in a separate I/O. WARNING means that the I/O completed without error, but that execution of the IO triggered a warning. E.g. when encountering a corrupted buffer with zero_damaged_pages enabled. ERROR means the I/O failed with an error.
target_desc text Description of what the I/O operation is targeting.
f_sync bool Flag indicating whether the I/O is executed synchronously.
f_localmem bool Flag indicating whether the I/O references process local memory.
f_buffered bool Flag indicating whether the I/O is buffered I/O.
The
`pg_aios`
view is read-only.
By default, the
`pg_aios`
view can be read only by superusers or roles with privileges of the
`pg_read_all_stats`
role.
Prev | Up | Next
53.1. Overview | Home | 53.3. pg_available_extensions
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