#pragma once

#include "../physics/Vector3.hpp"
#include <array>
#include <cmath>
#include <numbers>

namespace solarsim {

/**
 * @brief 3D Orbit Camera with target tracking and WebGPU-compatible 4x4 matrix generation.
 * WebGPU uses column-major matrices with depth range [0, 1].
 */
class Camera {
public:
    Vector3 target{0.0, 0.0, 0.0};
    double distance{18.0};           // distance in AU
    double yawDeg{45.0};             // rotation around Y axis in degrees
    double pitchDeg{30.0};           // elevation angle in degrees
    
    double fovYDeg{55.0};
    double nearPlane{0.01};
    double farPlane{2000.0};
    double aspectRatio{16.0 / 9.0};

    // Smooth damping / interpolation towards target
    Vector3 currentFocusPos{0.0, 0.0, 0.0};

    Camera() = default;

    void update(double dt, const Vector3& trackedTargetPos) {
        // Smooth lerp to tracked body
        double lerpSpeed = 5.0 * dt;
        if (lerpSpeed > 1.0) lerpSpeed = 1.0;
        currentFocusPos = currentFocusPos + (trackedTargetPos - currentFocusPos) * lerpSpeed;
    }

    [[nodiscard]] Vector3 getEyePosition() const noexcept {
        double yawRad = yawDeg * std::numbers::pi / 180.0;
        double pitchRad = pitchDeg * std::numbers::pi / 180.0;

        double cosPitch = std::cos(pitchRad);
        double sinPitch = std::sin(pitchRad);
        double cosYaw = std::cos(yawRad);
        double sinYaw = std::sin(yawRad);

        Vector3 offset{
            distance * cosPitch * sinYaw,
            distance * sinPitch,
            distance * cosPitch * cosYaw
        };

        return currentFocusPos + offset;
    }

    /**
     * @brief Computes 4x4 View Matrix (column-major array of 16 floats).
     */
    [[nodiscard]] std::array<float, 16> getViewMatrix() const noexcept {
        Vector3 eye = getEyePosition();
        Vector3 center = currentFocusPos;
        Vector3 up{0.0, 1.0, 0.0};

        Vector3 f = (center - eye).normalized();
        Vector3 s = f.cross(up).normalized();
        Vector3 u = s.cross(f);

        std::array<float, 16> m{};
        m[0]  = static_cast<float>(s.x);
        m[1]  = static_cast<float>(u.x);
        m[2]  = static_cast<float>(-f.x);
        m[3]  = 0.0f;

        m[4]  = static_cast<float>(s.y);
        m[5]  = static_cast<float>(u.y);
        m[6]  = static_cast<float>(-f.y);
        m[7]  = 0.0f;

        m[8]  = static_cast<float>(s.z);
        m[9]  = static_cast<float>(u.z);
        m[10] = static_cast<float>(-f.z);
        m[11] = 0.0f;

        m[12] = static_cast<float>(-s.dot(eye));
        m[13] = static_cast<float>(-u.dot(eye));
        m[14] = static_cast<float>(f.dot(eye));
        m[15] = 1.0f;

        return m;
    }

    /**
     * @brief Computes WebGPU Perspective Projection Matrix with [0, 1] depth range (column-major).
     */
    [[nodiscard]] std::array<float, 16> getProjectionMatrix() const noexcept {
        double fovRad = fovYDeg * std::numbers::pi / 180.0;
        double f = 1.0 / std::tan(fovRad * 0.5);

        std::array<float, 16> m{};
        m[0]  = static_cast<float>(f / aspectRatio);
        m[1]  = 0.0f;
        m[2]  = 0.0f;
        m[3]  = 0.0f;

        m[4]  = 0.0f;
        m[5]  = static_cast<float>(f);
        m[6]  = 0.0f;
        m[7]  = 0.0f;

        m[8]  = 0.0f;
        m[9]  = 0.0f;
        m[10] = static_cast<float>(farPlane / (nearPlane - farPlane));
        m[11] = -1.0f;

        m[12] = 0.0f;
        m[13] = 0.0f;
        m[14] = static_cast<float>((nearPlane * farPlane) / (nearPlane - farPlane));
        m[15] = 0.0f;

        return m;
    }

    /**
     * @brief Computes combined View-Projection matrix: VP = P * V.
     */
    [[nodiscard]] std::array<float, 16> getViewProjectionMatrix() const noexcept {
        auto v = getViewMatrix();
        auto p = getProjectionMatrix();
        std::array<float, 16> vp{};

        for (int col = 0; col < 4; ++col) {
            for (int row = 0; row < 4; ++row) {
                float sum = 0.0f;
                for (int k = 0; k < 4; ++k) {
                    sum += p[k * 4 + row] * v[col * 4 + k];
                }
                vp[col * 4 + row] = sum;
            }
        }
        return vp;
    }
};

} // namespace solarsim
