#pragma once

#include "Vector3.hpp"
#include <string>
#include <vector>
#include <array>
#include <cstdint>

namespace solarsim {

enum class BodyType : uint32_t {
    Star = 0,
    TerrestrialPlanet = 1,
    GasGiant = 2,
    IceGiant = 3,
    Moon = 4,
    DwarfPlanet = 5,
    Asteroid = 6
};

/**
 * @brief Representation of a celestial body in the solar system.
 * Units:
 *   - Mass: Solar masses (Sun = 1.0)
 *   - Position: Astronomical Units (AU)
 *   - Velocity: AU / Earth year (1 AU/yr ≈ 4.74 km/s)
 *   - Display Radius: Scaled for visual clarity in 3D WebGPU view
 */
struct Body {
    uint32_t id{0};
    std::string name{"Unnamed"};
    BodyType type{BodyType::Asteroid};

    double mass{0.0};           // in Solar Masses (M_sun = 1.0)
    Vector3 position{0, 0, 0};  // in Astronomical Units (AU)
    Vector3 velocity{0, 0, 0};  // in AU / Year

    float realRadiusKm{1000.0f}; // Real equatorial radius in km
    float displayRadius{0.1f};   // Scaled radius for 3D graphics
    std::array<float, 4> color{1.0f, 1.0f, 1.0f, 1.0f}; // RGBA

    bool isEmitter{false};      // Emits light (e.g. the Sun)
    bool hasRings{false};       // Has ring system (e.g. Saturn)
    float ringInnerRadius{0.0f};
    float ringOuterRadius{0.0f};

    // Rotation around own axis (hours per revolution)
    float rotationPeriodHours{24.0f};
    float axialTiltDeg{0.0f};
    float currentRotationDeg{0.0f};

    // Trail history for rendering orbit path ribbons
    std::vector<Vector3> trailHistory{};
    size_t maxTrailPoints{500};
    double trailSampleIntervalYears{0.005}; // sample every ~2 days
    double timeSinceLastTrailSample{0.0};

    void appendTrail(double dtYears) {
        timeSinceLastTrailSample += dtYears;
        if (timeSinceLastTrailSample >= trailSampleIntervalYears) {
            trailHistory.push_back(position);
            if (trailHistory.size() > maxTrailPoints) {
                trailHistory.erase(trailHistory.begin());
            }
            timeSinceLastTrailSample = 0.0;
        }
    }

    void clearTrail() {
        trailHistory.clear();
        timeSinceLastTrailSample = 0.0;
    }
};

/**
 * @brief Plain Old Data (POD) structure matching GPU Compute Shader buffer layout.
 * Aligned to 16 bytes for WebGPU WGSL compatibility.
 */
struct alignas(16) GpuBodyData {
    float posX, posY, posZ, mass;      // vec4<f32>: pos.xyz, mass
    float velX, velY, velZ, radius;    // vec4<f32>: vel.xyz, radius
    float r, g, b, a;                  // vec4<f32>: color
    uint32_t bodyType;                 // 0=Star, 1=Planet, 2=Asteroid...
    uint32_t id;                       // unique index
    float flags;                       // bitmask: 1=emitter, 2=rings
    float padding;
};

} // namespace solarsim
