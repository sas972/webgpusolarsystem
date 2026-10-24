#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include "../physics/Simulation.hpp"
#include "../render/Camera.hpp"

using namespace emscripten;
using namespace solarsim;

// Helper adapter functions for Emscripten JS bindings
std::string getBodyNameHelper(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) {
        return sim.getBodies()[index].name;
    }
    return "";
}

uint32_t getBodyTypeHelper(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) {
        return static_cast<uint32_t>(sim.getBodies()[index].type);
    }
    return 6; // Asteroid
}

double getBodyPosX(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].position.x;
    return 0.0;
}
double getBodyPosY(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].position.y;
    return 0.0;
}
double getBodyPosZ(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].position.z;
    return 0.0;
}

double getBodyVelX(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].velocity.x;
    return 0.0;
}
double getBodyVelY(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].velocity.y;
    return 0.0;
}
double getBodyVelZ(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].velocity.z;
    return 0.0;
}

double getBodyMass(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].mass;
    return 0.0;
}

float getBodyRadius(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].displayRadius;
    return 0.0f;
}

float getBodyRealRadiusKm(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].realRadiusKm;
    return 0.0f;
}

float getBodyColorR(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].color[0];
    return 1.0f;
}
float getBodyColorG(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].color[1];
    return 1.0f;
}
float getBodyColorB(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].color[2];
    return 1.0f;
}

bool getBodyIsEmitter(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].isEmitter;
    return false;
}

bool getBodyHasRings(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].hasRings;
    return false;
}

float getBodyRingInnerRadius(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].ringInnerRadius;
    return 0.0f;
}

float getBodyRingOuterRadius(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) return sim.getBodies()[index].ringOuterRadius;
    return 0.0f;
}

uint32_t getTrailCount(const Simulation& sim, uint32_t index) {
    if (index < sim.getBodies().size()) {
        return static_cast<uint32_t>(sim.getBodies()[index].trailHistory.size());
    }
    return 0;
}

double getTrailX(const Simulation& sim, uint32_t bIdx, uint32_t pIdx) {
    if (bIdx < sim.getBodies().size() && pIdx < sim.getBodies()[bIdx].trailHistory.size()) {
        return sim.getBodies()[bIdx].trailHistory[pIdx].x;
    }
    return 0.0;
}
double getTrailY(const Simulation& sim, uint32_t bIdx, uint32_t pIdx) {
    if (bIdx < sim.getBodies().size() && pIdx < sim.getBodies()[bIdx].trailHistory.size()) {
        return sim.getBodies()[bIdx].trailHistory[pIdx].y;
    }
    return 0.0;
}
double getTrailZ(const Simulation& sim, uint32_t bIdx, uint32_t pIdx) {
    if (bIdx < sim.getBodies().size() && pIdx < sim.getBodies()[bIdx].trailHistory.size()) {
        return sim.getBodies()[bIdx].trailHistory[pIdx].z;
    }
    return 0.0;
}

uintptr_t getGpuBufferPointer(const Simulation& sim) {
    return reinterpret_cast<uintptr_t>(sim.getGpuDataPtr());
}

emscripten::val getGpuBufferView(const Simulation& sim) {
    return emscripten::val(emscripten::typed_memory_view(
        sim.getGpuDataByteSize() / sizeof(float),
        reinterpret_cast<const float*>(sim.getGpuDataPtr())
    ));
}

void setIntegratorModeHelper(Simulation& sim, int mode) {
    sim.setIntegratorMode(static_cast<IntegratorMode>(mode));
}

int getIntegratorModeHelper(const Simulation& sim) {
    return static_cast<int>(sim.getIntegratorMode());
}

EMSCRIPTEN_BINDINGS(solarsim_module) {
    class_<Simulation>("Simulation")
        .constructor<>()
        .function("reset", &Simulation::reset)
        .function("update", &Simulation::update)
        .function("setAsteroidCount", &Simulation::setAsteroidCount)
        .function("getAsteroidCount", &Simulation::getAsteroidCount)
        .function("setIntegratorMode", &setIntegratorModeHelper)
        .function("getIntegratorMode", &getIntegratorModeHelper)
        .function("setTimeScale", &Simulation::setTimeScale)
        .function("getTimeScale", &Simulation::getTimeScale)
        .function("setSubSteps", &Simulation::setSubSteps)
        .function("getSubSteps", &Simulation::getSubSteps)
        .function("getBodyCount", &Simulation::getBodyCount)
        .function("getSimulationTimeYears", &Simulation::getSimulationTimeYears)
        .function("getSimulationTimeDays", &Simulation::getSimulationTimeDays)
        .function("getLastComputeTimeMs", &Simulation::getLastComputeTimeMs)
        .function("getEnergyDriftPct", &Simulation::getEnergyDriftPct)
        .function("getTotalEnergy", &Simulation::getTotalEnergy)
        .function("setTrackedTarget", &Simulation::setTrackedTarget)
        .function("getTrackedTarget", &Simulation::getTrackedTarget)
        
        // Body details
        .function("getBodyName", &getBodyNameHelper)
        .function("getBodyType", &getBodyTypeHelper)
        .function("getBodyPosX", &getBodyPosX)
        .function("getBodyPosY", &getBodyPosY)
        .function("getBodyPosZ", &getBodyPosZ)
        .function("getBodyVelX", &getBodyVelX)
        .function("getBodyVelY", &getBodyVelY)
        .function("getBodyVelZ", &getBodyVelZ)
        .function("getBodyMass", &getBodyMass)
        .function("getBodyRadius", &getBodyRadius)
        .function("getBodyRealRadiusKm", &getBodyRealRadiusKm)
        .function("getBodyColorR", &getBodyColorR)
        .function("getBodyColorG", &getBodyColorG)
        .function("getBodyColorB", &getBodyColorB)
        .function("getBodyIsEmitter", &getBodyIsEmitter)
        .function("getBodyHasRings", &getBodyHasRings)
        .function("getBodyRingInnerRadius", &getBodyRingInnerRadius)
        .function("getBodyRingOuterRadius", &getBodyRingOuterRadius)
        
        // Trail details
        .function("getTrailCount", &getTrailCount)
        .function("getTrailX", &getTrailX)
        .function("getTrailY", &getTrailY)
        .function("getTrailZ", &getTrailZ)

        // Direct fast memory access
        .function("getGpuBufferPointer", &getGpuBufferPointer)
        .function("getGpuBufferView", &getGpuBufferView)
        .function("getGpuDataByteSize", &Simulation::getGpuDataByteSize);
}
#endif
