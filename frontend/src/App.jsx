import { useState, useEffect } from 'react'
import {
  connectWallet, postStatement, challengeStatement,
  supportStatement, resolveStatement,
  getStatement, getRecentIds, getTotalCount,
  CONTRACT_ID,
} from './lib/stellar'

// ── Utils ──────────────────────────────────────────────────────────────────
const xlm = (stroops) => (Number(stroops) / 10_000_000).toFixed(2)
const short = (addr) => addr ? `${addr.toString().slice(0,5)}…${addr.toString().slice(-4)}` : ''
const pct = (a, b) => {
  const total = Number(a) + Number(b)
  if (total === 0) return 50
  return Math.round((Number(a) / total) * 100)
}

// ── Verdict badge ──────────────────────────────────────────────────────────
function Verdict({ stmt }) {
  const now_approx_ledger = Date.now() / 5000 // rough estimate
  const expired = stmt.expires_at && Number(stmt.expires_at) < now_approx_ledger

  if (stmt.resolved) {
    return (
      <span className={`verdict ${stmt.truth_wins ? 'verdict-true' : 'verdict-false'}`}>
        {stmt.truth_wins ? '◆ TRUTH STOOD' : '◇ TRUTH FELL'}
      </span>
    )
  }
  if (expired) return <span className="verdict verdict-expired">AWAITING RESOLVE</span>
  return <span className="verdict verdict-live">LIVE</span>
}

// ── Stake bar ──────────────────────────────────────────────────────────────
function StakeBar({ support, challenge }) {
  const sp = pct(support, challenge)
  return (
    <div className="stake-bar-wrap">
      <div className="stake-bar">
        <div
          className="stake-bar-true"
          style={{ width: `${sp}%` }}
        />
      </div>
      <div className="stake-labels">
        <span className="stake-true">{xlm(support)} XLM FOR</span>
        <span className="stake-against">{xlm(challenge)} XLM AGAINST</span>
      </div>
    </div>
  )
}

