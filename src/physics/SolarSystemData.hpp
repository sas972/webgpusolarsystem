#pragma once

#include "Body.hpp"
#include <vector>
#include <cmath>
#include <random>
#include <numbers>

namespace solarsim {

// Gravitational Constant G in astronomical units:
// AU^3 * M_sun^-1 * Year^-2 = 4 * pi^2
inline constexpr double G_CONST = 39.478417604357432;

// Softening parameter to prevent singularities during close encounters (~0.00003 AU softening length)
inline constexpr double SOFTENING_EPSILON_SQ = 1e-9;

class SolarSystemFactory {
public:
    /**
     * @brief Creates the canonical Solar System bodies (Sun, 8 planets, Moon, Pluto)
     * initialized with Keplerian orbital parameters at perihelion.
     */
    static std::vector<Body> createMajorBodies() {
        std::vector<Body> bodies;
        bodies.reserve(32);

        // 0. The Sun
        {
            Body sun;
            sun.id = 0;
            sun.name = "Sun";
            sun.type = BodyType::Star;
            sun.mass = 1.0; // 1.0 Solar Mass
            sun.position = {0.0, 0.0, 0.0};
            sun.velocity = {0.0, 0.0, 0.0};
            sun.realRadiusKm = 696340.0f;
            sun.displayRadius = 0.22f; // Scaled ~0.4x so Mercury (perihelion 0.3075 AU) has clear clearance
            sun.color = {1.0f, 0.92f, 0.55f, 1.0f};
            sun.isEmitter = true;
            sun.rotationPeriodHours = 600.0f;
            sun.axialTiltDeg = 7.25f;
            bodies.push_back(sun);
        }

        // 1. Mercury
        {
            Body mercury;
            mercury.id = 1;
            mercury.name = "Mercury";
            mercury.type = BodyType::TerrestrialPlanet;
            mercury.mass = 1.6601e-7;
            mercury.position = {0.3075, 0.0, 0.0}; // perihelion
            mercury.velocity = {0.0, 12.436, 0.0};
            mercury.realRadiusKm = 2439.7f;
            mercury.displayRadius = 0.055f; // ~0.6x
            mercury.color = {0.72f, 0.70f, 0.68f, 1.0f};
            mercury.rotationPeriodHours = 1407.6f;
            mercury.axialTiltDeg = 0.034f;
            bodies.push_back(mercury);
        }

        // 2. Venus
        {
            Body venus;
            venus.id = 2;
            venus.name = "Venus";
            venus.type = BodyType::TerrestrialPlanet;
            venus.mass = 2.4478e-6;
            venus.position = {0.7184, 0.0, 0.0};
            venus.velocity = {0.0, 7.437, 0.0};
            venus.realRadiusKm = 6051.8f;
            venus.displayRadius = 0.085f; // ~0.6x
            venus.color = {0.91f, 0.78f, 0.55f, 1.0f};
            venus.rotationPeriodHours = -5832.5f; // Retrograde rotation
            venus.axialTiltDeg = 177.36f;
            bodies.push_back(venus);
        }

        // 3. Earth
        {
            Body earth;
            earth.id = 3;
            earth.name = "Earth";
            earth.type = BodyType::TerrestrialPlanet;
            earth.mass = 3.0035e-6;
            earth.position = {0.9833, 0.0, 0.0};
            earth.velocity = {0.0, 6.389, 0.0};
            earth.realRadiusKm = 6371.0f;
            earth.displayRadius = 0.090f; // ~0.6x
            earth.color = {0.25f, 0.55f, 0.95f, 1.0f};
            earth.rotationPeriodHours = 23.934f;
            earth.axialTiltDeg = 23.44f;
            bodies.push_back(earth);
        }

        // 4. The Moon (orbits Earth)
        {
            Body moon;
            moon.id = 4;
            moon.name = "Moon";
            moon.type = BodyType::Moon;
            moon.mass = 3.6943e-8;
            // Positioned near Earth with relative orbital speed and 5.145 deg lunar inclination
            moon.position = {0.9833 + 0.00257, 0.0, 0.0};
            moon.velocity = {0.0, 6.389 + 0.21397, 0.01927};
            moon.realRadiusKm = 1737.4f;
            moon.displayRadius = 0.035f; // ~0.6x
            moon.color = {0.82f, 0.82f, 0.84f, 1.0f};
            moon.rotationPeriodHours = 655.7f;
            moon.axialTiltDeg = 6.68f;
            bodies.push_back(moon);
        }

        // 5. Mars
        {
            Body mars;
            mars.id = 5;
            mars.name = "Mars";
            mars.type = BodyType::TerrestrialPlanet;
            mars.mass = 3.2272e-7;
            mars.position = {1.3814, 0.0, 0.0};
            mars.velocity = {0.0, 5.589, 0.0};
            mars.realRadiusKm = 3389.5f;
            mars.displayRadius = 0.065f; // ~0.6x
            mars.color = {0.89f, 0.38f, 0.22f, 1.0f};
            mars.rotationPeriodHours = 24.623f;
            mars.axialTiltDeg = 25.19f;
            bodies.push_back(mars);
        }

        // 6. Jupiter
        {
            Body jupiter;
            jupiter.id = 6;
            jupiter.name = "Jupiter";
            jupiter.type = BodyType::GasGiant;
            jupiter.mass = 9.54588e-4; // 1/1047 solar mass
            jupiter.position = {4.9520, 0.0, 0.0};
            jupiter.velocity = {0.0, 2.891, 0.0};
            jupiter.realRadiusKm = 69911.0f;
            jupiter.displayRadius = 0.245f; // ~0.65x
            jupiter.color = {0.84f, 0.68f, 0.52f, 1.0f};
            jupiter.rotationPeriodHours = 9.925f;
            jupiter.axialTiltDeg = 3.13f;
            bodies.push_back(jupiter);
        }

        // 7. Saturn (with rings)
        {
            Body saturn;
            saturn.id = 7;
            saturn.name = "Saturn";
            saturn.type = BodyType::GasGiant;
            saturn.mass = 2.85886e-4;
            saturn.position = {9.0508, 0.0, 0.0};
            saturn.velocity = {0.0, 2.145, 0.0};
            saturn.realRadiusKm = 58232.0f;
            saturn.displayRadius = 0.205f; // ~0.65x
            saturn.color = {0.92f, 0.85f, 0.65f, 1.0f};
            saturn.hasRings = true;
            saturn.ringInnerRadius = 0.260f;
            saturn.ringOuterRadius = 0.530f;
            saturn.rotationPeriodHours = 10.656f;
            saturn.axialTiltDeg = 26.73f;
            bodies.push_back(saturn);
        }

        // 8. Uranus
        {
            Body uranus;
            uranus.id = 8;
            uranus.name = "Uranus";
            uranus.type = BodyType::IceGiant;
            uranus.mass = 4.36624e-5;
            uranus.position = {18.328, 0.0, 0.0};
            uranus.velocity = {0.0, 1.501, 0.0};
            uranus.realRadiusKm = 25362.0f;
            uranus.displayRadius = 0.150f; // ~0.65x
            uranus.color = {0.55f, 0.83f, 0.88f, 1.0f};
            uranus.rotationPeriodHours = -17.24f; // Retrograde / tilted on side
            uranus.axialTiltDeg = 97.77f;
            bodies.push_back(uranus);
        }

        // 9. Neptune
        {
            Body neptune;
            neptune.id = 9;
            neptune.name = "Neptune";
            neptune.type = BodyType::IceGiant;
            neptune.mass = 5.15139e-5;
            neptune.position = {29.824, 0.0, 0.0};
            neptune.velocity = {0.0, 1.156, 0.0};
            neptune.realRadiusKm = 24622.0f;
            neptune.displayRadius = 0.140f; // ~0.64x
            neptune.color = {0.28f, 0.46f, 0.94f, 1.0f};
            neptune.rotationPeriodHours = 16.11f;
            neptune.axialTiltDeg = 28.32f;
            bodies.push_back(neptune);
        }

        // 10. Pluto
        {
            Body pluto;
            pluto.id = 10;
            pluto.name = "Pluto";
            pluto.type = BodyType::DwarfPlanet;
            pluto.mass = 6.55e-9;
            // Pluto has an inclined orbit (17.16 degrees)
            double incRad = 17.16 * std::numbers::pi / 180.0;
            double r = 29.659;
            double v = 1.289;
            pluto.position = {r * std::cos(incRad), 0.0, r * std::sin(incRad)};
            pluto.velocity = {0.0, v, 0.0};
            pluto.realRadiusKm = 1188.3f;
            pluto.displayRadius = 0.042f; // ~0.6x
            pluto.color = {0.80f, 0.72f, 0.65f, 1.0f};
            pluto.rotationPeriodHours = -153.3f;
            pluto.axialTiltDeg = 122.53f;
            bodies.push_back(pluto);
        }

        // Adjust velocities so total momentum is zero (Barycentric frame)
        correctBarycenterMomentum(bodies);

        return bodies;
    }

