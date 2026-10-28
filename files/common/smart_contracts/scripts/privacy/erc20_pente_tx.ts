/**
 * Private ERC20 demo — deploy ERC20Token inside a Pente privacy group.
 *
 * The same ERC20Token.sol used by erc20-tx is deployed here, but inside a
 * Pente privacy group so balances and transfers are hidden from non-members.
 *
 * Setup:
 *   - member1 (paladin1) + member2 (paladin2) are in the privacy group
 *   - member3 (paladin3) is intentionally excluded
 *
 * Flow:
 *   1. Create Pente privacy group (member1 + member2)
 *   2. Deploy ERC20Token privately inside the group
 *   3. Read metadata (name, symbol, totalSupply) — member1
 *   4. Mint 500 extra tokens to member1
 *   5. Transfer 200 tokens from member1 → member2
 *   6. Approve member2 to spend 100 tokens on member1's behalf
 *   7. member2 calls transferFrom (member1 → member2, 100 tokens)
 *   8. Final balanceOf checks for both members
 *   9. Verify member3 is denied
 *
 * Run:
 *   cd smart_contracts
 *   npm install && npm run compile
 *   npm run erc20-pente-tx
 */
import PaladinClient, { PenteFactory } from "@lfdecentralizedtrust/paladin-sdk";
import { ethers } from "ethers";
import path from "path";
import fs from "fs";
import { paladin } from "../../keys";

const POLL_TIMEOUT_MS = 60_000;

const artifactPath = path.resolve(
  __dirname,
  "../../artifacts/contracts/ERC20Token.sol/ERC20Token.json"
);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const contractAbi: ReadonlyArray<ethers.JsonFragment> = artifact.abi;
const contractBytecode: string = artifact.bytecode;

// ── ABI fragments for each operation ────────────────────────────────────────

const NAME_ABI: ethers.JsonFragment = {
  name: "name", type: "function",
  inputs: [], outputs: [{ name: "", type: "string" }],
  stateMutability: "view",
};

const SYMBOL_ABI: ethers.JsonFragment = {
  name: "symbol", type: "function",
  inputs: [], outputs: [{ name: "", type: "string" }],
  stateMutability: "view",
};

const TOTAL_SUPPLY_ABI: ethers.JsonFragment = {
  name: "totalSupply", type: "function",
  inputs: [], outputs: [{ name: "", type: "uint256" }],
  stateMutability: "view",
};

const BALANCE_OF_ABI: ethers.JsonFragment = {
  name: "balanceOf", type: "function",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "view",
};

const MINT_ABI: ethers.JsonFragment = {
  name: "mint", type: "function",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [],
  stateMutability: "nonpayable",
};

const TRANSFER_ABI: ethers.JsonFragment = {
  name: "transfer", type: "function",
  inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
  stateMutability: "nonpayable",
};

const APPROVE_ABI: ethers.JsonFragment = {
  name: "approve", type: "function",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
  stateMutability: "nonpayable",
};

const ALLOWANCE_ABI: ethers.JsonFragment = {
  name: "allowance", type: "function",
  inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
  stateMutability: "view",
};

