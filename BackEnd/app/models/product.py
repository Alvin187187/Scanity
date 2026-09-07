from sqlalchemy import Column, Integer, String, ForeignKey, Table
from sqlalchemy.orm import relationship
from app.database.session import Base


# Association table for the Product <-> Ingredient many-to-many relationship
# (matches product_ingredients junction table in scanity_schema.sql)
product_ingredients = Table(
    "product_ingredients",
    Base.metadata,
    Column("product_id", Integer, ForeignKey("product.product_id"), primary_key=True),
    Column("ingredient_id", Integer, ForeignKey("ingredients.ingredient_id"), primary_key=True),
)


class Product(Base):
    __tablename__ = "product"

    product_id = Column(Integer, primary_key=True, index=True)
    barcode = Column(String, unique=True, index=True, nullable=True)
    product_name = Column(String(200), nullable=False)
    brand = Column(String(25), nullable=True)
    category = Column(String(25), nullable=True)
    ingredients_raw_text = Column(String(255), nullable=True)  # legacy/raw text field

    ingredients = relationship(
        "Ingredient",
        secondary=product_ingredients,
        back_populates="products",
    )


class Ingredient(Base):
    __tablename__ = "ingredients"

    ingredient_id = Column(Integer, primary_key=True, index=True)
    ingredient_name = Column(String(100), nullable=False)
    description = Column(String, nullable=True)
    is_allergen = Column(Integer, nullable=False, default=0)  # 0/1, matches tinyint(1) in schema

    products = relationship(
        "Product",
        secondary=product_ingredients,
        back_populates="ingredients",
    )
