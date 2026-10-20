#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
qa_image="${1:-efemero:local}"
qa_name="efemero-smoke-$$"
qa_volume="${qa_name}-data"
qa_memory="${qa_name}-memory"
qa_memory_volume="${qa_memory}-data"
qa_directory="$(mktemp -d)"
cleanup() {
  docker rm -f "$qa_name" "$qa_memory" >/dev/null 2>&1 || true
  docker volume rm "$qa_volume" "$qa_memory_volume" >/dev/null 2>&1 || true
  rm -rf "$qa_directory"
}
trap cleanup EXIT HUP INT TERM
npx --no-install esbuild scripts/smoke-standalone.ts --bundle --platform=node --target=node24 --format=esm --packages=external --outfile="$qa_directory/smoke.mjs"
ready() {
  qa_attempt=0
  until docker exec "$1" node -e 'fetch("http://127.0.0.1:3000/api/health").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))'; do
    qa_attempt=$((qa_attempt + 1))
    if [ "$qa_attempt" -ge 30 ]; then
      docker logs --tail 30 "$1"
      return 1
    fi
    sleep 1
  done
}
docker volume create "$qa_volume" >/dev/null
docker run -d --name "$qa_name" --network none -e OPAQUE_SETUP_VERSION=qa-v2 -v "$qa_volume:/data" "$qa_image" >/dev/null
docker cp "$qa_directory/smoke.mjs" "$qa_name:/app/qa-smoke.mjs"
ready "$qa_name"
docker exec -e SMOKE_STATE_FILE=/data/qa-state.json "$qa_name" node /app/qa-smoke.mjs
docker restart "$qa_name" >/dev/null
ready "$qa_name"
docker exec -e SMOKE_STATE_FILE=/data/qa-state.json -e SMOKE_RESUME=1 -e SMOKE_KEEP_ARTIFACT=1 "$qa_name" node /app/qa-smoke.mjs
docker stop "$qa_name" >/dev/null
docker rm "$qa_name" >/dev/null
docker run -d --name "$qa_name" --network none -v "$qa_volume:/data" "$qa_image" >/dev/null
docker cp "$qa_directory/smoke.mjs" "$qa_name:/app/qa-smoke.mjs"
ready "$qa_name"
docker exec -e SMOKE_STATE_FILE=/data/qa-state.json -e SMOKE_RESUME=1 "$qa_name" node /app/qa-smoke.mjs
docker stop "$qa_name" >/dev/null
docker run --rm --network none -v "$qa_volume:/data" --entrypoint node "$qa_image" -e 'require("node:fs").renameSync("/data/secrets.json","/data/secrets.backup.json")'
if docker run --rm --network none -v "$qa_volume:/data" "$qa_image"; then
  echo "An existing database unexpectedly started without its persisted secrets." >&2
  exit 1
fi
if docker run --rm --network none -e SQLITE_PATH=:memory: "$qa_image"; then
  echo "In-memory SQLite unexpectedly started without explicit opt-in." >&2
  exit 1
fi
docker volume create "$qa_memory_volume" >/dev/null
docker run -d --name "$qa_memory" --network none -v "$qa_memory_volume:/data" -e SQLITE_PATH=:memory: -e ALLOW_EPHEMERAL_DATABASE=true "$qa_image" >/dev/null
docker cp "$qa_directory/smoke.mjs" "$qa_memory:/app/qa-smoke.mjs"
ready "$qa_memory"
docker exec -e SMOKE_STATE_FILE=/data/qa-state.json "$qa_memory" node /app/qa-smoke.mjs
docker restart "$qa_memory" >/dev/null
ready "$qa_memory"
docker exec -e SMOKE_STATE_FILE=/data/qa-state.json -e SMOKE_RESUME=1 -e SMOKE_EXPECT_LOSS=1 "$qa_memory" node /app/qa-smoke.mjs
echo "Docker persistence and acknowledged memory mode passed without network access."
