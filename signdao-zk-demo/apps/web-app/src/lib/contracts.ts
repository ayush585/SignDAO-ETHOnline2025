import { ethers } from "ethers"
import { getBrowserProviderAndSigner, getReadProvider } from "@/lib/eth"
import DaoActionsZKArtifact from "../contract-artifacts/DaoActionsZK.json"
import FeedbackArtifact from "../contract-artifacts/Feedback.json"

const readProvider = getReadProvider()

const DAO_ACTIONS_ADDR = process.env.NEXT_PUBLIC_DAO_ACTIONS_ADDR
const FEEDBACK_ADDR = process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS

const daoRead =
    DAO_ACTIONS_ADDR !== undefined
        ? new ethers.Contract(DAO_ACTIONS_ADDR, DaoActionsZKArtifact.abi, readProvider)
        : null

const feedbackRead =
    FEEDBACK_ADDR !== undefined
        ? new ethers.Contract(FEEDBACK_ADDR, FeedbackArtifact.abi, readProvider)
        : null

function ensureAddress(address: string | undefined, envKey: string) {
    if (!address) {
        throw new Error(`${envKey} is not defined`)
    }
    return address
}

export function getDaoRead() {
    if (!daoRead) {
        ensureAddress(DAO_ACTIONS_ADDR, "NEXT_PUBLIC_DAO_ACTIONS_ADDR")
        throw new Error("DaoActionsZK contract unavailable")
    }
    return daoRead
}

export async function assertDaoDeployed() {
    const address = ensureAddress(DAO_ACTIONS_ADDR, "NEXT_PUBLIC_DAO_ACTIONS_ADDR")
    const code = await readProvider.getCode(address)
    if (!code || code === "0x") {
        throw new Error("DaoActionsZK not deployed at NEXT_PUBLIC_DAO_ACTIONS_ADDR")
    }
}

export async function getDaoWrite() {
    const read = getDaoRead()
    const { provider, signer } = await getBrowserProviderAndSigner()
    const network = await provider.getNetwork()
    console.log("[WRITE] chain:", network.chainId.toString())
    console.log("[WRITE] from:", await signer.getAddress())
    return read.connect(signer)
}

export function getFeedbackRead() {
    if (!feedbackRead) {
        ensureAddress(FEEDBACK_ADDR, "NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS")
        throw new Error("Feedback contract unavailable")
    }
    return feedbackRead
}

export async function assertFeedbackDeployed() {
    const address = ensureAddress(FEEDBACK_ADDR, "NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS")
    const code = await readProvider.getCode(address)
    if (!code || code === "0x") {
        throw new Error("Feedback contract not deployed at NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS")
    }
}

export async function getFeedbackWrite() {
    const read = getFeedbackRead()
    const { provider, signer } = await getBrowserProviderAndSigner()
    const network = await provider.getNetwork()
    console.log("[WRITE] chain:", network.chainId.toString())
    console.log("[WRITE] from:", await signer.getAddress())
    return read.connect(signer)
}
