FROM maximhq/bifrost:latest

# maximhq/bifrost:latest is Alpine-based and ships without git, which disables
# the Claude Code / Codex marketplace routes in the Bifrost UI ("git binary
# not found" at startup). This does not affect TRACE MCP (:8788) or the
# Parent Atlas retrieval pipeline — those never call out to git.
# The image's default USER is appuser (uid 1000); /var/log and /var/cache/apk
# are root-owned, so apk needs root for this one layer before dropping back.
USER root
RUN apk add --no-cache git
USER appuser
