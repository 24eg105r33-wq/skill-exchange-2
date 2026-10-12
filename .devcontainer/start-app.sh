#!/usr/bin/env bash
set -euo pipefail

if curl --fail --silent http://127.0.0.1:8080/api/health >/dev/null; then
  exit 0
fi

nohup mvn --batch-mode --no-transfer-progress --file backend/pom.xml spring-boot:run \
  >/tmp/student-skill-exchange.log 2>&1 &
app_pid=$!

for attempt in {1..60}; do
  if curl --fail --silent http://127.0.0.1:8080/api/health >/dev/null; then
    exit 0
  fi
  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat /tmp/student-skill-exchange.log
    echo "The backend stopped before it became healthy." >&2
    exit 1
  fi
  sleep 2
done

cat /tmp/student-skill-exchange.log
echo "The backend did not become healthy within 120 seconds." >&2
exit 1
