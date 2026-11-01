/**
 * NFT (ERC721) demo — deploy, mint, transfer, approve + transferFrom, burn.
 *
 * Uses a standard OpenZeppelin ERC721 with an owner-only mint function.
 * No Paladin involvement — purely public on-chain transactions.
 *
 * Run:
 *   cd smart_contracts
 *   npm install && npm run compile
 *   npm run nft-tx
 */
import { ethers } from "ethers";
import path from "path";
import fs from "fs";
import { besu } from "../../keys";

const artifactPath = path.resolve(
  __dirname,
  "../../artifacts/contracts/ERC721Token.sol/ERC721Token.json"
);
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const contractAbi: ethers.InterfaceAbi = artifact.abi;
const contractBytecode: string = artifact.bytecode;

async function deploy(wallet: ethers.Wallet, name: string, symbol: string): Promise<string> {
  const factory = new ethers.ContractFactory(contractAbi, contractBytecode, wallet);
  const contract = await factory.deploy(name, symbol);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  Contract deployed at: ${address}`);
  return address;
}

async function mint(wallet: ethers.Wallet, address: string, to: string): Promise<bigint> {
  const nft = new ethers.Contract(address, contractAbi, wallet);
  const tx: ethers.TransactionResponse = await nft.mint(to);
  const receipt = (await tx.wait())!;
  // the token id is the third topic of the ERC721 Transfer event
  const transfer = receipt.logs
    .map((log) => nft.interface.parseLog(log))
    .find((parsed) => parsed?.name === "Transfer");
  const tokenId: bigint = transfer!.args.tokenId;
  console.log(`  mint(${to}) => tokenId ${tokenId} mined — txHash: ${tx.hash}`);
  return tokenId;
}

async function ownerOf(provider: ethers.JsonRpcProvider, address: string, tokenId: bigint): Promise<string> {
  const nft = new ethers.Contract(address, contractAbi, provider);
  const owner: string = await nft.ownerOf(tokenId);
  console.log(`  ownerOf(${tokenId}): ${owner}`);
  return owner;
}

async function balanceOf(provider: ethers.JsonRpcProvider, address: string, account: string): Promise<bigint> {
  const nft = new ethers.Contract(address, contractAbi, provider);
  const balance: bigint = await nft.balanceOf(account);
  console.log(`  balanceOf(${account}): ${balance}`);
  return balance;
}

async function transferFrom(
  wallet: ethers.Signer,
  address: string,
  from: string,
  to: string,
  tokenId: bigint
): Promise<void> {
  const nft = new ethers.Contract(address, contractAbi, wallet);
  const tx: ethers.TransactionResponse = await nft.transferFrom(from, to, tokenId);
  await tx.wait();
  console.log(`  transferFrom(${from} -> ${to}, #${tokenId}) mined — txHash: ${tx.hash}`);
}

async function approve(wallet: ethers.Wallet, address: string, spender: string, tokenId: bigint): Promise<void> {
  const nft = new ethers.Contract(address, contractAbi, wallet);
  const tx: ethers.TransactionResponse = await nft.approve(spender, tokenId);
  await tx.wait();
  console.log(`  approve(${spender}, #${tokenId}) mined — txHash: ${tx.hash}`);
}

async function burn(wallet: ethers.Signer, address: string, tokenId: bigint): Promise<void> {
  const nft = new ethers.Contract(address, contractAbi, wallet);
  const tx: ethers.TransactionResponse = await nft.burn(tokenId);
  await tx.wait();
  console.log(`  burn(#${tokenId}) mined — txHash: ${tx.hash}`);
}

async function main(): Promise<void> {
  console.log("=== NFT (ERC721) DEMO ===\n");

  const provider = new ethers.JsonRpcProvider(besu.rpcnode.url, undefined, { cacheTimeout: -1 });

  // Owner wallet (deployer/minter)
  const owner = new ethers.Wallet(besu.rpcnode.accountPrivateKey, provider);
  // Second wallet — a fresh random key for demo purposes only
  const recipient = ethers.Wallet.createRandom().connect(provider);
  console.log(`Owner:     ${owner.address}`);
  console.log(`Recipient: ${recipient.address}`);

  // ── 1. Deploy ────────────────────────────────────────────────────────────────
  console.log("\n1. Deploying ERC721Token (name=DemoNFT, symbol=DNFT) ...");
  const nftAddress = await deploy(owner, "DemoNFT", "DNFT");

  // ── 2. Mint two NFTs to owner ────────────────────────────────────────────────
  console.log("\n2. Minting 2 NFTs to owner ...");
  const first = await mint(owner, nftAddress, owner.address);
  const second = await mint(owner, nftAddress, owner.address);
  await balanceOf(provider, nftAddress, owner.address);

  // ── 3. Transfer the first one to recipient ───────────────────────────────────
  console.log(`\n3. Transferring #${first} to recipient ...`);
  await transferFrom(owner, nftAddress, owner.address, recipient.address, first);
  await ownerOf(provider, nftAddress, first);

  // ── 4-5. Approve + transferFrom ──────────────────────────────────────────────
  console.log(`\n4. Owner approves recipient to move #${second} ...`);
  await approve(owner, nftAddress, recipient.address, second);

  console.log(`\n5. Recipient calls transferFrom (owner -> recipient, #${second}) ...`);
  // Fund the recipient with a tiny bit of ETH for gas (owner sends it)
  const gasTx = await owner.sendTransaction({ to: recipient.address, value: ethers.parseEther("0.01") });
  await gasTx.wait();
  await transferFrom(recipient, nftAddress, owner.address, recipient.address, second);
  await ownerOf(provider, nftAddress, second);

  // ── 6. Recipient burns one ───────────────────────────────────────────────────
  console.log(`\n6. Recipient burns #${first} ...`);
  await burn(recipient, nftAddress, first);

  // ── 7. Final balances ────────────────────────────────────────────────────────
  console.log("\n7. Final balances ...");
  await balanceOf(provider, nftAddress, owner.address);
  await balanceOf(provider, nftAddress, recipient.address);

  console.log("\n=== DONE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
