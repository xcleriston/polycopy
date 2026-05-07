/**
 * Polymarket V2 — wrapper fino sobre @polymarket/clob-client-v2 (lib oficial).
 *
 * O lib oficial (v1.0.4) cobre 100% do schema V2: 11-field signed Order, domain
 * version="2", ERC-7739 nested sig pra POLY_1271 (Deposit Wallet), rounding
 * MARKET vs LIMIT correto. Polycopy NÃO precisa reimplementar nada disso —
 * só precisa instanciar o ClobClient com `signatureType` + `funderAddress`
 * corretos.
 *
 * O que ESTE wrapper adiciona:
 *  1. detectSigType() — lib não detecta sozinha. Lê eip712Domain (ERC-5267)
 *     e retorna 0|1|2|3.
 *  2. createV2Client() — fábrica que aceita ethers.Wallet (polycopy é ethers v5),
 *     detecta sigType automaticamente e cria ClobClient pronto pra usar.
 *  3. submitOrderV2() — atalho com defaults seguros (FAK pra market, GTC pra limit).
 *
 * Origem: roxcopy descobriu que pra Deposit Wallet (sigType=3) signer == maker
 * e signature usa ERC-7739 nested sig — implementação completa em
 * `roxcopy/packages/core/src/orders/signer.ts`. A lib oficial cobre isso.
 */

import {
  ClobClient,
  Side,
  OrderType,
  SignatureTypeV2,
  Chain,
  type ApiKeyCreds,
} from '@polymarket/clob-client-v2';
import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
} from 'viem';
import { polygon } from 'viem/chains';
import type { Wallet } from 'ethers';

const SAFE_ABI = parseAbi(['function getOwners() view returns (address[])']);
const POLY_PROXY_ABI = parseAbi(['function wallet() view returns (address)']);
const EIP712_DOMAIN_ABI = parseAbi([
  'function eip712Domain() view returns (bytes1, string, string, uint256, address, bytes32, uint256[])',
]);
const EIP1167_PREFIX = '0x363d3d373d3d3d363d73';

export type DetectResult = {
  sigType: SignatureTypeV2;
  deployed: boolean;
  reason: string;
};

/**
 * Lê o tipo de wallet on-chain. Critério (em ordem):
 *  1. `eip712Domain().name == "DepositWallet"` → 3 (POLY_1271, ERC-7739 nested sig)
 *  2. expõe `wallet()` → 1 (POLY_PROXY clássico — email/Magic)
 *  3. expõe `getOwners()` → 2 (Gnosis Safe, MetaMask flow)
 *  4. EIP-1167 minimal proxy → 2 (Privy Safe variant)
 *  5. bytecode customizado → assume 2
 *  6. sem code → 0 (EOA-direct)
 */
export const detectSigType = async (
  rpcUrl: string,
  address: string,
): Promise<DetectResult> => {
  const pub = createPublicClient({ chain: polygon, transport: http(rpcUrl) });
  const addr = address as Address;

  const code = ((await pub.getCode({ address: addr }).catch(() => '0x')) ?? '0x').toLowerCase();
  if (code === '0x' || code.length <= 2) {
    return { sigType: SignatureTypeV2.EOA, deployed: false, reason: 'EOA-direct (no contract code)' };
  }

  // ERC-5267 eip712Domain — Polymarket Deposit Wallet retorna name="DepositWallet"
  try {
    const r = await pub.readContract({
      address: addr,
      abi: EIP712_DOMAIN_ABI,
      functionName: 'eip712Domain',
    });
    if (r[1] === 'DepositWallet') {
      return { sigType: SignatureTypeV2.POLY_1271, deployed: true, reason: "eip712Domain.name='DepositWallet'" };
    }
  } catch { /* fall through */ }

  try {
    await pub.readContract({ address: addr, abi: POLY_PROXY_ABI, functionName: 'wallet' });
    return { sigType: SignatureTypeV2.POLY_PROXY, deployed: true, reason: 'expoe wallet() — POLY_PROXY' };
  } catch { /* fall through */ }

  try {
    await pub.readContract({ address: addr, abi: SAFE_ABI, functionName: 'getOwners' });
    return { sigType: SignatureTypeV2.POLY_GNOSIS_SAFE, deployed: true, reason: 'expoe getOwners() — Gnosis Safe' };
  } catch { /* fall through */ }

  if (code.startsWith(EIP1167_PREFIX)) {
    return { sigType: SignatureTypeV2.POLY_GNOSIS_SAFE, deployed: true, reason: 'EIP-1167 minimal proxy → POLY_GNOSIS_SAFE (Privy)' };
  }

  return {
    sigType: SignatureTypeV2.POLY_GNOSIS_SAFE,
    deployed: true,
    reason: `bytecode customizado (${code.length / 2 - 1}b) → POLY_GNOSIS_SAFE`,
  };
};

/**
 * Adapter: ethers.Wallet (v5) implementa `_signTypedData(domain, types, value)`
 * e `getAddress()` — exatamente a interface `EthersSigner` esperada pelo ClobClient v2.
 * Logo, o próprio wallet do polycopy serve como `signer`.
 */
export type CreateV2ClientOpts = {
  host: string;
  ethersWallet: Wallet;
  funderAddress: string;
  /** Se omitido, é detectado on-chain via eip712Domain(). */
  sigType?: SignatureTypeV2;
  /** Se omitido, faz lookup; se presente, usa direto (cache hit em Mongo). */
  rpcUrl?: string;
  creds?: ApiKeyCreds;
};

