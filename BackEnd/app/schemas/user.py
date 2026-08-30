from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    user_id: int
    full_name: str
    username: str
    email: EmailStr

    class Config:
        from_attributes = True