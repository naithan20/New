import fs from "node:fs";
import { bestPair, boostedSolanaCandidates } from "./market.js";
import { START_TOKEN, RULES, chooseBest, scorePair } from "./engine.js";

type JournalEntry = {
  at: string;
  action: "INIT" | "HOLD" | "ROTATE" | "EXIT";
  from?: string;
  to?: string;
  notionalGbp: number;
  currentScore?: number;
  candidateScore?: number;
  reason: string;
};

type State = {
  version: number;
  startedAt: string | null;
  startingNotionalGbp: number;
  currentToken: string;
  currentSymbol: string;
  entryPriceUsd: number | null;
  entryNotionalGbp: number;
  peakNotionalGbp: number;
  realisedNotionalGbp: number;
  benchmarkStartPriceUsd: number | null;
  tradesToday: number;
  tradeDate: string | null;
  tradeCount: number;
  journal: JournalEntry[];
};

const statePath = new URL("../state.json", import.meta.url);
const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as State;
const now = new Date();
const today = now.toISOString().slice(0, 10);
if (state.tradeDate !== today) {
  state.tradeDate = today;
  state.tradesToday = 0;
}

function round(n: number) { return Math.round(n * 10000) / 10000; }
function save() {
  state.journal = state.journal.slice(-200);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}
function journal(entry: Omit<JournalEntry, "at">) {
  state.journal.push({ at: now.toISOString(), ...entry });
}

const current = await bestPair(state.currentToken);
if (!current || !current.priceUsd) throw new Error(`No live price for ${state.currentToken}`);
const currentPrice = Number(current.priceUsd);

if (!state.startedAt) {
  state.startedAt = now.toISOString();
  state.entryPriceUsd = currentPrice;
  state.benchmarkStartPriceUsd = currentPrice;
  state.currentSymbol = current.baseToken.symbol;
  journal({ action: "INIT", notionalGbp: 7, reason: `Seeded paper position at $${currentPrice}` });
}

if (!state.entryPriceUsd || !state.benchmarkStartPriceUsd) throw new Error("State not initialised");
let currentNotional = state.entryNotionalGbp * (currentPrice / state.entryPriceUsd);
state.peakNotionalGbp = Math.max(state.peakNotionalGbp, currentNotional);

const currentScored = scorePair(current);
const candidates = chooseBest(await boostedSolanaCandidates())
  .filter(x => x.pair.baseToken.address !== state.currentToken);
const best = candidates[0];

const pnlPct = ((currentNotional / state.entryNotionalGbp) - 1) * 100;
const drawdownFromPeakPct = state.peakNotionalGbp > 0 ? ((state.peakNotionalGbp - currentNotional) / state.peakNotionalGbp) * 100 : 0;
const forcedExit = pnlPct <= -RULES.stopLossPct || (pnlPct >= RULES.takeProfitPct && drawdownFromPeakPct >= RULES.trailingFromPeakPct);
const canTrade = state.tradesToday < RULES.maxTradesPerDay;
const rotateForOpportunity = !!best && best.score >= RULES.minCandidateScore && best.score - currentScored.score >= RULES.minRotationAdvantage;

if (canTrade && (forcedExit || rotateForOpportunity) && best?.pair.priceUsd) {
  const oneWayCost = RULES.assumedRoundTripCostPct / 2 / 100;
  const afterExit = currentNotional * (1 - oneWayCost);
  const afterEntry = afterExit * (1 - oneWayCost);
  const from = state.currentSymbol;
  state.realisedNotionalGbp = afterExit;
  state.currentToken = best.pair.baseToken.address;
  state.currentSymbol = best.pair.baseToken.symbol;
  state.entryPriceUsd = Number(best.pair.priceUsd);
  state.entryNotionalGbp = afterEntry;
  state.peakNotionalGbp = afterEntry;
  state.tradesToday += 1;
  state.tradeCount += 1;
  journal({
    action: "ROTATE",
    from,
    to: state.currentSymbol,
    notionalGbp: round(afterEntry),
    currentScore: currentScored.score,
    candidateScore: best.score,
    reason: forcedExit ? `Risk exit triggered at ${pnlPct.toFixed(1)}% P/L; best eligible destination selected` : `Candidate advantage ${best.score - currentScored.score} points`,
  });
  currentNotional = afterEntry;
} else {
  journal({
    action: "HOLD",
    notionalGbp: round(currentNotional),
    currentScore: currentScored.score,
    candidateScore: best?.score,
    reason: !canTrade ? "Daily trade cap reached" : forcedExit && !best ? "Exit condition met but no eligible destination; paper V1 does not model SOL cash yet" : "No candidate cleared the rotation threshold",
  });
}

const startPair = await bestPair(START_TOKEN);
const benchmarkPrice = Number(startPair?.priceUsd ?? 0);
const benchmarkGbp = benchmarkPrice > 0 ? state.startingNotionalGbp * (benchmarkPrice / state.benchmarkStartPriceUsd) : state.startingNotionalGbp;
const alphaPct = ((currentNotional / benchmarkGbp) - 1) * 100;

save();
console.log(JSON.stringify({
  at: now.toISOString(),
  mode: "PAPER_ONLY",
  current: { symbol: state.currentSymbol, token: state.currentToken, notionalGbp: round(currentNotional), score: currentScored.score },
  bestCandidate: best ? { symbol: best.pair.baseToken.symbol, token: best.pair.baseToken.address, score: best.score, reasons: best.reasons } : null,
  benchmark: { token: START_TOKEN, notionalGbp: round(benchmarkGbp) },
  alphaPct: round(alphaPct),
  tradeCount: state.tradeCount,
  tradesToday: state.tradesToday,
}, null, 2));
