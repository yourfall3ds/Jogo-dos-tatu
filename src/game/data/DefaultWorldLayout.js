// Layout base da arena em formato de registros do mundo compartilhado.
// A arena deixa de nascer via meshes nativas do Level e passa a ser
// semeada/carregada pelo mesmo pipeline dos objetos construidos.

function piece(pieceId, p, s, ry = 0, extra = {}) {
  return {
    kind: 'piece',
    pieceId,
    p,
    ry,
    sc: Array.isArray(s) ? (s[0] ?? 1) : (s ?? 1),
    s: Array.isArray(s) ? s : [s ?? 1, s ?? 1, s ?? 1],
    breakable: extra.breakable ?? false,
    src: extra.src || null,
  };
}

export const CLEAN_ARENA_LAYOUT = [
  piece('wall', [0, 0, -22], [3.5, 1.6667, 4.8]),
  piece('geo_box', [-24, 0, 0], [0.6, 6, 14]),
  piece('geo_box', [24, 0, 0], [0.6, 6, 14]),

  piece('geo_box', [-10, 0, -8], [3, 3, 3], 0.18),
  piece('geo_box', [10, 0, -8], [3, 3, 3], -0.18),
  piece('geo_box', [-8, 0, 9], [2.5, 4, 5]),
  piece('geo_box', [8, 0, 9], [2.5, 4, 5]),
  piece('wall', [0, 0, 4], [2.5, 1.3333, 4.8]),

  piece('geo_box', [-18, 1, -2], [3.5, 1, 7]),
  piece('geo_box', [-12, 0, -2], [1.5, 1, 3]),
  piece('geo_box', [18, 2, 6], [3.5, 1, 7]),
  piece('geo_box', [12, 0, 6], [1.5, 1, 3]),

  piece('geo_cylinder', [0, 0, 16], [2.6667, 3.5, 2.6667]),
];
