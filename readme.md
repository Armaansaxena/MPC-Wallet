# MPC Wallet (educational prototype). 
A 3-party wallet with working Feldman-VSS distributed key generation and a WebSocket relay, broadcasting to Sepolia. The threshold-signing step is a simplified demonstration and does not produce cryptographically correct threshold ECDSA (see Known Limitations). Not for real funds. Phase 2 will replace it with an audited FROST/GG20 implementation.

## What It Does

- **Distributed Key Generation (DKG)** — 3 parties jointly generate a keypair using Shamir's Secret Sharing and Feldman VSS. Each party holds a share. Nobody holds the full key.
- **Threshold Signing (TSS)** — any 2 of 3 parties can cooperate to sign a transaction without reconstructing the private key.
- **WebSocket Relay** — parties communicate through a message relay server, simulating real distributed deployment.
- **Ethereum Integration** — signed transactions broadcast to Sepolia testnet via ethers.js.

## Architecture
```
src/
├── crypto/
│   ├── field.ts      # Elliptic curve math (secp256k1)
│   ├── dkg.ts        # Distributed Key Generation
│   └── tss.ts        # Threshold Signing
├── network/
│   └── relay.ts      # WebSocket message relay
├── wallet/
│   └── wallet.ts     # MPC wallet — ties all layers together
└── chain/
    └── ethereum.ts   # Ethereum transaction broadcasting
```

## How It Works

### Key Generation (DKG)
Each party generates a random polynomial where the constant term is their secret contribution. They exchange commitments (EC points) publicly and private shares secretly. Each party verifies received shares using Feldman VSS — if a share is invalid, the cheating party is identified. The final public key is the sum of all parties' first commitments.

### Threshold Signing (TSS)
Parties exchange nonce commitments, reveal nonce points, then each compute a partial signature using their secret share weighted by their Lagrange coefficient. Partial signatures are combined to produce a standard ECDSA signature accepted by Ethereum.

### Message Relay
All inter-party messages route through a WebSocket relay server. In production this would have authentication, encryption, and audit logging.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Elliptic curve math | @noble/curves |
| Ethereum | ethers.js v6 |
| Networking | ws (WebSocket) |
| Runtime | Node.js v22 + tsx |
| Language | TypeScript |

## Getting Started

### Prerequisites
- Node.js v18+
- npm v8+

### Install
```bash
git clone <repo>
cd mpc-wallet
npm install
```

### Run
```bash
npm run dev
```

First run performs DKG and saves shares to `dkg-output.json`. Fund the printed address with Sepolia ETH, then run again to broadcast a transaction.

### Build
```bash
npm run build
```

## Known Limitations

### TSS Math
The current TSS implementation is a simplified version that demonstrates the protocol flow but does not produce cryptographically correct threshold signatures. Full threshold ECDSA requires Multiplicative-to-Additive (MtA) share conversion as specified in the GG20 protocol. Production implementations use:
- [tss-lib](https://github.com/bnb-chain/tss-lib) (Go) — used by Binance
- [multi-party-ecdsa](https://github.com/ZenGo-X/multi-party-ecdsa) (Rust) — used by ZenGo

The Rust TSS core is planned as Phase 2 of this project.

### Single Machine
Currently all 3 parties run in the same process. Production deployment would run each party on a separate server.

## Roadmap

- [ ] Fix TSS math — implement GG20 or integrate Rust core
- [ ] Solana support (FROST signatures over ed25519)
- [ ] Key refresh — rotate shares without changing public key
- [ ] Attack simulation tests
- [ ] Separate party processes with real network communication

## References

- [GG20 Paper](https://eprint.iacr.org/2020/540.pdf) — One Round Threshold ECDSA with Identifiable Abort
- [Feldman VSS](https://www.cs.umd.edu/~gasarch/TOPICS/secretsharing/feldmanVSS.pdf)
- [Shamir's Secret Sharing](https://dl.acm.org/doi/10.1145/359168.359176)
- [Fireblocks MPC Primer](https://www.fireblocks.com/what-is-mpc/)