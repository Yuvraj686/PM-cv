"""
Local webhook receiver for testing.
Starts an HTTP server that:
- Receives incoming webhook POST requests
- Validates the HMAC-SHA256 signature
- Logs every received payload to a JSON file
- Returns configurable status codes (for testing retry logic)
"""

import hashlib
import hmac
import json
import time
import datetime
datetime.now = datetime.datetime.now
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import threading
import sys

RECEIVED_LOG = Path("tests/webhooks/received_webhooks.json")
SIGNATURE_HEADER = "X-ProjectHub-Signature"
SECRET = "test-webhook-secret-1234"  # matches what we'll register

# Control variable — set to a list of status codes to return in sequence
# e.g. [500, 500, 200] simulates two failures then success (tests retry logic)
RESPONSE_SEQUENCE = []
response_index = 0
response_lock = threading.Lock()

class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        global response_index
        
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)
        
        # Validate signature
        signature_header = self.headers.get(SIGNATURE_HEADER, "")
        expected_sig = "sha256=" + hmac.new(
            SECRET.encode(), body, hashlib.sha256
        ).hexdigest()
        sig_valid = hmac.compare_digest(signature_header, expected_sig)
        
        # Parse payload
        try:
            payload = json.loads(body)
        except Exception:
            payload = {"raw": body.decode()}
        
        # Log the received webhook
        entry = {
            "timestamp": datetime.now(datetime.UTC).isoformat(),
            "path": self.path,
            "signature_valid": sig_valid,
            "signature_header": signature_header,
            "payload": payload,
            "headers": dict(self.headers),
        }
        
        log = []
        if RECEIVED_LOG.exists():
            log = json.loads(RECEIVED_LOG.read_text())
        log.append(entry)
        RECEIVED_LOG.write_text(json.dumps(log, indent=2))
        
        # Determine response code
        with response_lock:
            if RESPONSE_SEQUENCE and response_index < len(RESPONSE_SEQUENCE):
                status = RESPONSE_SEQUENCE[response_index]
                response_index += 1
            else:
                status = 200
        
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"received": True, "status": status}).encode())
    
    def log_message(self, format, *args):
        pass  # suppress default logging


def start_receiver(port=9999, response_sequence=None):
    global RESPONSE_SEQUENCE, response_index
    RESPONSE_SEQUENCE = response_sequence or []
    response_index = 0
    RECEIVED_LOG.parent.mkdir(parents=True, exist_ok=True)
    RECEIVED_LOG.write_text("[]")
    server = HTTPServer(("127.0.0.1", port), WebhookHandler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()
    return server


def get_received():
    if not RECEIVED_LOG.exists():
        return []
    return json.loads(RECEIVED_LOG.read_text())


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9999
    print(f"Webhook receiver listening on http://localhost:{port}")
    start_receiver(port)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Stopped.")