// ── Statement card ─────────────────────────────────────────────────────────
function StatementCard({ stmt, wallet, onAction, onSelect, selected }) {
  const [action, setAction] = useState(null) // 'support' | 'challenge'
  const [amount, setAmount] = useState('1')
  const [busy, setBusy] = useState(false)

  const handleStake = async () => {
    if (!wallet || !action) return
    setBusy(true)
    try {
      let hash
      if (action === 'support') hash = await supportStatement(wallet, stmt.id, parseFloat(amount))
      else hash = await challengeStatement(wallet, stmt.id, parseFloat(amount))
      onAction({ type: action, hash, stmtId: stmt.id })
      setAction(null)
    } catch (e) {
      onAction({ type: 'error', msg: e.message })
    } finally {
      setBusy(false)
    }
  }

  const handleResolve = async () => {
    if (!wallet) return
    setBusy(true)
    try {
      const hash = await resolveStatement(wallet, stmt.id)
      onAction({ type: 'resolved', hash, stmtId: stmt.id })
    } catch (e) {
      onAction({ type: 'error', msg: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={`card ${selected ? 'card-selected' : ''}`} onClick={() => onSelect(stmt.id)}>
      <div className="card-header">
        <span className="card-id">#{stmt.id?.toString().padStart(4, '0')}</span>
        <Verdict stmt={stmt} />
        <span className="card-author">by {short(stmt.author)}</span>
      </div>

      <blockquote className="card-text">"{stmt.text}"</blockquote>

      <StakeBar support={stmt.support_stake} challenge={stmt.challenge_stake} />

      <div className="card-meta">
        <span>{stmt.supporter_count?.toString()} supporters</span>
        <span className="dot-sep">·</span>
        <span>{stmt.challenger_count?.toString()} challengers</span>
        <span className="dot-sep">·</span>
        <span>Ledger {stmt.expires_at?.toString()}</span>
      </div>

      {/* Action row */}
      {wallet && !stmt.resolved && selected && (
        <div className="card-actions" onClick={e => e.stopPropagation()}>
          <div className="action-row">
            <button
              className={`btn-action btn-true ${action === 'support' ? 'active' : ''}`}
              onClick={() => setAction(action === 'support' ? null : 'support')}
            >SUPPORT ↑</button>
            <button
              className={`btn-action btn-false ${action === 'challenge' ? 'active' : ''}`}
              onClick={() => setAction(action === 'challenge' ? null : 'challenge')}
            >CHALLENGE ↓</button>
            <button className="btn-action btn-resolve" onClick={handleResolve} disabled={busy}>
              RESOLVE
            </button>
          </div>
          {action && (
            <div className="stake-input-row">
              <label>XLM to stake:</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="stake-input"
              />
              <button
                className={`btn-confirm ${action === 'support' ? 'btn-confirm-true' : 'btn-confirm-false'}`}
                onClick={handleStake}
                disabled={busy}
              >
                {busy ? 'SIGNING…' : `STAKE ${amount} XLM`}
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// ── Post form ──────────────────────────────────────────────────────────────
function PostForm({ wallet, onPosted }) {
  const [text, setText] = useState('')
  const [stake, setStake] = useState('0.5')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!wallet) return
    setBusy(true)
    setErr(null)
    try {
      const hash = await postStatement(wallet, text, parseFloat(stake))
      onPosted(hash)
      setText('')
      setStake('0.5')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="post-form" onSubmit={handleSubmit}>
      <div className="post-header">SUBMIT A STATEMENT</div>
      <textarea
        className="post-textarea"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Write something you believe to be true. You will stake XLM on it."
        maxLength={280}
        rows={3}
        required
        disabled={!wallet || busy}
      />
      <div className="post-footer">
        <span className="char-count">{text.length}/280</span>
        <div className="post-stake-row">
          <label>Stake (XLM):</label>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={stake}
            onChange={e => setStake(e.target.value)}
            className="post-stake-input"
            disabled={!wallet || busy}
          />
          <button
            type="submit"
            className="btn-post"
            disabled={!wallet || busy || !text.trim()}
          >
            {busy ? 'SUBMITTING…' : !wallet ? 'CONNECT FIRST' : 'POST TO CHAIN'}
          </button>
        </div>
        {err && <div className="post-err">{err}</div>}
      </div>
    </form>
  )
}

// ── Ticker ─────────────────────────────────────────────────────────────────
function Ticker({ total }) {
  const items = [
    `${total} STATEMENTS ON-CHAIN`,
    'STELLAR TESTNET',
    'TRUTH EXPIRES IN 30 DAYS',
    'STAKE XLM TO SIGNAL BELIEF',
    'EVERY CLAIM IS VERIFIABLE',
    `CONTRACT: ${CONTRACT_ID ? CONTRACT_ID.slice(0,16)+'…' : 'DEPLOY FIRST'}`,
  ]
  return (
    <div className="ticker-wrap">
      <div className="ticker-label">LIVE</div>
      <div className="ticker-track">
        <div className="ticker-content">
          {[...items, ...items].map((item, i) => (
            <span key={i} className="ticker-item">{item} &nbsp;◆&nbsp; </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function App() {
  const [wallet, setWallet] = useState(null)
  const [statements, setStatements] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState(null)
  const [flash, setFlash] = useState(null)
  const [tab, setTab] = useState('feed') // 'feed' | 'post'

  const loadFeed = async () => {
    setLoading(true)
    try {
      const [ids, count] = await Promise.all([getRecentIds(), getTotalCount()])
      setTotal(count)
      if (ids.length > 0) {
        const stmts = await Promise.all(
          [...ids].reverse().map(id => getStatement(id).catch(() => null))
        )
        setStatements(stmts.filter(Boolean))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFeed() }, [])

  const handleConnect = async () => {
    try {
      const addr = await connectWallet()
      setWallet(addr)
    } catch (e) {
      showFlash('error', e.message)
    }
  }

  const showFlash = (type, msg, hash) => {
    setFlash({ type, msg, hash })
    setTimeout(() => setFlash(null), 6000)
  }

  const handleAction = ({ type, hash, msg, stmtId }) => {
    if (type === 'error') { showFlash('error', msg); return }
    showFlash('success', `TX confirmed — ${type.toUpperCase()}`, hash)
    // Refresh that card
    getStatement(stmtId)
      .then(updated => setStatements(prev =>
        prev.map(s => s.id === updated.id ? updated : s)
      ))
      .catch(() => {})
  }

  const handlePosted = (hash) => {
    showFlash('success', 'Statement posted on-chain!', hash)
    setTab('feed')
    loadFeed()
  }

  return (
    <div className="app">

      {/* ── Masthead ── */}
      <header className="masthead">
        <div className="masthead-top">
          <div className="issue-info">
            <span>ISSUE #{total + 1}</span>
            <span>STELLAR TESTNET</span>
          </div>
          <h1 className="masthead-title">TruthChain</h1>
          <div className="masthead-right">
            {wallet
              ? <div className="wallet-tag"><span className="wallet-green">●</span> {short(wallet)}</div>
              : <button className="btn-connect" onClick={handleConnect}>CONNECT WALLET</button>
            }
          </div>
        </div>
        <div className="masthead-rule" />
        <p className="masthead-sub">
          STAKE XLM ON WHAT YOU BELIEVE TO BE TRUE — THE CHAIN DECIDES
        </p>
        <div className="masthead-rule masthead-rule-thin" />
      </header>

      <Ticker total={total} />

      {/* ── Flash ── */}
      {flash && (
        <div className={`flash flash-${flash.type}`}>
          <span>{flash.msg}</span>
          {flash.hash && (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${flash.hash}`}
              target="_blank" rel="noreferrer"
              className="flash-link"
            >VIEW TX →</a>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className="body-layout">

        {/* ── Feed column ── */}
        <main className="feed-col">
          <div className="feed-tabs">
            <button className={`feed-tab ${tab === 'feed' ? 'feed-tab-active' : ''}`}
              onClick={() => setTab('feed')}>THE FEED</button>
            <button className={`feed-tab ${tab === 'post' ? 'feed-tab-active' : ''}`}
              onClick={() => setTab('post')}>POST A CLAIM</button>
            <button className="feed-tab feed-tab-refresh" onClick={loadFeed}>↻ REFRESH</button>
          </div>

          {tab === 'post' && (
            <PostForm wallet={wallet} onPosted={handlePosted} />
          )}

          {tab === 'feed' && (
            loading ? (
              <div className="loading-state">
                <div className="loading-line" />
                <div className="loading-line loading-line-short" />
                <div className="loading-line" />
                <div className="loading-line loading-line-med" />
                <p className="loading-text">LOADING FROM CHAIN…</p>
              </div>
            ) : statements.length === 0 ? (
              <div className="empty-state">
                <p className="empty-headline">NO STATEMENTS YET.</p>
                <p>Be the first to post a claim and stake your conviction.</p>
              </div>
            ) : (
              <div className="card-list">
                {statements.map(stmt => (
                  <StatementCard
                    key={stmt.id?.toString()}
                    stmt={stmt}
                    wallet={wallet}
                    onAction={handleAction}
                    onSelect={(id) => setSelected(selected === id ? null : id)}
                    selected={selected === stmt.id}
                  />
                ))}
              </div>
            )
          )}
        </main>

        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-block">
            <div className="sidebar-title">HOW IT WORKS</div>
            <ol className="how-list">
              <li><strong>Post</strong> a statement you believe is true. Stake XLM.</li>
              <li><strong>Support</strong> statements you agree with — add more XLM.</li>
              <li><strong>Challenge</strong> statements you think are false.</li>
              <li>After <strong>30 days</strong>, anyone resolves it. Higher stake wins.</li>
            </ol>
          </div>

          <div className="sidebar-block">
            <div className="sidebar-title">THE RULES</div>
            <ul className="rules-list">
              <li>Minimum stake: <strong>0.1 XLM</strong></li>
              <li>Max statement length: <strong>280 chars</strong></li>
              <li>Expiry: <strong>~30 days</strong> (17,280 ledgers)</li>
              <li>Resolution: <strong>stake-weighted majority</strong></li>
              <li>Network: <strong>Stellar Testnet</strong></li>
            </ul>
          </div>

          <div className="sidebar-block sidebar-contract">
            <div className="sidebar-title">CONTRACT</div>
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
              target="_blank" rel="noreferrer"
              className="contract-link"
            >
              {CONTRACT_ID ? CONTRACT_ID : 'Run deploy.sh first'}
            </a>
          </div>

          <div className="sidebar-block">
            <div className="sidebar-title">STATS</div>
            <div className="stats-grid">
              <div className="stat-cell">
                <span className="stat-num">{total}</span>
                <span className="stat-lbl">TOTAL CLAIMS</span>
              </div>
              <div className="stat-cell">
                <span className="stat-num">{statements.filter(s => !s.resolved).length}</span>
                <span className="stat-lbl">LIVE NOW</span>
              </div>
              <div className="stat-cell">
                <span className="stat-num">{statements.filter(s => s.resolved && s.truth_wins).length}</span>
                <span className="stat-lbl">TRUTH WON</span>
              </div>
              <div className="stat-cell">
                <span className="stat-num">{statements.filter(s => s.resolved && !s.truth_wins).length}</span>
                <span className="stat-lbl">TRUTH FELL</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <footer className="footer">
        <span>TRUTHCHAIN — PROJECT #3 OF 30 — STELLAR SOROBAN HACKATHON</span>
        <a href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`}
          target="_blank" rel="noreferrer">CONTRACT ↗</a>
      </footer>
    </div>
  )
}
