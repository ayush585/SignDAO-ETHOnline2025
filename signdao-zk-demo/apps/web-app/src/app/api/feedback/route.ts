import { Contract, JsonRpcProvider, Wallet } from "ethers"
import { NextRequest } from "next/server"
import Feedback from "../../../../contract-artifacts/Feedback.json"

export async function POST(req: NextRequest) {
    if (typeof process.env.ETHEREUM_PRIVATE_KEY !== "string") {
        throw new Error("Please, define ETHEREUM_PRIVATE_KEY in your .env file")
    }

    const ethereumPrivateKey = process.env.ETHEREUM_PRIVATE_KEY
    const rpcUrl =
        process.env.NEXT_PUBLIC_RPC_URL ??
        process.env.NEXT_PUBLIC_PROVIDER_URL ??
        process.env.NEXT_PUBLIC_JSON_RPC_URL
    const contractAddress = process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS as string

    if (!rpcUrl) {
        throw new Error("Please, define NEXT_PUBLIC_RPC_URL in your .env file")
    }

    const provider = new JsonRpcProvider(rpcUrl)

    const signer = new Wallet(ethereumPrivateKey, provider)
    const contract = new Contract(contractAddress, Feedback.abi, signer)

    const { feedback, merkleTreeDepth, merkleTreeRoot, nullifier, points } = await req.json()

    try {
        const transaction = await contract.sendFeedback(merkleTreeDepth, merkleTreeRoot, nullifier, feedback, points)

        await transaction.wait()

        return new Response("Success", { status: 200 })
    } catch (error: any) {
        console.error(error)

        return new Response(`Server error: ${error}`, {
            status: 500
        })
    }
}
