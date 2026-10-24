// ==============================================================================
// WebGPU Render Shader: Orbital Trajectory Trails
// ==============================================================================

struct CameraUniforms {
    viewProjection: mat4x4<f32>,
    cameraPos: vec4<f32>,
};

struct TrailUniforms {
    color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> trail: TrailUniforms;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) progress: f32, // 0.0 (oldest point) to 1.0 (current position)
};

struct VertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) alpha: f32,
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.clipPosition = camera.viewProjection * vec4<f32>(in.position, 1.0);
    // Smoothly fade from head to tail
    out.alpha = pow(in.progress, 1.8);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(trail.color.rgb, trail.color.a * in.alpha * 0.7);
}
