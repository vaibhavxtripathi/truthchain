# TruthChain

> **Stake XLM on what you believe to be true. The chain decides.**

Post a statement. Stake XLM. Others support it (agree) or challenge it (disagree). After 30 days (~17,280 Stellar ledgers), anyone resolves it — whichever side staked more wins. Every action is an on-chain Soroban transaction.

---

## Live Links

| | |
|---|---|
| **Frontend** | `https://truthchain.vercel.app` |
| **GitHub** | `https://github.com/YOUR_USERNAME/truthchain` |
| **Contract** | `https://stellar.expert/explorer/testnet/contract/CONTRACT_ID` |
| **Proof TX** | `https://stellar.expert/explorer/testnet/tx/TX_HASH` |

---

## Contract Functions

```rust
post_statement(author, text, stake: i128, xlm_token) -> u64
challenge(challenger, statement_id, stake: i128, xlm_token)
support(supporter, statement_id, stake: i128, xlm_token)
resolve(statement_id)            // anyone calls after expiry
get_statement(id) -> Statement
get_recent()      -> Vec<u64>
count()           -> u64
```

---

## Run Locally

```bash
chmod +x scripts/deploy.sh && ./scripts/deploy.sh
cd frontend && npm install && npm run dev
```

---

## Project #3 of 30 — Stellar Hackathon MOU
