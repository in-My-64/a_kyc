"""
Load environment variables from .env files.

Precedence (highest wins):

    shell environment  >  .env.local  >  .env.{MODE}  >  .env

Shell always wins, so `OLLAMA_URL=... python manage.py runserver` and
`VLM_BACKEND=none pytest` behave the way you'd expect. Among the files,
.env.local is loaded last and is treated as the developer's personal
override — see the gitignore for that file.

Missing python-dotenv is not fatal; shell variables still work.
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_LOADED = False


def _find_project_root(start: Path) -> Path:
    """
    Walk up from `start` until a directory containing manage.py is found.

    The previous version used a fixed `Path(__file__).parent.parent.parent`,
    which silently pointed at the wrong directory if this file ever moved
    or was imported from a different package layout. The marker-file walk
    is layout-independent.

    Falls back to `start` if no marker is found, which preserves the old
    behaviour for unusual deployments (e.g. running from a wheel).
    """
    for candidate in (start, *start.parents):
        if (candidate / "manage.py").exists():
            return candidate
    return start


def load_env() -> None:
    global _LOADED
    if _LOADED:
        return
    _LOADED = True

    try:
        from dotenv import dotenv_values
    except ImportError:
        logger.debug("python-dotenv not installed; skipping .env load")
        return

    project_root = _find_project_root(Path(__file__).resolve().parent)

    # Order matters — later entries win among files.
    candidates = [project_root / ".env"]

    mode = os.environ.get("DJANGO_ENV", "").strip()
    if mode:
        candidates.append(project_root / f".env.{mode}")

    candidates.append(project_root / ".env.local")

    # Snapshot the shell environment BEFORE any file load. Any key in
    # here must survive; the previous `load_dotenv(..., override=True)`
    # call clobbered it, which is why an exported OLLAMA_URL was ignored.
    shell_keys = set(os.environ)

    # Merge files into a single dict. dotenv_values returns str | None
    # (None for malformed lines); we drop those.
    merged: dict[str, str] = {}
    loaded_names: list[str] = []
    for path in candidates:
        if not path.exists():
            continue
        values = {k: v for k, v in dotenv_values(path).items() if v is not None}
        if values:
            merged.update(values)  # later file overwrites earlier
            loaded_names.append(path.name)

    applied = 0
    for key, value in merged.items():
        if key in shell_keys:
            continue  # shell wins, always
        os.environ[key] = value
        applied += 1

    if loaded_names:
        logger.debug(
            "loaded env files: %s (%d keys applied, %d shadowed by shell)",
            ", ".join(loaded_names), applied, len(merged) - applied,
        )