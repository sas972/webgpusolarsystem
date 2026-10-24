# SolarSim WebGPU - Solar System Physics Simulator (C++20 & WebGPU RK4)

A modern, in-browser Solar System simulator built on **C++20** and **WebGPU**, powered by a **4th-Order Runge-Kutta (RK4)** gravitational integrator. Both graphics rendering and N-body gravitational physics are computed directly on the GPU via WGSL compute and render pipelines.

---

## 🚀 Key Features

1. **WebGPU Render & Compute Pipeline**:
   - **GPU Compute Shader (`rk4_compute.wgsl`)**: Gravitational N-body interactions and 4-stage Runge-Kutta integration are executed in parallel directly in GPU VRAM (workgroup size 64).
   - **Realistic PBR/Blinn-Phong Lighting (`planet.wgsl`)**: Dynamic day/night terminator based on incident sunlight angle, atmospheric Fresnel rim lighting, and ocean specular reflections.
   - **Emissive Sunlight Shading**: Pulsing solar corona and dynamic solar flares.
   - **Procedural Saturn Ring System (`ring.wgsl`)**: Fine ring band structures with Cassini division and light transmission.
   - **Procedural Deep-Space Starfield (`starfield.wgsl`)**: Thousands of background stars with astronomical spectral color temperatures.

2. **C++20 Physics Engine**:
   - **Runge-Kutta 4 (RK4)** numerical integrator: $O(\Delta t^4)$ local accuracy with outstanding energy conservation ($|\Delta E / E_0| < 0.0001\%$).
   - Real astronomical ephemerides: The Sun, 8 major planets, Earth's Moon, Pluto, and a procedurally generated Asteroid Belt based on Keplerian orbital elements.
   - Accurate masses, semi-major axes, eccentricities, orbital velocities, and axial tilts.
   - Real-time engine switching: **WebGPU Compute Shader (GPU)** vs. **C++20 Engine (CPU)**.

3. **Interactive Web Interface**:
   - Modern, sleek dark-themed *glassmorphic* control dashboard.
   - 3D Orbit Camera with celestial target tracking (Sun, Earth, Mars, Jupiter, etc.), smooth orbit rotation, panning, and zooming.
   - Time warp slider (from 1 day/s to 10 years/s), pause, and single-step stepping.
   - Live telemetry and astronomical dossier card (velocity in km/s, distance in AU & km, mass, orbital/rotational periods).

---

## 🚀 Quick Start & Development

### 1. Running with Docker (Recommended)

Start the services with Docker Compose:
```bash
# Start all services (Web Simulator + VS Code IDE):
docker compose up -d

# Or start ONLY the Web Simulator:
docker compose up -d web
```

