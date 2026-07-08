# -*- coding: utf-8 -*-
"""Desktop launcher for the Streamlit app."""

from __future__ import annotations

import argparse
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path
from typing import Any


def _bundle_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parent


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _launch_browser(url: str) -> None:
    def _open() -> None:
        time.sleep(2.0)
        webbrowser.open(url, new=1, autoraise=True)

    threading.Thread(target=_open, daemon=True).start()


def _run_streamlit(app_path: Path, port: int, extra_args: list[str]) -> None:
    flag_options: dict[str, Any] = {
        "server_headless": True,
        "server_port": port,
        "server_address": "127.0.0.1",
        "global_developmentMode": False,
        "browser_gatherUsageStats": False,
    }

    try:
        from streamlit.web.bootstrap import load_config_options, run

        load_config_options(flag_options)
        run(str(app_path), False, extra_args, flag_options)
        return
    except Exception:
        from streamlit.web import cli as stcli

        sys.argv = [
            "streamlit",
            "run",
            str(app_path),
            "--server.headless=true",
            f"--server.port={port}",
            "--server.address=127.0.0.1",
            "--global.developmentMode=false",
            "--browser.gatherUsageStats=false",
            *extra_args,
        ]
        stcli.main()


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch the Streamlit desktop app.")
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="Optional localhost port. Defaults to a free port.",
    )
    args, extra_args = parser.parse_known_args()

    port = args.port or _find_free_port()
    app_path = _bundle_root() / "app.py"
    if not app_path.exists():
        raise FileNotFoundError(f"app.py not found: {app_path}")

    url = f"http://127.0.0.1:{port}"
    print(
        "Starting Keiba Kachisuji desktop app...\n"
        f"Open your browser if it does not open automatically:\n  {url}",
        flush=True,
    )
    _launch_browser(url)
    _run_streamlit(app_path, port, extra_args)


if __name__ == "__main__":
    main()
