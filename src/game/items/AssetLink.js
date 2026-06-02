// ─────────────────────────────────────────────────────────────────
//  AssetLink — liga um ITEM do jogo ao ASSET gerado na árvore
//
//  Quando você gera um item do wishlist (ex: "Sucata" = mat_scrap), o
//  MeshyPanel marca em LocalDB 'wishlist_done' → { [wishId]: {assetId} }.
//  Aqui resolvemos o glbUrl do modelo gerado a partir do item, pra os
//  sistemas (drops, props, etc) usarem o modelo REAL no lugar do placeholder.
// ─────────────────────────────────────────────────────────────────
import { LocalDB } from '../data/LocalDB.js';
import { AssetGroups } from '../data/AssetGroups.js';

/** True se o item (def.wishlist) já foi gerado na árvore. */
export async function isItemGenerated(def) {
  if (!def?.wishlist) return false;
  const done = await LocalDB.get('wishlist_done', {});
  return !!done?.[def.wishlist]?.assetId;
}

/** Resolve o glbUrl do modelo gerado de um item (ou null se ainda placeholder). */
export async function resolveItemGlb(def) {
  try {
    if (!def?.wishlist) return null;
    const done = await LocalDB.get('wishlist_done', {});
    const assetId = done?.[def.wishlist]?.assetId;
    if (!assetId) return null;
    const assets = await AssetGroups.getAssets();
    const a = assets.find(x => x.id === assetId);
    return a?.glbUrl || null;
  } catch (_) { return null; }
}
