"""Compatibility import. Use app.models.schema — the ERD is the only live schema."""

from app.models.schema import Ingredient, Product, product_ingredients

__all__ = ["Ingredient", "Product", "product_ingredients"]
