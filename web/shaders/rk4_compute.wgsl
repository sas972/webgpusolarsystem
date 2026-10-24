// ==============================================================================
// WebGPU Compute Shader: Runge-Kutta 4th Order (RK4) N-Body Gravitational Physics
// ==============================================================================

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
    softeningSq: f32,   // epsilon^2 to prevent singular forces
    time: f32,
    padding1: f32,
    padding2: f32,
};

@group(0) @binding(0) var<uniform> sim: SimUniforms;
@group(0) @binding(1) var<storage, read_write> bodies: array<GpuBody>;

// Calculates gravitational acceleration on a particle at testPos
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

        // a = G * m_other * diff / dist^3
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

    // --- Runge-Kutta 4 Stages ---
    // Stage 1
    let k1_v = compute_acceleration(r0, idx);
    let k1_r = v0;

    // Stage 2
    let r1 = r0 + k1_r * (0.5 * dt);
    let v1 = v0 + k1_v * (0.5 * dt);
    let k2_v = compute_acceleration(r1, idx);
    let k2_r = v1;

    // Stage 3
    let r2 = r0 + k2_r * (0.5 * dt);
    let v2 = v0 + k2_v * (0.5 * dt);
    let k3_v = compute_acceleration(r2, idx);
    let k3_r = v2;

    // Stage 4
    let r3 = r0 + k3_r * dt;
    let v3 = v0 + k3_v * dt;
    let k4_v = compute_acceleration(r3, idx);
    let k4_r = v3;

    // Weighted combination: y_new = y0 + (dt / 6) * (k1 + 2*k2 + 2*k3 + k4)
    let inv6 = dt / 6.0;
    let new_pos = r0 + (k1_r + (k2_r + k3_r) * 2.0 + k4_r) * inv6;
    let new_vel = v0 + (k1_v + (k2_v + k3_v) * 2.0 + k4_v) * inv6;

    body.pos = vec4<f32>(new_pos, body.pos.w);
    body.vel = vec4<f32>(new_vel, body.vel.w);

    bodies[idx] = body;
}
