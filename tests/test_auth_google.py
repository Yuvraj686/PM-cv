import pytest
import os

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
SCREENSHOTS_DIR = "/tmp/screenshots"


@pytest.mark.e2e
class TestGoogleAuth:
    """Test Google OAuth UI elements."""

    def test_b1_google_register_button_visible(self, page):
        """B1: Google signup button on /register is visible"""
        page.goto(f"{FRONTEND_URL}/register")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="google-signup-btn"]', timeout=5000)
            button = page.locator('[data-testid="google-signup-btn"]')
            assert button.is_visible(), "Google signup button should be visible"
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/b1_register_fail.png")
            raise


    def test_b2_google_login_button_visible(self, page):
        """B2: Google login button on /login is visible"""
        page.goto(f"{FRONTEND_URL}/login")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="google-login-btn"]', timeout=5000)
            button = page.locator('[data-testid="google-login-btn"]')
            assert button.is_visible(), "Google login button should be visible"
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/b2_login_fail.png")
            raise


    def test_b3_google_register_button_clickable(self, page):
        """B3: Google signup button is clickable"""
        page.goto(f"{FRONTEND_URL}/register")
        page.wait_for_load_state("networkidle")
        
        try:
            button = page.locator('[data-testid="google-signup-btn"]')
            assert button.is_enabled(), "Google signup button should be enabled"
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/b3_fail.png")
            raise


    def test_b4_google_login_button_clickable(self, page):
        """B4: Google login button is clickable"""
        page.goto(f"{FRONTEND_URL}/login")
        page.wait_for_load_state("networkidle")
        
        try:
            button = page.locator('[data-testid="google-login-btn"]')
            assert button.is_enabled(), "Google login button should be enabled"
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/b4_fail.png")
            raise


    def test_b5_auth_callback_page_exists(self, page):
        """B5: OAuth callback page loads"""
        try:
            page.goto(f"{FRONTEND_URL}/auth/callback")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/b5_fail.png")
            raise


