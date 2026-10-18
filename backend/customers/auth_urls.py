from django.urls import path
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.serializers import AuthTokenSerializer
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.response import Response

from .throttles import LoginThrottle


class ObtainTokenView(ObtainAuthToken):
    """
    POST /api/auth/token/
    Body: { "username": "...", "password": "..." }
    Returns: { "token": "...", "user_id": N, "username": "..." }

    Throttled to prevent credential-stuffing.
    """

    serializer_class = AuthTokenSerializer
    throttle_classes = [LoginThrottle]

    # ObtainAuthToken sets permission_classes = () but inherits
    # DEFAULT_AUTHENTICATION_CLASSES — meaning SessionAuthentication
    # would enforce CSRF on this endpoint for any browser request that
    # carries a session cookie. The endpoint authenticates via the
    # request body, so no per-request authentication is wanted.
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            "token": token.key,
            "user_id": user.pk,
            "username": user.username,
        })


urlpatterns = [
    path("auth/token/", ObtainTokenView.as_view(), name="obtain-token"),
]