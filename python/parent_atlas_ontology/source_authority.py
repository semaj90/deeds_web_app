"""Explicit source-authority binding contract for read-only admission."""

from __future__ import annotations

from dataclasses import dataclass
import re


SHA256_REVISION = re.compile(r"^sha256:[0-9a-f]{64}$")


@dataclass(frozen=True, slots=True)
class SourceAuthorityBindingV1:
    sourceNamespace: str
    sourceRef: str
    sourceRevision: str
    workspaceRevision: str
    contentDigest: str
    evidenceRefs: tuple[str, ...]
    canonicalAuthority: bool = False
    writesPerformed: bool = False

    def __post_init__(self) -> None:
        if not self.sourceNamespace.strip():
            raise ValueError("SOURCE_NAMESPACE_UNPROVEN")
        if not self.sourceRef.strip():
            raise ValueError("SOURCE_REF_REQUIRED")
        if not SHA256_REVISION.fullmatch(self.sourceRevision):
            raise ValueError("SOURCE_REVISION_UNPROVEN")
        if not SHA256_REVISION.fullmatch(self.workspaceRevision):
            raise ValueError("WORKSPACE_REVISION_UNPROVEN")
        if not re.fullmatch(r"[0-9a-f]{64}", self.contentDigest):
            raise ValueError("CONTENT_DIGEST_INVALID")
        if not self.evidenceRefs:
            raise ValueError("EVIDENCE_MISSING")
        if self.canonicalAuthority or self.writesPerformed:
            raise ValueError("SOURCE_BINDING_CANNOT_GRANT_AUTHORITY")

    def to_dict(self) -> dict[str, object]:
        return {
            "schema": "atlas.source-authority-binding.v1",
            "sourceNamespace": self.sourceNamespace,
            "sourceRef": self.sourceRef,
            "sourceRevision": self.sourceRevision,
            "workspaceRevision": self.workspaceRevision,
            "contentDigest": self.contentDigest,
            "evidenceRefs": list(self.evidenceRefs),
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
