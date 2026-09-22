import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database.session import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True), primary_key=True)
    full_name = Column(String(120))
    email = Column(String(255))


class AllergyType(Base):
    __tablename__ = "allergy_types"

    allergy_type_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    allergen_name = Column(String(50))


class HealthProfile(Base):
    __tablename__ = "health_profiles"

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id"),
        primary_key=True,
    )


class HealthConditionType(Base):
    __tablename__ = "health_condition_types"

    condition_type_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    condition_name = Column(String(100))


product_ingredients = Table(
    "product_ingredients",
    Base.metadata,
    Column("product_id", UUID(as_uuid=True), ForeignKey("products.product_id")),
    Column(
        "ingredient_id",
        UUID(as_uuid=True),
        ForeignKey("ingredients.ingredient_id"),
    ),
)


class Product(Base):
    __tablename__ = "products"

    product_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    barcode = Column(String(20), unique=True, index=True)
    product_name = Column(String(200))
    brand = Column(String(25))
    category = Column(String(25))
    ingredients_raw_text = Column(Text)

    ingredients = relationship(
        "Ingredient",
        secondary=product_ingredients,
        back_populates="products",
    )


class Ingredient(Base):
    __tablename__ = "ingredients"

    ingredient_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ingredient_name = Column(String(100))
    common_name = Column(String(100))
    description = Column(Text)
    is_allergen = Column(Boolean)

    products = relationship(
        "Product",
        secondary=product_ingredients,
        back_populates="ingredients",
    )


class NutritionRule(Base):
    __tablename__ = "nutrition_rules"

    rule_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_name = Column(String(100))
    nutrient = Column(String(255))
    limit_value = Column(Integer)
    description = Column(String(255))


class ScanHistory(Base):
    __tablename__ = "scan_histories"

    scan_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"))
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.product_id"))
    scan_date = Column(DateTime)
    scan_method = Column(String(50))


user_allergies = Table(
    "user_allergies",
    Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.user_id")),
    Column(
        "allergy_type_id",
        UUID(as_uuid=True),
        ForeignKey("allergy_types.allergy_type_id"),
    ),
    Column("severity", String(20)),
)


user_health_conditions = Table(
    "user_health_conditions",
    Base.metadata,
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.user_id")),
    Column(
        "condition_type_id",
        UUID(as_uuid=True),
        ForeignKey("health_condition_types.condition_type_id"),
    ),
)


product_nutrition_flags = Table(
    "product_nutrition_flags",
    Base.metadata,
    Column("product_id", UUID(as_uuid=True), ForeignKey("products.product_id")),
    Column("rule_id", UUID(as_uuid=True), ForeignKey("nutrition_rules.rule_id")),
)
