import { getComponentByPackage } from "@/data/components";
import type { PlaygroundScenario } from "@/lib/playground/scenario-types";
import { createMerkleFixture, createOracleSignatureFixture } from "@/lib/playground/scenario-fixtures";

const accessControlSlug = getComponentByPackage("access-control")?.slug ?? "";

const paymentSlug = getComponentByPackage("payment")?.slug ?? "";
const paymentWorkflow: PlaygroundScenario = {
  id: "payment.transfer",
  componentSlug: paymentSlug,
  title: "Make a Payment",
  description: "Transfer a deterministic local asset from the seeded sender to a recipient through the stateless Payment contract.",
  fixtures: { identities: ["user1"], assets: ["forge-token"] },
  steps: [
    { id: "payment-send", title: "Send payment", kind: "call", method: "pay", args: ["user1", "admin", "asset", "250"], authorization: "The sender's authorization is simulated locally.", explanation: "Move 250 seeded local asset units from user1 to admin. Payment stores no state of its own; the underlying asset transfer is the result." },
  ],
};

const allowanceSlug = getComponentByPackage("allowance")?.slug ?? "";
const allowanceWorkflow: PlaygroundScenario = {
  id: "allowance.approve-and-spend",
  componentSlug: allowanceSlug,
  title: "Approve and Spend an Allowance",
  description: "Grant a spender a limit, spend part of it, and observe the remaining allowance.",
  fixtures: { identities: ["admin", "user1", "user2"], assets: ["forge-token"] },
  steps: [
    { id: "allowance-initial", title: "Inspect initial allowance", kind: "observation", method: "allowance", args: ["admin", "asset", "user1"], expected: 0, explanation: "Confirm that user1 has no allowance to spend admin's local asset." },
    { id: "allowance-approve", title: "Approve spending limit", kind: "call", method: "approve", args: ["admin", "asset", "user1", "400", "100"], authorization: "The owner's authorization is simulated locally.", explanation: "Grant user1 a 400-unit allowance with a stable local ledger expiration." },
    { id: "allowance-after-approve", title: "Verify approved allowance", kind: "observation", method: "allowance", args: ["admin", "asset", "user1"], expected: 400, comparison: { compareWith: "allowance-initial", relation: "increased" }, explanation: "Confirm that the manager records the approved spending limit." },
    { id: "allowance-transfer", title: "Spend part of allowance", kind: "call", method: "transfer_from", args: ["user1", "asset", "admin", "user2", "250"], authorization: "The spender's authorization is simulated locally.", explanation: "Have user1 spend 250 units from admin's balance to user2." },
    { id: "allowance-after-spend", title: "Inspect remaining allowance", kind: "observation", method: "allowance", args: ["admin", "asset", "user1"], expected: 150, comparison: { compareWith: "allowance-after-approve", relation: "decreased" }, explanation: "Confirm that spending debited the allowance by the transferred amount." },
  ],
};

const atomicSwapSlug = getComponentByPackage("atomic-swap")?.slug ?? "";
const atomicSwapWorkflow: PlaygroundScenario = {
  id: "atomic-swap.create-and-execute",
  componentSlug: atomicSwapSlug,
  title: "Create and Execute Atomic Swap",
  description: "Publish an offer, use its returned ID to inspect it, and execute the two-asset exchange locally.",
  fixtures: { identities: ["admin", "user1"] },
  steps: [
    { id: "atomic-swap-create", title: "Create swap offer", kind: "call", method: "create_offer", args: ["admin", "offer_asset", "100", "ask_asset", "200"], authorization: "The offerer's authorization is simulated locally.", explanation: "Offer 100 units of the offer asset in exchange for 200 units of the ask asset." },
    { id: "atomic-swap-active", title: "Inspect active offer", kind: "observation", method: "offer_active", args: [{ reference: "atomic-swap-create.result" }], expected: true, explanation: "Use the returned offer ID to confirm that the offer is active before execution." },
    { id: "atomic-swap-execute", title: "Execute swap", kind: "call", method: "execute", args: ["user1", { reference: "atomic-swap-create.result" }], authorization: "The entrant's authorization is simulated locally.", explanation: "Have user1 fill the offer; both asset transfers occur atomically or the call fails." },
    { id: "atomic-swap-inactive", title: "Verify offer completed", kind: "observation", method: "offer_active", args: [{ reference: "atomic-swap-create.result" }], expected: false, explanation: "Confirm that the executed offer is no longer active." },
  ],
};

