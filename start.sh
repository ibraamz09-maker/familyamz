#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "📦 Installation des dépendances backend..."
cd "$ROOT/backend" && npm install

echo "📦 Installation des dépendances frontend..."
cd "$ROOT/frontend" && npm install

echo ""
echo "🚀 Démarrage de FamilyAmz..."
echo "   Backend  → http://localhost:3001"
echo "   Frontend → http://localhost:5173"
echo ""

# Start backend in background
cd "$ROOT/backend" && node server.js &
BACKEND_PID=$!

# Start frontend dev server
cd "$ROOT/frontend" && npm run dev

# On exit, kill backend
trap "kill $BACKEND_PID 2>/dev/null" EXIT
