from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database.session import Base


class HealthProfile(Base):
    __tablename__ = "health_profiles"

    health_profile_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, unique=True)
    health_condition = Column(String(150), nullable=True)
    dietary_condition = Column(String(255), nullable=True)

    user = relationship("User", back_populates="health_profile")
    allergies = relationship("Allergy", back_populates="health_profile", cascade="all, delete-orphan")


class Allergy(Base):
    __tablename__ = "allergies"

    allergy_id = Column(Integer, primary_key=True, index=True)
    health_profile_id = Column(Integer, ForeignKey("health_profiles.health_profile_id", ondelete="CASCADE"), nullable=False)
    allergen_name = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=True)  # confirmed from live schema: mild/moderate/severe

    health_profile = relationship("HealthProfile", back_populates="allergies")