const accessControlRoleLifecycle: PlaygroundScenario = {
  id: "role-lifecycle",
  componentSlug: accessControlSlug,
  title: "Role Lifecycle",
  description:
    "Grant and revoke a role while observing how contract state changes.",
  fixtures: { identities: ["admin", "user1"] },
  steps: [
    {
      id: "check-initial-role",
      title: "Check initial role",
      kind: "observation",
      method: "has_role",
      args: ["EDITOR", "user1"],
      expected: false,
      explanation: "Check whether user1 initially has the EDITOR role.",
    },
    {
      id: "grant-role",
      title: "Grant role",
      kind: "call",
      method: "grant_role",
      args: ["EDITOR", "user1"],
      authorization: "The contract administrator's authorization is simulated locally.",
      explanation: "The contract administrator grants the EDITOR role to user1.",
    },
    {
      id: "verify-role-granted",
      title: "Verify role granted",
      kind: "observation",
      method: "has_role",
      args: ["EDITOR", "user1"],
      expected: true,
      explanation: "Confirm that user1 now has the EDITOR role.",
    },
    {
      id: "revoke-role",
      title: "Revoke role",
      kind: "call",
      method: "revoke_role",
      args: ["EDITOR", "user1"],
      authorization: "The contract administrator's authorization is simulated locally.",
      explanation: "The contract administrator removes the EDITOR role from user1.",
    },
    {
      id: "verify-role-revoked",
      title: "Verify role revoked",
      kind: "observation",
      method: "has_role",
      args: ["EDITOR", "user1"],
      expected: false,
      explanation: "Confirm that user1 no longer has the EDITOR role.",
    },
  ],
};

const escrowSlug = getComponentByPackage("escrow")?.slug ?? "";

const escrowReleaseFunds: PlaygroundScenario = {
  id: "escrow.release-funds",
  componentSlug: escrowSlug,
  title: "Release Escrow Funds",
  description:
    "Deposit funds into escrow and have the arbiter release them to the beneficiary.",
  fixtures: { identities: ["admin", "user1"], assets: ["forge-token"], balances: [{ identity: "user1", asset: "forge-token", amount: 400 }] },
  steps: [
    {
      id: "inspect-initial-status",
      title: "Inspect initial status",
      kind: "observation",
      method: "status",
      args: [],
      expected: 0,
      resultLabel: "Active / empty",
      explanation:
        "Confirm that the escrow begins in its initial state before funds are deposited.",
    },
    {
      id: "deposit-release-funds",
      title: "Deposit funds",
      kind: "call",
      method: "deposit",
      args: ["user1", "400"],
      authorization: "The depositor's authorization is simulated locally.",
      explanation:
        "The depositor transfers the demonstration funds into the escrow contract.",
    },
    {
      id: "verify-funded-status",
      title: "Verify funded status",
      kind: "observation",
      method: "status",
      args: [],
      expected: 0,
      resultLabel: "Active / funded",
      explanation: "Confirm that the escrow has received the funds.",
    },
    {
      id: "release-escrow-funds",
      title: "Release funds",
      kind: "call",
      method: "release",
      args: ["admin"],
      authorization: "The arbiter's authorization is simulated locally.",
      explanation:
        "The arbiter approves the release of the escrowed funds to the beneficiary.",
    },
    {
      id: "verify-released-status",
      title: "Verify released status",
      kind: "observation",
      method: "status",
      args: [],
      expected: 1,
      resultLabel: "Released",
      explanation: "Confirm that the escrow workflow completed successfully.",
    },
  ],
};

