// Issuer deployments and Token-2022 scaled-UI mints verified September 21, 2026.
// Approved launch catalog; order follows the recorded 24h volume snapshot, not a live ranking.
// Quote probes are evidence of route availability only, never dividend eligibility.
export const assets = [
  {"issuer": "xstocks", "symbol": "SPYx", "name": "SP500", "mint": "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W"},
  {"issuer": "xstocks", "symbol": "GMEx", "name": "Gamestop", "mint": "Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc"},
  {"issuer": "xstocks", "symbol": "NVDAx", "name": "NVIDIA", "mint": "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh"},
  {"issuer": "xstocks", "symbol": "SPCXx", "name": "SpaceX", "mint": "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8"},
  {"issuer": "xstocks", "symbol": "CRCLx", "name": "Circle", "mint": "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1"},
  {"issuer": "xstocks", "symbol": "QQQx", "name": "Nasdaq", "mint": "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ"},
  {"issuer": "xstocks", "symbol": "MSFTx", "name": "Microsoft", "mint": "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX"},
  {"issuer": "xstocks", "symbol": "GOOGLx", "name": "Alphabet", "mint": "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN"},
  {"issuer": "xstocks", "symbol": "PLTRx", "name": "Palantir", "mint": "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4"},
  {"issuer": "xstocks", "symbol": "TSLAx", "name": "Tesla", "mint": "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB"},
  {"issuer": "xstocks", "symbol": "KOx", "name": "Coca-Cola", "mint": "XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ"},
  {"issuer": "xstocks", "symbol": "MSTRx", "name": "MicroStrategy", "mint": "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ"},
  {"issuer": "xstocks", "symbol": "MCDx", "name": "McDonald's", "mint": "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2"},
  {"issuer": "xstocks", "symbol": "AAPLx", "name": "Apple", "mint": "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp"},
  {"issuer": "xstocks", "symbol": "COINx", "name": "Coinbase", "mint": "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu"},
  {"issuer": "xstocks", "symbol": "METAx", "name": "Meta", "mint": "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu"},
  {"issuer": "xstocks", "symbol": "AMZNx", "name": "Amazon.com", "mint": "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg"},
  {"issuer": "xstocks", "symbol": "HOODx", "name": "Robinhood", "mint": "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg"},
  {"issuer": "xstocks", "symbol": "STRCx", "name": "Strategy PP Variable", "mint": "Xs78JED6PFZxWc2wCEPspZW9kL3Se5J7L5TChKgsidH"},
  {"issuer": "xstocks", "symbol": "BRK.Bx", "name": "Berkshire Hathaway", "mint": "Xs6B6zawENwAbWVi7w92rjazLuAr5Az59qgWKcNb45x"},
] as const;
export type Stock = typeof assets[number];
