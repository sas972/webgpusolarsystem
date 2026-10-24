// ==============================================================================
// WebGPU Render Shader: Procedural Deep-Space Starfield Skybox
// ==============================================================================

struct CameraUniforms {
    viewProjection: mat4x4<f32>,
    cameraPos: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;

struct VertexOutput {
    @builtin(position) clipPosition: vec4<f32>,
    @location(0) rayDir: vec3<f32>,
};

// Full-screen quad without vertex buffer
@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var out: VertexOutput;
    // Generate full-screen quad coordinates [-1, 1]
    let pos = array<vec2<f32>, 4>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0,  1.0)
    );

    let p = pos[vertexIndex];
    out.clipPosition = vec4<f32>(p, 0.999999, 1.0); // Maximum depth

    // Approximate view ray
    out.rayDir = vec3<f32>(p.x, p.y, -1.0);
    return out;
}

// Pseudo-random hash function
fn hash3(p: vec3<f32>) -> f32 {
    let q = fract(p * 0.3183099 + vec3<f32>(0.1, 0.1, 0.1));
    let r = q * 17.0;
    return fract(r.x * r.y * r.z * (r.x + r.y + r.z));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let dir = normalize(in.rayDir);
    
    // Grid quantization for star generation
    let scale = 180.0;
    let grid = floor(dir * scale);
    let cell = fract(dir * scale) - 0.5;

    let h = hash3(grid);
    var color = vec3<f32>(0.003, 0.005, 0.012); // Deep space cosmic black

    if (h > 0.985) {
        let starCenter = (vec3<f32>(hash3(grid + 1.0), hash3(grid + 2.0), hash3(grid + 3.0)) - 0.5) * 0.7;
        let d = length(cell - starCenter);
        let brightness = smoothstep(0.08, 0.001, d) * pow((h - 0.985) / 0.015, 2.0);

        // Spectral class star color tint:
        // Blue (O/B), White (A), Yellow (G like Sun), Orange (K), Red (M)
        let starType = fract(h * 37.0);
        var starTint = vec3<f32>(1.0, 1.0, 1.0);
        if (starType < 0.25) {
            starTint = vec3<f32>(0.7, 0.85, 1.0); // hot blue
        } else if (starType < 0.5) {
            starTint = vec3<f32>(1.0, 0.95, 0.8); // warm white
        } else if (starType < 0.75) {
            starTint = vec3<f32>(1.0, 0.8, 0.5);  // orange
        } else {
            starTint = vec3<f32>(1.0, 0.55, 0.45); // red dwarf
        }

        color = color + starTint * brightness * 1.5;
    }

    return vec4<f32>(color, 1.0);
}
