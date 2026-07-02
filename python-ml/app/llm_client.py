"""
app/llm_client.py

Returns an AsyncOpenAI client pointed at Groq's OpenAI-compatible endpoint.
Groq is free — sign up at https://console.groq.com, no credit card needed.
"""

from openai import AsyncOpenAI
from app.config import get_settings


def get_llm_client() -> AsyncOpenAI:
    settings = get_settings()
    if not settings.llm_api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. "
            "Get a free key at https://console.groq.com and add it to your .env"
        )
    return AsyncOpenAI(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
    )
