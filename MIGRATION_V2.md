# Polycopy → Polymarket V2 Migration Plan

> **Origem deste plano**: o roxcopy (greenfield V2-native, monorepo TS) completou a
> migração V2 e validou primeira ordem `MATCHED` on-chain em 2026-05-07
> (tx [`0xf4415bbde8b127b24efcedc02a97dae250de54cc04c4f7586e0cf63963ff879d`](https://polygonscan.com/tx/0xf4415bbde8b127b24efcedc02a97dae250de54cc04c4f7586e0cf63963ff879d)).
> A jornada destravou 7 bugs sequenciais que estão consolidados aqui.
> Implementação de referência viva: `C:\Users\Ivan Xavier\.claude\sistemas\roxcopy\packages\core\src\orders\` (signer.ts, builder.ts, types.ts).

---

## 0. Contexto da migração

| | |
|---|---|
| Cutover Polymarket V1→V2 | **2026-04-28 ~11h UTC** |
| Sintoma comum | `400 {"error":"order_version_mismatch"}` em todas as ordens |
| Stack atual polycopy | `@polymarket/clob-client@^4.14.0` (V1 SDK) + `ethers@^5.8.0` |
| SDK V2 oficial | [`@polymarket/clob-client-v2`](https://github.com/Polymarket/clob-client-v2) |
| Source of truth | [`Polymarket/ctf-exchange-v2/src/exchange/libraries/Structs.sol`](https://github.com/Polymarket/ctf-exchange-v2) |

---

## 1. O que mudou em V2 — resumo executivo

### 1.1 Schema Order (signed struct)

| Campo | V1 | V2 |
|---|---|---|
| salt | ✓ | ✓ |
| maker | ✓ | ✓ |
| signer | ✓ | ✓ |
| **taker** | ✓ | ❌ removido do struct (vai só no JSON wire) |
| tokenId | ✓ | ✓ |
| makerAmount | ✓ | ✓ |
| takerAmount | ✓ | ✓ |
| **expiration** | ✓ | ❌ removido do struct (vai só no JSON wire) |
| **nonce** | ✓ | ❌ removido |
| **feeRateBps** | ✓ | ❌ removido (taxa cobrada no match, não no order) |
| side | ✓ | ✓ |
| signatureType | ✓ | ✓ |
| **timestamp** | ❌ | ✓ NOVO — `uint256`, **MILLISECONDS** (não seconds) |
| **metadata** | ❌ | ✓ NOVO — `bytes32`, zero por padrão |
| **builder** | ❌ | ✓ NOVO — `bytes32`, zero = sem attribution |

**EIP-712 type string V2** (referência exata do `clob-client-v2`):
```
Order(uint256 salt,address maker,address signer,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,uint256 timestamp,bytes32 metadata,bytes32 builder)
```

### 1.2 EIP-712 Domain

| | V1 | V2 |
|---|---|---|
| name | `"Polymarket CTF Exchange"` | `"Polymarket CTF Exchange"` (igual) |
| **version** | `"1"` | **`"2"`** |
| chainId | 137 | 137 |
| verifyingContract | exchange V1 (`0x4bFb…`) | exchange V2 (`0xE111…` ou `0xe222…`) |

### 1.3 Endereços de contrato

| | V1 (deprecated) | V2 (atual) |
|---|---|---|
| CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` | `0xE111180000d2663C0091e4f400237545B87B996B` |
| Neg-Risk Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` | `0xe2222d279d744050d28e00520010520000310F59` |

> ⚠️ Cuidado: `polycopy/src/utils/createClobClient.ts:24` tem o V2 CTF address rotulado como `EXCHANGE_V2`, mas o valor é o do **Neg-Risk V2**, não do CTF V2. Este é um dos bugs a corrigir.

### 1.4 Wire envelope POST `/order`

```json
{
  "deferExec": false,
  "postOnly": false,
  "order": {
    "salt": <int>,
    "maker": "0x...",
    "signer": "0x...",
    "taker": "0x0000…0000",
    "tokenId": "<string>",
    "makerAmount": "<string>",
    "takerAmount": "<string>",
    "side": "BUY" | "SELL",
    "signatureType": <0|1|2|3>,
    "timestamp": "<ms-string>",
    "expiration": "0",
    "metadata": "0x...32-byte",
    "builder": "0x...32-byte",
    "signature": "0x..."
  },
  "owner": "<api_key_uuid>",
  "orderType": "GTC" | "GTD" | "FOK" | "FAK"
}
```

14 campos no `order` (= 11 EIP-712 signed + `taker` + `expiration` wire-only + `signature`).

### 1.5 Signature Types

| sigType | Quem é | maker = signer? | Como assinar |
|---|---|---|---|
| 0 — EOA | Direto da PK | sim, ambos = EOA | `signTypedData(order)` plain |
| 1 — POLY_PROXY | Polymarket Proxy clássico (email/Magic) | maker=proxy, signer=EOA | `signTypedData(order)` plain pela EOA |
| 2 — POLY_GNOSIS_SAFE | MetaMask via Gnosis Safe | maker=safe, signer=EOA | `signTypedData(order)` plain pela EOA |
| **3 — POLY_1271** | **Polymarket Deposit Wallet (NOVO em V2)** | **signer == maker == DepositWallet** | **ERC-7739 nested sig (ver §1.6)** |

**Como detectar sigType=3 corretamente** (não dá pra adivinhar pelo bytecode):

```ts
// Read eip712Domain() do contrato (ERC-5267)
const result = await pub.readContract({
  address: funder,
  abi: parseAbi(["function eip712Domain() view returns (bytes1, string, string, uint256, address, bytes32, uint256[])"]),
  functionName: "eip712Domain",
});
// result[1] = name. Se "DepositWallet", é sigType=3.
if (result[1] === "DepositWallet") return 3;
```

### 1.6 ERC-7739 nested signature (sigType=3)

O Deposit Wallet contract valida via `isValidSignature(orderHash, sig)` — não aceita ECDSA solto.
A signature é uma estrutura composta:

```
0x [innerSig 65 bytes] [appDomainSep 32 bytes] [contentsHash 32 bytes] [ORDER_TYPE_STRING bytes ASCII] [len 2 bytes uint16 BE]
```

Onde:
- **`innerSig`** = ECDSA EIP-712 da EOA sobre um struct `TypedDataSign` que carrega o order como subtipo + a domain do DepositWallet:
  ```
  TypedDataSign(Order contents,string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)
  ```
  - **Domain do innerSig**: o do **EXCHANGE** (`Polymarket CTF Exchange` / `"2"` / `0xE111…` ou `0xe222…`)
  - **Message do innerSig**:
    - `contents` = o order completo (11 campos)
    - `name` = `"DepositWallet"`
    - `version` = `"1"`
    - `chainId` = 137
    - `verifyingContract` = `order.signer` (= o Deposit Wallet contract)
    - `salt` = `0x000…000` (32 zero bytes)

- **`appDomainSep`** = `keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, chainId, exchangeAddress))` — domain separator do exchange (constante por exchange)

- **`contentsHash`** = `keccak256(abi.encode(ORDER_TYPE_HASH, salt, maker, signer, tokenId, makerAmount, takerAmount, side, signatureType, timestamp, metadata, builder))` — encode direto, NÃO `hashTypedData`

> Implementação de referência funcionando: [`roxcopy/packages/core/src/orders/signer.ts`](C:/Users/Ivan%20Xavier/.claude/sistemas/roxcopy/packages/core/src/orders/signer.ts).
> O atual `polycopy/src/utils/signOrderV2.ts:209-216` está **errado** — inventou um wrapper "00ba" que não corresponde ao spec real.

### 1.7 Rounding de amounts

Para tickSize `0.01` (mercados típicos):
- `price` rounded to 2 decimals
- `size` rounded to 2 decimals
- `amount` rounded to 4 decimals

**LIMIT order** (GTC/GTD):
- BUY: `takerAmt = roundDown(size, 2)`, `makerAmt = takerAmt × price`, round `makerAmt` para no máx 4 decimais
- SELL: `makerAmt = roundDown(size, 2)`, `takerAmt = makerAmt × price`, round `takerAmt` para no máx 4 decimais

**MARKET order** (FOK/FAK) — **regra mais estrita**:
- BUY: `makerAmt = roundDown(USDC_amount, 2)` (centavos!), `takerAmt = makerAmt / price` (até 4 decimais)
- SELL: `makerAmt = roundDown(size, 2)`, `takerAmt = makerAmt × price` (até 4 decimais)

**Erro típico se errar**: `400 {"error":"invalid amounts, the market buy orders maker amount supports a max accuracy of 2 decimals, taker amount a max of 4 decimals"}`

### 1.8 OrderType default

| | Comportamento | Quando usar |
|---|---|---|
| GTC | Good Till Canceled — vira limit no book | Mirror de LEADER que postou limit (era maker) |
| FAK | Fill And Kill — fill parcial OK, resto cancela | **Default seguro pra copy trade** |
| FOK | Fill Or Kill — tudo ou nada | Apenas se quiser garantir tamanho exato |
| GTD | Good Till Date — limit com expiração | Casos avançados |

> ⚠️ Polycopy atual usa `OrderType.FOK` como default em `postOrder.ts:347`.
> Em mercados pouco líquidos isso vai falhar com `"FOK orders are fully filled or killed"`.
> Mude pra `FAK` salvo quando o leader também era FOK.

---

## 2. Plano de execução — passo a passo

### Fase 0 — Backup e branch
```bash
cd "C:\Users\Ivan Xavier\Documents\polycopy"
git checkout -b v2-migration
git add -A && git commit -m "checkpoint pre-v2-migration"
```

### Fase 1 — Instalar SDK V2 oficial

```bash
npm install @polymarket/clob-client-v2 viem@^2
# (mantém @polymarket/clob-client por enquanto — phase 4 remove)
```

> O `clob-client-v2` usa `viem` ao invés de `ethers`. Você tem 2 caminhos:
> - **(a)** Adotar `viem` paralelo a `ethers` (recomendado — viem é leve, melhora type-safety)
> - **(b)** Continuar com `ethers` e fazer o signing/post manualmente (mais trabalho, mas evita refactor amplo)
>
> Este plano segue **(a)** — `viem` apenas pro signing/post de ordens, mantendo `ethers` no resto.

### Fase 2 — Criar `signOrderV2Real.ts` correto

Substitui `src/utils/signOrderV2.ts` (que tem layout de signature inventado) por uma implementação fiel ao spec ERC-7739.

**Arquivo novo**: `src/utils/orderV2.ts` — copia adaptada de [roxcopy/packages/core/src/orders/](file:///C:/Users/Ivan%20Xavier/.claude/sistemas/roxcopy/packages/core/src/orders/):

```ts
// src/utils/orderV2.ts
import {
  createPublicClient,
  http,
  parseAbi,
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import axios from 'axios';
import { createHmac } from 'crypto';

const POLYGON_CHAIN_ID = 137 as const;
const ZERO_BYTES32: Hex = '0x' + '0'.repeat(64) as Hex;
const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

export const EXCHANGE_V2_CTF: Address     = '0xE111180000d2663C0091e4f400237545B87B996B';
export const EXCHANGE_V2_NEG_RISK: Address = '0xe2222d279d744050d28e00520010520000310F59';

const ORDER_DOMAIN_NAME = 'Polymarket CTF Exchange' as const;
const ORDER_DOMAIN_VERSION = '2' as const;

const ORDER_TYPES = {
  Order: [
    { name: 'salt',          type: 'uint256' },
    { name: 'maker',         type: 'address' },
    { name: 'signer',        type: 'address' },
    { name: 'tokenId',       type: 'uint256' },
    { name: 'makerAmount',   type: 'uint256' },
    { name: 'takerAmount',   type: 'uint256' },
    { name: 'side',          type: 'uint8'   },
    { name: 'signatureType', type: 'uint8'   },
    { name: 'timestamp',     type: 'uint256' },
    { name: 'metadata',      type: 'bytes32' },
    { name: 'builder',       type: 'bytes32' },
  ],
} as const;

const ORDER_TYPE_STRING =
  'Order(uint256 salt,address maker,address signer,uint256 tokenId,' +
  'uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,' +
  'uint256 timestamp,bytes32 metadata,bytes32 builder)';

const ORDER_TYPE_HASH = keccak256(toHex(ORDER_TYPE_STRING));
const DOMAIN_TYPE_HASH = keccak256(toHex(
  'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
));
const NAME_HASH = keccak256(toHex(ORDER_DOMAIN_NAME));
const VERSION_HASH = keccak256(toHex(ORDER_DOMAIN_VERSION));

const TYPED_DATA_SIGN_STRUCT = [
  { name: 'contents',          type: 'Order'   },
  { name: 'name',              type: 'string'  },
  { name: 'version',           type: 'string'  },
  { name: 'chainId',           type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
  { name: 'salt',              type: 'bytes32' },
] as const;

const buildDomain = (exchange: Address) => ({
  name: ORDER_DOMAIN_NAME,
  version: ORDER_DOMAIN_VERSION,
  chainId: POLYGON_CHAIN_ID,
  verifyingContract: exchange,
} as const);

const appDomainSep = (exchange: Address): Hex => keccak256(
  encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
    [DOMAIN_TYPE_HASH, NAME_HASH, VERSION_HASH, BigInt(POLYGON_CHAIN_ID), exchange]
  )
);

// ========== rounding ==========
const ROUNDING: Record<string, { price: number; size: number; amount: number }> = {
  '0.1':    { price: 1, size: 2, amount: 3 },
  '0.01':   { price: 2, size: 2, amount: 4 },
  '0.001':  { price: 3, size: 2, amount: 5 },
  '0.0001': { price: 4, size: 2, amount: 6 },
};

const decimalPlaces = (n: number): number => {
  if (Number.isInteger(n)) return 0;
  const s = n.toString();
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
};
const roundDown = (n: number, d: number): number => {
  if (decimalPlaces(n) <= d) return n;
  const f = 10 ** d; return Math.floor(n * f) / f;
};
const roundUp = (n: number, d: number): number => {
  if (decimalPlaces(n) <= d) return n;
  const f = 10 ** d; return Math.ceil(n * f) / f;
};
const roundNormal = (n: number, d: number): number => {
  if (decimalPlaces(n) <= d) return n;
  const f = 10 ** d; return Math.round(n * f) / f;
};
const toMicro = (n: number): bigint => {
  const s = n.toFixed(6);
  const [a = '0', b = '0'] = s.split('.');
  return BigInt(a) * 1_000_000n + BigInt(b.padEnd(6, '0').slice(0, 6));
};

const computeAmounts = (
  side: 'BUY' | 'SELL', sizeShares: number, priceUsd: number, tickSize: string, market: boolean,
): { rawMakerAmt: number; rawTakerAmt: number } => {
  const cfg = ROUNDING[tickSize] ?? ROUNDING['0.01'];
  if (market) {
    const rawPrice = roundDown(priceUsd, cfg.price);
    if (side === 'BUY') {
      const targetUsdc = sizeShares * rawPrice;
      const rawMakerAmt = roundDown(targetUsdc, cfg.size);
      let rawTakerAmt = rawMakerAmt / rawPrice;
      if (decimalPlaces(rawTakerAmt) > cfg.amount) {
        rawTakerAmt = roundUp(rawTakerAmt, cfg.amount + 4);
        if (decimalPlaces(rawTakerAmt) > cfg.amount) rawTakerAmt = roundDown(rawTakerAmt, cfg.amount);
      }
      return { rawMakerAmt, rawTakerAmt };
    }
    const rawMakerAmt = roundDown(sizeShares, cfg.size);
    let rawTakerAmt = rawMakerAmt * rawPrice;
    if (decimalPlaces(rawTakerAmt) > cfg.amount) {
      rawTakerAmt = roundUp(rawTakerAmt, cfg.amount + 4);
      if (decimalPlaces(rawTakerAmt) > cfg.amount) rawTakerAmt = roundDown(rawTakerAmt, cfg.amount);
    }
    return { rawMakerAmt, rawTakerAmt };
  }
  // LIMIT
  const rawPrice = roundNormal(priceUsd, cfg.price);
  if (side === 'BUY') {
    const rawTakerAmt = roundDown(sizeShares, cfg.size);
    let rawMakerAmt = rawTakerAmt * rawPrice;
    if (decimalPlaces(rawMakerAmt) > cfg.amount) {
      rawMakerAmt = roundUp(rawMakerAmt, cfg.amount + 4);
      if (decimalPlaces(rawMakerAmt) > cfg.amount) rawMakerAmt = roundDown(rawMakerAmt, cfg.amount);
    }
    return { rawMakerAmt, rawTakerAmt };
  }
  const rawMakerAmt = roundDown(sizeShares, cfg.size);
  let rawTakerAmt = rawMakerAmt * rawPrice;
  if (decimalPlaces(rawTakerAmt) > cfg.amount) {
    rawTakerAmt = roundUp(rawTakerAmt, cfg.amount + 4);
    if (decimalPlaces(rawTakerAmt) > cfg.amount) rawTakerAmt = roundDown(rawTakerAmt, cfg.amount);
  }
  return { rawMakerAmt, rawTakerAmt };
};

const randomSalt = (): bigint => {
  const buf = new Uint8Array(6); // 48 bits → cabe em Number.MAX_SAFE_INTEGER (CLOB envia como JSON Number)
  (globalThis.crypto ?? require('crypto').webcrypto).getRandomValues(buf);
  let r = 0n;
  for (const b of buf) r = (r << 8n) | BigInt(b);
  return r;
};

// ========== detect sigType via eip712Domain (ERC-5267) ==========
const SAFE_ABI = parseAbi(['function getOwners() view returns (address[])']);
const POLY_PROXY_ABI = parseAbi(['function wallet() view returns (address)']);
const EIP712_DOMAIN_ABI = parseAbi([
  'function eip712Domain() view returns (bytes1, string, string, uint256, address, bytes32, uint256[])',
]);

export const detectSigType = async (
  rpcUrl: string, funder: Address,
): Promise<{ sigType: 0 | 1 | 2 | 3; reason: string }> => {
  const pub = createPublicClient({ chain: polygon, transport: http(rpcUrl) });
  const code = ((await pub.getCode({ address: funder }).catch(() => '0x')) ?? '0x').toLowerCase();
  if (code === '0x' || code.length <= 2) return { sigType: 0, reason: 'EOA-direct (no contract code)' };
  // Deposit Wallet primeiro (ERC-5267)
  try {
    const r = await pub.readContract({ address: funder, abi: EIP712_DOMAIN_ABI, functionName: 'eip712Domain' });
    if (r[1] === 'DepositWallet') return { sigType: 3, reason: "eip712Domain.name='DepositWallet'" };
  } catch {}
  try { await pub.readContract({ address: funder, abi: POLY_PROXY_ABI, functionName: 'wallet' });
        return { sigType: 1, reason: 'expoe wallet() — POLY_PROXY' }; } catch {}
  try { await pub.readContract({ address: funder, abi: SAFE_ABI, functionName: 'getOwners' });
        return { sigType: 2, reason: 'expoe getOwners() — Gnosis Safe' }; } catch {}
  return { sigType: 2, reason: `bytecode customizado (${code.length / 2 - 1}b) — assume POLY_GNOSIS_SAFE` };
};

// ========== sign + post ==========
export type OrderArgs = {
  side: 'BUY' | 'SELL';
  tokenId: string;
  priceUsd: number;
  sizeShares: number;
  tickSize: string;
  exchange: 'ctf' | 'negRisk';
  privateKey: `0x${string}`;
  funder: Address;        // proxy/safe/depositWallet (= maker)
  sigType: 0 | 1 | 2 | 3;
  apiCreds: { key: string; secret: string; passphrase: string };
  clobHost: string;
  orderType?: 'GTC' | 'GTD' | 'FOK' | 'FAK'; // default FAK
};

export const submitOrderV2 = async (args: OrderArgs) => {
  const account = privateKeyToAccount(args.privateKey);
  const exchange: Address = args.exchange === 'ctf' ? EXCHANGE_V2_CTF : EXCHANGE_V2_NEG_RISK;
  const orderType = args.orderType ?? 'FAK';
  const market = orderType === 'FOK' || orderType === 'FAK';

  const { rawMakerAmt, rawTakerAmt } = computeAmounts(
    args.side, args.sizeShares, args.priceUsd, args.tickSize, market,
  );
  // Pra sigType=3, signer == maker == funder (DepositWallet valida via 1271).
  // Pra outros, signer = EOA.
  const orderSigner: Address = args.sigType === 3 ? args.funder : account.address;
  const order = {
    salt: randomSalt(),
    maker: args.funder,
    signer: orderSigner,
    tokenId: BigInt(args.tokenId),
    makerAmount: toMicro(rawMakerAmt),
    takerAmount: toMicro(rawTakerAmt),
    side: (args.side === 'BUY' ? 0 : 1) as 0 | 1,
    signatureType: args.sigType,
    timestamp: BigInt(Date.now()),
    metadata: ZERO_BYTES32,
    builder: ZERO_BYTES32,
  };

  // Sign
  let signature: Hex;
  if (args.sigType !== 3) {
    signature = await account.signTypedData({
      domain: buildDomain(exchange), types: ORDER_TYPES, primaryType: 'Order', message: order,
    });
  } else {
    // ERC-7739 nested sig
    const contentsHash = keccak256(encodeAbiParameters(
      [
        { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'address' },
        { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint8' },
        { type: 'uint8' }, { type: 'uint256' }, { type: 'bytes32' }, { type: 'bytes32' },
      ],
      [
        ORDER_TYPE_HASH, order.salt, order.maker, order.signer, order.tokenId,
        order.makerAmount, order.takerAmount, order.side, order.signatureType,
        order.timestamp, order.metadata, order.builder,
      ],
    ));
    const innerSig = await account.signTypedData({
      domain: buildDomain(exchange),
      types: { TypedDataSign: TYPED_DATA_SIGN_STRUCT, Order: ORDER_TYPES.Order },
      primaryType: 'TypedDataSign',
      message: {
        contents: order,
        name: 'DepositWallet',
        version: '1',
        chainId: BigInt(POLYGON_CHAIN_ID),
        verifyingContract: order.signer,
        salt: ZERO_BYTES32,
      },
    });
    const sep = appDomainSep(exchange);
    const typeBytes = toHex(ORDER_TYPE_STRING);
    const lenHex = ORDER_TYPE_STRING.length.toString(16).padStart(4, '0');
    signature = `0x${innerSig.slice(2)}${sep.slice(2)}${contentsHash.slice(2)}${typeBytes.slice(2)}${lenHex}` as Hex;
  }

  // Build envelope JSON (14 campos no order)
  const envelope = {
    deferExec: false,
    postOnly: false,
    order: {
      salt: Number(order.salt),
      maker: order.maker,
      signer: order.signer,
      taker: ZERO_ADDRESS,
      tokenId: order.tokenId.toString(),
      makerAmount: order.makerAmount.toString(),
      takerAmount: order.takerAmount.toString(),
      side: args.side,
      signatureType: order.signatureType,
      timestamp: order.timestamp.toString(),
      expiration: '0',
      metadata: order.metadata,
      builder: order.builder,
      signature,
    },
    owner: args.apiCreds.key,
    orderType,
  };

  // L2 HMAC headers
  const ts = Math.floor(Date.now() / 1000).toString();
  const path = '/order';
  const body = JSON.stringify(envelope);
  const secretBytes = Buffer.from(
    args.apiCreds.secret.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - args.apiCreds.secret.length % 4) % 4),
    'base64'
  );
  const hmac = createHmac('sha256', secretBytes).update(ts + 'POST' + path + body).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_');

  const resp = await axios.post(args.clobHost.replace(/\/$/, '') + path, body, {
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      'POLY_ADDRESS': account.address,
      'POLY_API_KEY': args.apiCreds.key,
      'POLY_PASSPHRASE': args.apiCreds.passphrase,
      'POLY_SIGNATURE': hmac,
      'POLY_TIMESTAMP': ts,
    },
    validateStatus: () => true,
  });
  return { status: resp.status, data: resp.data };
};
```

### Fase 3 — Roteamento na `postOrder.ts`

Substituir as chamadas ao `clobClient.postOrder(...)` por `submitOrderV2(...)`.

Em `src/utils/postOrder.ts:347` e similares, trocar:

```ts
// ANTES (V1 SDK)
const signed = await clobClient.createOrder(orderArgs, { tickSize, negRisk });
const resp = await clobClient.postOrder(signed, useMarket ? OrderType.FOK : OrderType.GTC);
```

por:

```ts
// DEPOIS (V2 nativo)
import { submitOrderV2, detectSigType } from './orderV2.js';

