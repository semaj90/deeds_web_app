#!/usr/bin/env python3
import argparse
import pyarrow as pa
import pyarrow.csv as csv
import pyarrow.ipc as ipc

ap=argparse.ArgumentParser()
ap.add_argument("edges_csv")
ap.add_argument("out_arrow")
a=ap.parse_args()

table=csv.read_csv(a.edges_csv)
required={"src","dst"}
if not required.issubset(set(table.column_names)):
    raise SystemExit(f"missing required columns {required}")
with pa.OSFile(a.out_arrow,"wb") as sink:
    with ipc.new_file(sink,table.schema) as writer:
        writer.write_table(table)
print({"rows":table.num_rows,"columns":table.column_names,"out":a.out_arrow})
