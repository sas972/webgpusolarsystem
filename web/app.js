/**
 * SolarSim WebGPU Application Controller
 * Handles WebGPU device initialization, Compute & Render pipelines,
 * Emscripten C++20 WebAssembly integration, Orbit lines, and UI controls.
 */

// --- 1. WebGPU Shaders (WGSL) ---

const RK4_COMPUTE_WGSL = `
struct GpuBody {
    pos: vec4<f32>,     // xyz = position (AU), w = mass (solar masses)
    vel: vec4<f32>,     // xyz = velocity (AU/year), w = display radius
    color: vec4<f32>,   // rgba
    extra: vec4<f32>,   // x = bodyType, y = id, z = flags, w = padding
};

struct SimUniforms {
    bodyCount: u32,
    subSteps: u32,
    dt: f32,            // time step per substep in years
    G: f32,             // 4 * pi^2 ≈ 39.4784176
    softeningSq: f32,   // epsilon^2
    time: f32,
    padding1: f32,
    padding2: f32,
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;
@group(0) @binding(1) var<storage, read_write> bodies: array<GpuBody>;

fn compute_acceleration(testPos: vec3<f32>, myIdx: u32) -> vec3<f32> {
    var acc = vec3<f32>(0.0, 0.0, 0.0);
    let count = sim.bodyCount;

    for (var j: u32 = 0u; j < count; j = j + 1u) {
        if (j == myIdx) {
            continue;
        }

        let other = bodies[j];
        let diff = other.pos.xyz - testPos;
        let distSq = dot(diff, diff) + sim.softeningSq;
        let dist = sqrt(distSq);
        let invDist3 = 1.0 / (distSq * dist);

        let force = sim.G * other.pos.w * invDist3;
        acc = acc + diff * force;
    }

    return acc;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= sim.bodyCount) {
        return;
    }

    var body = bodies[idx];
    let dt = sim.dt;
    let r0 = body.pos.xyz;
    let v0 = body.vel.xyz;

    // --- Runge-Kutta 4th Order (RK4) 4 Stages ---
    let k1_v = compute_acceleration(r0, idx);
    let k1_r = v0;

    let r1 = r0 + k1_r * (0.5 * dt);
    let v1 = v0 + k1_v * (0.5 * dt);
    let k2_v = compute_acceleration(r1, idx);
    let k2_r = v1;

    let r2 = r0 + k2_r * (0.5 * dt);
    let v2 = v0 + k2_v * (0.5 * dt);
    let k3_v = compute_acceleration(r2, idx);
    let k3_r = v2;

    let r3 = r0 + k3_r * dt;
    let v3 = v0 + k3_v * dt;
    let k4_v = compute_acceleration(r3, idx);
    let k4_r = v3;

    let inv6 = dt / 6.0;
    let new_pos = r0 + (k1_r + (k2_r + k3_r) * 2.0 + k4_r) * inv6;
    let new_vel = v0 + (k1_v + (k2_v + k3_v) * 2.0 + k4_v) * inv6;

    body.pos = vec4<f32>(new_pos, body.pos.w);
    body.vel = vec4<f32>(new_vel, body.vel.w);

    bodies[idx] = body;
}
`;

const PLANET_RENDER_WGSL = `
struct CameraUniforms {
    viewProjection: mat4x4<f32>,
    cameraPos: vec4<f32>,
};

struct GpuBody {
    pos: vec4<f32>,     // xyz = position (AU), w = mass
    vel: vec4<f32>,     // xyz = velocity (AU/yr), w = display radius
    color: vec4<f32>,   // rgba
    extra: vec4<f32>,   // x = bodyType, y = id, z = flags, w = padding
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> bodies: array<GpuBody>;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) worldPosition: vec3<f32>,
    @location(1) worldNormal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) color: vec4<f32>,
    @location(4) isSun: f32,
};

@vertex
fn vs_main(in: VertexInput, @builtin(instance_index) instanceIdx: u32) -> VertexOutput {
    var out: VertexOutput;
    let body = bodies[instanceIdx];

    let radius = max(0.04, body.vel.w);
    let worldPos = body.pos.xyz + in.position * radius;

    out.worldPosition = worldPos;
    out.worldNormal = in.normal;
    out.uv = in.uv;
    out.color = body.color;
    out.isSun = select(0.0, 1.0, instanceIdx == 0u);
    out.clipPosition = camera.viewProjection * vec4<f32>(worldPos, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let N = normalize(in.worldNormal);
    let V = normalize(camera.cameraPos.xyz - in.worldPosition);

    if (in.isSun > 0.5) {
        // Glowing emissive Sun
        let fresnel = 1.0 - max(0.0, dot(N, V));
        let corona = vec3<f32>(1.0, 0.7, 0.2) * pow(fresnel, 1.8);
        return vec4<f32>(in.color.rgb + corona, 1.0);
    }

    // Light source: The Sun is at (0, 0, 0)
    let lightDir = normalize(vec3<f32>(0.0, 0.0, 0.0) - in.worldPosition);
    let NdotL = max(0.0, dot(N, lightDir));

    let H = normalize(lightDir + V);
    let NdotH = max(0.0, dot(N, H));
    let specular = pow(NdotH, 24.0) * 0.3 * smoothstep(-0.05, 0.1, dot(N, lightDir));

    let fresnel = pow(1.0 - max(0.0, dot(N, V)), 2.5);
    let rimGlow = in.color.rgb * fresnel * 0.5;

    let ambient = vec3<f32>(0.08, 0.10, 0.15);
    let color = in.color.rgb * (ambient + NdotL * 0.95) + vec3<f32>(specular) + rimGlow;

    return vec4<f32>(color, 1.0);
}
`;

const ORBIT_LINE_WGSL = `
struct CameraUniforms {
    viewProjection: mat4x4<f32>,
    cameraPos: vec4<f32>,
};

struct OrbitUniforms {
    color: vec4<f32>,
    radius: f32,
    padding1: f32,
    padding2: f32,
    padding3: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> orbit: OrbitUniforms;

struct VertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIdx: u32) -> VertexOutput {
    var out: VertexOutput;
    let totalSegments = 128.0;
    let angle = (f32(vertexIdx) / totalSegments) * 6.28318530718;

    let pos = vec3<f32>(
        cos(angle) * orbit.radius,
        sin(angle) * orbit.radius,
        0.0
    );

    out.clipPosition = camera.viewProjection * vec4<f32>(pos, 1.0);
    return out;
}

@fragment
fn fs_main() -> @location(0) vec4<f32> {
    return orbit.color;
}
`;

