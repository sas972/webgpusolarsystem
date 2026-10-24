FROM emscripten/emsdk:latest

ENV DEBIAN_FRONTEND=noninteractive

# Install code-server and essential tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    ninja-build \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install VS Code Server (web IDE)
RUN curl -fsSL https://code-server.dev/install.sh | sh

# Set workspace directory
WORKDIR /workspace

# 8443: VS Code Server Web IDE
# 8080: SolarSim WebGPU HTTP Web Server
EXPOSE 8443 8080

# Default command: launch code-server
CMD ["code-server", "--bind-addr", "0.0.0.0:8443", "--auth", "none", "/workspace"]
