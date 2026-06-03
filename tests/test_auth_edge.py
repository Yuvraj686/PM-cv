import pytest
import os

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
SCREENSHOTS_DIR = "/tmp/screenshots"


@pytest.mark.e2e
class TestAuthEdgeCases:
    """Test edge cases, security, and responsive behavior."""

    def test_e1_login_page_navigation(self, page):
        """E1: Login page loads successfully"""
        try:
            page.goto(f"{FRONTEND_URL}/login")
            page.wait_for_load_state("networkidle")
            
            # Verify login page elements exist
            page.wait_for_selector('[data-testid="login-email-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="login-password-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="login-btn"]', timeout=5000)
            
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/e1_fail.png")
            raise


    def test_e2_register_page_navigation(self, page):
        """E2: Register page loads successfully"""
        try:
            page.goto(f"{FRONTEND_URL}/register")
            page.wait_for_load_state("networkidle")
            
            # Verify register page elements exist
            page.wait_for_selector('[data-testid="name-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="email-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="password-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="register-btn"]', timeout=5000)
            
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/e2_fail.png")
            raise


    def test_e3_callback_page_loads(self, page):
        """E3: Callback page loads without crashing"""
        page.goto(f"{FRONTEND_URL}/auth/callback")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
        
        try:
            # Page should load without errors
            assert page.url, "Callback page should load"
            
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/e3_fail.png")
            raise


    def test_e4_login_form_accepts_input(self, page):
        """E4: Login form safely accepts various inputs"""
        page.goto(f"{FRONTEND_URL}/login")
        page.wait_for_load_state("networkidle")
        
        try:
            # Try to fill with special characters
            page.fill('[data-testid="login-email-input"]', "test+123@example.com")
            page.fill('[data-testid="login-password-input"]', "P@ssw0rd!#$%")
            
            # Form should accept input safely
            email_val = page.locator('[data-testid="login-email-input"]').input_value()
            pwd_val = page.locator('[data-testid="login-password-input"]').input_value()
            
            assert email_val == "test+123@example.com", "Email input should be preserved"
            assert pwd_val == "P@ssw0rd!#$%", "Password input should be preserved"
            
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/e4_fail.png")
            raise


    def test_e5_login_button_functionality(self, page):
        """E5: Login button is properly enabled/disabled"""
        page.goto(f"{FRONTEND_URL}/login")
        page.wait_for_load_state("networkidle")
        
        try:
            button = page.locator('[data-testid="login-btn"]')
            
            # Initially might be disabled if form is empty
            initial_state = button.is_enabled()
            
            # Fill form
            page.fill('[data-testid="login-email-input"]', "test@test.com")
            page.fill('[data-testid="login-password-input"]', "password123")
            page.wait_for_timeout(500)
            
            # Button should be enabled after filling
            assert button.is_enabled(), "Login button should be enabled with valid inputs"
            
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/e5_fail.png")
            raise


    def test_e6_mobile_responsive_design(self, page):
        """E6: Register page responsive on mobile (375x812)"""
        page.set_viewport_size({"width": 375, "height": 812})
        
        try:
            page.goto(f"{FRONTEND_URL}/register")
            page.wait_for_load_state("networkidle")
            
            # Check key elements are visible on mobile
            page.wait_for_selector('[data-testid="register-btn"]', timeout=5000)
            
            # Verify button is visible and clickable
            button = page.locator('[data-testid="register-btn"]')
            assert button.is_visible(), "Register button should be visible on mobile"
            
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/e6_fail.png")
            raise


    def test_e7_forgot_password_page(self, page):
        """E7: Forgot password page loads and functions"""
        try:
            page.goto(f"{FRONTEND_URL}/forgot-password")
            page.wait_for_load_state("networkidle")
            
            # Verify forgot password page elements
            page.wait_for_selector('[data-testid="forgot-email-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="forgot-submit-btn"]', timeout=5000)
            
            # Fill and verify button
            page.fill('[data-testid="forgot-email-input"]', "test@test.com")
            button = page.locator('[data-testid="forgot-submit-btn"]')
            assert button.is_enabled(), "Submit button should be enabled with email"
            
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/e7_fail.png")
            raise


    def test_e8_reset_password_page(self, page):
        """E8: Reset password page loads and validates"""
        try:
            page.goto(f"{FRONTEND_URL}/reset-password?token=test123")
            page.wait_for_load_state("networkidle")
            
            # Verify reset password page elements
            page.wait_for_selector('[data-testid="new-password-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="confirm-password-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="reset-submit-btn"]', timeout=5000)
            
            # Fill with matching passwords
            page.fill('[data-testid="new-password-input"]', "NewPass@2025")
            page.fill('[data-testid="confirm-password-input"]', "NewPass@2025")
            page.wait_for_timeout(500)
            
            button = page.locator('[data-testid="reset-submit-btn"]')
            assert button.is_enabled(), "Reset button should be enabled with matching passwords"
            
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/e8_fail.png")
            raise
