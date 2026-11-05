#!/usr/bin/env sh
# Everything CI runs, in one command, so CI, people and the Factory's Stop hook check the same
# thing. The project has no checks yet; add each one here as it arrives (formatting, lint, types,
# tests, build), and have CI run this script.
set -eu
cd "$(dirname "$0")/.."

echo "validate: no checks yet"
