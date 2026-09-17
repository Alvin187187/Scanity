"""The finalized ERD is the only live SQLAlchemy schema."""

from sqlalchemy.dialects.postgresql import UUID

from app.models.product import Product as CompatProduct
from app.models.schema import (
    HealthProfile,
    Ingredient,
    Product,
    ScanHistory,
    User,
    product_ingredients,
)


def test_user_and_health_profile_use_uuid_like_supabase_auth():
    assert User.__tablename__ == "users"
    assert HealthProfile.__tablename__ == "health_profiles"
    assert isinstance(User.user_id.type, UUID)
    assert isinstance(HealthProfile.user_id.type, UUID)


def test_product_and_ingredient_follow_the_erd_not_the_old_int_pk_tables():
    assert Product.__tablename__ == "products"
    assert Ingredient.__tablename__ == "ingredients"
    assert ScanHistory.__tablename__ == "scan_histories"
    assert isinstance(Product.product_id.type, UUID)
    assert isinstance(Ingredient.ingredient_id.type, UUID)
    assert isinstance(ScanHistory.scan_id.type, UUID)
    assert product_ingredients.c.product_id.type.python_type is not int


def test_legacy_product_import_is_the_erd_model():
    assert CompatProduct is Product
    assert CompatProduct.__tablename__ == "products"
