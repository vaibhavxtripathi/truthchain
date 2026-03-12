#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Vec, token,
};

// ── Constants ──────────────────────────────────────────────────────────────
const EXPIRY_LEDGERS: u32 = 17_280; // ~30 days at 5s/ledger
const MIN_STAKE: i128 = 1_000_000; // 0.1 XLM in stroops
const MAX_STATEMENT_LEN: u32 = 280;

// ── Types ──────────────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone)]
pub struct Statement {
    pub id: u64,
    pub author: Address,
    pub text: String,
    pub stake: i128,           // stroops staked on truth
    pub challenge_stake: i128, // total XLM staked against it
    pub support_stake: i128,   // total XLM staked for it
    pub created_at: u32,       // ledger number
    pub expires_at: u32,       // ledger number
    pub resolved: bool,
    pub truth_wins: bool,      // true if truth > challenge at expiry
    pub challenger_count: u32,
    pub supporter_count: u32,
}

#[contracttype]
pub enum DataKey {
    Statement(u64),
    Count,
    Recent, // Vec<u64> last 20 IDs
}

#[contract]
pub struct TruthChainContract;

#[contractimpl]
impl TruthChainContract {
    /// Post a statement and stake XLM on its truth
    /// Caller transfers `stake` stroops to the contract
    pub fn post_statement(
        env: Env,
        author: Address,
        text: String,
        stake: i128,
        xlm_token: Address,
    ) -> u64 {
        author.require_auth();
        assert!(stake >= MIN_STAKE, "Stake too low, min 0.1 XLM");
        assert!(
            text.len() <= MAX_STATEMENT_LEN,
            "Statement too long, max 280 chars"
        );

        // Transfer stake from author to contract
        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(
            &author,
            &env.current_contract_address(),
            &stake,
        );

        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0u64);
        let id = count + 1;

        let current_ledger = env.ledger().sequence();
        let stmt = Statement {
            id,
            author: author.clone(),
            text,
            stake,
            challenge_stake: 0,
            support_stake: stake, // author's stake counts as support
            created_at: current_ledger,
            expires_at: current_ledger + EXPIRY_LEDGERS,
            resolved: false,
            truth_wins: false,
            challenger_count: 0,
            supporter_count: 1,
        };

        env.storage().persistent().set(&DataKey::Statement(id), &stmt);
        env.storage().instance().set(&DataKey::Count, &id);

        // Keep rolling list of last 20
        let mut recent: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::Recent)
            .unwrap_or(Vec::new(&env));
        recent.push_back(id);
        if recent.len() > 20 {
            recent.remove(0);
        }
        env.storage().instance().set(&DataKey::Recent, &recent);

        env.events().publish((symbol_short!("posted"),), (id, author, stake));

        id
    }

    /// Challenge a statement — stake XLM that it's FALSE
    pub fn challenge(
        env: Env,
        challenger: Address,
        statement_id: u64,
        stake: i128,
        xlm_token: Address,
    ) {
        challenger.require_auth();
        assert!(stake >= MIN_STAKE, "Stake too low");

        let mut stmt: Statement = env
            .storage()
            .persistent()
            .get(&DataKey::Statement(statement_id))
            .expect("Statement not found");

        assert!(!stmt.resolved, "Already resolved");
        assert!(
            env.ledger().sequence() < stmt.expires_at,
            "Statement expired"
        );

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(
            &challenger,
            &env.current_contract_address(),
            &stake,
        );

        stmt.challenge_stake += stake;
        stmt.challenger_count += 1;
        env.storage().persistent().set(&DataKey::Statement(statement_id), &stmt);

        env.events().publish(
            (symbol_short!("chalngd"),),
            (statement_id, challenger, stake),
        );
    }

    /// Support a statement — stake XLM that it's TRUE
    pub fn support(
        env: Env,
        supporter: Address,
        statement_id: u64,
        stake: i128,
        xlm_token: Address,
    ) {
        supporter.require_auth();
        assert!(stake >= MIN_STAKE, "Stake too low");

        let mut stmt: Statement = env
            .storage()
            .persistent()
            .get(&DataKey::Statement(statement_id))
            .expect("Statement not found");

        assert!(!stmt.resolved, "Already resolved");
        assert!(
            env.ledger().sequence() < stmt.expires_at,
            "Statement expired"
        );

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(
            &supporter,
            &env.current_contract_address(),
            &stake,
        );

        stmt.support_stake += stake;
        stmt.supporter_count += 1;
        env.storage().persistent().set(&DataKey::Statement(statement_id), &stmt);

        env.events().publish(
            (symbol_short!("supportd"),),
            (statement_id, supporter, stake),
        );
    }

    /// Resolve an expired statement — anyone can call this
    /// Truth wins if support_stake >= challenge_stake
    /// (simplified resolution — no oracle needed for hackathon)
    pub fn resolve(env: Env, statement_id: u64) {
        let mut stmt: Statement = env
            .storage()
            .persistent()
            .get(&DataKey::Statement(statement_id))
            .expect("Statement not found");

        assert!(!stmt.resolved, "Already resolved");
        assert!(
            env.ledger().sequence() >= stmt.expires_at,
            "Not expired yet"
        );

        stmt.truth_wins = stmt.support_stake >= stmt.challenge_stake;
        stmt.resolved = true;
        env.storage().persistent().set(&DataKey::Statement(statement_id), &stmt);

        env.events().publish(
            (symbol_short!("resolved"),),
            (statement_id, stmt.truth_wins),
        );
    }

    // ── Read functions ───────────────────────────────────────────────────
    pub fn get_statement(env: Env, id: u64) -> Statement {
        env.storage()
            .persistent()
            .get(&DataKey::Statement(id))
            .expect("Statement not found")
    }

    pub fn get_recent(env: Env) -> Vec<u64> {
        env.storage()
            .instance()
            .get(&DataKey::Recent)
            .unwrap_or(Vec::new(&env))
    }

    pub fn count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0u64)
    }

    pub fn min_stake(_env: Env) -> i128 {
        MIN_STAKE
    }
}
