"""
Root package for the KYC backend.

Intentionally empty. This file exists only to make `backend/` a regular
package (rather than a namespace package), which Django's app registry
and the test runner both require.

Do NOT add imports here — anything in this module runs on every
`import backend...`, including Django startup, which risks circular
imports with settings loading. Per-app `__init__.py` files are the
right place for that (see backend/kyc_system/__init__.py for the one
legitimate exception).
"""