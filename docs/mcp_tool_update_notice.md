
# MCP Tool Update Notice
The tool `minio-fetch` is deprecated and has been replaced by `seaweedfs` to align with the current infrastructure gateway.
All references in the codebase, documentation, and agent prompts must be updated to use `seaweedfs` instead of `minio-fetch`.

## Testing `seaweedfs`
To test functionality, run the following command, assuming a dummy resource path:
`seaweedfs.check_connection(resource_path="/dummy/test/resource")`
