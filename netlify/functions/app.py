# -*- coding: utf-8 -*-
"""Netlify function wrapper for the FastAPI app."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mangum import Mangum  # noqa: E402
from web.server import app as fastapi_app  # noqa: E402

handler = Mangum(fastapi_app, lifespan="off")
