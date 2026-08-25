default: build

all: test

test: build
	cargo test

build:
	stellar contract build
	@ls -l target/wasm32v1-none/release/*.wasm

# Deploy the escrow contract to Stellar Testnet.
#
# Requires the Stellar CLI and four addresses: the depositor, beneficiary,
# arbiter, and a deployed SEP-41 asset (such as the existing Token deployment
# on Testnet). Escrow's constructor takes (depositor, beneficiary, arbiter,
# asset) — supply real strkeys in place of the placeholders below.
#
# Prints the new contract id (C...) to stdout. Register it manually in
# src/lib/transactions/deployments.ts keyed by network "testnet" and component
# slug "escrow".
deploy-testnet:
	stellar keys ls | grep -q deployer || stellar keys generate deployer --fund --network testnet
	stellar contract deploy \
		--wasm target/wasm32v1-none/release/escrow.wasm \
		--source deployer \
		--network testnet \
		-- \
		<depositor> <beneficiary> <arbiter> <asset>

fmt:
	cargo fmt --all

clean:
	cargo clean
