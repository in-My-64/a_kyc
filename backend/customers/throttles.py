"""
Rate-limit scopes for auth-adjacent endpoints.

Registration and login are the two most abusable endpoints — the first
spawns accounts, the second is a password oracle. Both get tighter
limits than the default user/anon throttles.
"""

from rest_framework.throttling import AnonRateThrottle


class RegisterThrottle(AnonRateThrottle):
    scope = "register"


class LoginThrottle(AnonRateThrottle):
    scope = "login"