default: build

all: test

test: build
	cargo test

build:
	stellar contract build
	@ls -l target/wasm32v1-none/release/*.wasm

# Deploy the payment contract to Stellar Testnet.
#
# Requires the Stellar CLI. The deployer identity (a testnet-only keypair kept
# in the CLI config directory, never in this repo) is created and funded via
# friendbot when it does not exist yet.
#
# Payment's constructor takes no arguments, so nothing is passed after `--`.
#
# Prints the new contract id (C...) to stdout. Register it manually in
# src/lib/transactions/deployments.ts keyed by network "testnet" and component
# slug "payment". At call time, supply a deployed SEP-41 asset contract (such as
# the existing Token deployment) as the `asset` argument — no second contract is
# deployed by this target.
deploy-testnet:
	stellar keys ls | grep -q deployer || stellar keys generate deployer --fund --network testnet
	stellar contract deploy \
		--wasm target/wasm32v1-none/release/payment.wasm \
		--source deployer \
		--network testnet

fmt:
	cargo fmt --all

clean:
	cargo clean
