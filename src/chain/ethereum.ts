import { ethers } from "ethers";

export class EthereumBroadcaster {
    
    private provider: ethers.JsonRpcProvider

    constructor(rpcUrl: string) {
        this.provider = new ethers.JsonRpcProvider(rpcUrl)
    }

    async buildTxHash(from: string, to: string, valueEth: string): Promise<{ txHash: Uint8Array, tx: ethers.TransactionRequest, from: string }>{
        const nonce = await this.provider.getTransactionCount(from)
        const feeData = await this.provider.getFeeData()

        const tx: ethers.TransactionRequest = {
            to,
            value: ethers.parseEther(valueEth),
            nonce,
            gasLimit: 21000n,
            maxFeePerGas: feeData.maxFeePerGas!,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas!,
            chainId: 11155111n,
            type: 2
        }

        const txHash = ethers.getBytes(ethers.Transaction.from(tx as any).unsignedHash)
        return { txHash, tx, from }
    }

    async broadcast(tx: ethers.TransactionRequest, r: bigint, s: bigint, from: string): Promise<string> {
        const N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
        const canonicalS = s > N / 2n ? N - s : s

        const rHex = '0x' + r.toString(16).padStart(64, '0')
        const sHex = '0x' + canonicalS.toString(16).padStart(64, '0')

        let signature!: ethers.Signature
        const unsignedHash = ethers.Transaction.from(tx as any).unsignedHash

        for (const v of [27, 28]) {
            const sig = ethers.Signature.from({ r: rHex, s: sHex, v })
            const recovered = ethers.recoverAddress(unsignedHash, sig)
            console.log(`v=${v}, recovered: ${recovered}, expected: ${tx.from}`)
            if (recovered.toLowerCase() === from.toLowerCase()) {
                signature = sig
                break
            }
        }

        if (!signature) throw new Error('Could not determine correct v value')

        const signedTx = ethers.Transaction.from({ ...tx, signature } as any)
        const response = await this.provider.broadcastTransaction(signedTx.serialized)
        console.log(`[Chain] tx: https://sepolia.etherscan.io/tx/${response.hash}`)
        await response.wait(1)
        return response.hash
    }

    async getBalance(address: string): Promise<bigint> {
        return this.provider.getBalance(address)
    }

    getAddress(publicKeyHex: string): string {
        return ethers.computeAddress('0x' + publicKeyHex)
    }
}