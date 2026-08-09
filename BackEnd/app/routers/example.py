from fastapi import APIRouter

from app.schemas.example import ExampleResponse
from app.services.example import get_example_message

router = APIRouter()


@router.get("/example", response_model=ExampleResponse)
async def read_example():
    return ExampleResponse(message=get_example_message())
