#pragma once

#include "Body.hpp"
#include "SolarSystemData.hpp"
#include "IntegratorRK4.hpp"
#include <vector>
#include <chrono>
#include <cmath>
#include <string>

namespace solarsim {

enum class IntegratorMode : uint32_t {
    CpuRK4 = 0,
    GpuComputeRK4 = 1
};

class Simulation {
private:
    std::vector<Body> bodies_;
    std::vector<GpuBodyData> gpuBufferCache_;
    
    double simulationTimeYears_{0.0};
    double timeScaleDaysPerSec_{36.525}; // default: 1 sec = 0.1 year (~36.5 days)
    uint32_t subStepsPerFrame_{10};      // 10 sub-steps per frame for ultra-smooth RK4
    
    IntegratorMode mode_{IntegratorMode::CpuRK4};
    uint32_t asteroidCount_{200};

    double initialEnergy_{0.0};
    double currentEnergy_{0.0};
    double energyDriftPct_{0.0};

    double lastComputeTimeMs_{0.0};
    uint32_t trackedTargetIndex_{0};    // 0 = Sun, 3 = Earth, etc.

public:
    Simulation() {
        reset();
    }

    void reset() {
        simulationTimeYears_ = 0.0;
        bodies_ = SolarSystemFactory::createMajorBodies();
        
        if (asteroidCount_ > 0) {
            auto asteroids = SolarSystemFactory::createAsteroidBelt(asteroidCount_, static_cast<uint32_t>(bodies_.size()));
            bodies_.insert(bodies_.end(), asteroids.begin(), asteroids.end());
        }

        initialEnergy_ = IntegratorRK4::computeTotalEnergy(bodies_);
        currentEnergy_ = initialEnergy_;
        energyDriftPct_ = 0.0;

        syncGpuBuffer();
    }

    void setAsteroidCount(uint32_t count) {
        if (count != asteroidCount_) {
            asteroidCount_ = count;
            reset();
        }
    }

    uint32_t getAsteroidCount() const noexcept { return asteroidCount_; }

    void setIntegratorMode(IntegratorMode mode) noexcept {
        mode_ = mode;
    }

    IntegratorMode getIntegratorMode() const noexcept { return mode_; }

    void setTimeScale(double daysPerSecond) noexcept {
        timeScaleDaysPerSec_ = daysPerSecond;
    }

    double getTimeScale() const noexcept { return timeScaleDaysPerSec_; }

    void setSubSteps(uint32_t steps) noexcept {
        subStepsPerFrame_ = std::max(1u, std::min(100u, steps));
    }

    uint32_t getSubSteps() const noexcept { return subStepsPerFrame_; }

    /**
     * @brief Performs one simulation frame step.
     * @param realDeltaTimeSec Time elapsed since last frame in seconds.
     */
    void update(double realDeltaTimeSec) {
        if (realDeltaTimeSec <= 0.0) return;

        // Convert real delta time to simulation years:
        // realDeltaTimeSec * (daysPerSec / 365.25)
        double totalDtYears = realDeltaTimeSec * (timeScaleDaysPerSec_ / 365.25);
        if (totalDtYears > 0.5) totalDtYears = 0.5; // Cap delta time against massive tab backgrounding jumps

        double subDt = totalDtYears / static_cast<double>(subStepsPerFrame_);

        auto startTime = std::chrono::high_resolution_clock::now();

        if (mode_ == IntegratorMode::CpuRK4) {
            for (uint32_t s = 0; s < subStepsPerFrame_; ++s) {
                IntegratorRK4::step(bodies_, subDt);
            }
        }
        // If GpuComputeRK4 is active, the GPU compute pass executes on the GPU buffer,
        // and C++ can sync readback periodically or when requested.

        auto endTime = std::chrono::high_resolution_clock::now();
        lastComputeTimeMs_ = std::chrono::duration<double, std::milli>(endTime - startTime).count();

        simulationTimeYears_ += totalDtYears;

        // Energy conservation check
        currentEnergy_ = IntegratorRK4::computeTotalEnergy(bodies_);
        if (std::abs(initialEnergy_) > 1e-12) {
            energyDriftPct_ = ((currentEnergy_ - initialEnergy_) / std::abs(initialEnergy_)) * 100.0;
        }

        syncGpuBuffer();
    }

