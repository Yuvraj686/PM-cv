"""
Automated webhook test suite.
Tests the full webhook lifecycle:
1. Registration (CRUD)
2. Signature verification
3. Event delivery
4. Retry logic
5. Delivery logging
6. Security (bad signatures, unauthorized access)
"""

import hashlib
import hmac
import json
import time
import pytest
import httpx as _original_httpx

class _TimeoutClient:
    def __init__(self):
        self.client = _original_httpx.Client(timeout=30.0)
    def post(self, *args, **kwargs):
        return self.client.post(*args, **kwargs)
    def get(self, *args, **kwargs):
        return self.client.get(*args, **kwargs)
    def put(self, *args, **kwargs):
        return self.client.put(*args, **kwargs)
    def patch(self, *args, **kwargs):
        return self.client.patch(*args, **kwargs)
    def delete(self, *args, **kwargs):
        return self.client.delete(*args, **kwargs)

httpx = _TimeoutClient()
from receiver_server import start_receiver, get_received

BASE_URL = "http://localhost:8000"
RECEIVER_URL = "http://127.0.0.1:9999"
WEBHOOK_SECRET = "test-webhook-secret-1234"

# ── Helpers ──────────────────────────────────────────────────────────────────

def verify_signature(payload: dict, signature_header: str, secret: str) -> bool:
    body = json.dumps(payload, separators=(",", ":")).encode()
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)

