#!/bin/bash
set -e

echo "================================================"
echo "  ProjectHub Webhook Test Suite"
echo "================================================"
echo ""

# Check backend is running
echo "→ Checking backend is running..."
if ! curl -sf http://localhost:8000/health > /dev/null; then
    echo "❌ Backend is not running at http://localhost:8000"
    echo "   Start it with: docker-compose up -d OR uvicorn main:app --reload --port 8000"
    exit 1
fi
echo "✅ Backend is running"

# Check Celery worker is running (needed for async delivery)
echo "→ Checking Celery worker..."
cd ../../backend
WORKER_COUNT=$(celery -A celery_app inspect ping 2>/dev/null | grep -c "pong" || true)
if [ "$WORKER_COUNT" -eq "0" ]; then
    echo "⚠️  No Celery worker detected — webhook delivery may be synchronous or queued"
    echo "   Start with: celery -A celery_app worker --loglevel=info"
fi
cd ../tests/webhooks

# Install test deps if needed
echo "→ Installing test dependencies..."
pip install pytest httpx --quiet

# Create test user if needed
echo "→ Ensuring test user exists..."
curl -sf -X POST http://localhost:8000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"TestPass123!","name":"Test User"}' \
    > /dev/null 2>&1 || true  # ignore if already exists

echo ""
echo "================================================"
echo "  Running Webhook Tests..."
echo "================================================"
echo ""

# Run tests with verbose output
pytest test_webhooks.py -v --tb=short --no-header -rN 2>&1

EXIT_CODE=$?

echo ""
echo "================================================"
if [ $EXIT_CODE -eq 0 ]; then
    echo "  ✅ ALL WEBHOOK TESTS PASSED"
else
    echo "  ❌ SOME TESTS FAILED — see output above"
fi
echo "================================================"

# Print summary of what was received
echo ""
echo "Webhook deliveries received during tests:"
if [ -f "received_webhooks.json" ]; then
    python3 -c "
import json
data = json.load(open('received_webhooks.json'))
print(f'  Total: {len(data)} deliveries')
for i, w in enumerate(data[-5:], 1):
    event = w.get('payload', {}).get('event', 'unknown')
    sig_ok = '✅' if w['signature_valid'] else '❌'
    print(f'  {i}. {event} | Signature {sig_ok} | {w[\"timestamp\"]}')
"
fi

exit $EXIT_CODE
