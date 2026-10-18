from __future__ import annotations

import base64
import json
import logging
import os

from .base import VLMBackend, VLMExtraction

log = logging.getLogger(__name__)


class OpenAIVLMBackend(VLMBackend):
    """
    OpenAI vision via the chat completions API.

    Off by default. Only useful if the deployment is not subject to data
    residency rules, or the operator has explicit approval to send PII
    to OpenAI. For a Zimbabwean bank this is generally not an option.
    """

    name = "openai"

    def __init__(self, model: str | None = None, api_key: str | None = None):
        self.model = model or os.environ.get("OPENAI_VLM_MODEL", "gpt-4o-mini")
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")

    def extract(self, image_bytes: bytes, prompt: str) -> VLMExtraction:
        if not self.api_key:
            return VLMExtraction(
                backend=self.name, model=self.model,
                error="OPENAI_API_KEY is not set",
            )

        try:
            from openai import OpenAI
        except ImportError:
            return VLMExtraction(
                backend=self.name, model=self.model,
                error="openai package not installed",
            )

        b64 = base64.b64encode(image_bytes).decode("ascii")
        try:
            client = OpenAI(api_key=self.api_key)
            resp = client.chat.completions.create(
                model=self.model,
                response_format={"type": "json_object"},
                temperature=0.0,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{b64}"},
                        },
                    ],
                }],
            )
        except Exception as exc:
            log.warning("OpenAI VLM call failed: %s", exc)
            return VLMExtraction(
                backend=self.name, model=self.model, error=str(exc),
            )

        raw = resp.choices[0].message.content or ""
        try:
            fields = json.loads(raw)
        except ValueError:
            return VLMExtraction(
                backend=self.name, model=self.model,
                raw_response=raw, error="response was not valid JSON",
            )

        return VLMExtraction(
            fields=fields, raw_response=raw,
            backend=self.name, model=self.model,
        )