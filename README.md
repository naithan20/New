# Solana Rotation Paper Agent

A zero-subscription experiment that starts from a **£7 notional holding** of:

`FwSuQh9hcd759TARSG2sciwLCcHWyS4kYWfseWFFpump`

It uses live public Solana market data, scores alternative tokens, and autonomously decides whether to **hold or rotate** the simulated portfolio. It also maintains a benchmark showing what the same £7 would be worth if it had simply stayed in the starting token.

## Important boundary

This repository is deliberately **paper trading only**. It contains no wallet private key handling, signing code, swap execution, or real-money trading path.

## Cost

- No paid AI inference.
- No API key required by this V1 data feed.
- Runs on GitHub Actions every 10 minutes.
- Repository is public, so standard GitHub-hosted Actions usage is intended to remain a £0 experiment subject to GitHub's current usage rules.

## Decision model

The agent currently considers:

- liquidity
- 5-minute and 1-hour volume
- 5-minute and 1-hour momentum
- recent buy/sell pressure
- volume acceleration
- pair age
- thin-liquidity penalties
- spike/chasing penalties

It rotates only when an alternative clears the minimum score and beats the current holding by a configured margin. It models trading friction before updating the paper portfolio.

## Risk/behaviour rules

See `src/engine.ts` for the explicit thresholds. V1 includes:

- minimum candidate score
- minimum rotation advantage
- assumed round-trip trading cost
- stop-loss trigger
- profit/trailing trigger
- maximum trades per day

## State and journal

`state.json` is the experiment ledger. Each scheduled run appends an `INIT`, `HOLD`, or `ROTATE` decision and records the notional portfolio state. GitHub Actions commits the updated state back to the repository.

## Run manually

```bash
npm install
npm run check
npm start
```

The command prints the current paper portfolio, best candidate, starting-token benchmark, alpha versus hold, and trade count.

## Next useful upgrades

1. Add SOL/cash as an explicit paper position so the agent can choose to sit out.
2. Add stronger token-safety filters before a candidate can be scored.
3. Persist richer candidate snapshots for post-hoc strategy analysis.
4. Add a small static dashboard generated from `state.json`.
5. Analyse results over enough observations before changing thresholds.
