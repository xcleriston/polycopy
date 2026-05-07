import mongoose, { Schema, Document } from 'mongoose';

/**
 * Singleton de configuração de sistema — endereços de contrato Polymarket,
 * RPCs, hosts. Gerenciado em DB pra ser configurável via admin sem redeploy
 * (era em .env antes, o que não escala em ambiente SaaS).
 *
 * Há sempre exatamente 1 documento (singleton enforced via `key: 'singleton'`
 * unique). Helper `getSystemConfig()` em utils/systemConfig.ts faz get-or-seed
 * com cache em memória.
 */
export interface ISystemConfig extends Document {
    key: 'singleton';

    // Polymarket V2 contracts (cutover 2026-04-28)
    pUSDAddress: string;            // Collateral V2 (0xC011a7…)
    usdcELegacyAddress: string;     // Legacy USDC.e (0x2791Bca…), ainda lido p/ users em transição
    ctfExchangeV2: string;          // CTF Exchange V2 (0xE111180…)
    negRiskExchangeV2: string;      // Neg-Risk Exchange V2 (0xe2222d…)

    // V1 legacy (deprecated mas mantidos p/ rollback de emergência)
    ctfExchangeV1: string;          // 0x4bFb41d5…
    negRiskExchangeV1: string;      // 0xC5d563A3…

    // RPC fallbacks (tentados em ordem; primeiro com sucesso vence)
    rpcUrls: string[];

    // Polymarket APIs
    clobHttpUrl: string;
    gammaHttpUrl: string;
    dataHttpUrl: string;

    // Polymarket Proxy / Safe factories (pra deriv determinística)
    proxyFactory: string;           // 0xaB45c5A4… (POLY_PROXY)
    safeFactory: string;            // 0xaacFeEa0… (POLY_GNOSIS_SAFE)

    updatedAt: Date;
    updatedBy?: string;             // user._id que editou pela última vez
}

const SystemConfigSchema: Schema = new Schema({
    key: { type: String, default: 'singleton', unique: true, immutable: true },

    pUSDAddress:        { type: String, required: true },
    usdcELegacyAddress: { type: String, required: true },
    ctfExchangeV2:      { type: String, required: true },
    negRiskExchangeV2:  { type: String, required: true },

    ctfExchangeV1:      { type: String, required: true },
    negRiskExchangeV1:  { type: String, required: true },

    rpcUrls: { type: [String], default: [] },

    clobHttpUrl:  { type: String, required: true },
    gammaHttpUrl: { type: String, required: true },
    dataHttpUrl:  { type: String, required: true },

    proxyFactory: { type: String, required: true },
    safeFactory:  { type: String, required: true },

    updatedBy: { type: String },
}, { timestamps: true });

/** Defaults V2-native (cutover Polymarket 2026-04-28). Aplicados no first read. */
export const SYSTEM_CONFIG_DEFAULTS: Omit<ISystemConfig, '_id' | 'updatedAt' | 'updatedBy' | keyof Document> = {
    key: 'singleton',
    pUSDAddress:        '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB',
    usdcELegacyAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    ctfExchangeV2:      '0xE111180000d2663C0091e4f400237545B87B996B',
    negRiskExchangeV2:  '0xe2222d279d744050d28e00520010520000310F59',
    ctfExchangeV1:      '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
    negRiskExchangeV1:  '0xC5d563A36AE78145C45a50134d48A1215220f80a',
    rpcUrls: [
        'https://polygon-bor-rpc.publicnode.com',
        'https://polygon-rpc.com',
        'https://1rpc.io/matic',
        'https://polygon.llamarpc.com',
    ],
    clobHttpUrl:  'https://clob.polymarket.com',
    gammaHttpUrl: 'https://gamma-api.polymarket.com',
    dataHttpUrl:  'https://data-api.polymarket.com',
    proxyFactory: '0xaB45c5A4B0c941a2F231C04C3f49182e1A254052',
    safeFactory:  '0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b',
} as any;

export default mongoose.model<ISystemConfig>('SystemConfig', SystemConfigSchema);
