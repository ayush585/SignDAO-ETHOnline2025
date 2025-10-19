/* eslint-disable */
const hre = require("hardhat");
async function main() {
  await hre.run("compile");
  const Verifier = await hre.ethers.getContractFactory("SemaphoreVerifier");
  const verifier = await Verifier.deploy();
  const tx = verifier.deploymentTransaction();
  console.log("? Deploy tx:", tx.hash);
  await verifier.waitForDeployment();
  const addr = await verifier.getAddress();
  console.log("? Deployed:", addr);
}
main().catch((e)=>{console.error(e);process.exitCode=1;});