import type { Pair } from "./market.js";

export const START_TOKEN = "FwSuQh9hcd759TARSG2sciwLCcHWyS4kYWfseWFFpump";

export type Scored = { pair: Pair; score: number; reasons: string[] };

function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }

export function scorePair(pair: Pair): Scored {
  const liq = pair.liquidity?.usd ?? 0;
  const vol5 = pair.volume?.m5 ?? 0;
  const vol1h = pair.volume?.h1 ?? 0;
  const ch5 = pair.priceChange?.m5 ?? 0;
  const ch1h = pair.priceChange?.h1 ?? 0;
  const t5 = pair.txns?.m5 ?? { buys: 0, sells: 0 };
  const total5 = t5.buys + t5.sells;
  const buyRatio = total5 ? t5.buys / total5 : 0.5;
  const ageMin = pair.pairCreatedAt ? (Date.now() - pair.pairCreatedAt) / 60000 : 999999;

  const reasons: string[] = [];
  let score = 0;

  score += clamp(Math.log10(Math.max(liq, 1)) - 3, 0, 2) * 12; // up to 24
  score += clamp(Math.log10(Math.max(vol1h, 1)) - 3, 0, 2) * 10; // up to 20
  score += clamp((buyRatio - 0.45) * 80, 0, 16);
  score += clamp(ch5 * 0.8, -10, 12);
  score += clamp(ch1h * 0.25, -10, 18);
  if (vol5 > 1000 && vol1h > 0 && vol5 * 12 > vol1h * 1.4) { score += 8; reasons.push("5m volume acceleration"); }
  if (buyRatio >= 0.58) reasons.push(`buy pressure ${(buyRatio * 100).toFixed(0)}%`);
  if (liq >= 25_000) reasons.push(`liquidity $${Math.round(liq).toLocaleString()}`);
  if (ch5 > 2) reasons.push(`5m momentum +${ch5.toFixed(1)}%`);
  if (ageMin < 5) { score -= 20; reasons.push("very new pair penalty"); }
  if (liq < 10_000) { score -= 25; reasons.push("thin liquidity penalty"); }
  if (buyRatio > 0.9 && total5 < 10) { score -= 10; reasons.push("low-sample buy pressure penalty"); }
  if (ch5 > 30) { score -= 12; reasons.push("chasing spike penalty"); }

  return { pair, score: Math.round(clamp(score)), reasons };
}

export function chooseBest(pairs: Pair[]): Scored[] {
  return pairs.map(scorePair).sort((a, b) => b.score - a.score);
}

export const RULES = {
  minCandidateScore: 66,
  minRotationAdvantage: 12,
  assumedRoundTripCostPct: 3.0,
  stopLossPct: 12,
  takeProfitPct: 22,
  trailingFromPeakPct: 10,
  maxTradesPerDay: 3,
};