const TRANSFER_FROM_ABI: ethers.JsonFragment = {
  name: "transferFrom", type: "function",
  inputs: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
  stateMutability: "nonpayable",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const DECIMALS = 18n;
const ONE = 10n ** DECIMALS;

function fmt(raw: bigint | string): string {
  const bn = typeof raw === "string" ? BigInt(raw) : raw;
  return ethers.formatUnits(bn, DECIMALS);
}

async function main(): Promise<void> {
  console.log("=== PRIVATE ERC20 DEMO (Paladin / Pente) ===\n");

  // --- Clients ---
  const paladin1 = new PaladinClient({ url: paladin.member1.url });
  const paladin2 = new PaladinClient({ url: paladin.member2.url });
  const paladin3 = new PaladinClient({ url: paladin.member3.url });

  const [verifier1] = paladin1.getVerifiers("member@paladin1");
  const [verifier2] = paladin2.getVerifiers("member@paladin2");
  const [verifier3] = paladin3.getVerifiers("outsider@paladin3");

  console.log(`member1 key: ${verifier1.lookup}`);
  console.log(`member2 key: ${verifier2.lookup}`);
  console.log(`member3 key: ${verifier3.lookup} (excluded from group)`);

  // --- Step 1: Create Pente privacy group ---
  console.log("\n1. Creating Pente privacy group (member1 + member2) ...");
  const penteFactory = new PenteFactory(paladin1, "pente");
  const privacyGroup = await penteFactory
    .newPrivacyGroup({
      members: [verifier1, verifier2],
      evmVersion: "shanghai",
      externalCallsEnabled: true,
    })
    .waitForDeploy(POLL_TIMEOUT_MS);

  if (!privacyGroup) throw new Error("Timed out waiting for privacy group deployment");
  console.log(`  Privacy group address: ${privacyGroup.address}`);

  // --- Step 2: Deploy ERC20Token privately inside the group ---
  console.log("\n2. Deploying ERC20Token privately (name=PrivateDemo, symbol=PDEMO, initialSupply=1000) ...");
  const tokenAddress = await privacyGroup
    .deploy({
      abi: contractAbi,
      bytecode: contractBytecode,
      from: verifier1.lookup,
      inputs: { name: "PrivateDemo", symbol: "PDEMO", initialSupply: "1000" },
    })
    .waitForDeploy(POLL_TIMEOUT_MS);

  if (!tokenAddress) throw new Error("Timed out waiting for ERC20Token deployment");
  console.log(`  Private token address: ${tokenAddress}`);

  // --- Step 3: Read token metadata ---
  console.log("\n3. Token metadata (read by member1) ...");
  const [nameResult, symbolResult, supplyResult] = await Promise.all([
    privacyGroup.call({ from: verifier1.lookup, to: tokenAddress, methodAbi: NAME_ABI, data: {} }),
    privacyGroup.call({ from: verifier1.lookup, to: tokenAddress, methodAbi: SYMBOL_ABI, data: {} }),
    privacyGroup.call({ from: verifier1.lookup, to: tokenAddress, methodAbi: TOTAL_SUPPLY_ABI, data: {} }),
  ]);
  console.log(`  name:        ${nameResult?.[0] ?? nameResult}`);
  console.log(`  symbol:      ${symbolResult?.[0] ?? symbolResult}`);
  console.log(`  totalSupply: ${fmt(supplyResult?.[0] ?? supplyResult)} PDEMO`);

  // Resolve on-chain addresses for balanceOf calls
  const addr1 = await verifier1.address();
  const addr2 = await verifier2.address();

  // --- Step 4: Mint 500 extra tokens to member1 ---
  console.log("\n4. Minting 500 PDEMO to member1 ...");
  await privacyGroup
    .sendTransaction({
      from: verifier1.lookup,
      to: tokenAddress,
      methodAbi: MINT_ABI,
      data: { to: addr1, amount: (500n * ONE).toString() },
    })
    .waitForReceipt(POLL_TIMEOUT_MS);

  const bal1AfterMint = await privacyGroup.call({
    from: verifier1.lookup, to: tokenAddress,
    methodAbi: BALANCE_OF_ABI, data: { account: addr1 },
  });
  console.log(`  member1 balance: ${fmt(bal1AfterMint?.[0] ?? bal1AfterMint)} PDEMO`);

  // --- Step 5: Transfer 200 from member1 → member2 ---
  console.log("\n5. Transferring 200 PDEMO from member1 → member2 ...");
  await privacyGroup
    .sendTransaction({
      from: verifier1.lookup,
      to: tokenAddress,
      methodAbi: TRANSFER_ABI,
      data: { to: addr2, amount: (200n * ONE).toString() },
    })
    .waitForReceipt(POLL_TIMEOUT_MS);

  const [bal1AfterTransfer, bal2AfterTransfer] = await Promise.all([
    privacyGroup.call({ from: verifier1.lookup, to: tokenAddress, methodAbi: BALANCE_OF_ABI, data: { account: addr1 } }),
    privacyGroup.call({ from: verifier1.lookup, to: tokenAddress, methodAbi: BALANCE_OF_ABI, data: { account: addr2 } }),
  ]);
  console.log(`  member1 balance: ${fmt(bal1AfterTransfer?.[0] ?? bal1AfterTransfer)} PDEMO`);
  console.log(`  member2 balance: ${fmt(bal2AfterTransfer?.[0] ?? bal2AfterTransfer)} PDEMO`);

  // --- Step 6: member1 approves member2 to spend 100 PDEMO ---
  console.log("\n6. member1 approves member2 to spend 100 PDEMO ...");
  await privacyGroup
    .sendTransaction({
      from: verifier1.lookup,
      to: tokenAddress,
      methodAbi: APPROVE_ABI,
      data: { spender: addr2, amount: (100n * ONE).toString() },
    })
    .waitForReceipt(POLL_TIMEOUT_MS);

  const allowanceResult = await privacyGroup.call({
    from: verifier1.lookup, to: tokenAddress,
    methodAbi: ALLOWANCE_ABI, data: { owner: addr1, spender: addr2 },
  });
  console.log(`  allowance(member1 → member2): ${fmt(allowanceResult?.[0] ?? allowanceResult)} PDEMO`);

  // --- Step 7: member2 calls transferFrom (member1 → member2, 100 PDEMO) ---
  console.log("\n7. member2 calls transferFrom (member1 → member2, 100 PDEMO) ...");
  await privacyGroup
    .using(paladin2)
    .sendTransaction({
      from: verifier2.lookup,
      to: tokenAddress,
      methodAbi: TRANSFER_FROM_ABI,
      data: { from: addr1, to: addr2, amount: (100n * ONE).toString() },
    })
    .waitForReceipt(POLL_TIMEOUT_MS);

  // --- Step 8: Final balances ---
  console.log("\n8. Final balances ...");
  const [final1, final2] = await Promise.all([
    privacyGroup.call({ from: verifier1.lookup, to: tokenAddress, methodAbi: BALANCE_OF_ABI, data: { account: addr1 } }),
    privacyGroup.using(paladin2).call({ from: verifier2.lookup, to: tokenAddress, methodAbi: BALANCE_OF_ABI, data: { account: addr2 } }),
  ]);
  console.log(`  member1: ${fmt(final1?.[0] ?? final1)} PDEMO`);
  console.log(`  member2: ${fmt(final2?.[0] ?? final2)} PDEMO`);

  // --- Step 9: Verify member3 is denied ---
  console.log("\n9. Verifying privacy — member3 (not in group) attempts balanceOf ...");
  try {
    await privacyGroup.using(paladin3).call({
      from: verifier3.lookup,
      to: tokenAddress,
      methodAbi: BALANCE_OF_ABI,
      data: { account: addr1 },
    });
    console.error("  ERROR: member3 should NOT have access!");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  member3 correctly denied — "${msg}" ✓`);
  }

  console.log("\n=== DONE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