const STARFIELD_WGSL = `
struct CameraUniforms {
    viewProjection: mat4x4<f32>,
    cameraPos: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct VertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    let pos = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0,  1.0)
    );
    let p = pos[vertexIndex];
    out.clipPosition = vec4<f32>(p, 0.999999, 1.0);
    out.uv = p + camera.cameraPos.xy * 0.002;
    return out;
}

fn hash2(p: vec2<f32>) -> f32 {
    let q = fract(p * vec2<f32>(0.3183099, 0.3678794) + vec2<f32>(0.1, 0.1));
    let r = q * 17.0;
    return fract(r.x * r.y * (r.x + r.y));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let scale = 120.0;
    let grid = floor(in.uv * scale);
    let cell = fract(in.uv * scale) - 0.5;

    let h = hash2(grid);
    var color = vec3<f32>(0.012, 0.016, 0.028);

    if (h > 0.965) {
        let starCenter = (vec2<f32>(hash2(grid + 1.0), hash2(grid + 2.0)) - 0.5) * 0.7;
        let d = length(cell - starCenter);
        let brightness = smoothstep(0.12, 0.001, d) * pow((h - 0.965) / 0.035, 1.8);

        var starTint = vec3<f32>(1.0, 1.0, 1.0);
        let starType = fract(h * 37.0);
        if (starType < 0.3) {
            starTint = vec3<f32>(0.75, 0.88, 1.0);
        } else if (starType < 0.6) {
            starTint = vec3<f32>(1.0, 0.96, 0.85);
        } else {
            starTint = vec3<f32>(1.0, 0.8, 0.55);
        }

        color = color + starTint * brightness * 1.6;
    }

    return vec4<f32>(color, 1.0);
}
`;

const RING_WGSL = `
struct CameraUniforms {
    viewProjection: mat4x4<f32>,
    cameraPos: vec4<f32>,
};

struct RingUniforms {
    worldPos: vec4<f32>,   // xyz = center, w = scale
    color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> ring: RingUniforms;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let worldPos = ring.worldPos.xyz + in.position * ring.worldPos.w;
    out.uv = in.uv;
    out.clipPosition = camera.viewProjection * vec4<f32>(worldPos, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let r = in.uv.y;
    let cassiniGap = smoothstep(0.53, 0.57, r) * (1.0 - smoothstep(0.61, 0.65, r));
    let ringlets = sin(r * 120.0) * 0.15 + cos(r * 45.0) * 0.2 + 0.65;
    let innerFade = smoothstep(0.0, 0.08, r);
    let outerFade = 1.0 - smoothstep(0.92, 1.0, r);

    var alpha = (ringlets - cassiniGap * 0.85) * innerFade * outerFade;
    alpha = clamp(alpha, 0.0, 0.85);

    let ringColor = mix(vec3<f32>(0.85, 0.76, 0.60), vec3<f32>(0.95, 0.88, 0.72), ringlets);
    return vec4<f32>(ringColor, alpha);
}
`;

// --- 2. Procedural Geometry Builders ---

function createSphereMesh(latBands = 24, lonBands = 24, radius = 1.0) {
    const vertices = [];
    const indices = [];

    for (let lat = 0; lat <= latBands; ++lat) {
        const theta = (lat * Math.PI) / latBands;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lon = 0; lon <= lonBands; ++lon) {
            const phi = (lon * 2.0 * Math.PI) / lonBands;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            const nx = cosPhi * sinTheta;
            const ny = cosTheta;
            const nz = sinPhi * sinTheta;

            const u = 1.0 - lon / lonBands;
            const v = 1.0 - lat / latBands;

            vertices.push(radius * nx, radius * ny, radius * nz, nx, ny, nz, u, v);
        }
    }

    for (let lat = 0; lat < latBands; ++lat) {
        for (let lon = 0; lon < lonBands; ++lon) {
            const first = lat * (lonBands + 1) + lon;
            const second = first + lonBands + 1;

            indices.push(first, second, first + 1);
            indices.push(second, second + 1, first + 1);
        }
    }

    return {
        vertexData: new Float32Array(vertices),
        indexData: new Uint16Array(indices),
        indexCount: indices.length,
    };
}

function createRingMesh(innerRadius = 1.3, outerRadius = 2.5, segments = 64) {
    const vertices = [];
    const indices = [];

    for (let i = 0; i <= segments; ++i) {
        const angle = (i * 2.0 * Math.PI) / segments;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const u = i / segments;

        const tilt = 0.45; // ~sin(26.7 deg axial tilt)
        const cosTilt = 0.89; // ~cos(26.7 deg)
        vertices.push(innerRadius * cosA, innerRadius * sinA * cosTilt, innerRadius * sinA * tilt, 0.0, tilt, cosTilt, u, 0.0);
        vertices.push(outerRadius * cosA, outerRadius * sinA * cosTilt, outerRadius * sinA * tilt, 0.0, tilt, cosTilt, u, 1.0);
    }

    for (let i = 0; i < segments; ++i) {
        const i0 = i * 2;
        const i1 = i0 + 1;
        const i2 = i0 + 2;
        const i3 = i0 + 3;

        indices.push(i0, i1, i2);
        indices.push(i1, i3, i2);
    }

    return {
        vertexData: new Float32Array(vertices),
        indexData: new Uint16Array(indices),
        indexCount: indices.length,
    };
}

// --- 3. Matrix Math (WebGPU column-major, [0, 1] depth range) ---

class Mat4 {
    static perspective(fovRad, aspect, near, far) {
        const f = 1.0 / Math.tan(fovRad * 0.5);
        const out = new Float32Array(16);
        out[0] = f / aspect;
        out[5] = f;
        out[10] = far / (near - far);
        out[11] = -1.0;
        out[14] = (near * far) / (near - far);
        return out;
    }

