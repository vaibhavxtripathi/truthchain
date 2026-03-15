import * as StellarSdk from '@stellar/stellar-sdk'
import { isConnected, getPublicKey, signTransaction } from '@stellar/freighter-api'

const CONTRACT_ID  = import.meta.env.VITE_CONTRACT_ID
const XLM_TOKEN    = import.meta.env.VITE_XLM_TOKEN
const NET          = import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015'
const RPC_URL      = import.meta.env.VITE_SOROBAN_RPC_URL   || 'https://soroban-testnet.stellar.org'

export const rpc = new StellarSdk.rpc.Server(RPC_URL)
const DUMMY = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

export async function connectWallet() {
  if (!(await isConnected())) {
    throw new Error('Freighter not installed')
  }
  const address = await getPublicKey()
  return address
}

async function sendTx(tx) {
  const sim = await rpc.simulateTransaction(tx)
  if (StellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  const prep = StellarSdk.rpc.assembleTransaction(tx, sim).build()
  const signedXdr = await signTransaction(prep.toXDR(), { networkPassphrase: NET })
  const sent = await rpc.sendTransaction(
    StellarSdk.TransactionBuilder.fromXDR(signedXdr, NET)
  )
  for (let i = 0; i < 30; i++) {
    const r = await rpc.getTransaction(sent.hash)
    if (r.status === 'SUCCESS') return sent.hash
    if (r.status === 'FAILED')  throw new Error('TX failed on-chain')
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('TX timed out')
}

function makeTx(source, ops) {
  const builder = new StellarSdk.TransactionBuilder(source, {
    fee: StellarSdk.BASE_FEE, networkPassphrase: NET,
  })
  ops.forEach(op => builder.addOperation(op))
  return builder.setTimeout(30).build()
}

// ── Approve XLM spend then post_statement ─────────────────────────────────
export async function postStatement(author, text, stakeXLM) {
  const stake = BigInt(Math.round(stakeXLM * 10_000_000))
  const account = await rpc.getAccount(author)
  const xlm = new StellarSdk.Contract(XLM_TOKEN)
  const tc  = new StellarSdk.Contract(CONTRACT_ID)

  // 1. approve
  const approveTx = makeTx(account, [
    xlm.call('approve',
      StellarSdk.Address.fromString(author).toScVal(),
      StellarSdk.Address.fromString(CONTRACT_ID).toScVal(),
      new StellarSdk.XdrLargeInt('i128', stake).toI128(),
      StellarSdk.xdr.ScVal.scvU32(3_110_400),
    )
  ])
  await sendTx(approveTx)

  // 2. post
  const account2 = await rpc.getAccount(author)
  const postTx = makeTx(account2, [
    tc.call('post_statement',
      StellarSdk.Address.fromString(author).toScVal(),
      StellarSdk.xdr.ScVal.scvString(text),
      new StellarSdk.XdrLargeInt('i128', stake).toI128(),
      StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
    )
  ])
  const hash = await sendTx(postTx)
  return hash
}

// ── challenge ─────────────────────────────────────────────────────────────
export async function challengeStatement(challenger, stmtId, stakeXLM) {
  const stake = BigInt(Math.round(stakeXLM * 10_000_000))
  const account = await rpc.getAccount(challenger)
  const xlm = new StellarSdk.Contract(XLM_TOKEN)
  const tc  = new StellarSdk.Contract(CONTRACT_ID)

  const approveTx = makeTx(account, [
    xlm.call('approve',
      StellarSdk.Address.fromString(challenger).toScVal(),
      StellarSdk.Address.fromString(CONTRACT_ID).toScVal(),
      new StellarSdk.XdrLargeInt('i128', stake).toI128(),
      StellarSdk.xdr.ScVal.scvU32(3_110_400),
    )
  ])
  await sendTx(approveTx)

  const account2 = await rpc.getAccount(challenger)
  const tx = makeTx(account2, [
    tc.call('challenge',
      StellarSdk.Address.fromString(challenger).toScVal(),
      StellarSdk.xdr.ScVal.scvU64(new StellarSdk.xdr.Uint64(BigInt(stmtId))),
      new StellarSdk.XdrLargeInt('i128', stake).toI128(),
      StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
    )
  ])
  return sendTx(tx)
}

// ── support ───────────────────────────────────────────────────────────────
export async function supportStatement(supporter, stmtId, stakeXLM) {
  const stake = BigInt(Math.round(stakeXLM * 10_000_000))
  const account = await rpc.getAccount(supporter)
  const xlm = new StellarSdk.Contract(XLM_TOKEN)
  const tc  = new StellarSdk.Contract(CONTRACT_ID)

  const approveTx = makeTx(account, [
    xlm.call('approve',
      StellarSdk.Address.fromString(supporter).toScVal(),
      StellarSdk.Address.fromString(CONTRACT_ID).toScVal(),
      new StellarSdk.XdrLargeInt('i128', stake).toI128(),
      StellarSdk.xdr.ScVal.scvU32(3_110_400),
    )
  ])
  await sendTx(approveTx)

  const account2 = await rpc.getAccount(supporter)
  const tx = makeTx(account2, [
    tc.call('support',
      StellarSdk.Address.fromString(supporter).toScVal(),
      StellarSdk.xdr.ScVal.scvU64(new StellarSdk.xdr.Uint64(BigInt(stmtId))),
      new StellarSdk.XdrLargeInt('i128', stake).toI128(),
      StellarSdk.Address.fromString(XLM_TOKEN).toScVal(),
    )
  ])
  return sendTx(tx)
}

// ── resolve ───────────────────────────────────────────────────────────────
export async function resolveStatement(caller, stmtId) {
  const account = await rpc.getAccount(caller)
  const tc = new StellarSdk.Contract(CONTRACT_ID)
  const tx = makeTx(account, [
    tc.call('resolve',
      StellarSdk.xdr.ScVal.scvU64(new StellarSdk.xdr.Uint64(BigInt(stmtId))),
    )
  ])
  return sendTx(tx)
}

// ── reads ─────────────────────────────────────────────────────────────────
function readTx(op) {
  return new StellarSdk.TransactionBuilder(
    new StellarSdk.Account(DUMMY, '0'),
    { fee: StellarSdk.BASE_FEE, networkPassphrase: NET }
  ).addOperation(op).setTimeout(30).build()
}

export async function getStatement(id) {
  const tc = new StellarSdk.Contract(CONTRACT_ID)
  const r = await rpc.simulateTransaction(
    readTx(tc.call('get_statement',
      StellarSdk.xdr.ScVal.scvU64(new StellarSdk.xdr.Uint64(BigInt(id)))
    ))
  )
  return StellarSdk.scValToNative(r.result.retval)
}

export async function getRecentIds() {
  const tc = new StellarSdk.Contract(CONTRACT_ID)
  try {
    const r = await rpc.simulateTransaction(readTx(tc.call('get_recent')))
    const ids = StellarSdk.scValToNative(r.result.retval)
    return Array.isArray(ids) ? ids.map(Number) : []
  } catch { return [] }
}

export async function getTotalCount() {
  const tc = new StellarSdk.Contract(CONTRACT_ID)
  try {
    const r = await rpc.simulateTransaction(readTx(tc.call('count')))
    return Number(StellarSdk.scValToNative(r.result.retval))
  } catch { return 0 }
}

export { CONTRACT_ID, XLM_TOKEN }
