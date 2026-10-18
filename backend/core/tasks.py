# backend/core/tasks.py
import logging
import uuid

from celery import Task

from .workflow import mark_failed

logger = logging.getLogger(__name__)


class WorkflowTrackingTask(Task):
    """
    Base for every task in the KYC chain.

    Fires `on_failure` only after `autoretry_for` has given up — Celery
    invokes `on_failure` on the *final* failure, not on each retry. So
    a transient retry that eventually succeeds never marks the workflow
    FAILED.

    Expects `tracking_id` as either:
      * the LAST positional argument (the chain-binding convention used
        by StartKYCView._dispatch_chain), or
      * the `tracking_id` kwarg.

    The `screen_document` task is no longer in the chain — screening
    runs inline inside `run_sanctions_screening` (backend/core/assessment_tasks.py),
    so there is no standalone screening task to inherit from this base.
    """

    abstract = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        step = self.name.rsplit(".", 1)[-1]  # e.g. "preprocess_document"
        tracking_id = self._extract_tracking_id(args, kwargs)
        if tracking_id:
            mark_failed(tracking_id, step, exc)
            logger.warning(
                "Workflow %s failed at %s: %s", tracking_id, step, exc,
            )

    @staticmethod
    def _extract_tracking_id(args, kwargs):
        """
        Prefer the explicit kwarg; fall back to the last positional.

        Validates the candidate is UUID-shaped before accepting it, so a
        future signature change (extra trailing positional, a task that
        takes an int last) can't silently mark the wrong workflow — or
        a non-existent one — as failed.
        """
        candidate = kwargs.get("tracking_id")
        if candidate is None and args:
            candidate = args[-1]
        if candidate is None:
            return None

        if isinstance(candidate, uuid.UUID):
            return str(candidate)
        if isinstance(candidate, str):
            try:
                uuid.UUID(candidate)
            except (ValueError, AttributeError, TypeError):
                return None
            return candidate
        return None