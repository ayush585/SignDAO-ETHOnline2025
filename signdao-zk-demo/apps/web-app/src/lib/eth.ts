import { ethers } from "ethers"

declare global {
    interface Window {
        ethereum?: any
    }
}

export async function getBrowserProviderAndSigner() {
    if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("MetaMask not found")
    }

    await window.ethereum.request({ method: "eth_requestAccounts" })

    const provider = new ethers.BrowserProvider(window.ethereum)
    const signer = await provider.getSigner()

    const network = await provider.getNetwork()
    if (network.chainId !== 11155111n) {
        await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0xaa36a7" }]
        })
    }

    const activeSigner = await signer.getAddress()
    const refreshedNetwork = await provider.getNetwork()
    console.log("[ETH] signer:", activeSigner)
    console.log("[ETH] chainId:", refreshedNetwork.chainId.toString())

    return { provider, signer }
}

export function getReadProvider(): ethers.JsonRpcProvider {
    const rpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC
    if (!rpc) {
        throw new Error("NEXT_PUBLIC_SEPOLIA_RPC missing")
    }

    return new ethers.JsonRpcProvider(rpc)
}
