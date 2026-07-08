# -*- coding: utf-8 -*-
"""Vercel ASGI entrypoint."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from web.server import app  # noqa: E402

__all__ = ["app"]
