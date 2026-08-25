default: build

all: test

test: build
	cargo test

build:
	stellar contract build
	@ls -l target/wasm32v1-none/release/*.wasm

# Deploy the access-control contract to Stellar Testnet.
#
# Requires the Stellar CLI and an `admin` strkey. Access Control's constructor
# takes a single `admin` address. Prints the new contract id (C...) to stdout.
# Register it manually in src/lib/transactions/deployments.ts keyed by network
# "testnet" and component slug "access-control", then set capabilities.testnet
# to true. Not performed as part of v1 (testnet stays false).
deploy-testnet:
	stellar keys ls | grep -q deployer || stellar keys generate deployer --fund --network testnet
	stellar contract deploy \
		--wasm target/wasm32v1-none/release/access-control.wasm \
		--source deployer \
		--network testnet \
		-- \
		<admin>

fmt:
	cargo fmt --all

clean:
	cargo clean