const escrowRefundFunds: PlaygroundScenario = {
  id: "escrow.refund-funds",
  componentSlug: escrowSlug,
  title: "Refund Escrow Funds",
  description:
    "Deposit funds into escrow and have the arbiter refund them to the depositor.",
  fixtures: { identities: ["admin", "user1"], assets: ["forge-token"], balances: [{ identity: "user1", asset: "forge-token", amount: 400 }] },
  steps: [
    {
      id: "inspect-refund-initial-status",
      title: "Inspect initial status",
      kind: "observation",
      method: "status",
      args: [],
      expected: 0,
      resultLabel: "Active / empty",
      explanation:
        "Confirm that the escrow begins in its initial state before funds are deposited.",
    },
    {
      id: "deposit-refund-funds",
      title: "Deposit funds",
      kind: "call",
      method: "deposit",
      args: ["user1", "400"],
      authorization: "The depositor's authorization is simulated locally.",
      explanation:
        "The depositor transfers the demonstration funds into the escrow contract.",
    },
    {
      id: "verify-refund-funded-status",
      title: "Verify funded status",
      kind: "observation",
      method: "status",
      args: [],
      expected: 0,
      resultLabel: "Active / funded",
      explanation: "Confirm that the escrow has received the funds.",
    },
    {
      id: "refund-escrow-funds",
      title: "Refund funds",
      kind: "call",
      method: "refund",
      args: ["admin"],
      authorization: "The arbiter's authorization is simulated locally.",
      explanation:
        "The arbiter approves the refund of the escrowed funds to the depositor.",
    },
    {
      id: "verify-refunded-status",
      title: "Verify refunded status",
      kind: "observation",
      method: "status",
      args: [],
      expected: 2,
      resultLabel: "Refunded",
      explanation: "Confirm that the escrow funds were returned to the depositor.",
    },
  ],
};

const tokenSlug = getComponentByPackage("token")?.slug ?? "";

const tokenMintAndTransfer: PlaygroundScenario = {
  id: "token.mint-and-transfer",
  componentSlug: tokenSlug,
  title: "Mint and Transfer Tokens",
  description:
    "Mint tokens to one account, transfer part of the balance to another account, and observe the resulting balance changes.",
  fixtures: { identities: ["admin", "user1", "user2"] },
  steps: [
    {
      id: "token-sender-initial-balance",
      title: "Inspect sender initial balance",
      kind: "observation",
      method: "balance",
      args: ["user1"],
      expected: 0,
      explanation: "Inspect the sender's token balance before minting.",
    },
    {
      id: "token-recipient-initial-balance",
      title: "Inspect recipient initial balance",
      kind: "observation",
      method: "balance",
      args: ["user2"],
      expected: 0,
      explanation: "Inspect the recipient's token balance before any transfer occurs.",
    },
    {
      id: "token-mint",
      title: "Mint tokens",
      kind: "call",
      method: "mint",
      args: ["user1", "1000"],
      authorization: "The token administrator's authorization is simulated locally.",
      explanation: "Mint 1000 demonstration tokens to the sender account.",
    },
    {
      id: "token-sender-after-mint",
      title: "Observe sender balance after mint",
      kind: "observation",
      method: "balance",
      args: ["user1"],
      expected: 1000,
      comparison: {
        compareWith: "token-sender-initial-balance",
        relation: "increased",
      },
      explanation: "Confirm that minting increased the sender's balance.",
    },
    {
      id: "token-transfer",
      title: "Transfer tokens",
      kind: "call",
      method: "transfer",
      args: ["user1", "user2", "250"],
      authorization: "The sender's authorization is simulated locally.",
      explanation: "Transfer 250 tokens from the sender to the recipient.",
    },
    {
      id: "token-sender-after-transfer",
      title: "Observe sender balance after transfer",
      kind: "observation",
      method: "balance",
      args: ["user1"],
      expected: 750,
      comparison: {
        compareWith: "token-sender-after-mint",
        relation: "decreased",
      },
      explanation: "Confirm that the sender's balance decreased by the transfer amount.",
    },
    {
      id: "token-recipient-after-transfer",
      title: "Observe recipient balance after transfer",
      kind: "observation",
      method: "balance",
      args: ["user2"],
      expected: 250,
      comparison: {
        compareWith: "token-recipient-initial-balance",
        relation: "increased",
      },
      explanation: "Confirm that the recipient's balance increased by the transfer amount.",
    },
  ],
};

