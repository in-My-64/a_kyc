from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "backend.documents"
    # No `ready()` for signals — audit signals are registered by the
    # audit app itself.

    def ready(self):
        # Register the HEIC/HEIF opener with Pillow at process startup.
        #
        # The opener must be registered before any validator or
        # preprocessor runs Image.open() on a HEIC file. Registering it
        # only in preprocess_utils means a fresh web process that never
        # imported that module rejects every HEIC upload with
        # "not a valid image" — even though the worker (which does
        # import preprocess_utils) would have handled it.
        #
        # Import-time registration is idempotent; calling this in both
        # places is safe.
        try:
            from pillow_heif import register_heif_opener
            register_heif_opener()
        except ImportError:
            # pillow-heif not installed. HEIC uploads will be rejected
            # at validation with a specific message.
            pass