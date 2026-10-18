"""
Exceptions specific to the VLM step.

Distinct from "no backend configured" (a skip) and "model returned bad
data" (a data error). This one means the backend is configured but the
transport failed — connection refused, DNS failure, timeout, HTTP error
from the endpoint. When that happens, the workflow should fail loudly
so the reviewer knows the pipeline ran without its vision input.
"""
from __future__ import annotations


class VLMUnreachableError(RuntimeError):
    """
    The VLM backend is configured but could not be reached, or it
    returned an HTTP-level error.

    Raised by `run_vlm_extraction` when the transport to the model
    fails. The pipeline deliberately does NOT fall back to the two
    classical engines on this error — if the VLM is configured, its
    output is required for the compare step.
    """