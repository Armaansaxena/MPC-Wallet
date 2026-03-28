import { scalarAdd, scalarInv, scalarMul, scalarMultG, pointAdd, pointFromHex, pointToHex, type Scalar, type Point, randomScalar, N } from "./field.js";
import { type DKGOutput } from "./dkg.js";
import { sha256 } from '@noble/hashes/sha2.js'

export interface SigningRound1{
    partyId: number,
    nonceCommitHash: string
}

export interface SigningRound2 {
    partyId: number
    noncePoint: string
}

export interface PartialSignature{
    partyId: number,
    r: string,
    s_i: string
}


export function combineSignatures(partials: PartialSignature[]): { r: bigint, s: bigint }{
    
    const r = BigInt('0x' + partials[0].r);
    let s = 0n
    for (const partial of partials) {
        const s_i = BigInt('0x' + partial.s_i)
        s = scalarAdd(s, s_i)
    }
    return {r,s}
}

function lagrangeCoeff(myId: number, allIds: number[]): Scalar {
    let num = 1n
    let den = 1n
    const x = BigInt(myId)

    for (const id of allIds) {
        if (id === myId) continue
        const xj = BigInt(id)
        num = scalarMul(num, (N - xj) % N)
        den = scalarMul(den, (x - xj + N) % N)
    }

    return scalarMul(num, scalarInv(den))
}

export class SigningSession{
    private partyId: number
    private dkgOutput: DKGOutput
    private nonceShare: Scalar
    private noncePoint: Point

    constructor(partyId: number, dkgOutput: DKGOutput) {
        this.partyId = partyId
        this.dkgOutput = dkgOutput
        
        let calcNonceShare = randomScalar()
        let calcNoncePoint = scalarMultG(calcNonceShare);

        this.nonceShare = calcNonceShare
        this.noncePoint = calcNoncePoint
    }

    round1(): SigningRound1{
        let hashNoncePoint = pointToHex(this.noncePoint)
        const bytes = Buffer.from(hashNoncePoint, 'hex')
        const hash = sha256(bytes)
        const hashHex = Buffer.from(hash).toString('hex')
        
        return {
            partyId: this.partyId,
            nonceCommitHash: hashHex
        }
    }

    round2(): SigningRound2{
        const resNoncePoint = pointToHex(this.noncePoint);
        return {
            partyId: this.partyId,
            noncePoint: resNoncePoint
        }
    }

    partialSign(messageHash: Uint8Array, allRound2: SigningRound2[]): PartialSignature {
        let sharedR = this.noncePoint
        for (const r2 of allRound2) {
            sharedR = pointAdd(sharedR, pointFromHex(r2.noncePoint))
        }

        const r = sharedR.x % N
        const kInv = scalarInv(this.nonceShare)
        const h = BigInt('0x' + Buffer.from(messageHash).toString('hex'))

        // Compute Lagrange coefficient for this party
        const allPartyIds = [this.partyId, ...allRound2.map(r => r.partyId)]
        const lambda = lagrangeCoeff(this.partyId, allPartyIds)

        // Weight the secret share by Lagrange coefficient
        const weightedShare = scalarMul(this.dkgOutput.secretShare, lambda)
        const s_i = scalarMul(kInv, scalarAdd(h, scalarMul(r, weightedShare)))

        return {
            partyId: this.partyId,
            r: r.toString(16).padStart(64, '0'),
            s_i: s_i.toString(16).padStart(64, '0')
        }
    }
}
