#!/usr/bin/env python3
"""Persistent Parent Atlas Python kernel worker seam.

This module is intentionally *not* the canonical workflow owner.  It models the
stateful Python/IPython side of AtlasKernelSessionV1 and exposes only read,
compute, verify, prefill-compilation, patch-proposal, and subtask-request
operations.  The TypeScript host remains responsible for credentials, workflow
state, canonical identities, mutation authorization, CAS checks, validators and
materialization.

The worker is usable as a plain Python object for tests and can be hosted inside
an IPython/ipykernel process.  Heavy libraries are imported lazily so a missing
optional analyzer produces a capability probe result rather than preventing the
kernel from starting.
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import json
import os
import platform
import shutil
import subprocess
import sys
import sysconfig
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal, Mapping, MutableMapping, Optional


RequestKind = Literal[
    "READ_ARTIFACT",
    "RETRIEVE",
    "RUN_ANALYZER",
    "VERIFY_CLAIM",
    "COMPILE_PREFILL",
    "PROPOSE_PATCH",
    "SPAWN_SUBTASK",
]


ANALYZER_IMPORTS: dict[str, tuple[str, ...]] = {
    "TREE_SITTER": ("tree_sitter",),
    "TREESITTER_CHUNKER": ("chunker", "treesitter_chunker", "tree_sitter_chunker"),
    "AST_GREP": ("ast_grep_py", "ast_grep"),
    "LANGEXTRACT": ("langextract",),
    "STANZA_POS": ("stanza",),
    "PYTORCH": ("torch",),
    "NETWORKX": ("networkx",),
    "NX_CUGRAPH": ("nx_cugraph",),
    "CUVS": ("cuvs",),
    "CUGRAPH": ("cugraph",),
}

ANALYZER_BINARIES: dict[str, tuple[str, ...]] = {
    "CODEQL": ("codeql",),
    "SOUFFLE": ("souffle",),
}


@dataclass(frozen=True)
class CapabilityProbe:
    analyzer_id: str
    available: bool
    owner_runtime: str
    package_or_binary: str
    version: Optional[str]
    detail: str


@dataclass
class KernelArtifactHandle:
    artifact_id: str
    storage_ref: str
    content_format: str
    access_mode: str
    content_checksum_sha256: str
    row_identity_checksum: Optional[str] = None


@dataclass
class KernelRequest:
    request_id: str
    kind: RequestKind
    session_id: str
    session_revision: str
    workspace_revision: str
    source_snapshot_revision: str
    ace_graph_id: str
    ace_graph_revision: str
    analyzer_id: Optional[str] = None
    input_artifact_ids: list[str] = field(default_factory=list)
    canonical_ids: list[str] = field(default_factory=list)
    evidence_refs: list[str] = field(default_factory=list)
    claim_verification_receipt_ids: list[str] = field(default_factory=list)
    maximum_candidates: Optional[int] = None
    maximum_bytes: Optional[int] = None
    maximum_seconds: Optional[float] = None
    deterministic_required: bool = True
    mutation_intent: Literal["NONE", "PROPOSE_ONLY"] = "NONE"
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class KernelResponse:
    request_id: str
    session_id: str
    status: Literal["ACCEPTED", "COMPLETED", "REJECTED", "FAILED"]
    output_artifact_ids: list[str] = field(default_factory=list)
    evidence_refs: list[str] = field(default_factory=list)
    receipt_refs: list[str] = field(default_factory=list)
    child_handle_id: Optional[str] = None
    error_code: Optional[str] = None
    canonical_authority: bool = False
    payload: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema": "atlas.kernel-host-response.v1",
            "request_id": self.request_id,
            "session_id": self.session_id,
            "status": self.status,
            "output_artifact_ids": self.output_artifact_ids,
            "evidence_refs": self.evidence_refs,
            "receipt_refs": self.receipt_refs,
            "child_handle_id": self.child_handle_id,
            "error_code": self.error_code,
            "canonical_authority": False,
            "payload": self.payload,
        }


def _package_version(module_name: str) -> Optional[str]:
    candidates = [module_name.replace("_", "-"), module_name]
    for name in candidates:
        try:
            return importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            continue
    return None


def _probe_import(analyzer_id: str, names: tuple[str, ...]) -> CapabilityProbe:
    for name in names:
        try:
            module = importlib.import_module(name)
        except Exception:
            continue
        version = getattr(module, "__version__", None) or _package_version(name)
        return CapabilityProbe(
            analyzer_id=analyzer_id,
            available=True,
            owner_runtime="IPYTHON_KERNEL",
            package_or_binary=name,
            version=str(version) if version is not None else None,
            detail=f"import {name} succeeded",
        )
    return CapabilityProbe(
        analyzer_id=analyzer_id,
        available=False,
        owner_runtime="IPYTHON_KERNEL",
        package_or_binary=names[0],
        version=None,
        detail=f"none of {', '.join(names)} imported",
    )


def _probe_binary(analyzer_id: str, names: tuple[str, ...]) -> CapabilityProbe:
    for name in names:
        executable = shutil.which(name)
        if not executable:
            continue
        version: Optional[str] = None
        detail = executable
        try:
            completed = subprocess.run(
                [executable, "--version"],
                check=False,
                capture_output=True,
                text=True,
                timeout=5,
            )
            output = (completed.stdout or completed.stderr).strip().splitlines()
            if output:
                version = output[0][:256]
        except Exception as exc:  # pragma: no cover - environment dependent
            detail = f"{executable}: version probe failed: {exc}"
        return CapabilityProbe(
            analyzer_id=analyzer_id,
            available=True,
            owner_runtime="EXTERNAL_PROCESS",
            package_or_binary=executable,
            version=version,
            detail=detail,
        )
    return CapabilityProbe(
        analyzer_id=analyzer_id,
        available=False,
        owner_runtime="EXTERNAL_PROCESS",
        package_or_binary=names[0],
        version=None,
        detail=f"none of {', '.join(names)} found on PATH",
    )


def probe_kernel_runtime() -> dict[str, Any]:
    gil_enabled: Optional[bool]
    get_gil = getattr(sys, "_is_gil_enabled", None)
    if callable(get_gil):
        try:
            gil_enabled = bool(get_gil())
        except Exception:  # pragma: no cover - implementation dependent
            gil_enabled = None
    else:
        gil_enabled = None

    free_threaded = bool(sysconfig.get_config_var("Py_GIL_DISABLED"))
    try:
        ipykernel_version = importlib.metadata.version("ipykernel")
    except importlib.metadata.PackageNotFoundError:
        ipykernel_version = None

    return {
        "executable": sys.executable,
        "version": platform.python_version(),
        "implementation": platform.python_implementation(),
        "abi_flags": getattr(sys, "abiflags", ""),
        "python_abi": sysconfig.get_config_var("SOABI") or "unknown",
        "free_threaded_build": free_threaded,
        "gil_enabled": gil_enabled,
        "ipykernel_version": ipykernel_version,
    }


def probe_analyzers() -> list[CapabilityProbe]:
    probes = [_probe_import(analyzer_id, names) for analyzer_id, names in ANALYZER_IMPORTS.items()]
    probes.extend(_probe_binary(analyzer_id, names) for analyzer_id, names in ANALYZER_BINARIES.items())
    probes.extend([
        CapabilityProbe(
            analyzer_id="TS_MORPH",
            available=False,
            owner_runtime="TYPESCRIPT_HOST",
            package_or_binary="ts-morph",
            version=None,
            detail="host-owned analyzer; intentionally not imported into Python kernel",
        ),
        CapabilityProbe(
            analyzer_id="CUSPARSE",
            available=False,
            owner_runtime="NATIVE_LIBRARY",
            package_or_binary="cuSPARSE",
            version=None,
            detail="native CUDA library; availability is probed by the GPU executor layer",
        ),
    ])
    return sorted(probes, key=lambda probe: probe.analyzer_id)


def canonical_json_checksum(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class AtlasKernelWorker:
    """Stateful kernel-side dispatcher with a persistent Python namespace."""

    def __init__(
        self,
        *,
        session_id: str,
        session_revision: str,
        workspace_revision: str,
        source_snapshot_revision: str,
    ) -> None:
        self.session_id = session_id
        self.session_revision = session_revision
        self.workspace_revision = workspace_revision
        self.source_snapshot_revision = source_snapshot_revision
        self.namespace: MutableMapping[str, Any] = {}
        self.artifacts: dict[str, KernelArtifactHandle] = {}
        self._handlers: dict[RequestKind, Callable[[KernelRequest], KernelResponse]] = {}
        self._lock = threading.RLock()

    def register_artifact(self, artifact: KernelArtifactHandle) -> None:
        with self._lock:
            self.artifacts[artifact.artifact_id] = artifact

    def register_handler(self, kind: RequestKind, handler: Callable[[KernelRequest], KernelResponse]) -> None:
        with self._lock:
            self._handlers[kind] = handler

    def _validate_request(self, request: KernelRequest) -> Optional[str]:
        if request.session_id != self.session_id or request.session_revision != self.session_revision:
            return "KERNEL_SESSION_REVISION_MISMATCH"
        if request.workspace_revision != self.workspace_revision:
            return "KERNEL_WORKSPACE_REVISION_MISMATCH"
        if request.source_snapshot_revision != self.source_snapshot_revision:
            return "KERNEL_SOURCE_SNAPSHOT_REVISION_MISMATCH"
        if request.kind == "PROPOSE_PATCH":
            if request.mutation_intent != "PROPOSE_ONLY":
                return "KERNEL_PATCH_MUTATION_INTENT_INVALID"
            if not request.claim_verification_receipt_ids:
                return "KERNEL_PATCH_REQUIRES_VERIFIED_CLAIM"
        elif request.mutation_intent != "NONE":
            return "KERNEL_CANONICAL_MUTATION_FORBIDDEN"
        unknown = sorted(set(request.input_artifact_ids) - set(self.artifacts))
        if unknown:
            return f"KERNEL_UNKNOWN_ARTIFACT:{unknown[0]}"
        return None

    def dispatch(self, request: KernelRequest) -> KernelResponse:
        with self._lock:
            error = self._validate_request(request)
            if error:
                return KernelResponse(
                    request_id=request.request_id,
                    session_id=self.session_id,
                    status="REJECTED",
                    error_code=error,
                )
            handler = self._handlers.get(request.kind)
            if handler is None:
                return KernelResponse(
                    request_id=request.request_id,
                    session_id=self.session_id,
                    status="REJECTED",
                    error_code=f"KERNEL_HANDLER_NOT_REGISTERED:{request.kind}",
                )
            try:
                response = handler(request)
            except Exception as exc:
                return KernelResponse(
                    request_id=request.request_id,
                    session_id=self.session_id,
                    status="FAILED",
                    error_code=f"KERNEL_HANDLER_FAILED:{type(exc).__name__}",
                    payload={"message": str(exc)[:2048]},
                )
            response.canonical_authority = False
            return response

    def execute_python(self, source: str, *, namespace_key: Optional[str] = None) -> Any:
        """Execute trusted host-admitted Python in the persistent namespace.

        This is deliberately a low-level kernel primitive, not a security
        sandbox.  The TypeScript host must decide which code is admitted.  It
        cannot directly create canonical Atlas state because no mutation bridge
        is exposed here.
        """
        with self._lock:
            code = compile(source, "<atlas-kernel>", "exec")
            exec(code, self.namespace, self.namespace)
            if namespace_key is None:
                return None
            return self.namespace.get(namespace_key)


def build_runtime_manifest() -> dict[str, Any]:
    return {
        "schema": "atlas.kernel-runtime-probe.v1",
        "python_runtime": probe_kernel_runtime(),
        "capabilities": [probe.__dict__ for probe in probe_analyzers()],
        "pid": os.getpid(),
        "canonical_authority": False,
    }


if __name__ == "__main__":
    print(json.dumps(build_runtime_manifest(), sort_keys=True, indent=2))
