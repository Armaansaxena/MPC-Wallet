import { RelayServer, PartyTransport } from './network/relay.js'
import { MPCWallet } from './wallet/wallet.js'
import { EthereumBroadcaster } from './chain/ethereum.js'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { lagrangeInterpolateAt0 } from './crypto/field.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { ethers } from 'ethers'

interface SavedDKG {
    publicKey: string
    secretShares: string[]
}

function saveDKG(publicKey: string, secretShares: string[]) {
    writeFileSync('dkg-output.json', JSON.stringify({ publicKey, secretShares }))
    console.log('DKG saved to dkg-output.json')
}

function loadDKG(): SavedDKG | null {
    if (!existsSync('dkg-output.json')) return null
    return JSON.parse(readFileSync('dkg-output.json', 'utf8'))
}

const RELAY_PORT = 8080
const THRESHOLD = 2
const TOTAL_PARTIES = 3
const RPC_URL = 'https://eth-sepolia.g.alchemy.com/v2/3tmCQxU-Q1c2FzV5r30Nm'

async function main() {
    new RelayServer(RELAY_PORT)
    await new Promise(r => setTimeout(r, 300))

    const transports = [1, 2, 3].map(id =>
        new PartyTransport(id, `ws://localhost:${RELAY_PORT}`)
    )

    await Promise.all(transports.map(t => t.connect()))
    transports.forEach(t => t.register())
    await new Promise(r => setTimeout(r, 300))

    const wallets = transports.map((t, i) =>
        new MPCWallet(i + 1, THRESHOLD, TOTAL_PARTIES, t)
    )

    const broadcaster = new EthereumBroadcaster(RPC_URL)
    let publicKey: string

    const saved = loadDKG()
    if (saved) {
        publicKey = saved.publicKey
        wallets.forEach((w, i) => w.loadDKGOutput(publicKey, saved.secretShares[i]))
        console.log('Loaded saved DKG. Public key:', publicKey)
    } else {
        const keys = await Promise.all(wallets.map(w => w.generateKey()))
        publicKey = keys[0]
        console.log('All keys match:', keys.every(k => k === publicKey))
        const secretShares = wallets.map(w => w.getSecretShare())
        saveDKG(publicKey, secretShares)
    }

    const mpcAddress = broadcaster.getAddress(publicKey)
    console.log('MPC wallet address:', mpcAddress)

    const balance = await broadcaster.getBalance(mpcAddress)
    if (balance === 0n) {
        console.log('Fund this address with Sepolia ETH then run again:', mpcAddress)
        process.exit(1)
    }

    console.log('Balance:', balance.toString(), 'wei')

    const { txHash, tx, from } = await broadcaster.buildTxHash(
        mpcAddress,
        '0xCdC9872E7971C11b4Fe979E5812E22Cb1d201842',
        '0.0001'
    )

    const pubKeyBytes = Buffer.from(publicKey, 'hex')

    // ── Debug: reconstruct private key and verify DKG is correct ──
    const shares = saved!.secretShares.map((s, i) =>
        [BigInt(i + 1), BigInt('0x' + s)] as [bigint, bigint]
    )
    const reconstructed = lagrangeInterpolateAt0(shares.slice(0, 2))
    const reconstructedHex = reconstructed.toString(16).padStart(64, '0')

    const reconstructedPubKey = Buffer.from(
        secp256k1.getPublicKey(Buffer.from(reconstructedHex, 'hex'), true)
    ).toString('hex')
    console.log('DKG reconstruction correct:', reconstructedPubKey === publicKey)

    // Sign with reconstructed key using ethers (handles v correctly)
    const signingKey = new ethers.SigningKey('0x' + reconstructedHex)
    const ethSig = signingKey.sign(txHash)
    console.log('Real signature valid:', secp256k1.verify(
        new Uint8Array([...Buffer.from(ethSig.r.slice(2), 'hex'), ...Buffer.from(ethSig.s.slice(2), 'hex')]),
        txHash,
        pubKeyBytes
    ))

    console.log('Broadcasting to Sepolia...')
    const confirmedHash = await broadcaster.broadcast(tx, BigInt(ethSig.r), BigInt(ethSig.s), from)
    console.log('Transaction confirmed:', confirmedHash)
    console.log('View on Etherscan: https://sepolia.etherscan.io/tx/' + confirmedHash)

    process.exit(0)
}

main()