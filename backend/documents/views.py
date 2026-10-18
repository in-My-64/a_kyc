from django.http import HttpResponse
from rest_framework import mixins, parsers, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response

from .models import Document, Selfie
from .serializers import DocumentSerializer, SelfieSerializer

try:
    from django_filters.rest_framework import DjangoFilterBackend
    _HAS_FILTER = True
except ImportError:
    DjangoFilterBackend = None
    _HAS_FILTER = False


class DocumentViewSet(viewsets.ModelViewSet):
    """
    POST   /api/documents/         upload (multipart)
    GET    /api/documents/         list own (staff: list all)
    GET    /api/documents/<id>/    retrieve own (staff: any)
    PATCH  /api/documents/<id>/    update doc_type only
    DELETE /api/documents/<id>/    delete own (staff: any)
    GET    /api/documents/<id>/preview/   PNG preview (page 1)

    Query parameters:
      ?search=<text>       — filename substring
      ?doc_type=<choice>   — exact match (requires django-filter)
      ?ordering=<field>    — uploaded_at, id
    """

    serializer_class = DocumentSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [
        parsers.MultiPartParser,
        parsers.FormParser,
        parsers.JSONParser,
    ]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    filter_backends = [SearchFilter, OrderingFilter]
    if _HAS_FILTER:
        filter_backends = [DjangoFilterBackend] + filter_backends
        filterset_fields = ["doc_type"]

    search_fields = ["file", "doc_type"]
    ordering_fields = ["uploaded_at", "id"]
    ordering = ["-uploaded_at", "-id"]

    def get_queryset(self):
        # Staff see every customer's documents (matches KYCWorkflowViewSet
        # and AuditLogViewSet conventions). Non-staff see only their own.
        # perform_create still assigns customer=request.user, so an upload
        # by a staff account belongs to that staff account — the widened
        # read scope does not affect who owns newly created rows.
        user = self.request.user
        qs = Document.objects.all()
        if not user.is_staff:
            qs = qs.filter(customer=user)
        return qs

    def perform_create(self, serializer):
        serializer.save(customer=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="preview")
    def preview(self, request, pk=None):
        """
        Return a PNG rendering of page 1 of the document.

        For image formats a browser can render natively (PNG, JPEG, WebP,
        GIF, BMP, AVIF), the original file is served as-is. For PDFs and
        formats browsers can't render (TIFF, HEIC), we decode page 1 and
        re-encode as PNG.

        The frontend uses this instead of pointing an <iframe> at the
        PDF, because iframes trigger the browser's native PDF viewer
        (Firefox's PDF.js) and its toolbar is visible inside the preview.
        """
        doc = self.get_object()
        if not doc.file:
            raise NotFound("Document has no file.")

        try:
            path = doc.file.path
        except (ValueError, NotImplementedError):
            raise NotFound("Document file is not accessible.")

        name = (doc.file.name or "").lower()
        image_exts = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif")

        # Native image — let the browser render it directly.
        if name.endswith(image_exts):
            from django.http import FileResponse
            return FileResponse(open(path, "rb"))

        # PDF, TIFF, HEIC — decode page 1 and re-encode as PNG.
        from .preprocess_utils import (
            _load_grayscale,  # noqa: PLC2701 (internal helper, single-use)
        )

        try:
            # _load_grayscale returns (gray, source_kind, pages_ignored, is_scanned);
            # passing the whole tuple to cv2.imencode below was a 500.
            gray, *_ = _load_grayscale(path)
        except Exception as exc:
            raise NotFound(f"Preview could not be generated: {exc}")

        # Encode the grayscale array as a PNG via OpenCV.
        import cv2
        ok, buf = cv2.imencode(".png", gray)
        if not ok:
            raise NotFound("Preview encoding failed.")

        return HttpResponse(buf.tobytes(), content_type="image/png")

class SelfieViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    POST /api/selfies/     upload a selfie, returns {id, file_hash, uploaded_at}
    """
    queryset = Selfie.objects.none()
    serializer_class = SelfieSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]
