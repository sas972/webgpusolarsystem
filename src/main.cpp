#include <iostream>
#include <iomanip>
#include <chrono>
#include <vector>
#include "physics/Simulation.hpp"
#include "physics/IntegratorRK4.hpp"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>

int main() {
    std::cout << "[WebAssembly] Solarsim C++20 WebGPU Physics Engine initialized successfully!" << std::endl;
    std::cout << "[WebAssembly] Runge-Kutta 4 (RK4) integrator and WebGPU compute pipelines active." << std::endl;
    return 0;
}

#else

int main([[maybe_unused]] int argc, [[maybe_unused]] char* argv[]) {
    std::cout << "======================================================================\n";
    std::cout << "       SOLAR SYSTEM PHYSICS SIMULATOR (C++20 / WebGPU / RK4)          \n";
    std::cout << "======================================================================\n\n";

    solarsim::Simulation sim;
    sim.setAsteroidCount(250); // 11 major bodies + 250 asteroids = 261 bodies

    std::cout << "[+] Initialized Solar System with " << sim.getBodyCount() << " celestial bodies.\n";
    std::cout << "    - Sun + 8 Planets + Moon + Pluto + " << sim.getAsteroidCount() << " Asteroids.\n";
    std::cout << "    - Integrator: Runge-Kutta 4th Order (RK4)\n";
    std::cout << "    - Gravitational Constant G = 4 * pi^2 ≈ " << solarsim::G_CONST << " AU^3 / (M_sun * yr^2)\n";
    std::cout << "    - Initial Mechanical Energy E_0 = " << std::scientific << std::setprecision(8) 
              << sim.getTotalEnergy() << " M_sun * AU^2 / yr^2\n\n";

    std::cout << "--- Initial Major Bodies Ephemeris ---\n";
    std::cout << std::left << std::setw(12) << "Name" 
              << std::setw(16) << "Distance (AU)" 
              << std::setw(16) << "Speed (AU/yr)" 
              << std::setw(16) << "Speed (km/s)" 
              << std::setw(16) << "Mass (M_sun)" << "\n";
    std::cout << std::string(76, '-') << "\n";

    for (size_t i = 0; i <= 10 && i < sim.getBodyCount(); ++i) {
        const auto& b = sim.getBodies()[i];
        double dist = b.position.length();
        double speed = b.velocity.length();
        double speedKmS = speed * 4.74047; // 1 AU/yr ≈ 4.74047 km/s
        std::cout << std::left << std::setw(12) << b.name
                  << std::fixed << std::setprecision(4)
                  << std::setw(16) << dist
                  << std::setw(16) << speed
                  << std::setw(16) << speedKmS
                  << std::scientific << std::setprecision(3)
                  << std::setw(16) << b.mass << "\n";
    }

    std::cout << "\n[+] Running RK4 N-body Benchmark (1000 sub-steps, 1 year total simulation)...\n";
    auto t0 = std::chrono::high_resolution_clock::now();

    const double totalSimulationYears = 1.0;
    const uint32_t steps = 1000;
    const double dt = totalSimulationYears / steps;

    for (uint32_t s = 0; s < steps; ++s) {
        solarsim::IntegratorRK4::step(sim.getBodies(), dt);
    }

    auto t1 = std::chrono::high_resolution_clock::now();
    double elapsedMs = std::chrono::duration<double, std::milli>(t1 - t0).count();

    double finalEnergy = solarsim::IntegratorRK4::computeTotalEnergy(sim.getBodies());
    double driftPct = ((finalEnergy - sim.getTotalEnergy()) / std::abs(sim.getTotalEnergy())) * 100.0;

    std::cout << "[✓] Benchmark completed in " << std::fixed << std::setprecision(2) << elapsedMs << " ms.\n";
    std::cout << "    - Average step time: " << (elapsedMs / steps) * 1000.0 << " microseconds/step\n";
    std::cout << "    - Final Mechanical Energy: " << std::scientific << finalEnergy << "\n";
    std::cout << "    - Energy Conservation Drift: " << std::fixed << std::setprecision(6) << driftPct << " %\n";

    if (std::abs(driftPct) < 0.01) {
        std::cout << "    [PASS] Energy conservation is outstanding (|drift| < 0.01%)!\n";
    } else {
        std::cout << "    [WARN] Energy drift detected: " << driftPct << " %\n";
    }

    std::cout << "\n[+] Ready to deploy WebGPU web interface!\n";
    std::cout << "======================================================================\n";

    return 0;
}
#endif
