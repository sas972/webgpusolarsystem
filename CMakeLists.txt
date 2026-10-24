cmake_minimum_required(VERSION 3.20)
project(solarsimWebGPU CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Source files
set(PHYSICS_SOURCES
    src/physics/Vector3.hpp
    src/physics/Body.hpp
    src/physics/SolarSystemData.hpp
    src/physics/IntegratorRK4.hpp
    src/physics/Simulation.hpp
)

set(RENDER_SOURCES
    src/render/Camera.hpp
    src/render/Geometry.hpp
)

# ------------------------------------------------------------------------------
# Emscripten WebAssembly Target
# ------------------------------------------------------------------------------
if(EMSCRIPTEN)
    message(STATUS "[SolarSim] Building with Emscripten WebAssembly toolchain...")

    set(WASM_SOURCES
        src/main.cpp
        src/bindings/EmscriptenBindings.cpp
    )

    add_executable(solsim ${WASM_SOURCES} ${PHYSICS_SOURCES} ${RENDER_SOURCES})

    # Output directly to web/ directory for easy serving
    set_target_properties(solsim PROPERTIES
        OUTPUT_NAME "solsim"
        SUFFIX ".js"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/web"
    )

    target_compile_options(solsim PRIVATE
        -O3
        -Wall
        -Wextra
    )

    target_link_options(solsim PRIVATE
        -O3
        --bind
        -sALLOW_MEMORY_GROWTH=1
        -sMODULARIZE=1
        -sEXPORT_NAME="Module"
        -sEXPORTED_RUNTIME_METHODS=["ccall","cwrap"]
        -sSTACK_SIZE=1MB
    )

# ------------------------------------------------------------------------------
# Native C++20 Target (Linux / macOS / Container CLI & Benchmarks)
# ------------------------------------------------------------------------------
else()
    message(STATUS "[SolarSim] Building native C++20 test and benchmark executable...")

    find_package(Threads REQUIRED)

    add_executable(solsim_native src/main.cpp ${PHYSICS_SOURCES} ${RENDER_SOURCES})

    target_compile_options(solsim_native PRIVATE
        -O3
        -Wall
        -Wextra
        -pthread
    )

    target_link_libraries(solsim_native PRIVATE
        Threads::Threads
    )
endif()
