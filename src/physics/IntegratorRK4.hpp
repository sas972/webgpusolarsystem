#pragma once

#include "Body.hpp"
#include "SolarSystemData.hpp"
#include <vector>
#include <cmath>

namespace solarsim {

/**
 * @brief High-precision 4th Order Runge-Kutta (RK4) N-Body Integrator.
 * Solves the system of second-order differential equations:
 *   d^2 r_i / dt^2 = a_i(r_1, ..., r_N) = sum_{j != i} G * m_j * (r_j - r_i) / (|r_j - r_i|^2 + eps^2)^(3/2)
 */
class IntegratorRK4 {
public:
    /**
     * @brief Computes gravitational accelerations for all bodies given their current positions.
     */
    static void computeAccelerations(
        const std::vector<Vector3>& positions,
        const std::vector<double>& masses,
        std::vector<Vector3>& outAcc)
    {
        const size_t n = positions.size();
        if (outAcc.size() != n) {
            outAcc.resize(n);
        }

        // Reset accelerations to zero
        for (size_t i = 0; i < n; ++i) {
            outAcc[i] = {0.0, 0.0, 0.0};
        }

        // Mutual gravitational forces
        for (size_t i = 0; i < n; ++i) {
            for (size_t j = i + 1; j < n; ++j) {
                Vector3 diff = positions[j] - positions[i];
                double distSq = diff.lengthSquared() + SOFTENING_EPSILON_SQ;
                double dist = std::sqrt(distSq);
                double invDist3 = 1.0 / (distSq * dist);

                double forceFactor = G_CONST * invDist3;

                // Acceleration on body i caused by body j
                Vector3 a_ij = diff * (forceFactor * masses[j]);
                outAcc[i] += a_ij;

                // Acceleration on body j caused by body i (Newton's 3rd Law: action-reaction)
                Vector3 a_ji = diff * (-forceFactor * masses[i]);
                outAcc[j] += a_ji;
            }
        }
    }

    /**
     * @brief Advances the N-body system by dtYears using the classic 4th Order Runge-Kutta method.
     * 
     * Formulas:
     *   k1_v = a(r0),            k1_r = v0
     *   k2_v = a(r0 + 0.5*dt*k1_r), k2_r = v0 + 0.5*dt*k1_v
     *   k3_v = a(r0 + 0.5*dt*k2_r), k3_r = v0 + 0.5*dt*k2_v
     *   k4_v = a(r0 + dt*k3_r),     k4_r = v0 + dt*k3_v
     *   r_new = r0 + (dt / 6) * (k1_r + 2*k2_r + 2*k3_r + k4_r)
     *   v_new = v0 + (dt / 6) * (k1_v + 2*k2_v + 2*k3_v + k4_v)
     */
    static void step(std::vector<Body>& bodies, double dtYears) {
        const size_t n = bodies.size();
        if (n == 0) return;

        // Allocate scratch buffers (static or reusable)
        thread_local std::vector<Vector3> r0;
        thread_local std::vector<Vector3> v0;
        thread_local std::vector<double> masses;
        thread_local std::vector<Vector3> r_temp;
        thread_local std::vector<Vector3> k1_r, k1_v;
        thread_local std::vector<Vector3> k2_r, k2_v;
        thread_local std::vector<Vector3> k3_r, k3_v;
        thread_local std::vector<Vector3> k4_r, k4_v;

        r0.resize(n);
        v0.resize(n);
        masses.resize(n);
        r_temp.resize(n);
        k1_r.resize(n); k1_v.resize(n);
        k2_r.resize(n); k2_v.resize(n);
        k3_r.resize(n); k3_v.resize(n);
        k4_r.resize(n); k4_v.resize(n);

        for (size_t i = 0; i < n; ++i) {
            r0[i] = bodies[i].position;
            v0[i] = bodies[i].velocity;
            masses[i] = bodies[i].mass;
        }

        // --- Stage 1 ---
        computeAccelerations(r0, masses, k1_v);
        for (size_t i = 0; i < n; ++i) {
            k1_r[i] = v0[i];
            r_temp[i] = r0[i] + k1_r[i] * (0.5 * dtYears);
        }

        // --- Stage 2 ---
        computeAccelerations(r_temp, masses, k2_v);
        for (size_t i = 0; i < n; ++i) {
            k2_r[i] = v0[i] + k1_v[i] * (0.5 * dtYears);
            r_temp[i] = r0[i] + k2_r[i] * (0.5 * dtYears);
        }

        // --- Stage 3 ---
        computeAccelerations(r_temp, masses, k3_v);
        for (size_t i = 0; i < n; ++i) {
            k3_r[i] = v0[i] + k2_v[i] * (0.5 * dtYears);
            r_temp[i] = r0[i] + k3_r[i] * dtYears;
        }

        // --- Stage 4 ---
        computeAccelerations(r_temp, masses, k4_v);
        for (size_t i = 0; i < n; ++i) {
            k4_r[i] = v0[i] + k3_v[i] * dtYears;
        }

        // --- Final RK4 Weighted Average Update ---
        const double inv6 = dtYears / 6.0;
        for (size_t i = 0; i < n; ++i) {
            bodies[i].position = r0[i] + (k1_r[i] + (k2_r[i] + k3_r[i]) * 2.0 + k4_r[i]) * inv6;
            bodies[i].velocity = v0[i] + (k1_v[i] + (k2_v[i] + k3_v[i]) * 2.0 + k4_v[i]) * inv6;
            
            // Update rotation
            bodies[i].currentRotationDeg += static_cast<float>(
                (dtYears * 365.25 * 24.0 / bodies[i].rotationPeriodHours) * 360.0
            );
            if (bodies[i].currentRotationDeg > 360.0f) {
                bodies[i].currentRotationDeg = std::fmod(bodies[i].currentRotationDeg, 360.0f);
            }

            // Append trail point
            bodies[i].appendTrail(dtYears);
        }
    }

    /**
     * @brief Computes total mechanical energy (Kinetic + Potential).
     * Used to verify energy conservation across simulation time steps.
     */
    static double computeTotalEnergy(const std::vector<Body>& bodies) {
        const size_t n = bodies.size();
        double totalKinetic = 0.0;
        double totalPotential = 0.0;

        for (size_t i = 0; i < n; ++i) {
            totalKinetic += 0.5 * bodies[i].mass * bodies[i].velocity.lengthSquared();

            for (size_t j = i + 1; j < n; ++j) {
                double dist = std::sqrt(bodies[i].position.distanceSquared(bodies[j].position) + SOFTENING_EPSILON_SQ);
                totalPotential -= (G_CONST * bodies[i].mass * bodies[j].mass) / dist;
            }
        }

        return totalKinetic + totalPotential;
    }

    /**
     * @brief Computes total angular momentum vector: L = sum(m_i * (r_i x v_i)).
     */
    static Vector3 computeTotalAngularMomentum(const std::vector<Body>& bodies) {
        Vector3 totalL{0.0, 0.0, 0.0};
        for (const auto& b : bodies) {
            totalL += b.mass * b.position.cross(b.velocity);
        }
        return totalL;
    }
};

} // namespace solarsim
