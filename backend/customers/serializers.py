from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    """
    Write serializer for registration and self-update.

    Registration requires `password` and `password_confirm`. Update does
    not permit password changes — use the `set-password` action.
    """

    password = serializers.CharField(
        write_only=True,
        required=False,
        min_length=8,
        style={"input_type": "password"},
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=False,
        style={"input_type": "password"},
    )

    class Meta:
        model = Customer
        fields = [
            "id",
            "username",
            "email",
            "password",
            "password_confirm",
            "first_name",
            "last_name",
            "date_of_birth",
            "nationality",
        ]
        read_only_fields = ["id"]
        extra_kwargs = {
            "email": {"required": True},
            "username": {"required": True},
        }

    def validate(self, attrs):
        creating = self.instance is None
        pw = attrs.get("password")
        confirm = attrs.get("password_confirm")

        if creating:
            if not pw:
                raise serializers.ValidationError(
                    {"password": ["This field is required."]}
                )
            if not confirm:
                raise serializers.ValidationError(
                    {"password_confirm": ["This field is required."]}
                )
        if pw or confirm:
            if pw != confirm:
                raise serializers.ValidationError(
                    {"password_confirm": ["Passwords do not match."]}
                )
            # Pass the future instance so UserAttributeSimilarityValidator
            # can compare against username/email.
            user_like = self.instance or Customer(**{
                k: v for k, v in attrs.items()
                if k in {"username", "email", "first_name", "last_name"}
            })
            try:
                validate_password(pw, user=user_like)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(
                    {"password": list(exc.messages)}
                )
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm", None)
        password = validated_data.pop("password")
        user = Customer(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        # Password changes go through the `set-password` action.
        validated_data.pop("password", None)
        validated_data.pop("password_confirm", None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance


class CustomerReadSerializer(serializers.ModelSerializer):
    """
    Safe projection for list/detail; never exposes password or hash.

    `latest_screening_status` is set by the `cleared` and `flagged`
    actions on CustomerViewSet (via queryset annotation). It is None
    for any other queryset, so it renders as a null field.
    """

    latest_screening_status = serializers.CharField(
        read_only=True, allow_null=True, required=False,
    )

    class Meta:
        model = Customer
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "date_of_birth",
            "nationality",
            "is_active",
            "is_staff",
            "date_joined",
            "updated_at",
            "latest_screening_status",
        ]
        read_only_fields = fields


class PasswordChangeSerializer(serializers.Serializer):
    """Payload for POST /api/customers/set-password/."""

    current_password = serializers.CharField(
        write_only=True, style={"input_type": "password"},
    )
    new_password = serializers.CharField(
        write_only=True, min_length=8, style={"input_type": "password"},
    )
    new_password_confirm = serializers.CharField(
        write_only=True, style={"input_type": "password"},
    )

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": ["Passwords do not match."]}
            )
        if attrs["new_password"] == attrs["current_password"]:
            raise serializers.ValidationError(
                {"new_password": ["New password must differ from the current one."]}
            )
        try:
            validate_password(
                attrs["new_password"],
                user=self.context["request"].user,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"new_password": list(exc.messages)}
            )
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        # Include "updated_at" so auto_now fires — auto_now fields only
        # update when they're listed in update_fields.
        user.save(update_fields=["password", "updated_at"])
        return user