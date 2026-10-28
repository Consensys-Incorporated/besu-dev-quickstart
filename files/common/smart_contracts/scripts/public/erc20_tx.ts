/**
 * ERC20 token demo — deploy, mint, transfer, approve + transferFrom.
 *
 * Uses a standard OpenZeppelin ERC20 with an owner-only mint function.
 * No Paladin involvement — purely public on-chain transactions.
 *
 * Run:
 *   cd smart_contracts
 *   npm install && npm run compile
 *   npm run erc20-tx
 */
import { ethers } from "ethers";
import path from "path";
import fs from "fs";
import { besu } from "../../keys";

const artifactPath = path.resolve(
  __dirname,
  "../../artifacts/contracts/ERC20Token.sol/ERC20Token.json"
);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const contractAbi: ethers.InterfaceAbi = artifact.abi;
const contractBytecode: string = artifact.bytecode;

async function deploy(
  wallet: ethers.Wallet,
  name: string,
  symbol: string,
  initialSupply: bigint
): Promise<string> {
  const factory = new ethers.ContractFactory(contractAbi, contractBytecode, wallet);
  const contract = await factory.deploy(name, symbol, initialSupply);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  Contract deployed at: ${address}`);
  return address;
}

async function readInfo(provider: ethers.JsonRpcProvider, address: string): Promise<void> {
  const token = new ethers.Contract(address, contractAbi, provider);
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
    token.totalSupply(),
  ]);
  console.log(`  name:        ${name}`);
  console.log(`  symbol:      ${symbol}`);
  console.log(`  decimals:    ${decimals}`);
  console.log(`  totalSupply: ${ethers.formatUnits(totalSupply, decimals)} ${symbol}`);
}

async function balanceOf(
  provider: ethers.JsonRpcProvider,
  address: string,
  account: string
): Promise<bigint> {
  const token = new ethers.Contract(address, contractAbi, provider);
  const decimals: bigint = await token.decimals();
  const balance: bigint = await token.balanceOf(account);
  console.log(`  balanceOf(${account}): ${ethers.formatUnits(balance, decimals)}`);
  return balance;
}

async function mint(
  wallet: ethers.Wallet,
  address: string,
  to: string,
  amount: bigint
): Promise<void> {
  const token = new ethers.Contract(address, contractAbi, wallet);
  const decimals: bigint = await token.decimals();
  const tx: ethers.TransactionResponse = await token.mint(to, amount);
  await tx.wait();
  console.log(`  mint(${to}, ${ethers.formatUnits(amount, decimals)}) mined — txHash: ${tx.hash}`);
}

async function transfer(
  wallet: ethers.Wallet,
  address: string,
  to: string,
  amount: bigint
): Promise<void> {
  const token = new ethers.Contract(address, contractAbi, wallet);
  const decimals: bigint = await token.decimals();
  const tx: ethers.TransactionResponse = await token.transfer(to, amount);
  await tx.wait();
  console.log(`  transfer(${to}, ${ethers.formatUnits(amount, decimals)}) mined — txHash: ${tx.hash}`);
}

async function approve(
  wallet: ethers.Wallet,
  address: string,
  spender: string,
  amount: bigint
): Promise<void> {
  const token = new ethers.Contract(address, contractAbi, wallet);
  const decimals: bigint = await token.decimals();
  const tx: ethers.TransactionResponse = await token.approve(spender, amount);
  await tx.wait();
  console.log(`  approve(${spender}, ${ethers.formatUnits(amount, decimals)}) mined — txHash: ${tx.hash}`);
}

async function allowance(
  provider: ethers.JsonRpcProvider,
  address: string,
  owner: string,
  spender: string
): Promise<bigint> {
  const token = new ethers.Contract(address, contractAbi, provider);
  const decimals: bigint = await token.decimals();
  const amount: bigint = await token.allowance(owner, spender);
  console.log(`  allowance(owner=${owner}, spender=${spender}): ${ethers.formatUnits(amount, decimals)}`);
  return amount;
}

async function transferFrom(
  spenderWallet: ethers.Signer,
  address: string,
  from: string,
  to: string,
  amount: bigint
): Promise<void> {
  const token = new ethers.Contract(address, contractAbi, spenderWallet);
  const decimals: bigint = await token.decimals();
  const tx: ethers.TransactionResponse = await token.transferFrom(from, to, amount);
  await tx.wait();
  console.log(
    `  transferFrom(${from} -> ${to}, ${ethers.formatUnits(amount, decimals)}) mined — txHash: ${tx.hash}`
  );
}

async function main(): Promise<void> {
  console.log("=== ERC20 TOKEN DEMO ===\n");

  const provider = new ethers.JsonRpcProvider(besu.rpcnode.url);

  // Owner wallet (deployer/minter)
  const owner = new ethers.Wallet(besu.rpcnode.accountPrivateKey, provider);
  // Second wallet — a fresh random key for demo purposes only
  const recipient = ethers.Wallet.createRandom().connect(provider);
  console.log(`Owner:     ${owner.address}`);
  console.log(`Recipient: ${recipient.address}`);

  const DECIMALS = 18n;
  const ONE = 10n ** DECIMALS;

  // ── 1. Deploy ────────────────────────────────────────────────────────────────
  console.log("\n1. Deploying ERC20Token (name=DemoToken, symbol=DEMO, initialSupply=1000) ...");
  const tokenAddress = await deploy(owner, "DemoToken", "DEMO", 1000n);

  // ── 2. Read metadata ─────────────────────────────────────────────────────────
  console.log("\n2. Token metadata ...");
  await readInfo(provider, tokenAddress);

  // ── 3. Check initial balances ────────────────────────────────────────────────
  console.log("\n3. Initial balances ...");
  await balanceOf(provider, tokenAddress, owner.address);
  await balanceOf(provider, tokenAddress, recipient.address);

  // ── 4. Mint extra tokens to owner ────────────────────────────────────────────
  console.log("\n4. Minting 500 DEMO to owner ...");
  await mint(owner, tokenAddress, owner.address, 500n * ONE);
  await balanceOf(provider, tokenAddress, owner.address);

  // ── 5. Transfer to recipient ─────────────────────────────────────────────────
  console.log("\n5. Transferring 200 DEMO to recipient ...");
  await transfer(owner, tokenAddress, recipient.address, 200n * ONE);
  await balanceOf(provider, tokenAddress, owner.address);
  await balanceOf(provider, tokenAddress, recipient.address);

  // ── 6-7. Approve + transferFrom ────────────────────────────────────────────────
  console.log("\n6. Owner approves recipient to spend 100 DEMO on their behalf ...");
  await approve(owner, tokenAddress, recipient.address, 100n * ONE);
  await allowance(provider, tokenAddress, owner.address, recipient.address);

  console.log("\n7. Recipient calls transferFrom (owner -> recipient, 100 DEMO) ...");
  // Fund the recipient with a tiny bit of ETH for gas (owner sends it)
  const gasTx = await owner.sendTransaction({
    to: recipient.address,
    value: ethers.parseEther("0.01"),
  });
  await gasTx.wait();
  await transferFrom(recipient, tokenAddress, owner.address, recipient.address, 100n * ONE);

  // ── 8. Final balances ────────────────────────────────────────────────────────
  console.log("\n8. Final balances ...");
  await balanceOf(provider, tokenAddress, owner.address);
  await balanceOf(provider, tokenAddress, recipient.address);

  console.log("\n=== DONE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