    static lookAt(eye, center, up) {
        const out = new Float32Array(16);
        let fx = center[0] - eye[0];
        let fy = center[1] - eye[1];
        let fz = center[2] - eye[2];
        const rlf = 1.0 / Math.hypot(fx, fy, fz);
        fx *= rlf; fy *= rlf; fz *= rlf;

        let sx = fy * up[2] - fz * up[1];
        let sy = fz * up[0] - fx * up[2];
        let sz = fx * up[1] - fy * up[0];
        const rls = 1.0 / Math.hypot(sx, sy, sz);
        sx *= rls; sy *= rls; sz *= rls;

        const ux = sy * fz - sz * fy;
        const uy = sz * fx - sx * fz;
        const uz = sx * fy - sy * fx;

        out[0] = sx; out[1] = ux; out[2] = -fx; out[3] = 0;
        out[4] = sy; out[5] = uy; out[6] = -fy; out[7] = 0;
        out[8] = sz; out[9] = uz; out[10] = -fz; out[11] = 0;
        out[12] = -(sx * eye[0] + sy * eye[1] + sz * eye[2]);
        out[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
        out[14] = fx * eye[0] + fy * eye[1] + fz * eye[2];
        out[15] = 1;
        return out;
    }

    static multiply(a, b) {
        const out = new Float32Array(16);
        for (let i = 0; i < 4; ++i) {
            for (let j = 0; j < 4; ++j) {
                out[j * 4 + i] =
                    a[0 * 4 + i] * b[j * 4 + 0] +
                    a[1 * 4 + i] * b[j * 4 + 1] +
                    a[2 * 4 + i] * b[j * 4 + 2] +
                    a[3 * 4 + i] * b[j * 4 + 3];
            }
        }
        return out;
    }
}

// Planetary metadata for telemetry dossier
const PLANET_METADATA = [
    { name: "Sun", type: "Yellow Dwarf Star (G2V)", massKg: "1.989 × 10³⁰ kg", radiusKm: "696,340 km", period: "—", rot: "25.05 Days", color: "#ffd56b", a: 0.0 },
    { name: "Mercury", type: "Terrestrial Planet", massKg: "3.301 × 10²³ kg", radiusKm: "2,439 km", period: "87.97 Days", rot: "58.65 Days", color: "#b3b3b3", a: 0.387 },
    { name: "Venus", type: "Terrestrial Planet", massKg: "4.867 × 10²⁴ kg", radiusKm: "6,051 km", period: "224.70 Days", rot: "-243.02 Days", color: "#e6c78e", a: 0.723 },
    { name: "Earth", type: "Terrestrial Planet", massKg: "5.972 × 10²⁴ kg", radiusKm: "6,371 km", period: "365.25 Days", rot: "23.93 Hours", color: "#408cff", a: 1.000 },
    { name: "Moon", type: "Natural Satellite", massKg: "7.342 × 10²² kg", radiusKm: "1,737 km", period: "27.32 Days", rot: "27.32 Days", color: "#d1d5db", a: 1.003 },
    { name: "Mars", type: "Terrestrial Planet", massKg: "6.417 × 10²³ kg", radiusKm: "3,389 km", period: "686.98 Days", rot: "24.62 Hours", color: "#e36138", a: 1.524 },
    { name: "Jupiter", type: "Gas Giant", massKg: "1.898 × 10²⁷ kg", radiusKm: "69,911 km", period: "4,332.59 Days (11.86 Yrs)", rot: "9.92 Hours", color: "#d6ad85", a: 5.204 },
    { name: "Saturn", type: "Gas Giant with Rings", massKg: "5.683 × 10²⁶ kg", radiusKm: "58,232 km", period: "10,759.22 Days (29.46 Yrs)", rot: "10.65 Hours", color: "#ebd9a6", a: 9.582 },
    { name: "Uranus", type: "Ice Giant", massKg: "8.681 × 10²⁵ kg", radiusKm: "25,362 km", period: "30,685.40 Days (84.02 Yrs)", rot: "-17.24 Hours", color: "#8cd4e0", a: 19.20 },
    { name: "Neptune", type: "Ice Giant", massKg: "1.024 × 10²⁶ kg", radiusKm: "24,622 km", period: "60,189.00 Days (164.8 Yrs)", rot: "16.11 Hours", color: "#4775f0", a: 30.05 },
    { name: "Pluto", type: "Dwarf Planet (Kuiper)", massKg: "1.303 × 10²² kg", radiusKm: "1,188 km", period: "90,560 Days (247.9 Yrs)", rot: "-153.3 Hours", color: "#ccb8a6", a: 39.48 }
];

// --- 4. Main Application Class ---

class SolarSimApp {
    constructor() {
        this.canvas = document.getElementById("webgpu-canvas");
        this.device = null;
        this.context = null;
        this.format = null;

        // WebGPU Pipelines
        this.computePipeline = null;
        this.planetPipeline = null;
        this.orbitPipeline = null;
        this.starfieldPipeline = null;
        this.ringPipeline = null;

        // GPU Buffers
        this.bodyBuffer = null;
        this.simUniformBuffer = null;
        this.cameraUniformBuffer = null;
        this.ringUniformBuffer = null;
        this.orbitUniformBuffers = [];
        this.depthTexture = null;

        // Meshes
        this.sphereMesh = null;
        this.sphereVBO = null;
        this.sphereIBO = null;
        this.ringMesh = null;
        this.ringVBO = null;
        this.ringIBO = null;

        // Bind Groups
        this.computeBindGroup = null;
        this.planetBindGroup = null;
        this.orbitCameraBindGroup = null;
        this.orbitBindGroups = [];
        this.starfieldBindGroup = null;
        this.ringCameraBindGroup = null;
        this.ringBindGroup = null;

        // Simulation State
        this.isPlaying = true;
        this.integratorMode = 1; // 1 = WebGPU Compute RK4, 0 = C++20 CPU
        this.timeScaleDaysPerSec = 36.525;
        this.subSteps = 10;
        this.asteroidCount = 200;
        this.trackedTargetIndex = 0; // Default to The Sun overview!

        // Camera State
        this.cameraDistance = 14.0; // AU
        this.cameraYaw = 35.0;      // deg
        this.cameraPitch = 28.0;    // deg
        this.cameraFocus = [0, 0, 0];

        // Mouse Controls
        this.isMouseDown = false;
        this.isRightMouseDown = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // C++ Module
        this.wasmModule = null;
        this.wasmSimulation = null;

        // Telemetry
        this.frameCount = 0;
        this.lastFpsUpdateTime = performance.now();
        this.lastFrameTime = performance.now();
        this.simTimeYears = 0.0;
        this.bodyCount = 11 + this.asteroidCount;
        this.bodiesFloatArray = null;

        // Immediately initialize celestial bodies array so UI is ready before GPU setup
        this.initBodiesData();
    }

