from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Customer


@admin.register(Customer)
class CustomerAdmin(UserAdmin):
    list_display = (
        "username",
        "email",
        "first_name",
        "last_name",
        "nationality",
        "is_active",
        "is_staff",
        "date_joined",
    )
    list_filter = ("is_active", "is_staff", "is_superuser", "nationality")
    search_fields = ("username", "email", "first_name", "last_name")
    ordering = ("-date_joined",)

    # The auto_now / auto_now_add fields are already non-editable in the
    # admin, but listing them here makes the intent explicit — and keeps
    # them visible if the auto_* flag is ever removed.
    readonly_fields = ("date_joined", "last_login", "updated_at")

    fieldsets = UserAdmin.fieldsets + (
        (
            "KYC profile",
            {
                "fields": ("date_of_birth", "nationality"),
            },
        ),
        (
            "Timestamps",
            {
                # `updated_at` is read-only; shown so admins can see when
                # the row last changed (password change, email update, …).
                "fields": ("updated_at",),
            },
        ),
    )

    add_fieldsets = UserAdmin.add_fieldsets + (
        (
            "KYC profile",
            {
                "fields": ("email", "date_of_birth", "nationality"),
            },
        ),
    )