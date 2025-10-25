import { ethers } from "ethers";
import { getBrowserProviderAndSigner, getReadProvider } from "@/lib/eth";
import DaoActionsZKAbi from "@/lib/abi/DaoActionsZK.json";

const read = getReadProvider();

export const DAO_ADDR = process.env.NEXT_PUBLIC_DAO_ACTIONS_ADDR as `0x${string}`;
export const FB_ADDR  = (process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS || "") as `0x${string}`;

export const daoRead = new ethers.Contract(DAO_ADDR, DaoActionsZKAbi, read);

export async function assertDaoDeployed() {
  const code = await read.getCode(DAO_ADDR);
  if (!code || code === "0x") throw new Error(`DaoActionsZK not deployed at ${DAO_ADDR}`);
}

export async function getDaoWrite() {
  const { provider, signer } = await getBrowserProviderAndSigner();
  console.log("[WRITE] chain:", (await provider.getNetwork()).chainId.toString());
  console.log("[WRITE] from:", await signer.getAddress());
  return daoRead.connect(signer);
}

/** Feedback is OPTIONAL: return null if no address/bytecode */
export async function getFeedbackWriteOrNull() {
  if (!FB_ADDR) return null;
  const code = await read.getCode(FB_ADDR);
  if (!code || code === "0x") return null;
  const { default: FeedbackAbi } = await import("@/lib/abi/Feedback.json");
  const fbRead = new ethers.Contract(FB_ADDR, FeedbackAbi, read);
  const { signer } = await getBrowserProviderAndSigner();
  return fbRead.connect(signer);
}
