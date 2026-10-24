// ==============================================================================
// WebGPU Render Shader: Celestial Body (Planet / Moon / Asteroid)
// ==============================================================================

struct CameraUniforms {
    viewProjection: mat4x4<f32>,
    cameraPos: vec4<f32>,
};

struct InstanceData {
    worldPos: vec4<f32>,   // xyz = pos, w = radius
    color: vec4<f32>,      // rgba
    extra: vec4<f32>,      // x = bodyType, y = isEmitter, z = rotationAngle, w = axialTilt
};

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<uniform> instance: InstanceData;

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
};

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    // Apply axial tilt and axial rotation
    let angle = instance.extra.z;
    let cosA = cos(angle);
    let sinA = sin(angle);
    let rotatedPos = vec3<f32>(
        in.position.x * cosA - in.position.z * sinA,
        in.position.y,
        in.position.x * sinA + in.position.z * cosA
    );
    let rotatedNormal = vec3<f32>(
        in.normal.x * cosA - in.normal.z * sinA,
        in.normal.y,
        in.normal.x * sinA + in.normal.z * cosA
    );

    let worldPos = instance.worldPos.xyz + rotatedPos * instance.worldPos.w;
    out.worldPosition = worldPos;
    out.worldNormal = normalize(rotatedNormal);
    out.uv = in.uv;
    out.clipPosition = camera.viewProjection * vec4<f32>(worldPos, 1.0);

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let N = normalize(in.worldNormal);
    let V = normalize(camera.cameraPos.xyz - in.worldPosition);

    // Light source: The Sun is at the origin (0, 0, 0)
    let lightDir = normalize(vec3<f32>(0.0, 0.0, 0.0) - in.worldPosition);
    let distanceToSun = length(in.worldPosition);

    // If this body is an emitter (the Sun), render full bright emission
    if (instance.extra.y > 0.5) {
        let fresnelSun = 1.0 - max(0.0, dot(N, V));
        let coronaColor = vec3<f32>(1.0, 0.65, 0.15) * pow(fresnelSun, 2.0);
        return vec4<f32>(instance.color.rgb + coronaColor, 1.0);
    }

    // Diffuse lighting from Sun
    let NdotL = max(0.0, dot(N, lightDir));
    
    // Smooth day-to-night terminator
    let dayFactor = smoothstep(-0.1, 0.2, dot(N, lightDir));

    // Blinn-Phong specular highlight
    let H = normalize(lightDir + V);
    let NdotH = max(0.0, dot(N, H));
    let specular = pow(NdotH, 32.0) * 0.4 * dayFactor;

    // Atmospheric rim glow (Fresnel effect)
    let fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.0);
    let atmosphereColor = vec3<f32>(0.3, 0.6, 1.0) * fresnel * (NdotL * 0.7 + 0.3);

    // Deep space ambient fill (so night sides aren't pitch black)
    let ambient = vec3<f32>(0.03, 0.04, 0.07);

    // Combine lighting
    let litColor = instance.color.rgb * (ambient + NdotL * 0.95) + vec3<f32>(specular) + atmosphereColor * 0.6;

    return vec4<f32>(litColor, 1.0);
}
