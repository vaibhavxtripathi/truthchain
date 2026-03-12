#!/usr/bin/env bash
set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${RED}TRUTHCHAIN — DEPLOY${NC}"
echo -e "${YELLOW}──────────────────────────────────${NC}"

echo -e "${YELLOW}[1/6] Setting up identity...${NC}"
stellar keys generate --global deployer --network testnet 2>/dev/null || true
stellar keys fund deployer --network testnet
DEPLOYER=$(stellar keys address deployer)
echo -e "${GREEN}✓ Deployer: ${DEPLOYER}${NC}"

# Get XLM native token address on testnet
XLM_TOKEN=$(stellar contract id asset --asset native --network testnet)
echo -e "${GREEN}✓ XLM Token: ${XLM_TOKEN}${NC}"

echo -e "${YELLOW}[2/6] Building contract...${NC}"
cd contract
cargo build --target wasm32-unknown-unknown --release
WASM="target/wasm32-unknown-unknown/release/truthchain.wasm"
cd ..

echo -e "${YELLOW}[3/6] Uploading WASM...${NC}"
WASM_HASH=$(stellar contract upload \
  --network testnet --source deployer \
  --wasm contract/${WASM})
echo -e "${GREEN}✓ WASM: ${WASM_HASH}${NC}"

echo -e "${YELLOW}[4/6] Deploying contract...${NC}"
CONTRACT_ID=$(stellar contract deploy \
  --network testnet --source deployer \
  --wasm-hash ${WASM_HASH})
echo -e "${GREEN}✓ Contract: ${CONTRACT_ID}${NC}"

echo -e "${YELLOW}[5/6] Posting proof statement...${NC}"
# Wrap XLM contract so the contract can receive transfers
stellar contract invoke \
  --network testnet --source deployer \
  --id ${XLM_TOKEN} \
  -- approve \
  --from ${DEPLOYER} \
  --spender ${CONTRACT_ID} \
  --amount 10000000 \
  --expiration_ledger 99999999 2>&1 || true

TX_RESULT=$(stellar contract invoke \
  --network testnet --source deployer \
  --id ${CONTRACT_ID} \
  -- post_statement \
  --author ${DEPLOYER} \
  --text '"The Stellar blockchain will process 1 billion transactions by 2026."' \
  --stake 5000000 \
  --xlm_token ${XLM_TOKEN} 2>&1)

TX_HASH=$(echo "$TX_RESULT" | grep -oP '[0-9a-f]{64}' | head -1)
echo -e "${GREEN}✓ Proof TX: ${TX_HASH}${NC}"

echo -e "${YELLOW}[6/6] Writing frontend .env...${NC}"
cat > frontend/.env << EOF
VITE_CONTRACT_ID=${CONTRACT_ID}
VITE_XLM_TOKEN=${XLM_TOKEN}
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
EOF

echo ""
echo -e "${RED}┌──────────────────────────────────────────────────────────┐${NC}"
echo -e "${RED}│                  TRUTHCHAIN DEPLOYED                    │${NC}"
echo -e "${RED}├──────────────────────────────────────────────────────────┤${NC}"
echo -e "${RED}│${NC} Contract : ${GREEN}${CONTRACT_ID}${NC}"
echo -e "${RED}│${NC} XLM Token: ${GREEN}${XLM_TOKEN}${NC}"
echo -e "${RED}│${NC} Proof TX : ${GREEN}${TX_HASH}${NC}"
echo -e "${RED}│${NC} Explorer : https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}"
echo -e "${RED}└──────────────────────────────────────────────────────────┘${NC}"