    /**
     * @brief Generates procedural Asteroid Belt particles between Mars (1.52 AU) and Jupiter (5.2 AU).
     * Placed primarily between 2.1 AU and 3.3 AU with realistic semi-major axis, eccentricity, and inclination.
     */
    static std::vector<Body> createAsteroidBelt(uint32_t count, uint32_t startingId = 11) {
        std::vector<Body> asteroids;
        asteroids.reserve(count);

        std::mt19937_64 rng(42); // deterministic seed for reproducibility
        std::uniform_real_distribution<double> distA(2.1, 3.3);       // Semi-major axis (AU)
        std::uniform_real_distribution<double> distE(0.01, 0.22);     // Eccentricity
        std::uniform_real_distribution<double> distInc(-0.15, 0.15);  // Inclination in radians (~8.5 deg)
        std::uniform_real_distribution<double> distTheta(0.0, 2.0 * std::numbers::pi); // True anomaly
        std::uniform_real_distribution<float> distColor(0.55f, 0.85f);

        for (uint32_t i = 0; i < count; ++i) {
            Body ast;
            ast.id = startingId + i;
            ast.name = "Asteroid-" + std::to_string(i + 1);
            ast.type = BodyType::Asteroid;
            ast.mass = 1e-13; // Negligible mass (test particle)
            
            double a = distA(rng);
            double e = distE(rng);
            double inc = distInc(rng);
            double theta = distTheta(rng);

            // Elliptical orbit distance at angle theta
            double r = a * (1.0 - e * e) / (1.0 + e * std::cos(theta));
            
            // Orbital position in plane
            double x_orb = r * std::cos(theta);
            double y_orb = r * std::sin(theta);

            // Velocity vector in orbital plane (perpendicular to radius with radial component)
            // v_r = sqrt(G*M / (a*(1-e^2))) * e * sin(theta)
            // v_theta = sqrt(G*M / (a*(1-e^2))) * (1 + e * cos(theta))
            double p = a * (1.0 - e * e);
            double h = std::sqrt(G_CONST * p);
            double vr = (G_CONST / h) * e * std::sin(theta);
            double vt = (h / r);

            double vx_orb = vr * std::cos(theta) - vt * std::sin(theta);
            double vy_orb = vr * std::sin(theta) + vt * std::cos(theta);

            // Incline orbit by inc around X axis:
            // Y_new = Y * cos(inc) - Z * sin(inc)
            // Z_new = Y * sin(inc) + Z * cos(inc)
            // In our coordinate system: X and Y are horizontal, Z is vertical!
            ast.position = {
                x_orb,
                y_orb * std::cos(inc),
                y_orb * std::sin(inc)
            };
            ast.velocity = {
                vx_orb,
                vy_orb * std::cos(inc),
                vy_orb * std::sin(inc)
            };

            ast.realRadiusKm = 10.0f + static_cast<float>(i % 50);
            ast.displayRadius = 0.015f; // ~0.6x
            float c = distColor(rng);
            ast.color = {c, c * 0.95f, c * 0.9f, 1.0f};

            asteroids.push_back(ast);
        }

        return asteroids;
    }

private:
    static void correctBarycenterMomentum(std::vector<Body>& bodies) {
        if (bodies.empty()) return;

        double totalMass = 0.0;
        Vector3 totalMomentum{0.0, 0.0, 0.0};
        Vector3 comPos{0.0, 0.0, 0.0};

        for (const auto& b : bodies) {
            totalMass += b.mass;
            totalMomentum += b.velocity * b.mass;
            comPos += b.position * b.mass;
        }

        Vector3 barycenterVel = totalMomentum / totalMass;
        Vector3 barycenterPos = comPos / totalMass;

        // Shift Sun so the entire system's center of mass is stationary at (0, 0, 0)
        for (auto& b : bodies) {
            b.velocity -= barycenterVel;
            b.position -= barycenterPos;
        }
    }
};

} // namespace solarsim
