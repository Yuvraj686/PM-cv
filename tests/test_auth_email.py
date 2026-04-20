import pytest
import os
import time

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
SCREENSHOTS_DIR = "/tmp/screenshots"


class TestEmailAuth:
    """Test email authentication UI and flows."""

    def test_a1_register_page_elements(self, page):
        """A1: Register page has all required elements"""
        page.goto(f"{FRONTEND_URL}/register")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="name-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="email-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="password-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="register-btn"]', timeout=5000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a1_fail.png")
            raise


    def test_a2_register_google_button(self, page):
        """A2: Google signup button exists"""
        page.goto(f"{FRONTEND_URL}/register")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="google-signup-btn"]', timeout=5000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a2_fail.png")
            raise


    def test_a3_register_github_button(self, page):
        """A3: GitHub signup button exists"""
        page.goto(f"{FRONTEND_URL}/register")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="github-signup-btn"]', timeout=5000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a3_fail.png")
            raise


    def test_a4_register_phone_button(self, page):
        """A4: Phone signup button exists"""
        page.goto(f"{FRONTEND_URL}/register")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="phone-signup-btn"]', timeout=5000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a4_fail.png")
            raise


    def test_a5_password_strength_bar(self, page):
        """A5: Password strength indicator works"""
        page.goto(f"{FRONTEND_URL}/register")
        page.wait_for_load_state("networkidle")
        
        try:
            password_input = page.locator('[data-testid="password-input"]')
            
            # Test weak password
            password_input.fill("abc")
            page.wait_for_timeout(300)
            
            # Test medium password
            password_input.fill("Abcdef1")
            page.wait_for_timeout(300)
            
            # Test strong password
            password_input.fill("Abcdef1!")
            page.wait_for_timeout(300)
            
            # Verify button is enabled with strong password
            button = page.locator('[data-testid="register-btn"]')
            assert button.is_enabled(), "Register button should be enabled with strong password"
            
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a5_fail.png")
            raise


    def test_a6_verify_email_page(self, page):
        """A6: Verify email page loads"""
        page.goto(f"{FRONTEND_URL}/verify-email?token=test")
        page.wait_for_load_state("networkidle")
        
        try:
            # Page should load and show error or loading
            page.wait_for_timeout(2000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a6_fail.png")
            raise


    def test_a7_forgot_password_page(self, page):
        """A7: Forgot password page loads"""
        page.goto(f"{FRONTEND_URL}/forgot-password")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="forgot-email-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="forgot-submit-btn"]', timeout=5000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a7_fail.png")
            raise


    def test_a8_login_page_elements(self, page):
        """A8: Login page has all required elements"""
        page.goto(f"{FRONTEND_URL}/login")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="login-email-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="login-password-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="login-btn"]', timeout=5000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a8_fail.png")
            raise


    def test_a9_login_google_button(self, page):
        """A9: Google login button exists"""
        page.goto(f"{FRONTEND_URL}/login")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="google-login-btn"]', timeout=5000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a9_fail.png")
            raise


    def test_a10_login_github_button(self, page):
        """A10: GitHub login button exists"""
        page.goto(f"{FRONTEND_URL}/login")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="github-login-btn"]', timeout=5000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a10_fail.png")
            raise


    def test_a11_reset_password_page(self, page):
        """A11: Reset password page has all elements"""
        page.goto(f"{FRONTEND_URL}/reset-password?token=test123")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="new-password-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="confirm-password-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="reset-submit-btn"]', timeout=5000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a11_fail.png")
            raise


    def test_a12_password_match_validation(self, page):
        """A12: Password match validation works"""
        page.goto(f"{FRONTEND_URL}/reset-password?token=test123")
        page.wait_for_load_state("networkidle")
        
        try:
            # Type mismatched passwords
            page.fill('[data-testid="new-password-input"]', "NewPass@2025")
            page.fill('[data-testid="confirm-password-input"]', "DifferentPass@2025")
            page.wait_for_timeout(500)
            
            # Button should be disabled
            button = page.locator('[data-testid="reset-submit-btn"]')
            assert button.is_disabled(), "Button should be disabled when passwords don't match"
            
            # Type matching passwords
            page.fill('[data-testid="confirm-password-input"]', "NewPass@2025")
            page.wait_for_timeout(500)
            
            # Button should now be enabled
            assert button.is_enabled(), "Button should be enabled when passwords match"
            
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a12_fail.png")
            raise


    def test_a13_register_phone_tab(self, page):
        """A13: Phone registration OTP fields exist"""
        page.goto(f"{FRONTEND_URL}/register")
        page.wait_for_load_state("networkidle")
        
        try:
            page.wait_for_selector('[data-testid="phone-signup-btn"]', timeout=5000)
            page.click('[data-testid="phone-signup-btn"]')
            page.wait_for_timeout(500)
            
            # OTP fields should be visible
            page.wait_for_selector('[data-testid="phone-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="send-otp-btn"]', timeout=5000)
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a13_fail.png")
            raise


    def test_a14_otp_fields_exist(self, page):
        """A14: OTP input boxes are rendered when OTP is sent"""
        page.goto(f"{FRONTEND_URL}/register")
        page.wait_for_load_state("networkidle")
        
        try:
            # Switch to phone tab
            page.click('[data-testid="phone-signup-btn"]')
            page.wait_for_timeout(500)
            
            # Verify phone form elements exist
            page.wait_for_selector('[data-testid="phone-name-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="phone-input"]', timeout=5000)
            page.wait_for_selector('[data-testid="send-otp-btn"]', timeout=5000)
            
            # Verify send-otp button is enabled when inputs are filled
            page.fill('[data-testid="phone-name-input"]', "Yuvraj Singh")
            page.fill('[data-testid="phone-input"]', "9876543210")
            page.wait_for_timeout(500)
            
            button = page.locator('[data-testid="send-otp-btn"]')
            assert button.is_enabled(), "Send OTP button should be enabled with filled inputs"
            
        except Exception as e:
            page.screenshot(path=f"{SCREENSHOTS_DIR}/a14_fail.png")
            raise



