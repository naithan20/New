export type Pair = {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceNative?: string;
  txns?: Record<string, { buys: number; sells: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
};

type Boost = { chainId: string; tokenAddress: string; amount?: number; totalAmount?: number };

const API = "https://api.dexscreener.com";

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`market HTTP ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

export async function pairsForToken(address: string): Promise<Pair[]> {
  const data = await json<Pair[]>(`${API}/token-pairs/v1/solana/${address}`);
  return Array.isArray(data) ? data : [];
}

export async function bestPair(address: string): Promise<Pair | null> {
  const pairs = await pairsForToken(address);
  return pairs
    .filter(p => Number(p.priceUsd) > 0)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0] ?? null;
}

export async function boostedSolanaCandidates(limit = 24): Promise<Pair[]> {
  const boosts = await json<Boost[]>(`${API}/token-boosts/top/v1`);
  const addresses = [...new Set(boosts.filter(b => b.chainId === "solana").map(b => b.tokenAddress))].slice(0, limit);
  const out: Pair[] = [];
  for (const address of addresses) {
    const pair = await bestPair(address);
    if (pair) out.push(pair);
  }
  return out;
}