    async init() {
        this.setupEventListeners();
        this.updateDossierCard();

        if (!navigator.gpu) {
            console.warn("WebGPU not detected in this browser. Activating software/canvas fallback.");
            document.getElementById("webgpu-unsupported").classList.remove("hidden");
            this.initCanvasFallback();
            return;
        }

        try {
            const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
            if (!adapter) {
                console.warn("WebGPU adapter request failed. Activating software/canvas fallback.");
                document.getElementById("webgpu-unsupported").classList.remove("hidden");
                this.initCanvasFallback();
                return;
            }

            this.device = await adapter.requestDevice();
            this.device.addEventListener("uncapturederror", (event) => {
                console.error("[WebGPU Error]:", event.error.message);
            });
            this.context = this.canvas.getContext("webgpu");
            this.format = navigator.gpu.getPreferredCanvasFormat();

            this.device.lost.then((info) => {
                console.error("WebGPU device lost:", info.message, info.reason);
            });

            this.resizeCanvas();
            window.addEventListener("resize", () => this.resizeCanvas());

            // Build Pipelines & Meshes
            await this.buildPipelines();

            // Initialize C++ WebAssembly
            await this.initWasmModule();

            // Start Animation Loop
            requestAnimationFrame((t) => this.renderLoop(t));
        } catch (err) {
            console.error("Failed to initialize WebGPU:", err);
            document.getElementById("webgpu-unsupported").classList.remove("hidden");
            this.initCanvasFallback();
        }
    }

    resizeCanvas() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.max(1, Math.floor(window.innerWidth * dpr));
        const height = Math.max(1, Math.floor(window.innerHeight * dpr));

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;

