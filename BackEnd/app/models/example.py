from sqlalchemy import Column, Integer, String

from backend.app.database.session import Base


class ExampleModel(Base):
    __tablename__ = "examples"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
