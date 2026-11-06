#!/usr/bin/env sh
set -eu

DEFAULT_MCP_ADDR="http://127.0.0.1:3333/mcp"
MCP_ADDR="${MCP_ADDR:-${MCP_URL:-$DEFAULT_MCP_ADDR}}"

usage() {
  cat <<EOF
Usage:
  mcp/scripts/mcp-inspector.sh [MCP_URL] [inspector args...]
  npm run mcp:inspector -- [MCP_URL] [inspector args...]

Environment:
  MCP_ADDR or MCP_URL  Override the default MCP URL.

Default:
  $DEFAULT_MCP_ADDR
EOF
}

case "${1:-}" in
  -h | --help)
    usage
    exit 0
    ;;
esac

if [ "$#" -gt 0 ] && [ "${1#-}" = "$1" ]; then
  MCP_ADDR="$1"
  shift
fi

case "$MCP_ADDR" in
  http://* | https://*) ;;
  *)
    echo "MCP_URL must be an http(s) URL: $MCP_ADDR" >&2
    echo "Example: npm run mcp:inspector -- http://127.0.0.1:3333/mcp" >&2
    exit 2
    ;;
esac

exec npx --yes @modelcontextprotocol/inspector --transport http --server-url "$MCP_ADDR" "$@"