const claimableBalanceSlug =
  getComponentByPackage("claimable-balance")?.slug ?? "";

const claimableBalanceCreateAndInspect: PlaygroundScenario = {
  id: "claimable-balance.create-and-inspect",
  componentSlug: claimableBalanceSlug,
  title: "Create and Inspect Claimable Balance",
  description:
    "Create a claimable balance, capture its returned ID, and use that ID to inspect the new balance.",
  fixtures: { identities: ["admin", "user1"], assets: ["forge-token"], balances: [{ identity: "admin", asset: "forge-token", amount: 1000 }] },
  steps: [
    {
      id: "claimable-balance-deposit",
      title: "Create claimable balance",
      kind: "call",
      method: "deposit",
      args: ["admin", "user1", "1000", "0", null, "1000"],
      authorization: "The funder's authorization is simulated locally.",
      explanation:
        "Deposit 1000 local asset units for user1 and capture the returned balance ID.",
    },
    {
      id: "claimable-balance-read-amount",
      title: "Inspect deposited amount",
      kind: "observation",
      method: "balance_of",
      args: [{ reference: "claimable-balance-deposit.result" }],
      expected: 1000,
      explanation:
        "Use the ID returned by the deposit step to read the remaining balance.",
    },
    {
      id: "claimable-balance-read-claimable",
      title: "Inspect claimability",
      kind: "observation",
      method: "is_claimable",
      args: [{ reference: "claimable-balance-deposit.result" }],
      expected: true,
      explanation:
        "Use the same returned ID to check whether the balance is currently claimable.",
    },
  ],
};

const merkleAirdropFixture = createMerkleFixture({
  id: "test-airdrop",
  asset: "forge-token",
  leaves: [{ index: 0, claimant: "user1", amount: 1000 }],
});

const merkleAirdropSlug = getComponentByPackage("merkle-airdrop")?.slug ?? "";
const merkleAirdropClaimWorkflow: PlaygroundScenario = {
  id: "merkle-airdrop.claim",
  componentSlug: merkleAirdropSlug,
  title: "Claim Merkle Airdrop",
  description: "Fund a deterministic local Merkle distribution and claim the user1 allocation with its generated proof.",
  fixtures: {
    identities: ["admin", "user1"],
    assets: ["forge-token"],
    balances: [{ identity: "admin", asset: "forge-token", amount: 1000 }],
    merkle: [merkleAirdropFixture],
    constructorValues: { root: merkleAirdropFixture.root },
  },
  steps: [
    { id: "inspect-initial-claim", title: "Check initial claim state", kind: "observation", method: "claimed", args: [0], expected: false, explanation: "Confirm that the user1 allocation has not been claimed." },
    { id: "fund-airdrop", title: "Fund the distribution", kind: "call", method: "deposit", args: ["1000"], authorization: "The distributor administrator's authorization is simulated locally.", explanation: "Deposit enough local asset balance to cover the deterministic allocation." },
    { id: "claim-airdrop", title: "Submit local Merkle claim", kind: "call", method: "claim", args: [0, "user1", "1000", { fixture: "test-airdrop.proof.0" }], authorization: "Claimant authorization is simulated locally.", explanation: "Claim user1's allocation using the locally generated cryptographic proof." },
    { id: "inspect-final-claim", title: "Verify claim state", kind: "observation", method: "claimed", args: [0], expected: true, explanation: "Confirm that the allocation index is now marked as claimed." },
  ],
};

const timelockSlug = getComponentByPackage("timelock")?.slug ?? "";