// sigType deve ser detectado no setup do user e cacheado em User.proxySignatureType.
// Aqui usamos o que já está em User; se for null, detecta on-the-fly:
const sigType = followerUser.proxySignatureType
  ?? (await detectSigType(ENV.RPC_HTTP_URL, proxyAddress)).sigType;

const resp = await submitOrderV2({
  side: orderArgs.side === Side.BUY ? 'BUY' : 'SELL',
  tokenId: orderArgs.tokenID,
  priceUsd: executionPrice,
  sizeShares: useMarket ? (orderSize / executionPrice) : (orderSize / executionPrice),
  tickSize,
  exchange: negRisk ? 'negRisk' : 'ctf',
  privateKey: followerUser.privateKey, // descrypted
  funder: proxyAddress,
  sigType: sigType as 0 | 1 | 2 | 3,
  apiCreds: { key: creds.apiKey, secret: creds.secret, passphrase: creds.passphrase },
  clobHost: ENV.CLOB_HTTP_URL,
  orderType: useMarket ? 'FAK' : 'GTC',  // FAK ao invés de FOK!
});

if (resp.status >= 400) {
  Logger.error(`[ORDER] REJECTED ${resp.status}: ${JSON.stringify(resp.data)}`);
  return { success: false, error: resp.data?.error };
}
return { success: true, orderID: resp.data?.orderID, response: resp.data };
```

### Fase 4 — Atualizar User schema + setup

`src/models/user.ts:14` — `proxySignatureType` já aceita `0 | 1 | 2 | 3`. Apenas garantir que o valor `3` é detectado e persistido durante o `/setup`:

`src/scripts/setup.ts` — chamar `detectSigType(rpc, funderAddress)` e salvar `proxySignatureType` no doc do user. Para users existentes com sigType=2 stale, criar migration script:

```ts
// src/scripts/migrate_users_sigtype_v2.ts
import { detectSigType } from '../utils/orderV2.js';
import User from '../models/user.js';
import { connectDB } from '../config/db.js';

