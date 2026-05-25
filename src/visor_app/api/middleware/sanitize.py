"""[SPEC-006] Input sanitization.

Two layers:
1. `reject_shell_meta(value)`: scan any string for `;`, `|`, `` ` ``, `$()`, `&`, `&&`, `||`.
   Match → raise `SecurityException`.
2. `validate_storage_path(path)`: must start with `/visor/` and not contain `..` segments
   after normalization. Match → raise `SecurityException`.

These are applied to all params before forwarding to visor-agent / visor-exec.
"""
from __future__ import annotations

import re
from pathlib import PurePosixPath
from typing import Any


class SecurityException(Exception):
    pass


SHELL_META_RE = re.compile(r"[;|`$&]|&&|\|\||\$\(")
STORAGE_PREFIX = "/visor/"
PATH_SUFFIXES = ("_path", "_zarr")


def reject_shell_meta(value: str) -> None:
    if SHELL_META_RE.search(value):
        raise SecurityException(f"shell metacharacter in value: {value!r}")


def validate_storage_path(path: str) -> None:
    if not path.startswith(STORAGE_PREFIX):
        raise SecurityException(f"path must start with {STORAGE_PREFIX}: {path!r}")
    if ".." in PurePosixPath(path).parts:
        raise SecurityException(f"path escapes storage prefix: {path!r}")


def sanitize_params(params: dict[str, Any]) -> None:
    """Walk params recursively; apply shell-meta + storage path checks."""
    for key, value in params.items():
        if isinstance(value, str):
            reject_shell_meta(value)
            if key.endswith(PATH_SUFFIXES):
                validate_storage_path(value)
        elif isinstance(value, dict):
            sanitize_params(value)
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    sanitize_params(item)
                elif isinstance(item, str):
                    reject_shell_meta(item)
