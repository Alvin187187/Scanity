from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.database.session import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    # Links to the Supabase Auth user — populated at registration time.
    # Kept separate from user_id (Option B) rather than replacing it, since
    # user_id is an existing int PK with FKs elsewhere (health_profiles,
    # scan_history) that a destructive type change would break.
    auth_uid = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String(25), nullable=False)
    email = Column(String(35), nullable=False, unique=True)
    # No password column — dropped per Issue #143; Supabase Auth owns credentials.

    health_profile = relationship("HealthProfile", back_populates="user", uselist=False)