(async () => {
  await connectDB();
  const users = await User.find({});
  for (const u of users) {
    if (!u.wallet?.address) continue;
    const proxy = u.realProxyWallet ?? u.wallet.address;
    const { sigType, reason } = await detectSigType(process.env.RPC_HTTP_URL!, proxy);
    if (u.proxySignatureType !== sigType) {
      console.log(`${u._id} ${proxy}: ${u.proxySignatureType} → ${sigType} (${reason})`);
      u.proxySignatureType = sigType;
      await u.save();
    }
  }
  process.exit(0);
})();
```

### Fase 5 — Limpar V1

Apenas DEPOIS de validar V2 end-to-end:

1. **Apagar** `src/utils/signOrderV2.ts` (era a tentativa quebrada).
2. **Apagar** `src/utils/signOrderManually.ts` (V1 manual sign).
3. **Apagar** lines 14-21 e 37-56 de `createClobClient.ts` (patch dinâmico do V1 SDK não é mais necessário).
4. **Remover** import `OrderType` do `@polymarket/clob-client` em todos os files — usar string literais (`'FAK'`, `'GTC'`).
5. **Remover** dependência `@polymarket/clob-client` do `package.json` quando 100% migrado.
6. **Atualizar** test fixtures em `src/__tests__/postOrder.test.ts` pra V2 addresses.

### Fase 6 — Reverificar contratos

Em `src/utils/createClobClient.ts:24` o constante está rotulada errado:

```ts
const EXCHANGE_V2 = '0xe2222d279d744050d28e00520010520000310F59'; // ⚠️ Isso é Neg-Risk V2, não CTF V2
```

Corrigir para:
```ts
const EXCHANGE_V2 = '0xE111180000d2663C0091e4f400237545B87B996B';      // CTF V2
const NEG_RISK_EXCHANGE_V2 = '0xe2222d279d744050d28e00520010520000310F59'; // Neg-Risk V2
```

---

## 3. Procedimento de teste

Replicar o que destravou o roxcopy: **um script `test-order.ts` standalone** que posta uma ordem mínima ($1 USDC) num mercado ativo. Não dependa de leader trade pra debugar — é muito lento.

```ts
// src/scripts/testOrderV2.ts
import { submitOrderV2, detectSigType } from '../utils/orderV2.js';
import { ENV } from '../config/env.js';
import axios from 'axios';