const multiSignatureSlug = getComponentByPackage("multi-signature")?.slug ?? "";
const multiSignatureApprovalWorkflow: PlaygroundScenario = {
  id: "multi-signature.threshold-approval",
  componentSlug: multiSignatureSlug,
  title: "Reach Approval Threshold",
  description:
    "Record approvals from two configured signers and execute a proposal after the 2-of-3 threshold is reached.",
  fixtures: {
    identities: ["signer1", "signer2", "signer3"],
    multisig: [{ id: "test-multisig", signers: ["signer1", "signer2", "signer3"], threshold: 2 }],
    constructorValues: { signer1: "signer1", signer2: "signer2", signer3: "signer3", threshold: "2" },
  },
  steps: [
    { id: "multisig-initial-approval", title: "Check initial approval state", kind: "observation", method: "is_approved", args: ["proposal1"], expected: false, explanation: "Confirm that proposal1 has no approvals and has not reached the threshold." },
    { id: "multisig-signer1-approval", title: "Signer 1 approves", kind: "call", method: "approve", args: ["signer1", "proposal1"], authorization: "Signer 1 authorization is simulated locally.", explanation: "Record the first distinct configured signer approval for proposal1." },
    { id: "multisig-after-signer1", title: "Check threshold after one approval", kind: "observation", method: "is_approved", args: ["proposal1"], expected: false, explanation: "Confirm that one approval is insufficient for the 2-of-3 threshold." },
    { id: "multisig-signer2-approval", title: "Signer 2 approves", kind: "call", method: "approve", args: ["signer2", "proposal1"], authorization: "Signer 2 authorization is simulated locally.", explanation: "Record the second distinct configured signer approval for proposal1." },
    { id: "multisig-after-signer2", title: "Check approval threshold", kind: "observation", method: "is_approved", args: ["proposal1"], expected: true, explanation: "Confirm that two distinct approvals reach the configured threshold." },
    { id: "multisig-execute", title: "Execute approved proposal", kind: "call", method: "execute", args: ["proposal1"], explanation: "Execute proposal1 after its approval threshold has been reached." },
    { id: "multisig-final-approval", title: "Verify final approval state", kind: "observation", method: "is_approved", args: ["proposal1"], expected: true, explanation: "Confirm that the proposal remains threshold-approved after execution." },
  ],
};

const vestingSlug = getComponentByPackage("vesting")?.slug ?? "";
const vestingWorkflow: PlaygroundScenario = {
  id: "vesting.claim-after-cliff",
  componentSlug: vestingSlug,
  title: "Claim Vested Tokens",
  description: "Fund a vesting schedule, advance the local clock halfway through it, and claim the vested amount.",
  fixtures: { identities: ["admin", "beneficiary"], assets: ["forge-token"], balances: [{ identity: "admin", asset: "forge-token", amount: 1000000 }], constructorValues: { beneficiary: "beneficiary", asset: "asset", total: "1000000", start: "0", duration: "86400", cliff: "0" } },
  clock: { initialLedgerTimestamp: 0, maxAdvanceSeconds: 43200 },
  steps: [
    { id: "vesting-initial-claimable", title: "Inspect initial claimable amount", kind: "observation", method: "claimable", args: [], expected: 0, explanation: "Confirm that no tokens are vested at the beginning of the schedule." },
    { id: "vesting-deposit", title: "Fund vesting schedule", kind: "call", method: "deposit", args: ["admin", "1000000"], authorization: "The funder's authorization is simulated locally.", explanation: "Deposit the full deterministic local allocation into the vesting contract." },
    { id: "vesting-advance", title: "Advance to halfway point", kind: "clock", method: "", args: [], clock: { advanceBySeconds: 43200 }, explanation: "Advance only the local sandbox clock by half of the vesting duration." },
    { id: "vesting-half-claimable", title: "Inspect vested amount", kind: "observation", method: "claimable", args: [], expected: 500000, comparison: { compareWith: "vesting-initial-claimable", relation: "increased" }, explanation: "Confirm that half of the allocation is vested after half the schedule." },
    { id: "vesting-claim", title: "Claim vested tokens", kind: "call", method: "claim", args: ["beneficiary"], authorization: "The beneficiary's authorization is simulated locally.", explanation: "Release the currently vested amount to the beneficiary." },
    { id: "vesting-released", title: "Verify released amount", kind: "observation", method: "released", args: [], expected: 500000, explanation: "Confirm that the claimed amount is recorded as released." },
  ],
};

