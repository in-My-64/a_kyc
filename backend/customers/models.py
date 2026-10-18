from django.contrib.auth.models import AbstractUser
from django.db import models


class Customer(AbstractUser):
    """
    Single user model for both customers and staff.

    Uses `username` as the login identifier (matches DRF TokenAuth
    conventions). Email is unique and required.
    """

    email = models.EmailField(unique=True)
    date_of_birth = models.DateField(null=True, blank=True)
    nationality = models.CharField(max_length=50, blank=True)

    # Bumped on every save() — and on save(update_fields=[...]) when
    # "updated_at" is included in the list, which PasswordChangeSerializer
    # does explicitly. QuerySet.update() still bypasses it.
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["email"]

    class Meta:
        ordering = ["-date_joined"]
        indexes = [
            # `email` is unique=True, which already creates a B-tree
            # index. A second Index(fields=["email"]) would be dead weight.
            models.Index(fields=["is_active", "is_staff"]),
        ]

    def __str__(self):
        # `email` is unique + required so it's never blank in practice,
        # but returning username as a fallback keeps this safe for
        # partially-created rows (fixtures, migrations, admin drafts).
        return self.email or self.username