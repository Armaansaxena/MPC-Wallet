import { secp256k1 } from '@noble/curves/secp256k1.js';

export const N = secp256k1.Point.Fn.ORDER
export const G = secp256k1.Point.BASE

export type Scalar = bigint;
export type Point = typeof G

export function scalarAdd(a: Scalar, b: Scalar): Scalar{

    const ans = ((a + b) % N + N) % N;
    return ans;
}

export function scalarMul(a: Scalar, b: Scalar): Scalar{

    const ans = (a * b) % N;
    return ans;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint{
    let result = 1n;
    base = base % mod;
    while (exp > 0n) {
        if (exp % 2n === 1n) result = (result * base) % mod
        exp = exp / 2n
        base = (base * base) % mod
    }
    return result;
}

export function scalarInv(a: Scalar): Scalar{
    if (a == 0n) throw new Error("Cannot invert Zero");
    return modPow(a, N - 2n, N);
}

export function randomScalar(): Scalar{
    const randomSecret = secp256k1.utils.randomSecretKey();

    const hex = Buffer.from(randomSecret).toString('hex');
    const ans = BigInt('0x' + hex);

    return ans
}

export function scalarMultG(k: Scalar): Point{
    
    const ans = G.multiply(k)
    return ans;
}

export function pointAdd(p1: Point, p2: Point): Point{
    
    const ans = p1.add(p2);
    return ans;
}

export function pointToHex(p: Point): string{

    const bytes = p.toBytes(true);
    const ans = Buffer.from(bytes).toString('hex');
    return ans;
}

export function pointFromHex(hex: string): Point{
    return secp256k1.Point.fromHex(hex);
}

export function lagrangeInterpolateAt0(points: [Scalar, Scalar][]): Scalar {
    let secret = 0n
    for (let i = 0; i < points.length; i++) {
        const [xi, yi] = points[i]
        let num = 1n
        let den = 1n
        for (let j = 0; j < points.length; j++) {
            if (i === j) continue
            const [xj] = points[j]
            num = scalarMul(num, (N - xj) % N)
            den = scalarMul(den, (xi - xj + N) % N)
        }
        secret = scalarAdd(secret, scalarMul(yi, scalarMul(num, scalarInv(den))))
    }
    return secret
}

export function polyEval(coefficients: Scalar[], x: Scalar): Scalar {
    let result = 0n
    let xPow = 1n
    for (let i = 0; i < coefficients.length; i++) {
        result = scalarAdd(result, scalarMul(coefficients[i], xPow))
        xPow = scalarMul(xPow, x)
    }
    return result
}