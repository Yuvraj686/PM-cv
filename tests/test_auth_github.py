import pytest
import os

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
SCREENSHOTS_DIR = "/tmp/screenshots"


class TestGitHubAuth:
    """Test GitHub OAuth UI elements."""

    def test_c1_github_register_button_visible(self, page):
        """C1: GitHub signup button on /register is visible"""
        page.goto(f"{FRONTEND_URL}/register")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="github-signup-btn"]', timeout=5000)
            button = page.locator('[data-testid="github-signup-btn"]')
            assert button.is_visible(), "GitHub signup button should be visible"
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/c1_register_fail.png")
            raise


    def test_c2_github_login_button_visible(self, page):
        """C2: GitHub login button on /login is visible"""
        page.goto(f"{FRONTEND_URL}/login")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="github-login-btn"]', timeout=5000)
            button = page.locator('[data-testid="github-login-btn"]')
            assert button.is_visible(), "GitHub login button should be visible"
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/c2_login_fail.png")
            raise


    def test_c3_github_register_button_clickable(self, page):
        """C3: GitHub signup button is clickable"""
        page.goto(f"{FRONTEND_URL}/register")
        page.wait_for_load_state("networkidle")
        
        try:
            button = page.locator('[data-testid="github-signup-btn"]')
            assert button.is_enabled(), "GitHub signup button should be enabled"
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/c3_fail.png")
            raise


    def test_c4_github_login_button_clickable(self, page):
        """C4: GitHub login button is clickable"""
        page.goto(f"{FRONTEND_URL}/login")
        page.wait_for_load_state("networkidle")
        
        try:
            button = page.locator('[data-testid="github-login-btn"]')
            assert button.is_enabled(), "GitHub login button should be enabled"
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/c4_fail.png")
            raise


    def test_c5_oauth_callback_page(self, page):
        """C5: OAuth callback page loads properly"""
        try:
            page.goto(f"{FRONTEND_URL}/auth/callback")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/c5_fail.png")
            raise


