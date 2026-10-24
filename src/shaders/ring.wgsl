// ==============================================================================
// WebGPU Render Shader: Planetary Rings (e.g., Saturn)
// ==============================================================================

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
    @location(0) worldPosition: vec3<f32>,
    @location(1) uv: vec2<f32>,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    let worldPos = ring.worldPos.xyz + in.position * ring.worldPos.w;
    out.worldPosition = worldPos;
    out.uv = in.uv;
    out.clipPosition = camera.viewProjection * vec4<f32>(worldPos, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // uv.y varies from 0.0 (inner edge) to 1.0 (outer edge)
    let r = in.uv.y;

    // Procedural ring banding structure
    // Ring B: 0.1 to 0.55
    // Cassini Division: 0.55 to 0.63 (gap)
    // Ring A: 0.63 to 0.95
    // Encke Gap: ~0.85
    let cassiniGap = smoothstep(0.53, 0.57, r) * (1.0 - smoothstep(0.61, 0.65, r));
    let enckeGap = smoothstep(0.83, 0.85, r) * (1.0 - smoothstep(0.86, 0.88, r));

    // High frequency ringlets
    let ringlets = sin(r * 120.0) * 0.15 + cos(r * 45.0) * 0.2 + 0.65;

    // Edge fades
    let innerFade = smoothstep(0.0, 0.08, r);
    let outerFade = 1.0 - smoothstep(0.92, 1.0, r);

    var alpha = (ringlets - cassiniGap * 0.85 - enckeGap * 0.7) * innerFade * outerFade;
    alpha = clamp(alpha, 0.0, 0.85);

    let ringColor = mix(
        vec3<f32>(0.85, 0.76, 0.60),
        vec3<f32>(0.95, 0.88, 0.72),
        ringlets
    );

    return vec4<f32>(ringColor, alpha);
}
