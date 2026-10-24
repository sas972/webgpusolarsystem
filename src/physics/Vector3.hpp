#pragma once

#include <cmath>
#include <iostream>

namespace solarsim {

/**
 * @brief High-performance 3D Vector class with C++20 constexpr math support.
 */
struct Vector3 {
    double x{0.0};
    double y{0.0};
    double z{0.0};

    constexpr Vector3() = default;
    constexpr Vector3(double x_, double y_, double z_) : x(x_), y(y_), z(z_) {}

    constexpr Vector3 operator+(const Vector3& rhs) const noexcept {
        return {x + rhs.x, y + rhs.y, z + rhs.z};
    }

    constexpr Vector3 operator-(const Vector3& rhs) const noexcept {
        return {x - rhs.x, y - rhs.y, z - rhs.z};
    }

    constexpr Vector3 operator-() const noexcept {
        return {-x, -y, -z};
    }

    constexpr Vector3 operator*(double scalar) const noexcept {
        return {x * scalar, y * scalar, z * scalar};
    }

    friend constexpr Vector3 operator*(double scalar, const Vector3& v) noexcept {
        return v * scalar;
    }

    constexpr Vector3 operator/(double scalar) const noexcept {
        double inv = 1.0 / scalar;
        return {x * inv, y * inv, z * inv};
    }

    constexpr Vector3& operator+=(const Vector3& rhs) noexcept {
        x += rhs.x;
        y += rhs.y;
        z += rhs.z;
        return *this;
    }

    constexpr Vector3& operator-=(const Vector3& rhs) noexcept {
        x -= rhs.x;
        y -= rhs.y;
        z -= rhs.z;
        return *this;
    }

    constexpr Vector3& operator*=(double scalar) noexcept {
        x *= scalar;
        y *= scalar;
        z *= scalar;
        return *this;
    }

    constexpr Vector3& operator/=(double scalar) noexcept {
        double inv = 1.0 / scalar;
        x *= inv;
        y *= inv;
        z *= inv;
        return *this;
    }

    [[nodiscard]] constexpr double dot(const Vector3& rhs) const noexcept {
        return x * rhs.x + y * rhs.y + z * rhs.z;
    }

    [[nodiscard]] constexpr Vector3 cross(const Vector3& rhs) const noexcept {
        return {
            y * rhs.z - z * rhs.y,
            z * rhs.x - x * rhs.z,
            x * rhs.y - y * rhs.x
        };
    }

    [[nodiscard]] constexpr double lengthSquared() const noexcept {
        return x * x + y * y + z * z;
    }

    [[nodiscard]] double length() const noexcept {
        return std::sqrt(lengthSquared());
    }

    [[nodiscard]] constexpr double distanceSquared(const Vector3& rhs) const noexcept {
        return (*this - rhs).lengthSquared();
    }

    [[nodiscard]] double distance(const Vector3& rhs) const noexcept {
        return (*this - rhs).length();
    }

    [[nodiscard]] Vector3 normalized() const noexcept {
        double len = length();
        if (len > 1e-15) {
            return *this / len;
        }
        return {0.0, 0.0, 0.0};
    }

    friend std::ostream& operator<<(std::ostream& os, const Vector3& v) {
        return os << "(" << v.x << ", " << v.y << ", " << v.z << ")";
    }
};

} // namespace solarsim
