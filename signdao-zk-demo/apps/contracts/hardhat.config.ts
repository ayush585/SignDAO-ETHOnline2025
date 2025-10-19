import * as dotenv from "dotenv";
dotenv.config();

import "@nomicfoundation/hardhat-toolbox";

import { HardhatUserConfig } from "hardhat/config";

const rawPk = process.env.ETHEREUM_PRIVATE_KEY ?? "";
const pk = rawPk.startsWith("0x") ? rawPk : rawPk ? `0x${rawPk}` : "";

const config: HardhatUserConfig = {
    solidity: "0.8.23",
    networks: {
        sepolia: {
            url: process.env.SEPOLIA_RPC_URL,
            accounts: pk ? [pk] : [],
            chainId: 11155111
        }
    }
};

export default config;