const subscriptionSlug = getComponentByPackage("subscription")?.slug ?? "";
const subscriptionWorkflow: PlaygroundScenario = {
  id: "subscription.charge-and-cancel",
  componentSlug: subscriptionSlug,
  title: "Charge and Cancel Subscription",
  description: "Observe an active subscription, charge it after its interval, then cancel it locally.",
  fixtures: { identities: ["admin", "user1"], assets: ["forge-token"], balances: [{ identity: "admin", asset: "forge-token", amount: 1000000 }], constructorValues: { subscriber: "admin", merchant: "user1", asset: "asset", amount: "1000", interval: "3600" } },
  clock: { initialLedgerTimestamp: 0, maxAdvanceSeconds: 3600 },
  steps: [
    { id: "subscription-initial-active", title: "Inspect initial subscription", kind: "observation", method: "is_active", args: [], expected: true, explanation: "Confirm that the subscription starts active." },
    { id: "subscription-before-interval", title: "Attempt early charge", kind: "call", method: "charge", args: ["admin"], authorization: "The subscriber's authorization is simulated locally.", explanation: "An early charge is safely gated until the configured interval has elapsed." },
    { id: "subscription-advance", title: "Advance to charge interval", kind: "clock", method: "", args: [], clock: { advanceBySeconds: 3600 }, explanation: "Advance only the local sandbox clock to the next charge time." },
    { id: "subscription-charge", title: "Charge subscription", kind: "call", method: "charge", args: ["admin"], authorization: "The subscriber's authorization is simulated locally.", explanation: "Charge the configured amount after the interval is reached." },
    { id: "subscription-cancel", title: "Cancel subscription", kind: "call", method: "cancel", args: ["admin"], authorization: "The subscriber's authorization is simulated locally.", explanation: "Cancel the active subscription from its configured subscriber identity." },
    { id: "subscription-final-active", title: "Verify cancellation", kind: "observation", method: "is_active", args: [], expected: false, explanation: "Confirm that the subscription is no longer active." },
  ],
};

const crowdfundSlug = getComponentByPackage("crowdfund")?.slug ?? "";
const crowdfundWorkflow: PlaygroundScenario = {
  id: "crowdfund.reach-goal-and-withdraw",
  componentSlug: crowdfundSlug,
  title: "Reach Crowdfund Goal",
  description: "Create a campaign, contribute enough to reach its goal, advance the local deadline, and withdraw the funds.",
  fixtures: { identities: ["admin"], assets: ["forge-token"], balances: [{ identity: "admin", asset: "forge-token", amount: 1000000 }], constructorValues: {} },
  clock: { initialLedgerTimestamp: 0, maxAdvanceSeconds: 3600 },
  steps: [
    { id: "crowdfund-create", title: "Create campaign", kind: "call", method: "create_campaign", args: ["admin", "asset", "500000", "3600"], authorization: "The owner's authorization is simulated locally.", explanation: "Create a deterministic campaign that closes at local timestamp 3600." },
    { id: "crowdfund-contribute", title: "Contribute to campaign", kind: "call", method: "contribute", args: [{ reference: "crowdfund-create.result" }, "admin", "500000", "100"], authorization: "The contributor's authorization is simulated locally.", explanation: "Contribute enough local asset units to reach the campaign goal." },
    { id: "crowdfund-total", title: "Inspect amount raised", kind: "observation", method: "total_raised", args: [{ reference: "crowdfund-create.result" }], expected: 500000, explanation: "Confirm that the campaign records the contribution." },
    { id: "crowdfund-goal", title: "Verify goal reached", kind: "observation", method: "goal_reached", args: [{ reference: "crowdfund-create.result" }], expected: true, explanation: "Confirm that the campaign has reached its funding goal." },
    { id: "crowdfund-advance", title: "Advance past deadline", kind: "clock", method: "", args: [], clock: { advanceBySeconds: 3600 }, explanation: "Advance only the local sandbox clock past the campaign deadline." },
    { id: "crowdfund-withdraw", title: "Withdraw campaign funds", kind: "call", method: "withdraw", args: [{ reference: "crowdfund-create.result" }, "admin"], authorization: "The owner's authorization is simulated locally.", explanation: "Withdraw the reached campaign balance after its deadline." },
  ],
};

