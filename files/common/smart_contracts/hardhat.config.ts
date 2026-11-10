import { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.27",
        // genesis.json enables Cancun from block 0; newer OpenZeppelin releases need it (mcopy)
        settings: { evmVersion: "cancun" },
      },
    ],
    overrides: {
      // erc20_pente_tx.ts deploys this contract inside a Pente privacy group.
      // Paladin's Pente EVM supports up to shanghai and rejects cancun bytecode.
      "contracts/ERC20Token.sol": {
        version: "0.8.27",
        settings: { evmVersion: "shanghai" },
      },
    },
  },
  networks: {
    besu: {
      url: "http://localhost:8545",
      chainId: 1337,
      accounts: ["0x60bbe10a196a4e71451c0f6e9ec9beab454c2a5ac0542aa5b8b733ff5719fec3"],
    },
  },
};

export default config;