(async () => {
  // 1. Buscar mercado ativo
  const ms = (await axios.get('https://gamma-api.polymarket.com/markets', {
    params: { active: true, closed: false, limit: 5, order: 'volume24hr', ascending: false }
  })).data;
  const market = ms.find((m: any) => m.enableOrderBook && m.clobTokenIds);
  const tokenId = JSON.parse(market.clobTokenIds)[0];

  // 2. Detectar sigType do funder
  const funder = process.env.FUNDER as `0x${string}`;
  const { sigType, reason } = await detectSigType(ENV.RPC_HTTP_URL, funder);
  console.log(`funder ${funder} sigType=${sigType} (${reason})`);

  // 3. Postar ordem mínima ($1 = 2 shares @ $0.50)
  const resp = await submitOrderV2({
    side: 'BUY',
    tokenId,
    priceUsd: 0.50,
    sizeShares: 2,
    tickSize: market.minimumTickSize ?? '0.01',
    exchange: market.negRisk ? 'negRisk' : 'ctf',
    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
    funder,
    sigType: sigType as any,
    apiCreds: {
      key: process.env.CLOB_API_KEY!,
      secret: process.env.CLOB_SECRET!,
      passphrase: process.env.CLOB_PASS!,
    },
    clobHost: ENV.CLOB_HTTP_URL,
    orderType: 'FAK',
  });
  console.log('result:', resp.status, JSON.stringify(resp.data, null, 2));
})();
```

Critério de sucesso: `resp.status === 200` com `data.orderID` preenchido.

Erros típicos e como interpretar:

| Mensagem CLOB | Causa | Fix |
|---|---|---|
| `order_version_mismatch` | Domain version != "2" OU schema antigo | §1.2 + §1.1 |
| `maker address not allowed, please use the deposit wallet flow` | Funder é DepositWallet mas sigType ≠ 3 | §1.5 — detectar via eip712Domain() |
| `the order signer address has to be the address of the API KEY` | sigType=3 mas signer != maker no payload | §1.5 — signer = maker = funder |
| `invalid signature` | sigType=3 mas wrapper ERC-7739 errado | §1.6 — usar implementação de referência |
| `invalid amounts, the market buy orders maker amount supports a max accuracy of 2 decimals` | Rounding LIMIT aplicado em FAK/FOK | §1.7 — usar rounding MARKET |
| `order couldn't be fully filled. FOK orders are fully filled or killed` | FOK em mercado ilíquido | §1.8 — trocar pra FAK |
| `not enough balance` | pUSD insuficiente (tudo correto, só falta dinheiro) | Depositar pUSD no funder via Polymarket UI |