def wait_for_delivery(expected_count=1, timeout=10):
    """Poll until the receiver has the expected number of webhooks."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        received = get_received()
        if len(received) >= expected_count:
            return received
        time.sleep(0.5)
    return get_received()

# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def auth_headers():
    """Get a valid JWT for test user."""
    r = httpx.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test@example.com",
        "password": "TestPass123!"
    })
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(scope="session")
def test_project(auth_headers):
    """Create a test project."""
    r = httpx.post(f"{BASE_URL}/api/projects", 
        headers=auth_headers,
        json={"name": "Webhook Test Project", "description": "Auto-test"}
    )
    assert r.status_code == 201, f"Project creation failed: {r.text}"
    project = r.json()
    yield project
    # Cleanup
    httpx.delete(f"{BASE_URL}/api/projects/{project['id']}", headers=auth_headers)

@pytest.fixture(autouse=True)
def receiver(request):
    """Start the local receiver before each test."""
    sequence = getattr(request, "param", None)
    server = start_receiver(port=9999, response_sequence=sequence)
    yield server
    server.shutdown()

@pytest.fixture
def registered_webhook(auth_headers, test_project):
    """Register a webhook and return it."""
    r = httpx.post(
        f"{BASE_URL}/api/projects/{test_project['id']}/webhooks",
        headers=auth_headers,
        json={
            "url": RECEIVER_URL,
            "secret": WEBHOOK_SECRET,
            "events": ["task_created", "task_updated", "task_moved", "member_invited"],
            "active": True
        }
    )
    assert r.status_code == 201, f"Webhook registration failed: {r.text}"
    webhook = r.json()
    yield webhook
    # Cleanup
    httpx.delete(
        f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{webhook['id']}",
        headers=auth_headers
    )

# ── Tests: Registration ───────────────────────────────────────────────────────

class TestWebhookRegistration:
    def test_create_webhook(self, auth_headers, test_project):
        """Can register a webhook with valid data."""
        r = httpx.post(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks",
            headers=auth_headers,
            json={"url": "http://localhost:9999", "secret": "abc", "events": ["task_created"], "active": True}
        )
        assert r.status_code == 201
        data = r.json()
        assert "id" in data
        assert data["url"] == "http://localhost:9999"
        assert data["active"] is True
        # Secret must NOT be returned in plaintext
        assert "secret" not in data or data.get("secret") != "abc"
        # Cleanup
        httpx.delete(f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{data['id']}", headers=auth_headers)

    def test_list_webhooks(self, auth_headers, test_project, registered_webhook):
        """Listed webhooks include the registered one."""
        r = httpx.get(f"{BASE_URL}/api/projects/{test_project['id']}/webhooks", headers=auth_headers)
        assert r.status_code == 200
        ids = [w["id"] for w in r.json()]
        assert registered_webhook["id"] in ids

    def test_update_webhook(self, auth_headers, test_project, registered_webhook):
        """Can update webhook URL and events."""
        r = httpx.put(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{registered_webhook['id']}",
            headers=auth_headers,
            json={"url": "http://localhost:9999/updated", "events": ["task_created"], "active": True}
        )
        assert r.status_code == 200
        assert r.json()["url"] == "http://localhost:9999/updated"

    def test_delete_webhook(self, auth_headers, test_project):
        """Can delete a webhook."""
        r = httpx.post(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks",
            headers=auth_headers,
            json={"url": "http://localhost:9999", "secret": "x", "events": ["task_created"], "active": True}
        )
        webhook_id = r.json()["id"]
        r2 = httpx.delete(f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{webhook_id}", headers=auth_headers)
        assert r2.status_code == 204

    def test_invalid_url_rejected(self, auth_headers, test_project):
        """Webhook with invalid URL is rejected."""
        r = httpx.post(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks",
            headers=auth_headers,
            json={"url": "not-a-url", "secret": "x", "events": ["task_created"], "active": True}
        )
        assert r.status_code == 422

    def test_unknown_event_rejected(self, auth_headers, test_project):
        """Webhook with unknown event type is rejected."""
        r = httpx.post(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks",
            headers=auth_headers,
            json={"url": "http://localhost:9999", "secret": "x", "events": ["does_not_exist"], "active": True}
        )
        assert r.status_code in (400, 422)

    def test_unauthorized_cannot_register(self, test_project):
        """Unauthenticated request cannot register a webhook."""
        r = httpx.post(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks",
            json={"url": "http://localhost:9999", "secret": "x", "events": ["task_created"], "active": True}
        )
        assert r.status_code == 401

# ── Tests: Delivery ───────────────────────────────────────────────────────────

class TestWebhookDelivery:
    def test_task_created_triggers_webhook(self, auth_headers, test_project, registered_webhook):
        """Creating a task fires a webhook to the registered URL."""
        r = httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Webhook trigger task", "status": "todo", "priority": "medium"}
        )
        assert r.status_code == 201
        task_id = r.json()["id"]
        
        received = wait_for_delivery(expected_count=1)
        assert len(received) >= 1, "No webhook was delivered"
        
        payload = received[-1]["payload"]
        assert payload["event"] == "task_created"
        assert payload["project_id"] == test_project["id"]
        assert payload["data"]["target_id"] == task_id
        assert "timestamp" in payload

    def test_task_moved_triggers_webhook(self, auth_headers, test_project, registered_webhook):
        """Moving a task (status change) fires a task_moved webhook."""
        # Create task
        task = httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Task to move", "status": "todo", "priority": "low"}
        ).json()
        
        # Clear received log by restarting receiver (handled by fixture)
        # Update status
        httpx.put(
            f"{BASE_URL}/api/tasks/{task['id']}",
            headers=auth_headers,
            json={"status": "in_progress"}
        )
        
        received = wait_for_delivery(expected_count=2)  # created + moved
        events = [w["payload"]["event"] for w in received]
        assert "task_moved" in events or "task_updated" in events

    def test_webhook_payload_structure(self, auth_headers, test_project, registered_webhook):
        """Webhook payload has all required fields."""
        httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Structure test task", "status": "todo", "priority": "high"}
        )
        
        received = wait_for_delivery(expected_count=1)
        payload = received[-1]["payload"]
        
        required_fields = ["event", "project_id", "data", "timestamp"]
        for field in required_fields:
            assert field in payload, f"Missing field: {field}"
        
        assert isinstance(payload["timestamp"], str)
        assert isinstance(payload["data"], dict)

    def test_inactive_webhook_not_triggered(self, auth_headers, test_project):
        """An inactive webhook does not receive deliveries."""
        # Register inactive webhook
        r = httpx.post(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks",
            headers=auth_headers,
            json={"url": RECEIVER_URL, "secret": WEBHOOK_SECRET, "events": ["task_created"], "active": False}
        )
        webhook_id = r.json()["id"]
        
        # Create a task
        httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Should not trigger inactive webhook", "status": "todo", "priority": "low"}
        )
        
        time.sleep(3)  # Wait to confirm nothing arrives
        received = get_received()
        assert len(received) == 0, f"Inactive webhook was triggered: {received}"
        
        # Cleanup
        httpx.delete(f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{webhook_id}", headers=auth_headers)

    def test_only_subscribed_events_delivered(self, auth_headers, test_project):
        """Webhook only receives events it subscribed to."""
        # Register webhook for task_created ONLY
        r = httpx.post(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks",
            headers=auth_headers,
            json={"url": RECEIVER_URL, "secret": WEBHOOK_SECRET, "events": ["task_created"], "active": True}
        )
        webhook_id = r.json()["id"]
        
        # Create task (should trigger)
        task = httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Subscribed event task", "status": "todo", "priority": "low"}
        ).json()
        
        # Move task (should NOT trigger — not subscribed to task_moved)
        httpx.put(
            f"{BASE_URL}/api/tasks/{task['id']}",
            headers=auth_headers,
            json={"status": "in_progress"}
        )
        
        received = wait_for_delivery(expected_count=1)
        time.sleep(2)  # Extra wait to confirm no extra delivery
        
        events = [w["payload"]["event"] for w in get_received()]
        assert "task_created" in events
        assert "task_moved" not in events and "task_updated" not in events
        
        # Cleanup
        httpx.delete(f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{webhook_id}", headers=auth_headers)

# ── Tests: Signature Verification ────────────────────────────────────────────

class TestSignatureVerification:
    def test_signature_is_present(self, auth_headers, test_project, registered_webhook):
        """Every webhook delivery includes a signature header."""
        httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Sig test task", "status": "todo", "priority": "low"}
        )
        received = wait_for_delivery(expected_count=1)
        assert len(received) >= 1
        assert "X-ProjectHub-Signature" in received[-1]["headers"] or \
               "x-projecthub-signature" in {k.lower(): v for k, v in received[-1]["headers"].items()}

    def test_signature_is_valid(self, auth_headers, test_project, registered_webhook):
        """The HMAC-SHA256 signature is correct for the delivered payload."""
        httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Sig validity task", "status": "todo", "priority": "low"}
        )
        received = wait_for_delivery(expected_count=1)
        entry = received[-1]
        
        assert entry["signature_valid"] is True, \
            f"Signature was invalid! Header: {entry['signature_header']}"

    def test_different_secrets_produce_different_signatures(self, auth_headers, test_project):
        """Two webhooks with different secrets produce different signatures for the same event."""
        # Register two webhooks with different secrets
        w1 = httpx.post(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks",
            headers=auth_headers,
            json={"url": RECEIVER_URL, "secret": "secret-AAA", "events": ["task_created"], "active": True}
        ).json()
        w2 = httpx.post(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks",
            headers=auth_headers,
            json={"url": RECEIVER_URL, "secret": "secret-BBB", "events": ["task_created"], "active": True}
        ).json()
        
        # Trigger one event
        httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Dual secret task", "status": "todo", "priority": "low"}
        )
        
        received = wait_for_delivery(expected_count=2)
        sigs = [entry["signature_header"] for entry in received]
        assert len(set(sigs)) == 2, "Both webhooks produced the same signature — secret is not being used!"
        
        httpx.delete(f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{w1['id']}", headers=auth_headers)
        httpx.delete(f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{w2['id']}", headers=auth_headers)

# ── Tests: Retry Logic ────────────────────────────────────────────────────────

class TestRetryLogic:
    @pytest.mark.parametrize("receiver", [[500, 500, 200]], indirect=True)
    def test_retries_on_5xx(self, auth_headers, test_project, registered_webhook, receiver):
        """Webhook is retried up to 3 times on 5xx responses."""
        httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Retry test task", "status": "todo", "priority": "low"}
        )
        # Wait longer — retries have backoff delays
        received = wait_for_delivery(expected_count=3, timeout=60)
        assert len(received) == 3, f"Expected 3 attempts (2 failures + 1 success), got {len(received)}"

    @pytest.mark.parametrize("receiver", [[500, 500, 500, 500]], indirect=True)
    def test_stops_after_max_retries(self, auth_headers, test_project, registered_webhook, receiver):
        """Webhook stops retrying after 3 failed attempts (does not retry forever)."""
        httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Max retry task", "status": "todo", "priority": "low"}
        )
        # Wait long enough for all retries
        time.sleep(45)
        received = get_received()
        assert len(received) == 3, f"Expected exactly 3 attempts, got {len(received)}"

    @pytest.mark.parametrize("receiver", [[200]], indirect=True)
    def test_successful_delivery_no_retry(self, auth_headers, test_project, registered_webhook, receiver):
        """Webhook with 200 response is not retried."""
        httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Success no retry task", "status": "todo", "priority": "low"}
        )
        received = wait_for_delivery(expected_count=1)
        time.sleep(5)  # Extra wait to confirm no retry
        assert len(get_received()) == 1, "Successful delivery was retried — it should not be"

# ── Tests: Delivery Logging ───────────────────────────────────────────────────

class TestDeliveryLogging:
    def test_successful_delivery_is_logged(self, auth_headers, test_project, registered_webhook):
        """A successful delivery is recorded in webhook_deliveries."""
        httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Log test task", "status": "todo", "priority": "low"}
        )
        wait_for_delivery(expected_count=1)
        
        # Check the delivery log via API
        r = httpx.get(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{registered_webhook['id']}/deliveries",
            headers=auth_headers
        )
        assert r.status_code == 200
        deliveries = r.json()
        assert len(deliveries) >= 1
        
        latest = deliveries[0]
        assert latest["status_code"] == 200
        assert latest["success"] is True
        assert "delivered_at" in latest

    def test_failed_delivery_is_logged(self, auth_headers, test_project, registered_webhook, receiver):
        """A failed delivery attempt is recorded with the error status code."""
        # Stop the receiver so delivery fails
        receiver.shutdown()
        
        httpx.post(
            f"{BASE_URL}/api/tasks",
            headers=auth_headers,
            json={"project_id": test_project["id"], "title": "Failed delivery task", "status": "todo", "priority": "low"}
        )
        
        time.sleep(15)  # Wait for attempts
        
        r = httpx.get(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{registered_webhook['id']}/deliveries",
            headers=auth_headers
        )
        assert r.status_code == 200
        deliveries = r.json()
        failed = [d for d in deliveries if not d.get("success")]
        assert len(failed) >= 1
        assert failed[0]["status_code"] in (None, 0, 500, 502, 503, 504)  # connection error or server error

# ── Tests: Test Webhook Endpoint ─────────────────────────────────────────────

class TestWebhookTestEndpoint:
    def test_test_endpoint_fires_webhook(self, auth_headers, test_project, registered_webhook):
        """POST /webhooks/{id}/test fires a test event immediately."""
        r = httpx.post(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{registered_webhook['id']}/test",
            headers=auth_headers
        )
        assert r.status_code == 200
        
        received = wait_for_delivery(expected_count=1)
        assert len(received) >= 1
        payload = received[-1]["payload"]
        assert payload["event"] == "test" or payload.get("is_test") is True

    def test_test_endpoint_validates_signature(self, auth_headers, test_project, registered_webhook):
        """Test event also carries a valid HMAC signature."""
        httpx.post(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{registered_webhook['id']}/test",
            headers=auth_headers
        )
        received = wait_for_delivery(expected_count=1)
        assert received[-1]["signature_valid"] is True

# ── Tests: Security ───────────────────────────────────────────────────────────

class TestWebhookSecurity:
    def test_non_member_cannot_list_webhooks(self, test_project):
        """Unauthenticated user cannot list webhooks."""
        r = httpx.get(f"{BASE_URL}/api/projects/{test_project['id']}/webhooks")
        assert r.status_code == 401

    def test_internal_urls_blocked(self, auth_headers, test_project):
        """Webhook URLs pointing to internal/private IPs are rejected (SSRF protection)."""
        ssrf_urls = [
            "http://169.254.169.254/latest/meta-data/",  # AWS metadata
            "http://10.0.0.1/admin",
            "http://192.168.1.1/",
            "http://127.0.0.1:6379/",  # Redis
            "http://0.0.0.0/",
        ]
        for url in ssrf_urls:
            r = httpx.post(
                f"{BASE_URL}/api/projects/{test_project['id']}/webhooks",
                headers=auth_headers,
                json={"url": url, "secret": "x", "events": ["task_created"], "active": True}
            )
            assert r.status_code in (400, 422), \
                f"SSRF URL was accepted: {url} — this is a security vulnerability!"

    def test_webhook_secret_not_exposed_in_api(self, auth_headers, test_project, registered_webhook):
        """The webhook secret is never returned in plaintext from any API endpoint."""
        # Check list endpoint
        webhooks = httpx.get(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks",
            headers=auth_headers
        ).json()
        for w in webhooks:
            assert w.get("secret") != WEBHOOK_SECRET, "Secret exposed in list endpoint!"
        
        # Check get single endpoint
        w = httpx.get(
            f"{BASE_URL}/api/projects/{test_project['id']}/webhooks/{registered_webhook['id']}",
            headers=auth_headers
        ).json()
        assert w.get("secret") != WEBHOOK_SECRET, "Secret exposed in get endpoint!"
