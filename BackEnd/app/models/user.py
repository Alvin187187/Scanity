from sqlalchemy import Column, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database.session import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    auth_uid = Column(UUID(as_uuid=True), unique=True, index=True, nullable=False)
    full_name = Column(String(25), nullable=False)
    email = Column(String(35), nullable=False, unique=True)

    health_profile = relationship("HealthProfile", back_populates="user", uselist=False)