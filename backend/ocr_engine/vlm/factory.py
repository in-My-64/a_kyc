from __future__ import annotations

import logging
import os
from functools import lru_cache

from .base import VLMBackend
from .ollama import OllamaVLMBackend
from .openai import OpenAIVLMBackend

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_vlm_backend() -> VLMBackend | None:
    """
    Pick a VLM backend from environment. Order:

      1. VLM_BACKEND=ollama|openai|none  (explicit, no reachability check)
      2. Ollama reachable at OLLAMA_URL AND serving the configured model
      3. OPENAI_API_KEY set → OpenAI
      4. None → step is a silent no-op

    Cached because the backend construction reads env at most once per
    worker process. Changing env requires a worker restart — `load_env`
    from the settings module does not invalidate this cache.

    Auto-detection (case 2) verifies the model is actually present,
    not just that the endpoint answers. The previous version accepted
    any 200 from /api/tags, which meant a local Ollama with zero
    models would be selected ahead of a working tunnel — and every
    workflow would then fail with an inscrutable 404.

    Explicit configuration (case 1) does NOT probe. If you set
    VLM_BACKEND=ollama, we trust you and let the task surface whatever
    the endpoint says.
    """
    explicit = os.environ.get("VLM_BACKEND", "").strip().lower()
    if explicit == "ollama":
        return OllamaVLMBackend()
    if explicit == "openai":
        return OpenAIVLMBackend()
    if explicit == "none":
        return None

    # Auto-detect: Ollama first (local, no data leaves the machine).
    try:
        import requests
        url = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
        wanted = os.environ.get("OLLAMA_VLM_MODEL", "qwen2.5vl:7b")
        r = requests.get(
            f"{url}/api/tags",
            headers={"ngrok-skip-browser-warning": "true"},
            timeout=4,
        )
        if r.status_code == 200:
            try:
                names = {
                    m.get("name") for m in (r.json().get("models") or [])
                }
            except (ValueError, AttributeError):
                names = set()
            if wanted in names:
                log.info("VLM backend: ollama at %s (model %s)", url, wanted)
                return OllamaVLMBackend()
            log.info(
                "Ollama at %s is up but has no %s; trying next backend",
                url, wanted,
            )
    except ImportError:
        log.debug("requests not installed; skipping Ollama auto-detect")
    except Exception as exc:
        log.debug("Ollama auto-detect failed: %s", exc)

    if os.environ.get("OPENAI_API_KEY"):
        log.info("VLM backend: openai")
        return OpenAIVLMBackend()

    log.info("VLM backend: none (set VLM_BACKEND or OLLAMA_URL to enable)")
    return None