"""
Setup script for Granite-Docling Worker
W-I9 optimized document processing worker for Windows
"""

from setuptools import setup, find_packages
import os

# Read README
with open("README.md", "r", encoding="utf-8") as f:
    long_description = f.read()

# Read requirements
with open("requirements.txt", "r", encoding="utf-8") as f:
    requirements = [line.strip() for line in f if line.strip() and not line.startswith("#")]

setup(
    name="granite-docling-worker",
    version="1.0.0",
    description="W-I9 optimized Granite-Docling document processing worker for Windows",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Legal AI Team",
    author_email="team@legalai.dev",
    url="https://github.com/legalai/granite-docling-worker",
    license="MIT",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    python_requires=">=3.10",
    install_requires=requirements,
    extras_require={
        "dev": [
            "pytest>=7.0",
            "pytest-cov>=4.0",
            "black>=22.0",
            "flake8>=4.0",
            "mypy>=0.950",
        ],
        "gpu": [
            "torch>=2.0",
            "torchvision>=0.15",
            "torchaudio>=2.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "granite-worker=granite_worker.cli:main",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: Microsoft :: Windows",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
        "Topic :: Office/Business",
    ],
    keywords="document-processing ocr granite-docling legal-ai w-i9",
    project_urls={
        "Bug Reports": "https://github.com/legalai/granite-docling-worker/issues",
        "Documentation": "https://github.com/legalai/granite-docling-worker/wiki",
        "Source Code": "https://github.com/legalai/granite-docling-worker",
    },
)
