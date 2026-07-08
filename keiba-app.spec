# -*- mode: python ; coding: utf-8 -*-

from __future__ import annotations

from pathlib import Path

from PyInstaller.utils.hooks import collect_all, copy_metadata


try:
    ROOT = Path(SPEC).resolve().parent
except NameError:
    ROOT = Path.cwd()


def _collect_source_files() -> list[tuple[str, str]]:
    files: list[tuple[str, str]] = []
    for rel_path in [
        "desktop.py",
        "app.py",
        "engine.py",
        "model.py",
        "features.py",
        "backtest.py",
        "README.md",
    ]:
        src = ROOT / rel_path
        files.append((str(src), str(src.parent.relative_to(ROOT))))

    for rel_dir in ["data", "site"]:
        base = ROOT / rel_dir
        for path in base.rglob("*"):
            if not path.is_file() or "__pycache__" in path.parts:
                continue
            files.append((str(path), str(path.parent.relative_to(ROOT))))
    return files


datas = _collect_source_files()

metadata = []


def _copy_package_metadata(package_name: str) -> list[tuple[str, str]]:
    try:
        return copy_metadata(package_name)
    except Exception:
        return []


for package in [
    "streamlit",
    "lightgbm",
    "numpy",
    "pandas",
    "plotly",
    "altair",
    "scikit-learn",
    "sklearn",
    "scipy",
]:
    metadata.extend(_copy_package_metadata(package))

streamlit_datas, streamlit_binaries, _streamlit_hiddenimports = collect_all(
    "streamlit"
)
datas += streamlit_datas
binaries = streamlit_binaries

hiddenimports = (
    _streamlit_hiddenimports
    + [
        "engine",
        "model",
        "features",
        "backtest",
        "data",
        "data.fetch",
        "lightgbm",
        "numpy",
        "pandas",
        "plotly",
        "sklearn",
        "scipy",
        "altair",
    ]
)

a = Analysis(
    ["desktop.py"],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas + metadata,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="keiba-kachisuji",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)
