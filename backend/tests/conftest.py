import os
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
