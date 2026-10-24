#pragma once

#include <vector>
#include <cmath>
#include <numbers>
#include <cstdint>

namespace solarsim {

struct Vertex {
    float x, y, z;       // Position
    float nx, ny, nz;    // Normal
    float u, v;          // Texture coordinates
};

class GeometryBuilder {
public:
    /**
     * @brief Generates a UV sphere mesh.
     * @param latitudeBands Number of horizontal divisions.
     * @param longitudeBands Number of vertical divisions.
     * @param radius Sphere radius (default 1.0).
     */
    static void createSphere(
        uint32_t latitudeBands,
        uint32_t longitudeBands,
        std::vector<Vertex>& outVertices,
        std::vector<uint16_t>& outIndices,
        float radius = 1.0f)
    {
        outVertices.clear();
        outIndices.clear();

        for (uint32_t lat = 0; lat <= latitudeBands; ++lat) {
            float theta = static_cast<float>(lat) * std::numbers::pi_v<float> / static_cast<float>(latitudeBands);
            float sinTheta = std::sin(theta);
            float cosTheta = std::cos(theta);

            for (uint32_t lon = 0; lon <= longitudeBands; ++lon) {
                float phi = static_cast<float>(lon) * 2.0f * std::numbers::pi_v<float> / static_cast<float>(longitudeBands);
                float sinPhi = std::sin(phi);
                float cosPhi = std::cos(phi);

                float nx = cosPhi * sinTheta;
                float ny = cosTheta;
                float nz = sinPhi * sinTheta;

                float u = 1.0f - (static_cast<float>(lon) / static_cast<float>(longitudeBands));
                float v = 1.0f - (static_cast<float>(lat) / static_cast<float>(latitudeBands));

                outVertices.push_back({
                    radius * nx, radius * ny, radius * nz,
                    nx, ny, nz,
                    u, v
                });
            }
        }

        for (uint32_t lat = 0; lat < latitudeBands; ++lat) {
            for (uint32_t lon = 0; lon < longitudeBands; ++lon) {
                uint16_t first = static_cast<uint16_t>((lat * (longitudeBands + 1)) + lon);
                uint16_t second = static_cast<uint16_t>(first + longitudeBands + 1);

                outIndices.push_back(first);
                outIndices.push_back(second);
                outIndices.push_back(first + 1);

                outIndices.push_back(second);
                outIndices.push_back(second + 1);
                outIndices.push_back(first + 1);
            }
        }
    }

    /**
     * @brief Generates flat ring geometry in XZ plane for planetary rings (e.g. Saturn).
     */
    static void createRing(
        float innerRadius,
        float outerRadius,
        uint32_t segments,
        std::vector<Vertex>& outVertices,
        std::vector<uint16_t>& outIndices)
    {
        outVertices.clear();
        outIndices.clear();

        for (uint32_t i = 0; i <= segments; ++i) {
            float angle = static_cast<float>(i) * 2.0f * std::numbers::pi_v<float> / static_cast<float>(segments);
            float cosA = std::cos(angle);
            float sinA = std::sin(angle);
            float u = static_cast<float>(i) / static_cast<float>(segments);

            // Inner edge vertex
            outVertices.push_back({
                innerRadius * cosA, 0.0f, innerRadius * sinA,
                0.0f, 1.0f, 0.0f,
                u, 0.0f
            });

            // Outer edge vertex
            outVertices.push_back({
                outerRadius * cosA, 0.0f, outerRadius * sinA,
                0.0f, 1.0f, 0.0f,
                u, 1.0f
            });
        }

        for (uint32_t i = 0; i < segments; ++i) {
            uint16_t i0 = static_cast<uint16_t>(i * 2);
            uint16_t i1 = static_cast<uint16_t>(i0 + 1);
            uint16_t i2 = static_cast<uint16_t>(i0 + 2);
            uint16_t i3 = static_cast<uint16_t>(i0 + 3);

            outIndices.push_back(i0);
            outIndices.push_back(i1);
            outIndices.push_back(i2);

            outIndices.push_back(i1);
            outIndices.push_back(i3);
            outIndices.push_back(i2);
        }
    }
};

} // namespace solarsim