---

## 4. Mapa completo de arquivos a tocar

| Arquivo | Ação | Por quê |
|---|---|---|
| `package.json` | Add `@polymarket/clob-client-v2`, `viem` | SDK V2 |
| `src/utils/orderV2.ts` | **CRIAR** (código completo §2.fase 2) | Substitui signOrderV2.ts quebrado |
| `src/utils/signOrderV2.ts` | **APAGAR** (depois de Fase 5) | Schema/wrap inventado, bugs |
| `src/utils/signOrderManually.ts` | **APAGAR** (depois de Fase 5) | V1 manual sign |
| `src/utils/createClobClient.ts:14-56` | **REMOVER** patch hack (Fase 5); corrigir nomes V2 (Fase 6) | Não precisa mais patchar V1 |
| `src/utils/createClobClient.ts:64,181-233,241-273` | Manter detecção de proxy; trocar `0|1|2|3` mapping pra usar `detectSigType` de orderV2.ts | Detecção via ERC-5267 |
| `src/utils/postOrder.ts:1,310,347,476,556,573,622,630` | Trocar `clobClient.postOrder(...)` por `submitOrderV2(...)` | Usar caminho V2 |
| `src/services/tradeExecutor.ts:1,124-133` | Sem mudança no proxy detection; trocar chamada de execução | — |
| `src/services/arbitrageMonitor.ts:209` | Trocar `clobClient.postOrder` | — |
| `src/services/tpSlMonitor.ts:133` | Trocar `clobClient.postOrder` | — |
| `src/scripts/{closeResolvedPositions,closeStalePositions,manualSell,sellLargePositions}.ts` | Trocar `client.postOrder` | — |
| `src/models/user.ts:14` | OK (já aceita 0|1|2|3) | — |
| `src/scripts/setup.ts` | Adicionar `detectSigType` na pipeline | Persistir sigType correto |
| `src/scripts/migrate_users_sigtype_v2.ts` | **CRIAR** | Re-detectar para users existentes |
| `src/scripts/testOrderV2.ts` | **CRIAR** (§3) | Smoke test sem depender de leader |
| `src/__tests__/postOrder.test.ts` | Atualizar fixtures pra V2 addresses | Tests verdes |

