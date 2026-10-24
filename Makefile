.PHONY: all build build-wasm build-native run-native serve docker-build docker-up docker-down docker-shell clean

all: build

build:
	bash scripts/build.sh

build-wasm:
	mkdir -p build-wasm
	emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release
	cmake --build build-wasm

build-native:
	mkdir -p build-native
	cmake -B build-native -DCMAKE_BUILD_TYPE=Release
	cmake --build build-native

run-native: build-native
	./build-native/solsim_native

serve:
	python3 scripts/server.py 8080 web

docker-build:
	docker-compose build

docker-up:
	docker compose up -d

docker-web:
	docker compose up -d web

docker-vscode:
	docker compose up -d vscode

docker-down:
	docker-compose down

docker-shell:
	docker-compose run --rm dev bash

clean:
	rm -rf build-wasm build-native web/solsim.js web/solsim.wasm