const stakingSlug = getComponentByPackage("staking")?.slug ?? "";
const stakingWorkflow: PlaygroundScenario = {
  id: "staking.earn-and-claim",
  componentSlug: stakingSlug,
  title: "Stake and Earn Rewards",
  description: "Fund a reward period, stake local tokens, advance the clock, and claim the accrued rewards.",
  fixtures: { identities: ["admin"], assets: ["forge-token"], balances: [{ identity: "admin", asset: "forge-token", amount: 1000000 }], constructorValues: { asset: "asset", duration: "1000" } },
  clock: { initialLedgerTimestamp: 0, maxAdvanceSeconds: 500 },
  steps: [
    { id: "staking-initial-balance", title: "Inspect initial stake", kind: "observation", method: "staked_balance", args: ["admin"], expected: 0, explanation: "Confirm that admin has not staked any tokens yet." },
    { id: "staking-fund", title: "Fund reward period", kind: "call", method: "fund_rewards", args: ["admin", "500000"], authorization: "The reward funder's authorization is simulated locally.", explanation: "Fund a deterministic 1000-second reward period." },
    { id: "staking-stake", title: "Stake tokens", kind: "call", method: "stake", args: ["admin", "100000"], authorization: "The staker's authorization is simulated locally.", explanation: "Stake 100000 local asset units in the reward pool." },
    { id: "staking-after-stake", title: "Verify staked balance", kind: "observation", method: "staked_balance", args: ["admin"], expected: 100000, comparison: { compareWith: "staking-initial-balance", relation: "increased" }, explanation: "Confirm that the stake was recorded." },
    { id: "staking-initial-earned", title: "Inspect initial rewards", kind: "observation", method: "earned", args: ["admin"], expected: 0, explanation: "Confirm that no reward time has elapsed yet." },
    { id: "staking-advance", title: "Advance reward time", kind: "clock", method: "", args: [], clock: { advanceBySeconds: 500 }, explanation: "Advance only the local sandbox clock halfway through the reward period." },
    { id: "staking-earned", title: "Inspect accrued rewards", kind: "observation", method: "earned", args: ["admin"], expected: 250000, comparison: { compareWith: "staking-initial-earned", relation: "increased" }, explanation: "Confirm that rewards accrued during the local time advancement." },
    { id: "staking-claim", title: "Claim rewards", kind: "call", method: "claim", args: ["admin"], authorization: "The staker's authorization is simulated locally.", explanation: "Claim the rewards accrued by the staker." },
    { id: "staking-final-earned", title: "Verify rewards cleared", kind: "observation", method: "earned", args: ["admin"], expected: 0, explanation: "Confirm that claiming clears the pending reward balance." },
  ],
};