---

## 5. Riscos e validação

- **Não use destructive git** (não force push, não reset --hard) — branch `v2-migration` isolada.
- **Não delete arquivos antigos** até `testOrderV2.ts` retornar `MATCHED` consistente.
- **Cada user existente** precisa ter `proxySignatureType` re-validado após Fase 4. Se um Deposit Wallet user ficou com sigType=2 stale, a primeira ordem V2 vai falhar com `maker address not allowed`.
- **API creds** podem precisar ser re-derivadas (hoje em V2 o backend pode invalidar creds antigas em alguns casos). Polycopy já tem essa lógica em `createClobClient.ts` — testar.
- **pUSD vs USDC.e**: V2 usa pUSD (`0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`) como collateral. Polycopy ainda menciona USDC.e em vários scripts. Audit de allowances/balances precisa rodar com os 2 tokens.

---

## 6. Histórico de descoberta (referência)

Os 7 bugs descobertos no roxcopy, em ordem de aparição (cada um destravou o próximo):

1. **`Invalid order payload`** → schema V1 no envelope; corrigir 11 campos signed (§1.1)
2. **`order_version_mismatch`** → domain version "1" → "2" (§1.2)
3. **`maker address not allowed, please use the deposit wallet flow`** → sigType errado pro funder; detectar via `eip712Domain()` (§1.5)
4. **`the order signer address has to be the address of the API KEY`** → pra sigType=3, signer == maker; não EOA (§1.5)
5. **`invalid signature`** → ECDSA solto não funciona; usar ERC-7739 nested wrap (§1.6)
6. **`invalid amounts, the market buy orders maker amount supports a max accuracy of 2 decimals`** → rounding MARKET vs LIMIT (§1.7)
7. **`order couldn't be fully filled. FOK orders are fully filled or killed`** → trocar default FOK → FAK (§1.8)

Cada um aparece quando o anterior é resolvido. Use o `testOrderV2.ts` pra iterar — não espere leader trade pra debugar (timing imprevisível).

---

**Sucesso end-to-end** = `testOrderV2` retorna `200 OK` + `orderID` + `tx hash` em polygonscan.
Roxcopy reference: tx [`0xf4415bbde8b127b24efcedc02a97dae250de54cc04c4f7586e0cf63963ff879d`](https://polygonscan.com/tx/0xf4415bbde8b127b24efcedc02a97dae250de54cc04c4f7586e0cf63963ff879d).
