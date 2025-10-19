/* eslint-disable */
const hre = require("hardhat");
async function main() {
  const bn = await hre.ethers.provider.getBlockNumber();
  console.log("Sepolia block:", bn);
}
main().catch((e)=>{console.error(e);process.exitCode=1;});