from __future__ import annotations

import base64
import json
import logging
import os

from .base import VLMBackend, VLMExtraction

log = logging.getLogger(__name__)


class OllamaVLMBackend(VLMBackend):
    """
    Local VLM via Ollama. Default model: qwen2.5vl:7b.

    Production intent: Ollama runs on infrastructure the bank controls, so
    customer PII never reaches a third party (a Zimbabwean bank cannot send
    PII to OpenAI or Anthropic without explicit RBZ sign-off).

    The MVP/demo deployment is NOT that: Ollama runs in a Kaggle notebook
    behind an ngrok static dev domain, so images transit ngrok's edge and
    run on Google infrastructure. Use synthetic or consented test IDs only
    on this path.

    Access is gated by an X-API-Key checked by a small proxy in the notebook
    (only /api/generate, /api/chat and /api/tags are forwarded). The key
    comes from OLLAMA_API_KEY and must never be logged.

    The ngrok domain is stable across notebook restarts, but the notebook
    itself is not: when the Kaggle session dies, the tunnel is offline and
    ngrok answers with an error page. That is reported as an ngrok edge
    error rather than a bare 404. The log line emitted before each call
    (`Ollama VLM -> <url>`) shows which endpoint the process is hitting.

    `ngrok-skip-browser-warning` is sent unconditionally; ngrok's free tier
    serves an HTML interstitial to header-less clients otherwise. It is
    harmless against direct Ollama.

    `requests` is imported lazily so the package remains importable even
    when the dependency isn't installed.
    """

    name = "ollama"

    # Substrings from error bodies that indicate a configuration problem
    # (the endpoint answered, but can't serve this request) rather than a
    # transport failure. Kept here so the classification lives next to the
    # responses it classifies.
    CONFIG_ERROR_MARKERS = (
        "not found",
        "does not support",
        "no such model",
        "unknown model",
        "unauthorized",   # proxy: missing/wrong X-API-Key (401)
        "not allowed",    # proxy: endpoint outside the allowlist (403)
        "ERR_NGROK",      # ngrok edge error, e.g. tunnel offline
        "err_ngrok",      # same, in case the consumer lowercases errors
    )

    # Long edge in px. Plenty for OCR, keeps uploads small and fast.
    MAX_SIDE = 1600

    def __init__(
        self,
        model: str | None = None,
        url: str | None = None,
        api_key: str | None = None,
    ):
        self.model = model or os.environ.get("OLLAMA_VLM_MODEL", "qwen2.5vl:7b")
        self.url = (
            url or os.environ.get("OLLAMA_URL", "http://localhost:11434")
        ).rstrip("/")
        self.api_key = (
            api_key if api_key is not None
            else os.environ.get("OLLAMA_API_KEY", "")
        )
        if (
            self.api_key
            and self.url.startswith("http://")
            and not any(h in self.url for h in ("localhost", "127.0.0.1"))
        ):
            log.warning("OLLAMA_API_KEY would be sent over plain http to %s", self.url)

    def _headers(self) -> dict[str, str]:
        headers = {"ngrok-skip-browser-warning": "true"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    @staticmethod
    def _downscale(image_bytes: bytes, max_side: int = MAX_SIDE) -> bytes:
        """
        Shrink large photos and apply EXIF rotation before upload.

        Phone photos often carry an EXIF orientation flag that Ollama does
        not honour, so a "portrait" ID can reach the model sideways.
        Falls back to the original bytes on any failure (including
        unreadable images), so this never blocks a call.
        """
        try:
            import io
            from PIL import Image, ImageOps

            img = Image.open(io.BytesIO(image_bytes))
            rotated = img.getexif().get(0x0112, 1) not in (0, 1)
            if max(img.size) <= max_side and not rotated:
                return image_bytes
            img = ImageOps.exif_transpose(img)
            img.thumbnail((max_side, max_side))
            buf = io.BytesIO()
            img.convert("RGB").save(buf, "JPEG", quality=90)
            return buf.getvalue()
        except Exception:
            return image_bytes

    def _error_body(self, resp) -> str:
        """
        Extract a diagnosable error string from a non-200 response.

        Order of checks:
        1. ngrok edge errors (tunnel offline, etc.) arrive as an HTML 404
           that looks identical to Ollama's "model not found", so they are
           identified by the `ngrok-error-code` header first.
        2. Ollama / proxy JSON bodies: `{"error": "..."}`.
        3. Anything else: status code plus a short body preview.
        """
        code = resp.headers.get("ngrok-error-code")
        if code:
            return (
                f"HTTP {resp.status_code}: ngrok edge error {code} "
                "(tunnel offline? notebook restarted?)"
            )
        try:
            body = resp.json()
        except ValueError:
            preview = (resp.text or "")[:200].replace("\n", " ")
            return f"HTTP {resp.status_code}: {preview!r}"
        if isinstance(body, dict) and isinstance(body.get("error"), str):
            return f"HTTP {resp.status_code}: {body['error']}"
        preview = (resp.text or "")[:200].replace("\n", " ")
        return f"HTTP {resp.status_code}: {preview!r}"

    def extract(self, image_bytes: bytes, prompt: str) -> VLMExtraction:
        try:
            import requests
        except ImportError:
            return VLMExtraction(
                backend=self.name, model=self.model,
                error="`requests` is not installed; run `pip install requests`",
            )

        b64 = base64.b64encode(self._downscale(image_bytes)).decode("ascii")
        payload = {
            "model": self.model,
            "prompt": prompt,
            "images": [b64],
            "stream": False,
            "format": "json",
            # Keep the model resident; otherwise Ollama unloads it after
            # 5 idle minutes and the next call pays the 20-60s load again.
            "keep_alive": "30m",
            # num_predict caps runaway generations. ID-field JSON is far
            # smaller; raise it if you see truncated "not valid JSON".
            "options": {"temperature": 0.0, "num_predict": 512},
        }

        # One line, and any "wrong endpoint / stale tunnel / missing key"
        # bug becomes self-diagnosing from the Celery log alone. Logs only
        # whether a key is set, never its value.
        log.info(
            "Ollama VLM -> %s/api/generate (model=%s, api_key=%s)",
            self.url, self.model, "set" if self.api_key else "MISSING",
        )

        try:
            resp = requests.post(
                f"{self.url}/api/generate",
                json=payload,
                headers=self._headers(),
                # (connect, read). The first call after a cold start loads
                # the model, so the read timeout must be generous. Keep
                # Celery task_soft_time_limit / task_time_limit above this.
                timeout=(10, 300),
            )
        except requests.RequestException as exc:
            log.warning("Ollama VLM call failed: %s", exc)
            return VLMExtraction(backend=self.name, model=self.model, error=str(exc))

        if resp.status_code != 200:
            error = self._error_body(resp)
            log.warning("Ollama returned %s", error)
            return VLMExtraction(
                backend=self.name, model=self.model,
                error=error,
            )

        try:
            body = resp.json()
        except ValueError as exc:
            preview = (resp.text or "")[:120].replace("\n", " ")
            return VLMExtraction(
                backend=self.name, model=self.model,
                error=f"response was not JSON ({exc}); body starts: {preview!r}",
            )

        raw = body.get("response") or ""
        try:
            fields = json.loads(raw) if raw else {}
        except ValueError:
            return VLMExtraction(
                backend=self.name, model=self.model,
                raw_response=raw,
                error="model response was not valid JSON",
            )

        if not isinstance(fields, dict):
            return VLMExtraction(
                backend=self.name, model=self.model,
                raw_response=raw, error="model response was not a JSON object",
            )

        return VLMExtraction(
            fields=fields,
            raw_response=raw,
            backend=self.name,
            model=self.model,
        )