"""Put the repository root on sys.path so Backend can import `ai` and `seed`."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def ensure_repo_root() -> Path:
    root = str(REPO_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)
    return REPO_ROOT
