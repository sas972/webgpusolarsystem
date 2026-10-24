#!/usr/bin/env python3
"""
Lightweight development HTTP server for SolarSim WebGPU.
Serves static files from /workspace/web (or current directory) with
proper MIME types and Cross-Origin isolation headers (COOP/COEP).
"""

import http.server
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
DIRECTORY = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")

class WebGPURequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable Cross-Origin Isolation for SharedArrayBuffer / WebAssembly threads
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith(".wasm"):
            return "application/wasm"
        if path.endswith(".wgsl"):
            return "text/plain"
        if path.endswith(".js"):
            return "application/javascript"
        return super().guess_type(path)

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    print(f"[*] SolarSim WebGPU Server running at http://0.0.0.0:{PORT}")
    print(f"[*] Serving files from: {DIRECTORY}")
    
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), WebGPURequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[*] Server stopped.")
