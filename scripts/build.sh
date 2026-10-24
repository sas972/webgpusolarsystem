#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "======================================================================"
echo "          Building SolarSim WebGPU (C++20 / RK4)                      "
echo "======================================================================"

cd "$PROJECT_ROOT"

# 1. Build WebAssembly target if Emscripten is detected
if command -v emcmake >/dev/null 2>&1; then
    echo "[*] Emscripten detected. Building WebAssembly target (solsim.js / solsim.wasm)..."
    mkdir -p build-wasm
    emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release
    cmake --build build-wasm -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
    echo "[✓] WebAssembly target built successfully into web/ directory."
else
    echo "[!] Note: emcmake not in PATH. Skipping WebAssembly build on this machine."
    echo "    (WebAssembly builds run inside the Docker container via emscripten/emsdk)."
fi

# 2. Build Native C++20 Target for local benchmark & verification
if command -v cmake >/dev/null 2>&1; then
    echo "[*] Building native C++20 benchmark executable..."
    mkdir -p build-native
    cmake -B build-native -DCMAKE_BUILD_TYPE=Release
    cmake --build build-native -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
    echo "[✓] Native executable built: build-native/solsim_native"
fi

echo "======================================================================"
echo "Build complete!"
echo "To serve the simulator: python3 scripts/server.py 8080"
echo "======================================================================"
