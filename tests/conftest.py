import pytest
import os
import requests
from pathlib import Path
from playwright.sync_api import sync_playwright, Browser, Page
from datetime import datetime, timedelta
import time

# Create temp directories for screenshots and emails
SCREENSHOTS_DIR = "/tmp/screenshots"
EMAILS_DIR = "/tmp/emails"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(EMAILS_DIR, exist_ok=True)

API_URL = os.getenv("NEXT_PUBLIC_API_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


@pytest.fixture(scope="session")
def browser():
    """Create a browser instance for the entire test session."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        yield browser
        browser.close()


@pytest.fixture
def page(browser):
    """Create a new page for each test."""
    page = browser.new_page()
    yield page
    page.close()


@pytest.fixture
def api_client():
    """Create an API client for direct backend requests."""
    class APIClient:
        def __init__(self, base_url=API_URL):
            self.base_url = base_url
            self.session = requests.Session()
        
        def get(self, endpoint, **kwargs):
            return self.session.get(f"{self.base_url}{endpoint}", **kwargs)
        
        def post(self, endpoint, **kwargs):
            return self.session.post(f"{self.base_url}{endpoint}", **kwargs)
        
        def put(self, endpoint, **kwargs):
            return self.session.put(f"{self.base_url}{endpoint}", **kwargs)
        
        def delete(self, endpoint, **kwargs):
            return self.session.delete(f"{self.base_url}{endpoint}", **kwargs)
    
    return APIClient()


@pytest.fixture
def get_user_by_email():
    """Get a user from database via API (admin endpoint or similar)."""
    def _get_user(email: str):
        try:
            # This would require an admin endpoint to fetch user data
            # For now, we'll return None - the tests will verify via API responses instead
            return None
        except Exception as e:
            print(f"Error getting user: {e}")
            return None
    
    return _get_user


@pytest.fixture
def set_token_expired():
    """Set a token expiration to the past (requires admin access)."""
    def _set_expired(user_id: int, token_type: str, value=None):
        try:
            # This would require an admin endpoint
            # For now, this is a placeholder
            pass
        except Exception as e:
            print(f"Error setting token expired: {e}")
    
    return _set_expired


@pytest.fixture
def get_token_from_db():
    """Get a token from database via API."""
    def _get_token(user_email: str, token_type: str):
        try:
            # This would require an admin endpoint to fetch token data
            # For now, return None - tests will handle differently
            return None
        except Exception as e:
            print(f"Error getting token from DB: {e}")
            return None
    
    return _get_token


@pytest.fixture
def clean_user():
    """Delete a user from database via API (requires admin access)."""
    def _delete(email: str):
        try:
            # This would require an admin endpoint
            # For now, this is a placeholder
            pass
        except Exception as e:
            print(f"Error cleaning user: {e}")
    
    return _delete


@pytest.fixture
def wait_for_backend():
    """Wait for backend to be ready."""
    def _wait(timeout=30):
        start = time.time()
        while time.time() - start < timeout:
            try:
                response = requests.get(f"{API_URL}/health", timeout=2)
                if response.status_code == 200:
                    return True
            except:
                pass
            time.sleep(1)
        return False
    
    return _wait