export type CreateV2ClientResult = {
  client: ClobClient;
  sigType: SignatureTypeV2;
  detection?: DetectResult;
};

/**
 * Normaliza o `secret` das api creds — a lib v2 oficial (1.0.4) usa `atob(secret)`
 * direto pra HMAC, mas a Polymarket retorna secrets em base64**url** (com `-` e `_`).
 * `atob` rejeita esses chars com `InvalidCharacterError`. Workaround: converter pra
 * base64 padrão antes de passar pra ClobClient.
 */
const normalizeApiCreds = (creds: ApiKeyCreds): ApiKeyCreds => ({
  ...creds,
  secret: creds.secret.replace(/-/g, '+').replace(/_/g, '/'),
});

export const createV2Client = async (opts: CreateV2ClientOpts): Promise<CreateV2ClientResult> => {
  let sigType = opts.sigType;
  let detection: DetectResult | undefined;
  if (sigType === undefined) {
    if (!opts.rpcUrl) throw new Error('createV2Client: sigType ou rpcUrl é obrigatório');
    detection = await detectSigType(opts.rpcUrl, opts.funderAddress);
    sigType = detection.sigType;
  }

  // ethers.Wallet v5 já satisfaz a interface EthersSigner do ClobClient
  const signer = opts.ethersWallet as unknown as ConstructorParameters<typeof ClobClient>[0]['signer'];

  const client = new ClobClient({
    host: opts.host,
    chain: Chain.POLYGON,
    signer,
    funderAddress: opts.funderAddress,
    signatureType: sigType,
    ...(opts.creds && { creds: normalizeApiCreds(opts.creds) }),
  });

  return { client, sigType, ...(detection && { detection }) };
};

/**
 * Atalho com defaults seguros — recomendado pra fluxos de copy.
 *  - Default `orderType` = FAK (Fill And Kill) pra MARKET-like; aceita fill parcial.
 *    FOK em mercado ilíquido = ordem morta; FAK preserva o que conseguir fillar.
 *  - LIMIT continua GTC.
 */
export type SubmitOrderArgs = {
  client: ClobClient;
  side: 'BUY' | 'SELL';
  tokenId: string;
  priceUsd: number;
  /** Pra MARKET BUY: amount em USDC. Pra MARKET SELL: shares. Pra LIMIT: shares. */
  size: number;
  market?: boolean;
  orderType?: OrderType;
  tickSize: '0.1' | '0.01' | '0.001' | '0.0001';
  negRisk?: boolean;
};

export const submitOrderV2 = async (args: SubmitOrderArgs) => {
  const side = args.side === 'BUY' ? Side.BUY : Side.SELL;
  const market = args.market ?? false;
  const opts = { tickSize: args.tickSize, ...(args.negRisk !== undefined && { negRisk: args.negRisk }) };

  if (market) {
    return args.client.createAndPostMarketOrder(
      { tokenID: args.tokenId, price: args.priceUsd, amount: args.size, side } as any,
      opts,
      (args.orderType as OrderType.FOK | OrderType.FAK) ?? OrderType.FAK,
    );
  }
  return args.client.createAndPostOrder(
    { tokenID: args.tokenId, price: args.priceUsd, size: args.size, side } as any,
    opts,
    (args.orderType as OrderType.GTC | OrderType.GTD) ?? OrderType.GTC,
  );
};

/**
 * Pós-processo de wallet recém criado/importado: tenta consultar Polymarket Gamma
 * /public-profile pra descobrir o proxyWallet REAL associado à EOA, depois detecta
 * sigType via on-chain probe. Retorna o que conseguiu — null se EOA nunca usou
 * Polymarket (caso de wallet nova, fluxo normal).
 *
 * Uso:
 *   const enriched = await enrichWalletV2({ eoa: wallet.address, gammaUrl, rpcUrl });
 *   if (enriched) {
 *     await User.updateOne({ _id }, { $set: {
 *       'wallet.proxyAddress': enriched.proxyAddress,
 *       'wallet.proxySignatureType': enriched.sigType,
 *     }});
 *   }
 */
export type EnrichResult = {
  proxyAddress: string;
  sigType: SignatureTypeV2;
  detectionReason: string;
  pseudonym?: string;
  name?: string;
};

export const enrichWalletV2 = async (opts: {
  eoa: string;
  gammaUrl?: string;
  rpcUrl: string;
}): Promise<EnrichResult | null> => {
  const gamma = (opts.gammaUrl ?? 'https://gamma-api.polymarket.com').replace(/\/$/, '');
  let profile: { proxyWallet?: string; pseudonym?: string; name?: string } | null = null;
  try {
    const r = await fetch(`${gamma}/public-profile?address=${opts.eoa}`);
    if (r.ok) profile = await r.json() as any;
  } catch { /* sem profile */ }

  if (!profile?.proxyWallet) return null;

  const det = await detectSigType(opts.rpcUrl, profile.proxyWallet);
  return {
    proxyAddress: profile.proxyWallet.toLowerCase(),
    sigType: det.sigType,
    detectionReason: det.reason,
    ...(profile.pseudonym && { pseudonym: profile.pseudonym }),
    ...(profile.name && { name: profile.name }),
  };
};

// re-export pra conveniência
export { ClobClient, Side, OrderType, SignatureTypeV2 };
export type { ApiKeyCreds };
