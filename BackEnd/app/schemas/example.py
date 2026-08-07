from pydantic import BaseModel


class ExampleResponse(BaseModel):
    message: str