- **SolarSim WebGPU Web App**: [http://localhost:8080](http://localhost:8080)
- **VS Code Web IDE**: [http://localhost:8443](http://localhost:8443) (accessible without password)

To stop the containers:
```bash
docker compose down
```

---

### 2. Running Locally (Without Docker)

You can serve the application directly on your host machine using the included Python server (configured with WebGPU Cross-Origin isolation headers):
```bash
python3 scripts/server.py 8080 web
# or using Make:
make serve
```
Then navigate to **[http://localhost:8080](http://localhost:8080)** in any WebGPU-compatible browser (Google Chrome, Microsoft Edge, or Firefox Nightly).

---

### 3. Building the Project

#### Inside the Docker Container (via Emscripten SDK):
```bash
# Build WebAssembly (solsim.js / solsim.wasm) and native binaries:
docker compose run --rm dev bash scripts/build.sh
```

#### On Host (if Emscripten and CMake are installed):
```bash
bash scripts/build.sh
```

---

### 4. Running the Native C++20 Test & Benchmark

#### Inside Docker:
```bash
docker compose run --rm dev ./build-native/solsim_native
```

#### Locally on Host (macOS / Linux):
```bash
cmake -B build-native -DCMAKE_BUILD_TYPE=Release
cmake --build build-native
./build-native/solsim_native
```

Output:
```text
======================================================================
       SOLAR SYSTEM PHYSICS SIMULATOR (C++20 / WebGPU / RK4)          
======================================================================
[+] Initialized Solar System with 211 celestial bodies.
    - Sun + 8 Planets + Moon + Pluto + 200 Asteroids.
    - Integrator: Runge-Kutta 4th Order (RK4)
[+] Running RK4 N-body Benchmark (1000 sub-steps, 1 year total simulation)...
[✓] Benchmark completed in 496.83 ms.
    - Energy Conservation Drift: -0.000000 %
    [PASS] Energy conservation is outstanding (|drift| < 0.01%)!
```

---

## 📐 Mathematical Background: Runge-Kutta 4 (RK4)

The gravitational acceleration exerted on body $i$ in an $N$-body system:
$$\mathbf{a}_i(\mathbf{r}) = \sum_{j \neq i}^{N} \frac{G \cdot m_j \cdot (\mathbf{r}_j - \mathbf{r}_i)}{(|\mathbf{r}_j - \mathbf{r}_i|^2 + \epsilon^2)^{3/2}}$$

The RK4 step evaluates 4 intermediate stages across timestep $\Delta t$:
1. $k_{1,v} = \mathbf{a}(\mathbf{r}_0)$, $\quad k_{1,r} = \mathbf{v}_0$
2. $k_{2,v} = \mathbf{a}\left(\mathbf{r}_0 + \frac{\Delta t}{2} k_{1,r}\right)$, $\quad k_{2,r} = \mathbf{v}_0 + \frac{\Delta t}{2} k_{1,v}$
3. $k_{3,v} = \mathbf{a}\left(\mathbf{r}_0 + \frac{\Delta t}{2} k_{2,r}\right)$, $\quad k_{3,r} = \mathbf{v}_0 + \frac{\Delta t}{2} k_{2,v}$
4. $k_{4,v} = \mathbf{a}\left(\mathbf{r}_0 + \Delta t k_{3,r}\right)$, $\quad k_{4,r} = \mathbf{v}_0 + \Delta t k_{3,v}$

The weighted result is:
$$\mathbf{r}_{new} = \mathbf{r}_0 + \frac{\Delta t}{6} \left( k_{1,r} + 2 k_{2,r} + 2 k_{3,r} + k_{4,r} \right)$$
$$\mathbf{v}_{new} = \mathbf{v}_0 + \frac{\Delta t}{6} \left( k_{1,v} + 2 k_{2,v} + 2 k_{3,v} + k_{4,v} \right)$$

---

## 📂 Directory Structure

```
solarsimWebGPU/
├── .devcontainer/
│   └── devcontainer.json        # VS Code Dev Container configuration
├── Dockerfile                   # Emscripten SDK + code-server + C++20 environment
├── docker-compose.yml           # VS Code (8443) and Web server (8080)
├── CMakeLists.txt               # Emscripten & Native C++20 CMake configuration
├── Makefile                     # make build, make serve, make run-native
├── scripts/
│   ├── build.sh                 # Automated build script
│   └── server.py                # HTTP server with COOP/COEP isolation headers
├── src/
│   ├── physics/
│   │   ├── Vector3.hpp          # C++20 constexpr 3D vector math
│   │   ├── Body.hpp             # Celestial bodies & GPU-aligned structs
│   │   ├── SolarSystemData.hpp  # Astronomical ephemerides & asteroid belt generator
│   │   ├── IntegratorRK4.hpp    # 4th-order Runge-Kutta numerical integrator
│   │   └── Simulation.hpp       # Simulation controller & state manager
│   ├── render/
│   │   ├── Camera.hpp           # 3D Orbit camera & 4x4 WebGPU matrices
│   │   └── Geometry.hpp         # Procedural UV sphere & ring geometries
│   ├── shaders/
│   │   ├── rk4_compute.wgsl     # GPU Compute Shader (RK4 N-body gravity in VRAM)
│   │   ├── planet.wgsl          # Planet PBR/Blinn-Phong & atmospheric shader
│   │   ├── ring.wgsl            # Saturn ring shader with Cassini division
│   │   ├── trail.wgsl           # Fading orbital trail lines
│   │   └── starfield.wgsl       # Deep-space procedural starfield
│   ├── bindings/
│   │   └── EmscriptenBindings.cpp # Embind interface between C++ and JavaScript
│   └── main.cpp                 # Native CLI benchmark and WebAssembly entry point
└── web/
    ├── index.html               # High-fidelity web user interface
    ├── style.css                # Glassmorphic dark-space styling
    ├── app.js                   # WebGPU initialization, pipelines & event handling
    ├── solsim.js                # Emscripten C++20 JavaScript wrapper
    ├── solsim.wasm              # Compiled C++20 RK4 WebAssembly binary
    └── shaders/
        └── rk4_compute.wgsl     # Compute shader for WebGPU N-body gravity
```
