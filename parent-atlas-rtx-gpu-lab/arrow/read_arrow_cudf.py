#!/usr/bin/env python3
import argparse
import pyarrow.ipc as ipc
import cudf

ap=argparse.ArgumentParser()
ap.add_argument("arrow_file")
a=ap.parse_args()

with open(a.arrow_file,"rb") as f:
    table=ipc.open_file(f).read_all()
gdf=cudf.DataFrame.from_arrow(table)
print({
  "rows":len(gdf),
  "columns":list(gdf.columns),
  "gpuMemoryBytes":int(gdf.memory_usage(deep=True).sum())
})