    /**
     * @brief Synchronizes C++ body state into contiguous GPU-aligned buffer.
     */
    void syncGpuBuffer() {
        const size_t n = bodies_.size();
        if (gpuBufferCache_.size() != n) {
            gpuBufferCache_.resize(n);
        }

        for (size_t i = 0; i < n; ++i) {
            const auto& b = bodies_[i];
            gpuBufferCache_[i].posX = static_cast<float>(b.position.x);
            gpuBufferCache_[i].posY = static_cast<float>(b.position.y);
            gpuBufferCache_[i].posZ = static_cast<float>(b.position.z);
            gpuBufferCache_[i].mass = static_cast<float>(b.mass);

            gpuBufferCache_[i].velX = static_cast<float>(b.velocity.x);
            gpuBufferCache_[i].velY = static_cast<float>(b.velocity.y);
            gpuBufferCache_[i].velZ = static_cast<float>(b.velocity.z);
            gpuBufferCache_[i].radius = b.displayRadius;

            gpuBufferCache_[i].r = b.color[0];
            gpuBufferCache_[i].g = b.color[1];
            gpuBufferCache_[i].b = b.color[2];
            gpuBufferCache_[i].a = b.color[3];

            gpuBufferCache_[i].bodyType = static_cast<uint32_t>(b.type);
            gpuBufferCache_[i].id = b.id;
            gpuBufferCache_[i].flags = (b.isEmitter ? 1.0f : 0.0f) + (b.hasRings ? 2.0f : 0.0f);
            gpuBufferCache_[i].padding = 0.0f;
        }
    }

    /**
     * @brief Writes back GPU state from compute shader into C++ body objects.
     */
    void updateFromGpuBuffer(const GpuBodyData* data, size_t count) {
        if (!data) return;
        size_t n = std::min(bodies_.size(), count);
        for (size_t i = 0; i < n; ++i) {
            bodies_[i].position = {data[i].posX, data[i].posY, data[i].posZ};
            bodies_[i].velocity = {data[i].velX, data[i].velY, data[i].velZ};
            bodies_[i].appendTrail(0.005);
        }
    }

    [[nodiscard]] const std::vector<Body>& getBodies() const noexcept { return bodies_; }
    [[nodiscard]] std::vector<Body>& getBodies() noexcept { return bodies_; }
    [[nodiscard]] size_t getBodyCount() const noexcept { return bodies_.size(); }

    [[nodiscard]] const GpuBodyData* getGpuDataPtr() const noexcept {
        return gpuBufferCache_.data();
    }
    [[nodiscard]] size_t getGpuDataByteSize() const noexcept {
        return gpuBufferCache_.size() * sizeof(GpuBodyData);
    }

    [[nodiscard]] double getSimulationTimeYears() const noexcept { return simulationTimeYears_; }
    [[nodiscard]] double getSimulationTimeDays() const noexcept { return simulationTimeYears_ * 365.25; }
    [[nodiscard]] double getLastComputeTimeMs() const noexcept { return lastComputeTimeMs_; }
    [[nodiscard]] double getEnergyDriftPct() const noexcept { return energyDriftPct_; }
    [[nodiscard]] double getTotalEnergy() const noexcept { return currentEnergy_; }

    void setTrackedTarget(uint32_t index) noexcept {
        if (index < bodies_.size()) {
            trackedTargetIndex_ = index;
        }
    }
    [[nodiscard]] uint32_t getTrackedTarget() const noexcept { return trackedTargetIndex_; }
};

} // namespace solarsim
