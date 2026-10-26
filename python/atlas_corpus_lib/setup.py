from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from setuptools import Extension, setup
from setuptools.command.build_ext import build_ext


class CMakeExtension(Extension):
    def __init__(self, name: str, source_dir: str) -> None:
        super().__init__(name, sources=[])
        self.source_dir = str(Path(source_dir).resolve())


class CMakeBuild(build_ext):
    def run(self) -> None:
        aten_extension_name = "atlas_corpus_lib._atlas_aten_bridge"
        if not any(extension.name == aten_extension_name for extension in self.extensions):
            stale_extension = Path(self.get_ext_fullpath(aten_extension_name))
            stale_extension.unlink(missing_ok=True)
        super().run()

    def build_extension(self, extension: CMakeExtension) -> None:
        output_path = Path(self.get_ext_fullpath(extension.name)).resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        build_dir = Path(self.build_temp).resolve() / extension.name.replace(".", "_")
        build_dir.mkdir(parents=True, exist_ok=True)
        build_aten = extension.name.endswith("._atlas_aten_bridge")
        build_python = extension.name.endswith("._atlas_native_core")

        pybind_include = os.environ.get("ATLAS_PYBIND11_INCLUDE_DIR", "")
        if build_python and not pybind_include:
            try:
                import pybind11

                pybind_include = pybind11.get_include()
            except ImportError:
                import torch

                pybind_include = str(Path(torch.__file__).parent / "include")

        configuration = "Debug" if self.debug else "Release"
        configure = [
            "cmake",
            "-S",
            extension.source_dir,
            "-B",
            str(build_dir),
            f"-DCMAKE_BUILD_TYPE={configuration}",
            "-DATLAS_NATIVE_BUILD_TESTS=OFF",
            f"-DATLAS_NATIVE_BUILD_PYTHON={'ON' if build_python else 'OFF'}",
            "-DATLAS_NATIVE_BUILD_NAPI=OFF",
            f"-DATLAS_NATIVE_BUILD_ATEN={'ON' if build_aten else 'OFF'}",
            f"-DPython3_EXECUTABLE={sys.executable}",
            f"-DATLAS_PYTHON_OUTPUT_DIRECTORY={output_path.parent}",
        ]
        if build_python:
            configure.append(f"-DATLAS_PYBIND11_INCLUDE_DIR={pybind_include}")
        subprocess.check_call(configure)
        subprocess.check_call([
            "cmake",
            "--build",
            str(build_dir),
            "--config",
            configuration,
            "--target",
            extension.name.rsplit(".", 1)[-1],
            "--parallel",
            str(os.cpu_count() or 2),
        ])
        if not output_path.is_file():
            raise RuntimeError(f"Native extension was not produced at {output_path}")


repo_root = Path(__file__).resolve().parents[2]
extensions = [
    CMakeExtension(
        "atlas_corpus_lib._atlas_native_core",
        str(repo_root / "packages" / "atlas-native-core"),
    )
]
if os.environ.get("ATLAS_NATIVE_BUILD_ATEN", "").lower() in {"1", "on", "true", "yes"}:
    extensions.append(
        CMakeExtension(
            "atlas_corpus_lib._atlas_aten_bridge",
            str(repo_root / "packages" / "atlas-native-core"),
        )
    )

setup(
    ext_modules=extensions,
    cmdclass={"build_ext": CMakeBuild},
)
