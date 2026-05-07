/**
 * Helper p/ ler/escrever a SystemConfig singleton com cache em memória.
 *
 * Uso:
 *   const cfg = await getSystemConfig();
 *   const balance = await someContract.balanceOf(addr, cfg.pUSDAddress);
 *
 *   // Admin path:
 *   await updateSystemConfig({ pUSDAddress: '0x...' }, adminUserId);
 */

import SystemConfig, { type ISystemConfig, SYSTEM_CONFIG_DEFAULTS } from '../models/SystemConfig.js';

let cached: ISystemConfig | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000; // re-read a cada 30s pra pegar mudanças do admin

export const getSystemConfig = async (): Promise<ISystemConfig> => {
    const now = Date.now();
    if (cached && (now - cachedAt) < CACHE_TTL_MS) return cached;

    let doc = await SystemConfig.findOne({ key: 'singleton' });
    if (!doc) {
        // First boot: seed com defaults V2.
        doc = await SystemConfig.create(SYSTEM_CONFIG_DEFAULTS);
    }
    cached = doc;
    cachedAt = now;
    return doc;
};

/** Atualização parcial via admin. Só persiste campos passados. */
export const updateSystemConfig = async (
    patch: Partial<ISystemConfig>,
    updatedBy?: string,
): Promise<ISystemConfig> => {
    const allowed: (keyof ISystemConfig)[] = [
        'pUSDAddress', 'usdcELegacyAddress',
        'ctfExchangeV2', 'negRiskExchangeV2',
        'ctfExchangeV1', 'negRiskExchangeV1',
        'rpcUrls',
        'clobHttpUrl', 'gammaHttpUrl', 'dataHttpUrl',
        'proxyFactory', 'safeFactory',
    ];
    const safePatch: any = {};
    for (const k of allowed) {
        if (k in patch && (patch as any)[k] !== undefined) {
            safePatch[k] = (patch as any)[k];
        }
    }
    if (updatedBy) safePatch.updatedBy = updatedBy;

    const doc = await SystemConfig.findOneAndUpdate(
        { key: 'singleton' },
        { $set: safePatch },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    cached = doc;
    cachedAt = Date.now();
    return doc!;
};

/** Invalida cache — útil em testes ou após restore manual no DB. */
export const invalidateSystemConfigCache = (): void => {
    cached = null;
    cachedAt = 0;
};
