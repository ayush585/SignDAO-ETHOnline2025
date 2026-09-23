import * as dotenv from "dotenv";
dotenv.config();

import "@nomicfoundation/hardhat-toolbox";

import { HardhatUserConfig } from "hardhat/config";

const rawPk = process.env.ETHEREUM_PRIVATE_KEY ?? "";
const pk = rawPk.startsWith("0x") ? rawPk : rawPk ? `0x${rawPk}` : "";
const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL?.trim();

const networks: HardhatUserConfig["networks"] = {};

if (sepoliaRpcUrl) {
    networks.sepolia = {
        url: sepoliaRpcUrl,
        accounts: pk ? [pk] : [],
        chainId: 11155111
    };
}

const config: HardhatUserConfig = {
    solidity: "0.8.23",
    networks
};

export default config;
