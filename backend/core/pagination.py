"""
Project-wide pagination.

Enables `?page_size=N` on every list endpoint, capped at 100 to prevent
a client from requesting `?page_size=1000000` and DoS'ing the DB.
"""

from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100