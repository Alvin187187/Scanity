# app/models/__init__.py
# Import every model module here so SQLAlchemy registers all mapped classes
# before any relationship() string reference (e.g. "HealthProfile") is resolved.
# Without this, models that are never directly imported elsewhere in the app
# cause InvalidRequestError the first time a relationship tries to look them up.

from app.models.user import User
from app.models.health_profile import HealthProfile, Allergy
from app.models.product import Product, Ingredient

__all__ = [
    "User",
    "HealthProfile",
    "Allergy",
    "Product",
    "Ingredient",
]