const oracleFixture = createOracleSignatureFixture({
  id: "test-oracle",
  signer: "user1",
  price: 125,
  timestamp: 100,
});
const oracleSlug = getComponentByPackage("oracle")?.slug ?? "";
const oraclePublishWorkflow: PlaygroundScenario = {
  id: "oracle.publish-signed-price",
  componentSlug: oracleSlug,
  title: "Publish Signed Oracle Price",
  description: "Publish a deterministic locally signed price and observe the updated oracle state.",
  fixtures: {
    identities: ["admin", "user1"],
    oracle: [oracleFixture],
    constructorValues: { signer: oracleFixture.publicKey },
  },
  steps: [
    { id: "oracle-initial-price", title: "Read initial price", kind: "observation", method: "latest_price", args: [], expected: 0, explanation: "Read the oracle's constructor-initialized price." },
    { id: "oracle-publish", title: "Publish signed price", kind: "call", method: "publish", args: ["125", "100", { fixture: "test-oracle.signature" }], explanation: "Submit a price signed by the deterministic local signature fixture." },
    { id: "oracle-updated-price", title: "Read updated price", kind: "observation", method: "latest_price", args: [], expected: 125, comparison: { compareWith: "oracle-initial-price", relation: "increased" }, explanation: "Confirm that the accepted observation updated the stored price." },
    { id: "oracle-updated-time", title: "Read observation timestamp", kind: "observation", method: "latest_time", args: [], expected: 100, explanation: "Confirm that the signed timestamp was stored with the price." },
  ],
};

const timelockUnlockWorkflow: PlaygroundScenario = {
  id: "timelock.unlock-and-release",
  componentSlug: timelockSlug,
  title: "Unlock and Release Timelock",
  description: "Create a time-locked asset, advance the local clock, and release it after unlock.",
  fixtures: { identities: ["admin", "user1"], assets: ["forge-token"], balances: [{ identity: "admin", asset: "forge-token", amount: 100 }] },
  clock: { initialLedgerTimestamp: 0, maxAdvanceSeconds: 86400 },
  steps: [
    { id: "create-timelock", title: "Create lock", kind: "call", method: "lock", args: ["admin", "asset", "100", "user1", "86400"], authorization: "The owner's authorization is simulated locally.", explanation: "Lock demonstration funds for user1 until the local timestamp reaches 86400." },
    { id: "inspect-locked", title: "Check locked state", kind: "observation", method: "is_unlocked", args: [{ reference: "create-timelock.result" }], expected: false, explanation: "Confirm that the lock is not unlocked at the initial local time." },
    { id: "advance-to-unlock", title: "Advance local clock", kind: "clock", method: "", args: [], clock: { advanceBySeconds: 86400 }, explanation: "Advance only the local sandbox clock to the lock's unlock timestamp." },
    { id: "inspect-unlocked", title: "Check unlocked state", kind: "observation", method: "is_unlocked", args: [{ reference: "create-timelock.result" }], expected: true, explanation: "Confirm that the lock is now unlocked after local time advancement." },
    { id: "release-timelock", title: "Release lock", kind: "call", method: "release", args: [{ reference: "create-timelock.result" }], authorization: "The beneficiary's authorization is simulated locally.", explanation: "Release the unlocked funds to the beneficiary." },
    { id: "inspect-released", title: "Verify released state", kind: "observation", method: "lock_released", args: [{ reference: "create-timelock.result" }], expected: true, explanation: "Confirm that the lock has been marked released." },
  ],
};

export const playgroundScenarios: readonly PlaygroundScenario[] = [
  paymentWorkflow,
  allowanceWorkflow,
  atomicSwapWorkflow,
  accessControlRoleLifecycle,
  escrowReleaseFunds,
  escrowRefundFunds,
  tokenMintAndTransfer,
  claimableBalanceCreateAndInspect,
  merkleAirdropClaimWorkflow,
  oraclePublishWorkflow,
  multiSignatureApprovalWorkflow,
  vestingWorkflow,
  subscriptionWorkflow,
  crowdfundWorkflow,
  stakingWorkflow,
  timelockUnlockWorkflow,
];

export function getScenariosForComponent(
  componentSlug: string,
): PlaygroundScenario[] {
  return playgroundScenarios.filter(
    (scenario) => scenario.componentSlug === componentSlug,
  );
}

export function getScenario(
  componentSlug: string,
  scenarioId: string,
): PlaygroundScenario | undefined {
  return playgroundScenarios.find(
    (scenario) =>
      scenario.componentSlug === componentSlug && scenario.id === scenarioId,
  );
}
