// Verified against the issuer's /api/v2/public/assets/{symbol} on 2026-09-17.
// Explicit allowlist: adding another issuer must supply its own adapter.
export const assets = [
  { issuer: 'xstocks', symbol: 'AAPLx', name: 'Apple', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp' },
  { issuer: 'xstocks', symbol: 'SPYx', name: 'S&P 500', mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W' },
  { issuer: 'xstocks', symbol: 'NVDAx', name: 'NVIDIA', mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh' },
] as const;
export type Stock = typeof assets[number];