            if (this.device && this.context) {
                this.context.configure({
                    device: this.device,
                    format: this.format,
                    alphaMode: "premultiplied",
                });

                if (this.depthTexture) this.depthTexture.destroy();
                this.depthTexture = this.device.createTexture({
                    size: [width, height],
                    format: "depth24plus",
                    usage: GPUTextureUsage.RENDER_ATTACHMENT,
                });
            }
        }
    }

    async buildPipelines() {
        // 1. Compute Pipeline: Runge-Kutta 4 on GPU
        const computeModule = this.device.createShaderModule({ code: RK4_COMPUTE_WGSL });
        this.computePipeline = this.device.createComputePipeline({
            layout: "auto",
            compute: { module: computeModule, entryPoint: "main" },
        });

        // 2. Render Pipeline: Planets & Sun (Instanced from Storage Buffer)
        const planetModule = this.device.createShaderModule({ code: PLANET_RENDER_WGSL });
        this.planetPipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: planetModule,
                entryPoint: "vs_main",
                buffers: [{
                    arrayStride: 8 * 4,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: "float32x3" },
                        { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
                        { shaderLocation: 2, offset: 6 * 4, format: "float32x2" },
                    ],
                }],
            },
            fragment: {
                module: planetModule,
                entryPoint: "fs_main",
                targets: [{ format: this.format }],
            },
            primitive: { topology: "triangle-list", cullMode: "none" },
            depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth24plus" },
        });

        // 3. Render Pipeline: Orbit Circles
        const orbitModule = this.device.createShaderModule({ code: ORBIT_LINE_WGSL });
        this.orbitPipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: { module: orbitModule, entryPoint: "vs_main" },
            fragment: {
                module: orbitModule,
                entryPoint: "fs_main",
                targets: [{
                    format: this.format,
                    blend: {
                        color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
                        alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
                    },
                }],
            },
            primitive: { topology: "line-strip" },
            depthStencil: { depthWriteEnabled: false, depthCompare: "less-equal", format: "depth24plus" },
        });

        // 4. Render Pipeline: Starfield
        const starfieldModule = this.device.createShaderModule({ code: STARFIELD_WGSL });
        this.starfieldPipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: { module: starfieldModule, entryPoint: "vs_main" },
            fragment: {
                module: starfieldModule,
                entryPoint: "fs_main",
                targets: [{ format: this.format }],
            },
            primitive: { topology: "triangle-strip" },
            depthStencil: { depthWriteEnabled: false, depthCompare: "always", format: "depth24plus" },
        });

        // 5. Render Pipeline: Saturn Rings
        const ringModule = this.device.createShaderModule({ code: RING_WGSL });
        this.ringPipeline = this.device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: ringModule,
                entryPoint: "vs_main",
                buffers: [{
                    arrayStride: 8 * 4,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: "float32x3" },
                        { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
                        { shaderLocation: 2, offset: 6 * 4, format: "float32x2" },
                    ],
                }],
            },
            fragment: {
                module: ringModule,
                entryPoint: "fs_main",
                targets: [{
                    format: this.format,
                    blend: {
                        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
                        alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
                    },
                }],
            },
            primitive: { topology: "triangle-list", cullMode: "none" },
            depthStencil: { depthWriteEnabled: false, depthCompare: "less-equal", format: "depth24plus" },
        });

        // Meshes
        this.sphereMesh = createSphereMesh(24, 24, 1.0);
        this.sphereVBO = this.createGPUBuffer(this.sphereMesh.vertexData, GPUBufferUsage.VERTEX);
        this.sphereIBO = this.createGPUBuffer(this.sphereMesh.indexData, GPUBufferUsage.INDEX);

        this.ringMesh = createRingMesh(1.3, 2.5, 64);
        this.ringVBO = this.createGPUBuffer(this.ringMesh.vertexData, GPUBufferUsage.VERTEX);
        this.ringIBO = this.createGPUBuffer(this.ringMesh.indexData, GPUBufferUsage.INDEX);

        // Uniform Buffers
        this.cameraUniformBuffer = this.device.createBuffer({
            size: 32 * 4, // 128 bytes
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.simUniformBuffer = this.device.createBuffer({
            size: 32, // 32 bytes
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.ringUniformBuffer = this.device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Initialize Celestial Bodies Storage Buffer
        this.initGpuBodiesBuffer();

        // Orbit Line Buffers for planets 1 to 10
        this.initOrbitBuffers();
    }

    initOrbitBuffers() {
        this.orbitUniformBuffers = [];
        this.orbitBindGroups = [];

        for (let i = 1; i <= 10; ++i) {
            const meta = PLANET_METADATA[i];
            const buffer = this.device.createBuffer({
                size: 32,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            // RGB color + semi-major axis
            const col = this.hexToRgb(meta.color);
            const data = new Float32Array([
                col[0], col[1], col[2], 0.35, // alpha 0.35
                meta.a, 0.0, 0.0, 0.0,
            ]);
            this.device.queue.writeBuffer(buffer, 0, data);

            const bindGroup = this.device.createBindGroup({
                layout: this.orbitPipeline.getBindGroupLayout(1),
                entries: [{ binding: 0, resource: { buffer: buffer } }],
            });

            this.orbitUniformBuffers.push(buffer);
            this.orbitBindGroups.push(bindGroup);
        }
    }

    hexToRgb(hex) {
        let c = hex.replace("#", "");
        if (c.length === 3) c = c.split("").map((x) => x + x).join("");
        const num = parseInt(c, 16);
        return [(num >> 16 & 255) / 255, (num >> 8 & 255) / 255, (num & 255) / 255];
    }

    createGPUBuffer(data, usage) {
        const buffer = this.device.createBuffer({
            size: Math.max(16, (data.byteLength + 3) & ~3),
            usage: usage | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        });
        if (data instanceof Float32Array) {
            new Float32Array(buffer.getMappedRange()).set(data);
        } else if (data instanceof Uint16Array) {
            new Uint16Array(buffer.getMappedRange()).set(data);
        }
        buffer.unmap();
        return buffer;
    }

    initBodiesData() {
        const initialBodies = [
            // pos(xyz), mass, vel(xyz), radius, rgba, extra(type, id, flags, padding)
            // 0: Sun
            0, 0, 0, 1.0,         0, 0, 0, 0.65,        1.0, 0.92, 0.55, 1.0,   0, 0, 1.0, 0,
            // 1: Mercury
            0.3075, 0, 0, 1.66e-7,   0, 12.436, 0, 0.12,   0.72, 0.70, 0.68, 1.0,   1, 1, 0, 0,
            // 2: Venus
            0.7184, 0, 0, 2.45e-6,   0, 7.437, 0, 0.16,    0.91, 0.78, 0.55, 1.0,   1, 2, 0, 0,
            // 3: Earth
            0.9833, 0, 0, 3.00e-6,   0, 6.389, 0, 0.18,    0.25, 0.55, 0.95, 1.0,   1, 3, 0, 0,
            // 4: Moon
            0.98587, 0, 0.0001, 3.69e-8, 0, 6.604, 0.01, 0.08, 0.82, 0.82, 0.84, 1.0, 4, 4, 0, 0,
            // 5: Mars
            1.3814, 0, 0, 3.23e-7,   0, 5.589, 0, 0.14,    0.89, 0.38, 0.22, 1.0,   1, 5, 0, 0,
            // 6: Jupiter
            4.9520, 0, 0, 9.55e-4,   0, 2.891, 0, 0.45,    0.84, 0.68, 0.52, 1.0,   2, 6, 0, 0,
            // 7: Saturn
            9.0508, 0, 0, 2.86e-4,   0, 2.145, 0, 0.38,    0.92, 0.85, 0.65, 1.0,   2, 7, 0, 0,
            // 8: Uranus
            18.328, 0, 0, 4.37e-5,   0, 1.501, 0, 0.28,    0.55, 0.83, 0.88, 1.0,   3, 8, 0, 0,
            // 9: Neptune
            29.824, 0, 0, 5.15e-5,   0, 1.156, 0, 0.26,    0.28, 0.46, 0.94, 1.0,   3, 9, 0, 0,
            // 10: Pluto
            28.34, 0, 8.74, 6.55e-9, 0, 1.289, 0, 0.10,    0.80, 0.72, 0.65, 1.0,   5, 10, 0, 0,
        ];

        // Procedural Asteroids
        const G = 39.4784;
        for (let i = 0; i < this.asteroidCount; ++i) {
            const a = 2.1 + Math.random() * 1.2;
            const theta = Math.random() * Math.PI * 2.0;
            const inc = (Math.random() - 0.5) * 0.2;
            const r = a;
            const speed = Math.sqrt(G / r);

            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta) * Math.cos(inc);
            const z = r * Math.sin(theta) * Math.sin(inc);

            const vx = -speed * Math.sin(theta);
            const vy = speed * Math.cos(theta) * Math.cos(inc);
            const vz = speed * Math.cos(theta) * Math.sin(inc);

            const c = 0.55 + Math.random() * 0.35;
            initialBodies.push(
                x, y, z, 1e-12,
                vx, vy, vz, 0.035, // display radius
                c, c * 0.95, c * 0.9, 1.0,
                6, 11 + i, 0, 0
            );
        }

        this.bodyCount = 11 + this.asteroidCount;
        this.bodiesFloatArray = new Float32Array(initialBodies);
    }

    initGpuBodiesBuffer() {
        if (!this.bodiesFloatArray) {
            this.initBodiesData();
        }

        if (this.bodyBuffer) this.bodyBuffer.destroy();
        this.bodyBuffer = this.device.createBuffer({
            size: this.bodiesFloatArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            mappedAtCreation: true,
        });
        new Float32Array(this.bodyBuffer.getMappedRange()).set(this.bodiesFloatArray);
        this.bodyBuffer.unmap();

        // Compute BindGroup
        this.computeBindGroup = this.device.createBindGroup({
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.simUniformBuffer } },
                { binding: 1, resource: { buffer: this.bodyBuffer } },
            ],
        });

        // Planet Render BindGroup (Camera + Bodies Storage Buffer)
        this.planetBindGroup = this.device.createBindGroup({
            layout: this.planetPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.cameraUniformBuffer } },
                { binding: 1, resource: { buffer: this.bodyBuffer } },
            ],
        });

        // Starfield, Orbit & Ring BindGroups
        this.starfieldBindGroup = this.device.createBindGroup({
            layout: this.starfieldPipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
        });

        this.orbitCameraBindGroup = this.device.createBindGroup({
            layout: this.orbitPipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
        });

        this.ringCameraBindGroup = this.device.createBindGroup({
            layout: this.ringPipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
        });

        this.ringBindGroup = this.device.createBindGroup({
            layout: this.ringPipeline.getBindGroupLayout(1),
            entries: [{ binding: 0, resource: { buffer: this.ringUniformBuffer } }],
        });
    }

    async initWasmModule() {
        if (typeof Module !== "undefined") {
            try {
                this.wasmModule = await Module();
                if (this.wasmModule && this.wasmModule.Simulation) {
                    this.wasmSimulation = new this.wasmModule.Simulation();
                    this.wasmSimulation.setAsteroidCount(this.asteroidCount);
                    console.log("C++20 WebAssembly Simulation successfully attached!");
                }
            } catch (e) {
                console.log("WebAssembly runtime loading asynchronously...", e);
            }
        }
    }

    renderLoop(currentTime) {
        try {
            const deltaSec = (currentTime - this.lastFrameTime) * 0.001;
            this.lastFrameTime = currentTime;

            // FPS counter
            this.frameCount++;
            if (currentTime - this.lastFpsUpdateTime >= 500) {
                const fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdateTime));
                const elFps = document.getElementById("stat-fps");
                if (elFps) elFps.textContent = fps;
                this.frameCount = 0;
                this.lastFpsUpdateTime = currentTime;
            }

            if (this.isPlaying && deltaSec > 0 && deltaSec < 0.5) {
                const computeStart = performance.now();

                if (this.wasmSimulation && this.wasmModule) {
                    this.wasmSimulation.update(deltaSec);
                    const ptr = this.wasmSimulation.getGpuBufferPointer();
                    const byteSize = this.wasmSimulation.getGpuDataByteSize();
                    if (ptr && byteSize && this.wasmModule.HEAPF32) {
                        const f32Heap = new Float32Array(this.wasmModule.HEAPF32.buffer, ptr, byteSize / 4);
                        this.bodiesFloatArray.set(f32Heap);
                        if (this.integratorMode === 0) {
                            this.device.queue.writeBuffer(this.bodyBuffer, 0, f32Heap);
                        }
                    }
                }

                if (this.integratorMode === 1) {
                    // --- WebGPU Compute Pipeline Execution (RK4 on GPU) ---
                    this.executeGpuCompute(deltaSec);
                }

                if (this.frameCount % 5 === 0) {
                    this.updateDossierCard();
                }

                const computeTime = (performance.now() - computeStart).toFixed(2);
                const elCompute = document.getElementById("stat-compute-time");
                if (elCompute) elCompute.textContent = `${computeTime} ms`;

                const dtYears = deltaSec * (this.timeScaleDaysPerSec / 365.25);
                this.simTimeYears += dtYears;
                const days = (this.simTimeYears * 365.25).toFixed(0);
                const elTime = document.getElementById("stat-time");
                if (elTime) elTime.textContent = `Year ${this.simTimeYears.toFixed(2)} (Day ${days})`;
            }

            // Draw WebGPU Frame
            this.drawScene();
        } catch (err) {
            console.error("[SolarSim renderLoop error]:", err);
        }

        requestAnimationFrame((t) => this.renderLoop(t));
    }

    executeGpuCompute(deltaSec) {
        const totalDtYears = deltaSec * (this.timeScaleDaysPerSec / 365.25);
        const subDt = totalDtYears / this.subSteps;

        // Write SimUniforms with exact uint32 vs float32 layout
        const uniformData = new ArrayBuffer(32);
        const u32View = new Uint32Array(uniformData);
        const f32View = new Float32Array(uniformData);

        u32View[0] = this.bodyCount;       // u32: bodyCount (211)
        u32View[1] = this.subSteps;        // u32: subSteps
        f32View[2] = subDt;                // f32: dt
        f32View[3] = 39.4784176;           // f32: G
        f32View[4] = 1e-6;                 // f32: softeningSq
        f32View[5] = this.simTimeYears;    // f32: time
        f32View[6] = 0.0;
        f32View[7] = 0.0;

        this.device.queue.writeBuffer(this.simUniformBuffer, 0, uniformData);

        const commandEncoder = this.device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(this.computePipeline);
        computePass.setBindGroup(0, this.computeBindGroup);

        const workgroups = Math.ceil(this.bodyCount / 64);
        for (let s = 0; s < this.subSteps; ++s) {
            computePass.dispatchWorkgroups(workgroups);
        }
        computePass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

    drawScene() {
        if (!this.device || !this.context) return;

        const aspect = this.canvas.width / this.canvas.height;
        const proj = Mat4.perspective((50 * Math.PI) / 180, aspect, 0.05, 2000.0);

        // Smooth camera target tracking
        const targetBodyPos = this.getBodyPosition(this.trackedTargetIndex);
        for (let i = 0; i < 3; ++i) {
            this.cameraFocus[i] += (targetBodyPos[i] - this.cameraFocus[i]) * 0.12;
        }

        const yawRad = (this.cameraYaw * Math.PI) / 180;
        const pitchRad = (this.cameraPitch * Math.PI) / 180;
        const cosP = Math.cos(pitchRad);
        const sinP = Math.sin(pitchRad);
        const cosY = Math.cos(yawRad);
        const sinY = Math.sin(yawRad);

        const eye = [
            this.cameraFocus[0] + this.cameraDistance * cosP * sinY,
            this.cameraFocus[1] + this.cameraDistance * sinP,
            this.cameraFocus[2] + this.cameraDistance * cosP * cosY,
        ];

        const view = Mat4.lookAt(eye, this.cameraFocus, [0, 1, 0]);
        const viewProj = Mat4.multiply(proj, view);

        // Upload Camera Uniforms (16 float matrix + 4 float eye)
        const cameraUniformData = new Float32Array(32);
        cameraUniformData.set(viewProj, 0);
        cameraUniformData.set([eye[0], eye[1], eye[2], 1.0], 16);
        this.device.queue.writeBuffer(this.cameraUniformBuffer, 0, cameraUniformData);

        // Begin Render Pass
        const commandEncoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.015, g: 0.02, b: 0.035, a: 1.0 },
                loadOp: "clear",
                storeOp: "store",
            }],
            depthStencilAttachment: {
                view: this.depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });

        // 1. Draw Starfield Skybox
        if (document.getElementById("toggle-starfield").checked) {
            renderPass.setPipeline(this.starfieldPipeline);
            renderPass.setBindGroup(0, this.starfieldBindGroup);
            renderPass.draw(4);
        }

        // 2. Draw Orbit Circles
        if (document.getElementById("toggle-trails").checked) {
            renderPass.setPipeline(this.orbitPipeline);
            renderPass.setBindGroup(0, this.orbitCameraBindGroup);

            for (let i = 0; i < this.orbitBindGroups.length; ++i) {
                renderPass.setBindGroup(1, this.orbitBindGroups[i]);
                renderPass.draw(129); // 128 segments + 1 closing vertex
            }
        }

        // 3. Draw Planets, Sun & Asteroids in ONE Instanced Draw Call!
        renderPass.setPipeline(this.planetPipeline);
        renderPass.setBindGroup(0, this.planetBindGroup);
        renderPass.setVertexBuffer(0, this.sphereVBO);
        renderPass.setIndexBuffer(this.sphereIBO, "uint16");
        renderPass.drawIndexed(this.sphereMesh.indexCount, this.bodyCount);

        // 4. Draw Saturn's Rings
        if (document.getElementById("toggle-rings").checked && this.bodyCount > 7) {
            const saturnPos = this.getBodyPosition(7);
            const ringData = new Float32Array([saturnPos[0], saturnPos[1], saturnPos[2], 0.38, 1, 1, 1, 1]);
            this.device.queue.writeBuffer(this.ringUniformBuffer, 0, ringData);

            renderPass.setPipeline(this.ringPipeline);
            renderPass.setBindGroup(0, this.ringCameraBindGroup);
            renderPass.setBindGroup(1, this.ringBindGroup);
            renderPass.setVertexBuffer(0, this.ringVBO);
            renderPass.setIndexBuffer(this.ringIBO, "uint16");
            renderPass.drawIndexed(this.ringMesh.indexCount);
        }

        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    getBodyPosition(index) {
        if (!this.bodiesFloatArray || index * 16 + 2 >= this.bodiesFloatArray.length) {
            return [0, 0, 0];
        }
        const offset = index * 16;
        return [
            this.bodiesFloatArray[offset] || 0,
            this.bodiesFloatArray[offset + 1] || 0,
            this.bodiesFloatArray[offset + 2] || 0,
        ];
    }

    updateDossierCard() {
        const meta = PLANET_METADATA[this.trackedTargetIndex] || {
            name: `Asteroid #${this.trackedTargetIndex - 10}`,
            type: "Asteroid (Minor Planet)",
            massKg: "~1.0 × 10¹⁵ kg",
            radiusKm: "15 km",
            period: "3.5 - 5.5 Years",
            rot: "8.5 Hours",
            color: "#8899a6",
            a: 2.7,
        };

        const elName = document.getElementById("target-name");
        if (elName) elName.textContent = meta.name;
        const elType = document.getElementById("target-type");
        if (elType) elType.textContent = meta.type;
        const elSwatch = document.getElementById("target-color-swatch");
        if (elSwatch) {
            elSwatch.style.backgroundColor = meta.color;
            elSwatch.style.boxShadow = `0 0 16px ${meta.color}`;
        }

        const pos = this.getBodyPosition(this.trackedTargetIndex);
        const distAU = Math.hypot(pos[0], pos[1], pos[2]);
        const distKm = (distAU * 149.59787).toFixed(1);
        const elDist = document.getElementById("dossier-dist");
        if (elDist) elDist.textContent = `${distAU.toFixed(3)} AU (${distKm}M km)`;

        const offset = this.trackedTargetIndex * 16;
        const vx = (this.bodiesFloatArray && this.bodiesFloatArray[offset + 4]) || 0;
        const vy = (this.bodiesFloatArray && this.bodiesFloatArray[offset + 5]) || 0;
        const vz = (this.bodiesFloatArray && this.bodiesFloatArray[offset + 6]) || 0;
        const speedAU = Math.hypot(vx, vy, vz);
        const speedKm = (speedAU * 4.74047).toFixed(2);
        const elVel = document.getElementById("dossier-vel");
        if (elVel) elVel.textContent = `${speedKm} km/s (${speedAU.toFixed(2)} AU/yr)`;

        const elMass = document.getElementById("dossier-mass");
        if (elMass) elMass.textContent = meta.massKg;
        const elRadius = document.getElementById("dossier-radius");
        if (elRadius) elRadius.textContent = meta.radiusKm;
        const elPeriod = document.getElementById("dossier-period");
        if (elPeriod) elPeriod.textContent = meta.period;
        const elRot = document.getElementById("dossier-rot");
        if (elRot) elRot.textContent = meta.rot;
    }

    setupEventListeners() {
        // Play / Pause
        const btnPlay = document.getElementById("btn-play-pause");
        btnPlay.addEventListener("click", () => {
            this.isPlaying = !this.isPlaying;
            document.getElementById("icon-play-pause").textContent = this.isPlaying ? "⏸ Pause" : "▶ Play";
            btnPlay.classList.toggle("btn-primary", this.isPlaying);
            btnPlay.classList.toggle("btn-secondary", !this.isPlaying);
        });

        // Step
        document.getElementById("btn-step").addEventListener("click", () => {
            this.isPlaying = false;
            document.getElementById("icon-play-pause").textContent = "▶ Play";
            this.executeGpuCompute(1.0 / 60.0);
            this.updateDossierCard();
        });

        // Reset
        document.getElementById("btn-reset").addEventListener("click", () => {
            this.simTimeYears = 0.0;
            this.initGpuBodiesBuffer();
            if (this.wasmSimulation) this.wasmSimulation.reset();
            this.updateDossierCard();
        });

        // Integrator Mode
        const selectInt = document.getElementById("select-integrator");
        selectInt.addEventListener("change", (e) => {
            this.integratorMode = parseInt(e.target.value, 10);
            const pill = document.getElementById("integrator-pill");
            if (this.integratorMode === 1) {
                pill.textContent = "GPU Compute";
                pill.style.color = "var(--accent-blue)";
            } else {
                pill.textContent = "C++20 CPU";
                pill.style.color = "var(--accent-gold)";
            }
        });

        // Speed Slider
        const sliderTime = document.getElementById("slider-timewarp");
        sliderTime.addEventListener("input", (e) => {
            this.timeScaleDaysPerSec = parseFloat(e.target.value);
            const mult = (this.timeScaleDaysPerSec / 36.525).toFixed(1);
            document.getElementById("val-timewarp").textContent = `${this.timeScaleDaysPerSec.toFixed(1)} days/s (${mult}x)`;
        });

        // Substeps Slider
        const sliderSub = document.getElementById("slider-substeps");
        sliderSub.addEventListener("input", (e) => {
            this.subSteps = parseInt(e.target.value, 10);
            document.getElementById("val-substeps").textContent = `${this.subSteps}`;
        });

        // Asteroids Slider
        const sliderAst = document.getElementById("slider-asteroids");
        sliderAst.addEventListener("change", (e) => {
            this.asteroidCount = parseInt(e.target.value, 10);
            document.getElementById("val-asteroids").textContent = `${this.asteroidCount} bodies`;
            this.initGpuBodiesBuffer();
            if (this.wasmSimulation) this.wasmSimulation.setAsteroidCount(this.asteroidCount);
        });

        // Target Selector & Quick Presets
        const selectTarget = document.getElementById("select-target");
        const setFocusTarget = (targetIdx, distance) => {
            this.trackedTargetIndex = targetIdx;
            this.cameraDistance = distance;
            selectTarget.value = String(targetIdx);
            this.updateDossierCard();
        };

        selectTarget.addEventListener("change", (e) => {
            const idx = parseInt(e.target.value, 10);
            let dist = 14.0;
            if (idx === 0) dist = 14.0;
            else if (idx <= 5) dist = 2.2;
            else if (idx <= 7) dist = 5.5;
            else dist = 4.0;
            setFocusTarget(idx, dist);
        });

        const btnSun = document.getElementById("btn-preset-sun");
        if (btnSun) btnSun.addEventListener("click", () => setFocusTarget(0, 14.0));

        const btnEarth = document.getElementById("btn-preset-earth");
        if (btnEarth) btnEarth.addEventListener("click", () => setFocusTarget(3, 2.2));

        const btnJupiter = document.getElementById("btn-preset-jupiter");
        if (btnJupiter) btnJupiter.addEventListener("click", () => setFocusTarget(6, 5.5));

        // Mouse Orbit Controls
        this.canvas.addEventListener("mousedown", (e) => {
            this.isMouseDown = true;
            this.isRightMouseDown = (e.button === 2);
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        window.addEventListener("mouseup", () => {
            this.isMouseDown = false;
            this.isRightMouseDown = false;
        });

        this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

        this.canvas.addEventListener("mousemove", (e) => {
            if (!this.isMouseDown) return;
            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            if (this.isRightMouseDown) {
                const panSpeed = 0.003 * this.cameraDistance;
                this.cameraFocus[0] -= dx * panSpeed;
                this.cameraFocus[1] += dy * panSpeed;
            } else {
                this.cameraYaw += dx * 0.35;
                this.cameraPitch = Math.max(-85, Math.min(85, this.cameraPitch - dy * 0.35));
            }
        });

        this.canvas.addEventListener("wheel", (e) => {
            e.preventDefault();
            const zoomFactor = Math.exp(e.deltaY * 0.001);
            this.cameraDistance = Math.max(0.2, Math.min(300.0, this.cameraDistance * zoomFactor));
        }, { passive: false });

        // Fallback Dismiss
        document.getElementById("btn-fallback-dismiss").addEventListener("click", () => {
            document.getElementById("webgpu-unsupported").classList.add("hidden");
            this.initCanvasFallback();
        });
    }

    // --- 5. High-Performance Canvas 2D Fallback Renderer ---
    initCanvasFallback() {
        console.log("[SolarSim] Initializing 2D Canvas Fallback Renderer...");
        let ctx = this.canvas.getContext("2d");
        if (!ctx) {
            // Replace canvas with fresh element if already locked by webgpu
            const freshCanvas = this.canvas.cloneNode(false);
            this.canvas.parentNode.replaceChild(freshCanvas, this.canvas);
            this.canvas = freshCanvas;
            ctx = this.canvas.getContext("2d");
        }
        if (!ctx) return;

        let lastTime = performance.now();

        const render2D = (time) => {
            const dtSec = (time - lastTime) * 0.001;
            lastTime = time;

            if (this.isPlaying && dtSec > 0 && dtSec < 0.5) {
                const dtYears = dtSec * (this.timeScaleDaysPerSec / 365.25);
                this.simTimeYears += dtYears;
                const days = (this.simTimeYears * 365.25).toFixed(0);
                const elTime = document.getElementById("stat-time");
                if (elTime) elTime.textContent = `Year ${this.simTimeYears.toFixed(2)} (Day ${days})`;
            }

            const width = (this.canvas.width = window.innerWidth);
            const height = (this.canvas.height = window.innerHeight);

            // Clear Background
            ctx.fillStyle = "#07090f";
            ctx.fillRect(0, 0, width, height);

            const cx = width / 2;
            const cy = height / 2;
            const scale = Math.min(width, height) / (this.cameraDistance * 1.8);

            // Draw Orbit Rings
            if (document.getElementById("toggle-trails").checked) {
                for (let i = 1; i <= 10; ++i) {
                    const meta = PLANET_METADATA[i];
                    ctx.beginPath();
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
                    ctx.lineWidth = 1;
                    ctx.arc(cx, cy, meta.a * scale, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }

            // Draw Sun
            const sunGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 35);
            sunGrad.addColorStop(0, "#fff5b8");
            sunGrad.addColorStop(0.3, "#ffcc00");
            sunGrad.addColorStop(1, "rgba(255, 120, 0, 0)");
            ctx.beginPath();
            ctx.fillStyle = sunGrad;
            ctx.arc(cx, cy, 35, 0, Math.PI * 2);
            ctx.fill();

            // Draw Planets
            const t = this.simTimeYears;
            for (let i = 1; i <= 10; ++i) {
                const meta = PLANET_METADATA[i];
                const angle = t * (Math.PI * 2 / (meta.a * Math.sqrt(meta.a || 1)));
                const px = cx + Math.cos(angle) * meta.a * scale;
                const py = cy + Math.sin(angle) * meta.a * scale * 0.8; // subtle perspective tilt

                ctx.beginPath();
                ctx.fillStyle = meta.color;
                ctx.shadowColor = meta.color;
                ctx.shadowBlur = 10;
                ctx.arc(px, py, Math.max(3, 8 * (meta.radiusKm.replace(/[^0-9]/g, "") / 70000)), 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                // Label
                if (document.getElementById("toggle-labels").checked) {
                    ctx.fillStyle = "#cbd5e1";
                    ctx.font = "11px Outfit, sans-serif";
                    ctx.fillText(meta.name, px + 8, py - 4);
                }
            }

            requestAnimationFrame(render2D);
        };

        requestAnimationFrame(render2D);
    }
}

// Start application
window.addEventListener("DOMContentLoaded", () => {
    const app = new SolarSimApp();
    app.init();
});
