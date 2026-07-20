/* StableLink — stablecoin transfer demo.
 *
 * Fictional demo only. Simulated virtual credits — no real money, no real chain.
 * Transaction hashes are generated locally and are broadcast nowhere.
 *
 * Design rules this file obeys:
 *  1. One calculator. Every displayed number (quote, review, receipt, history,
 *     export) comes from computeFlow(). Display can never drift from settlement.
 *  2. No invented data. Address validation is real (base58 length check for
 *     Solana, EIP-55 keccak-256 checksum for EVM). Loyalty is lifetime settled
 *     volume, not a random "score". Failures come from real causes or from an
 *     explicit demo toggle — never from a hidden dice roll.
 *  3. Irreversible actions get a review step. Routine actions get none.
 */

/* ============================================================ *
 * 1. Money
 * ============================================================ */

// Amounts and percentage fees quantize to cents.
function money(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
// Chain-level values (network fees, totals, balances) need finer granularity:
// a cent-quantized ledger would silently swallow sub-cent gas costs.
function q3(n) {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}
function fmt(n) {
  return money(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Shows the third decimal only when there is one, so totals stay readable
// but never claim a rounder number than was actually moved.
function fmtT(n) {
  const v = q3(n);
  return Math.round(v * 1000) % 10 !== 0
    ? v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
    : fmt(v);
}

/* Single source of truth for a transfer's arithmetic.
 * amount        — what the sender types
 * sendFee       — platform fee, taken out of the amount
 * networkFee    — chain cost, charged on top (never rebated)
 * recipientGets — amount - sendFee
 * totalDebit    — amount + networkFee
 * Invariants: recipientGets + sendFee === amount, totalDebit === amount + networkFee.
 */
function computeFlow(amount, feePct, chain) {
  amount = money(amount);
  const sendFee = money(amount * (feePct / 100));
  const recipientGets = money(amount - sendFee);
  const networkFee = NETWORK_FEE[chain] != null ? NETWORK_FEE[chain] : 0;
  const totalDebit = q3(amount + networkFee);
  return { amount, sendFee, networkFee, recipientGets, totalDebit, feePct: money(feePct) };
}

function flowIsSound(f) {
  return money(f.recipientGets + f.sendFee) === f.amount &&
         q3(f.amount + f.networkFee) === q3(f.totalDebit);
}

/* ============================================================ *
 * 2. Chains
 * ============================================================ */

const CHAINS = {
  sol:  { id: 'sol',  name: 'Solana', short: 'SOL',  fmtName: 'base58 (case-sensitive, 32–44 chars)', etaSec: 8,  confirmMs: [900, 2200] },
  base: { id: 'base', name: 'Base',   short: 'BASE', fmtName: '0x + 40 hex characters',                etaSec: 20, confirmMs: [1800, 5200] }
};
const TOKENS = ['USDC', 'USDT'];

// Simulated network fee, denominated in the token being sent for demo simplicity.
// Real Solana signatures cost ~0.000005 SOL and Base calldata a fraction of a cent;
// these stand in for that and are disclosed as simulated everywhere they appear.
const NETWORK_FEE = { sol: 0.001, base: 0.004 };

/* ============================================================ *
 * 3b. FX corridors — recipient local-currency payout
 * ============================================================ *
 * The sender's stablecoin is USD-denominated. A recipient can be paid out in a
 * local currency instead — the reason cross-border rails exist. We show the
 * mid-market reference rate, apply ONE transparent FX margin, and disclose the
 * effective locked rate and the exact margin cost. Rates below are FIXED,
 * deterministic illustrative demo values (NOT live) and are disclosed as such
 * everywhere they appear — no random walks, no hidden markup. Display == math.  */

const FX_MARGIN_PCT = 0.30;   // transparent conversion margin, shown as its own line
const FX_LOCK_MS = 10 * 60e3; // how long a quoted rate is held (rate-lock UX)

const CURRENCIES = {
  USD: { code: 'USD', name: 'US Dollar',        flag: '🇺🇸', mid: 1,       dp: 2, rail: 'Stablecoin — no conversion' },
  EUR: { code: 'EUR', name: 'Euro',             flag: '🇪🇺', mid: 0.9230,  dp: 2, rail: 'SEPA credit' },
  GBP: { code: 'GBP', name: 'British Pound',    flag: '🇬🇧', mid: 0.7880,  dp: 2, rail: 'Faster Payments' },
  PHP: { code: 'PHP', name: 'Philippine Peso',  flag: '🇵🇭', mid: 58.30,   dp: 2, rail: 'InstaPay · GCash' },
  INR: { code: 'INR', name: 'Indian Rupee',     flag: '🇮🇳', mid: 86.10,   dp: 2, rail: 'UPI · IMPS' },
  MXN: { code: 'MXN', name: 'Mexican Peso',     flag: '🇲🇽', mid: 18.650,  dp: 2, rail: 'SPEI' },
  NGN: { code: 'NGN', name: 'Nigerian Naira',   flag: '🇳🇬', mid: 1580.0,  dp: 2, rail: 'NIP transfer' },
  BRL: { code: 'BRL', name: 'Brazilian Real',   flag: '🇧🇷', mid: 5.4200,  dp: 2, rail: 'PIX' },
  VND: { code: 'VND', name: 'Vietnamese Dong',  flag: '🇻🇳', mid: 26150,   dp: 0, rail: 'Napas 247' },
  KRW: { code: 'KRW', name: 'Korean Won',       flag: '🇰🇷', mid: 1385.0,  dp: 0, rail: 'Open Banking' }
};
const CCY_CODES = Object.keys(CURRENCIES);

function ccyOf(code) { return CURRENCIES[code] || CURRENCIES.USD; }
function fxRound(v, dp) { const f = Math.pow(10, dp); return Math.round((Number(v) + Number.EPSILON) * f) / f; }

// Effective (locked) rate = mid-market minus the disclosed margin.
function effRate(cur) { return cur.mid * (1 - FX_MARGIN_PCT / 100); }

/* Derive the payout from a USD send amount. Pure + deterministic.
 * usd           — recipient's USD-side amount (after send fee)
 * returns { cur, isUSD, mid, rate, local, marginPct, marginCostUsd } */
function fxQuote(usd, code) {
  const cur = ccyOf(code);
  const isUSD = cur.code === 'USD';
  const rate = isUSD ? 1 : effRate(cur);
  const local = isUSD ? money(usd) : fxRound(usd * rate, cur.dp);
  const marginCostUsd = isUSD ? 0 : money(usd * (FX_MARGIN_PCT / 100));
  return { cur, isUSD, mid: cur.mid, rate, local, marginPct: isUSD ? 0 : FX_MARGIN_PCT, marginCostUsd };
}

function fmtLocal(v, cur) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.code,
      minimumFractionDigits: cur.dp, maximumFractionDigits: cur.dp }).format(v);
  } catch (e) {
    return v.toLocaleString('en-US', { minimumFractionDigits: cur.dp, maximumFractionDigits: cur.dp }) + ' ' + cur.code;
  }
}
// Rates print with enough precision to reproduce the payout, without noise.
function fmtRate(v) {
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (v >= 1)    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

/* ============================================================ *
 * 3. keccak-256 (for real EIP-55 checksums + plausible tx hashes)
 * ============================================================ */

const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];
const KECCAK_ROTC = [1,3,6,10,15,21,28,36,45,55,2,14,27,41,56,8,25,43,62,18,39,61,20,44];
const KECCAK_PILN = [10,7,11,17,18,3,5,16,8,21,24,4,15,23,19,13,12,2,20,14,22,9,6,1];
const M64 = (1n << 64n) - 1n;

function rotl64(x, n) {
  const s = BigInt(n);
  return ((x << s) | (x >> (64n - s))) & M64;
}

function keccakF(st) {
  const bc = new Array(5);
  for (let r = 0; r < 24; r++) {
    for (let i = 0; i < 5; i++) bc[i] = st[i] ^ st[i + 5] ^ st[i + 10] ^ st[i + 15] ^ st[i + 20];
    for (let i = 0; i < 5; i++) {
      const t = bc[(i + 4) % 5] ^ rotl64(bc[(i + 1) % 5], 1);
      for (let j = 0; j < 25; j += 5) st[j + i] = (st[j + i] ^ t) & M64;
    }
    let t = st[1];
    for (let i = 0; i < 24; i++) {
      const j = KECCAK_PILN[i];
      const tmp = st[j];
      st[j] = rotl64(t, KECCAK_ROTC[i]);
      t = tmp;
    }
    for (let j = 0; j < 25; j += 5) {
      for (let i = 0; i < 5; i++) bc[i] = st[j + i];
      for (let i = 0; i < 5; i++) st[j + i] = (st[j + i] ^ ((bc[(i + 1) % 5] ^ M64) & bc[(i + 2) % 5])) & M64;
    }
    st[0] = (st[0] ^ KECCAK_RC[r]) & M64;
  }
}

// Keccak-256 (original padding 0x01, as used by Ethereum — not SHA3-256's 0x06).
function keccak256(bytes) {
  const rate = 136;
  const st = new Array(25).fill(0n);
  const padded = new Uint8Array(Math.floor(bytes.length / rate) * rate + rate);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + b]);
      st[i] ^= lane;
    }
    keccakF(st);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = st[i];
    for (let b = 0; b < 8; b++) { out[i * 8 + b] = Number(lane & 0xffn); lane >>= 8n; }
  }
  return out;
}

function bytesToHex(b) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}
function strToBytes(s) {
  return new TextEncoder().encode(s);
}
function keccakHex(str) {
  return bytesToHex(keccak256(strToBytes(str)));
}

/* EIP-55: mixed-case checksum. Uppercase a hex letter when the matching
 * nibble of keccak256(lowercase address) is >= 8. */
function toChecksumAddress(addr40) {
  const lower = addr40.toLowerCase();
  const hash = keccakHex(lower);
  let out = '';
  for (let i = 0; i < 40; i++) {
    const c = lower[i];
    out += (c >= 'a' && c <= 'f' && parseInt(hash[i], 16) >= 8) ? c.toUpperCase() : c;
  }
  return '0x' + out;
}

/* ============================================================ *
 * 4. base58 (Solana address validation + signature shapes)
 * ============================================================ */

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(str) {
  let num = 0n;
  for (const ch of str) {
    const idx = B58.indexOf(ch);
    if (idx < 0) return null; // not in alphabet (0, O, I, l are excluded by design)
    num = num * 58n + BigInt(idx);
  }
  const bytes = [];
  while (num > 0n) { bytes.unshift(Number(num & 0xffn)); num >>= 8n; }
  for (const ch of str) { if (ch === '1') bytes.unshift(0); else break; }
  return new Uint8Array(bytes);
}

function base58Encode(bytes) {
  let num = 0n;
  for (const b of bytes) num = (num << 8n) | BigInt(b);
  let out = '';
  while (num > 0n) { out = B58[Number(num % 58n)] + out; num /= 58n; }
  for (const b of bytes) { if (b === 0) out = '1' + out; else break; }
  return out || '1';
}

/* ============================================================ *
 * 5. Address validation
 * ============================================================ */

const ERRAND_RE = /^errand-[a-z0-9-]+$/i;

/* Returns { ok, level, code, msg, normalized, kind }
 * level: 'ok' | 'warn' | 'error' — warnings are informative, errors block. */
function validateRecipient(raw, chain) {
  const v = (raw || '').trim();
  if (!v) return { ok: false, level: 'idle', code: 'EMPTY', msg: '' };

  if (ERRAND_RE.test(v)) {
    return { ok: true, level: 'ok', code: 'ERRAND', kind: 'errand', normalized: v.toLowerCase(),
             msg: 'Errand ID — routed through the errand pool at the flat 0.50% rate.' };
  }

  const looksEvm = /^0x/i.test(v);
  const looksB58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);

  if (chain === 'base') {
    if (!looksEvm) {
      if (looksB58) {
        return { ok: false, level: 'error', code: 'WRONG_NETWORK', kind: 'address',
                 msg: 'That is a Solana address, but Base is selected. Tokens sent to the wrong network cannot be recovered.',
                 fix: { label: 'Switch to Solana', action: 'switchTo:sol' } };
      }
      return { ok: false, level: 'error', code: 'FORMAT', kind: 'address',
               msg: 'Base addresses start with 0x and contain 40 hex characters. Paste the address instead of typing it.' };
    }
    const body = v.slice(2);
    if (body.length !== 40 || !/^[0-9a-fA-F]{40}$/.test(body)) {
      return { ok: false, level: 'error', code: 'FORMAT', kind: 'address',
               msg: `A Base address needs exactly 40 hex characters after 0x — this one has ${body.length}. Re-copy it; a truncated paste is the usual cause.` };
    }
    const isMixed = /[a-f]/.test(body) && /[A-F]/.test(body);
    const checksummed = toChecksumAddress(body);
    if (isMixed && checksummed !== '0x' + body) {
      return { ok: false, level: 'error', code: 'CHECKSUM', kind: 'address',
               msg: 'This address fails its EIP-55 checksum, which means at least one character is wrong. Copy it again from the source — do not retype it.' };
    }
    return { ok: true, level: isMixed ? 'ok' : 'warn', code: isMixed ? 'CHECKSUM_OK' : 'NO_CHECKSUM',
             kind: 'address', normalized: checksummed,
             msg: isMixed
               ? 'EIP-55 checksum verified.'
               : 'All-lowercase address: valid in form, but with no checksum to verify against. Compare the first and last four characters against your source.' };
  }

  // Solana
  if (looksEvm) {
    return { ok: false, level: 'error', code: 'WRONG_NETWORK', kind: 'address',
             msg: 'That is an EVM address, but Solana is selected. Tokens sent to the wrong network cannot be recovered.',
             fix: { label: 'Switch to Base', action: 'switchTo:base' } };
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(v)) {
    return { ok: false, level: 'error', code: 'FORMAT', kind: 'address',
             msg: 'Solana addresses use base58, which excludes 0, O, I and l. One of those characters is present, so this address cannot be right.' };
  }
  const decoded = base58Decode(v);
  if (!decoded || decoded.length !== 32) {
    return { ok: false, level: 'error', code: 'FORMAT', kind: 'address',
             msg: `A Solana address decodes to exactly 32 bytes — this one decodes to ${decoded ? decoded.length : 0}. Re-copy it from the source.` };
  }
  return { ok: true, level: 'warn', code: 'NO_CHECKSUM', kind: 'address', normalized: v,
           msg: 'Valid base58, 32 bytes. Solana addresses carry no checksum and are case-sensitive — verify the capitalization against your source.' };
}

/* ============================================================ *
 * 6. State
 * ============================================================ */

const LS = {
  bal: 'p10_balances_v2', receipts: 'p10_receipts', contacts: 'p10_contacts',
  sched: 'p10_schedules', notif: 'p10_notifications', vault: 'p10_vault_balance',
  opts: 'p10_options', migrated: 'p10_migrated_v2', ccy: 'p10_payout_ccy'
};

let balances, receipts, contacts, schedules, notifications, vaultBalance, options;
let payoutCcy = 'USD';   // recipient payout currency (personal sends); errands are always USD
let currentVoice = null;
let mediaRecorder, audioCtx, analyser, sourceNode, dataArray, raf, recog;
let pendingFlow = null;   // the reviewed transfer awaiting confirmation
let liveTimers = [];
let rateLockTimer = null; // FX rate-lock countdown in the review sheet

function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch (e) { return fallback; }
}

function balKey(chain, token) { return chain + ':' + token; }

function loadState() {
  receipts = loadJSON(LS.receipts, []);
  contacts = loadJSON(LS.contacts, []);
  schedules = loadJSON(LS.sched, []);
  notifications = loadJSON(LS.notif, []);
  vaultBalance = parseFloat(localStorage.getItem(LS.vault) || '0') || 0;
  options = loadJSON(LS.opts, { forceFail: false, fast: false });
  const savedCcy = localStorage.getItem(LS.ccy);
  payoutCcy = CURRENCIES[savedCcy] ? savedCcy : 'USD';
  balances = loadJSON(LS.bal, null);

  if (!balances) {
    // Migrate the old single-balance demo, preserving the total exactly.
    const legacy = parseFloat(localStorage.getItem('p10_balance') || '1284.70') || 1284.70;
    balances = {
      'sol:USDC': money(legacy * 0.5),
      'sol:USDT': money(legacy * 0.14),
      'base:USDC': money(legacy * 0.28),
      'base:USDT': 0
    };
    // Give any rounding remainder to the largest bucket so the total is untouched.
    const diff = money(legacy - Object.values(balances).reduce((s, v) => s + v, 0));
    balances['sol:USDC'] = money(balances['sol:USDC'] + diff);
    localStorage.setItem(LS.migrated, '1');
  }
  for (const c of Object.keys(CHAINS)) for (const t of TOKENS) {
    if (balances[balKey(c, t)] == null) balances[balKey(c, t)] = 0;
  }

  // Backfill fields older receipts predate, so history/filters never show blanks.
  receipts.forEach(r => {
    if (!r.status) r.status = 'delivered';
    if (!r.chain) r.chain = 'sol';
    if (!r.type) r.type = String(r.to || '').includes('errand') ? 'errand' : 'send';
    if (r.amount == null) r.amount = r.gross != null ? r.gross : 0;
    if (r.sendFee == null) r.sendFee = r.fee != null ? r.fee : 0;
    if (r.recipientGets == null) r.recipientGets = r.net != null ? r.net : money(r.amount - r.sendFee);
    if (r.networkFee == null) r.networkFee = 0;
    if (r.totalDebit == null) r.totalDebit = money(r.amount + r.networkFee);
    if (!r.timeline) r.timeline = [{ status: 'delivered', ts: r.ts }];
    if (!r.hash) r.hash = makeHash(r.id || String(r.ts), r.chain);
  });
}

function saveState() {
  localStorage.setItem(LS.bal, JSON.stringify(balances));
  localStorage.setItem(LS.receipts, JSON.stringify(receipts));
  localStorage.setItem(LS.contacts, JSON.stringify(contacts));
  localStorage.setItem(LS.sched, JSON.stringify(schedules));
  localStorage.setItem(LS.notif, JSON.stringify(notifications.slice(0, 40)));
  localStorage.setItem(LS.vault, vaultBalance.toFixed(2));
  localStorage.setItem(LS.opts, JSON.stringify(options));
}

function totalBalance() {
  return q3(Object.values(balances).reduce((s, v) => s + v, 0));
}
function avail(chain, token) {
  return q3(balances[balKey(chain, token)] || 0);
}

/* ============================================================ *
 * 7. Fee tiers + limits (driven by lifetime settled volume)
 * ============================================================ */

const TIERS = [
  { name: 'Standard', fee: 0.50, from: 0,      perTx: 1000,  daily: 2500,  weekly: 5000 },
  { name: 'Trusted',  fee: 0.35, from: 1000,   perTx: 2500,  daily: 6000,  weekly: 15000 },
  { name: 'Regular',  fee: 0.22, from: 5000,   perTx: 5000,  daily: 15000, weekly: 40000 },
  { name: 'Insider',  fee: 0.12, from: 25000,  perTx: 10000, daily: 30000, weekly: 100000 },
  { name: 'Founder',  fee: 0.04, from: 100000, perTx: 25000, daily: 75000, weekly: 250000 }
];

// Lifetime volume = the sum of settled transfers. Auditable in Activity, by design.
function lifetimeVolume() {
  return money(receipts.filter(r => r.status === 'delivered').reduce((s, r) => s + (r.amount || 0), 0));
}

function tierStatus() {
  const vol = lifetimeVolume();
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) if (vol >= TIERS[i].from) idx = i;
  const cur = TIERS[idx], next = TIERS[idx + 1] || null;
  const progress = next ? Math.max(0, Math.min(1, (vol - cur.from) / (next.from - cur.from))) : 1;
  return { idx, cur, next, progress, vol, num: idx + 1 };
}

function currentFeePct() { return tierStatus().cur.fee; }

function windowVolume(ms) {
  const since = Date.now() - ms;
  return money(receipts.filter(r => r.ts >= since && r.status !== 'failed' && r.type !== 'errand')
                       .reduce((s, r) => s + (r.amount || 0), 0));
}

function limitStatus() {
  const t = tierStatus().cur;
  const day = windowVolume(24 * 3600e3), week = windowVolume(7 * 24 * 3600e3);
  return {
    perTx: t.perTx,
    daily: t.daily, dailyUsed: day, dailyLeft: money(Math.max(0, t.daily - day)),
    weekly: t.weekly, weeklyUsed: week, weeklyLeft: money(Math.max(0, t.weekly - week))
  };
}

// Fee saved versus the 0.50% base rate, recomputed from receipts (never a stored claim).
function totalFeeSaved() {
  return money(receipts.filter(r => r.status === 'delivered').reduce((s, r) => {
    return s + Math.max(0, money((r.amount || 0) * 0.005) - (r.sendFee || 0));
  }, 0));
}

/* ============================================================ *
 * 8. Small DOM helpers
 * ============================================================ */

function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function shortAddr(a) {
  const s = String(a || '');
  return s.length > 18 ? s.slice(0, 6) + '…' + s.slice(-4) : s;
}
function relTime(ts) {
  const d = Date.now() - ts;
  if (d < 60e3) return 'just now';
  if (d < 3600e3) return Math.floor(d / 60e3) + 'm ago';
  if (d < 86400e3) return Math.floor(d / 3600e3) + 'h ago';
  if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + 'd ago';
  return new Date(ts).toLocaleDateString();
}
function setStatus(msg) { const s = el('status'); if (s) s.textContent = msg; }

let toastTimer;
function toast(msg) {
  const t = el('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

// Locally generated, correctly shaped, and broadcast nowhere.
function makeHash(seed, chain) {
  const h1 = keccakHex('stablelink:' + seed);
  if (chain === 'base') return '0x' + h1;
  const h2 = keccakHex('stablelink:sig:' + seed);
  const bytes = new Uint8Array(64);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(h1.substr(i * 2, 2), 16);
  for (let i = 0; i < 32; i++) bytes[32 + i] = parseInt(h2.substr(i * 2, 2), 16);
  return base58Encode(bytes);
}

/* ============================================================ *
 * 9. Navigation
 * ============================================================ */

const TABS = [
  { id: 'send',      label: 'Send' },
  { id: 'history',   label: 'Activity' },
  { id: 'errands',   label: 'Errands' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'settings',  label: 'Settings' }
];
let activeTab = 'send';

function renderNav() {
  const nav = el('nav');
  if (!nav) return;
  nav.innerHTML = TABS.map(t => {
    const badge = t.id === 'scheduled' && schedules.filter(s => s.active).length
      ? `<span class="tab-dot">${schedules.filter(s => s.active).length}</span>` : '';
    return `<button class="${t.id === activeTab ? 'on' : ''}" onclick="showTab('${t.id}')">${t.label}${badge}</button>`;
  }).join('');
}

function showTab(id) {
  activeTab = id;
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  const sec = el(id);
  if (sec) sec.classList.remove('hidden');
  renderNav();
  if (id === 'history') renderHistory();
  if (id === 'errands') renderErrands();
  if (id === 'scheduled') renderSchedules();
  if (id === 'settings') { renderFeeTable(); renderFxTable(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showSend() { showTab('send'); }
function showSettings() { showTab('settings'); }
function scrollToFees() {
  const f = el('fee-schedule');
  if (f) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ============================================================ *
 * 10. Sheets
 * ============================================================ */

let sheetOnClose = null;
function openSheet(title, bodyHtml, onClose) {
  el('sheet-title').textContent = title;
  el('sheet-body').innerHTML = bodyHtml;
  el('sheet').classList.remove('hidden');
  el('scrim').classList.remove('hidden');
  requestAnimationFrame(() => el('sheet').classList.add('up'));
  sheetOnClose = onClose || null;
}
function closeSheet() {
  const s = el('sheet');
  s.classList.remove('up');
  el('scrim').classList.add('hidden');
  setTimeout(() => s.classList.add('hidden'), 180);
  if (sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(); }
}

/* ============================================================ *
 * 11. Header rendering
 * ============================================================ */

let balOpen = false;
function toggleBalanceBreakdown() {
  balOpen = !balOpen;
  el('bal-breakdown').classList.toggle('hidden', !balOpen);
  el('bal-caret').textContent = balOpen ? '▴' : '▾';
  document.querySelector('.bal-main').setAttribute('aria-expanded', String(balOpen));
}

function renderBalances() {
  el('balance').textContent = fmtT(totalBalance());
  el('total-saved').textContent = fmt(totalFeeSaved());
  el('personal-rate').textContent = currentFeePct().toFixed(2) + '%';

  const rows = [];
  for (const c of Object.keys(CHAINS)) for (const t of TOKENS) {
    const v = avail(c, t);
    rows.push({ c, t, v });
  }
  rows.sort((a, b) => b.v - a.v);
  el('bal-breakdown').innerHTML = rows.map(r => `
    <button class="bal-row" onclick="pickBucket('${r.c}','${r.t}')">
      <span class="bal-row-l"><span class="chip-chain ${r.c}">${CHAINS[r.c].short}</span> ${r.t}</span>
      <span class="bal-row-r ${r.v > 0 ? '' : 'zero'}">${fmtT(r.v)}</span>
    </button>`).join('') +
    `<div class="bal-note">Balances are per network. Moving value between networks needs a bridge, which this demo does not simulate.</div>`;
  renderTier();
}

function pickBucket(chain, token) {
  el('chain').value = chain;
  el('token').value = token;
  onFormChange();
  showTab('send');
  toast(`Sending from ${CHAINS[chain].name} · ${token}`);
}

let _lastTierIdx = null;
function renderTier() {
  const st = tierStatus();
  el('tier-name').textContent = `Tier ${st.num} · ${st.cur.name} — ${st.cur.fee.toFixed(2)}%`;
  const nextBtn = el('tier-next');
  const fill = el('tier-fill');
  const hint = el('tier-hint');

  if (st.next) {
    nextBtn.textContent = `next ${st.next.fee.toFixed(2)}% ›`;
    fill.style.width = (st.progress * 100).toFixed(0) + '%';
    const need = money(st.next.from - st.vol);
    hint.innerHTML = `${fmt(st.vol)} sent lifetime · <strong>${fmt(need)}</strong> more to ${esc(st.next.name)} (${st.next.fee.toFixed(2)}%).`;
  } else {
    nextBtn.textContent = 'top tier ›';
    fill.style.width = '100%';
    hint.innerHTML = `${fmt(st.vol)} sent lifetime · lowest published rate reached.`;
  }
  if (_lastTierIdx !== null && st.idx > _lastTierIdx) {
    fill.classList.remove('tier-drop'); void fill.offsetWidth; fill.classList.add('tier-drop');
  }
  _lastTierIdx = st.idx;
}

/* ============================================================ *
 * 12. Send form — live quote
 * ============================================================ */

// Always resolve to a chain/token we actually support, so a stale or empty
// select value can never take the form down.
function currentChain() {
  const v = el('chain') ? el('chain').value : '';
  return CHAINS[v] ? v : 'sol';
}
function currentToken() {
  const v = el('token') ? el('token').value : '';
  return TOKENS.indexOf(v) >= 0 ? v : 'USDC';
}

// The currency actually used to pay a recipient. Errand payouts settle in USD.
function payoutCcyFor(isErrand) { return isErrand ? 'USD' : payoutCcy; }

function onFormChange() {
  const chain = currentChain(), token = currentToken();
  el('chain-note').textContent =
    `${CHAINS[chain].name}: ~${CHAINS[chain].etaSec}s typical settlement · network fee ${NETWORK_FEE[chain].toFixed(3)} ${token} (simulated) · addresses are ${CHAINS[chain].fmtName}.`;
  el('avail-line').innerHTML = `Available: <strong>${fmtT(avail(chain, token))} ${token}</strong> on ${CHAINS[chain].name}`;
  renderCcyRail();
  renderRecipientCheck();
  renderRecentChips();
  renderQuote();
}

function renderCcyRail() {
  const rail = el('ccy-rail');
  if (!rail) return;
  const isErrand = ERRAND_RE.test((el('recipient').value || '').trim());
  const cur = ccyOf(payoutCcyFor(isErrand));
  if (isErrand) { rail.innerHTML = 'Errand payouts always settle in <strong>USD</strong>.'; return; }
  if (cur.code === 'USD') { rail.innerHTML = 'Recipient keeps stablecoin — no conversion, no FX margin.'; return; }
  rail.innerHTML = `Paid out via <strong>${esc(cur.rail)}</strong> · mid-market ${fmtRate(cur.mid)} ${cur.code}/USD · ${FX_MARGIN_PCT.toFixed(2)}% margin. Illustrative fixed demo rate.`;
}

function onCcyChange() {
  const sel = el('payout-ccy');
  if (sel && CURRENCIES[sel.value]) {
    payoutCcy = sel.value;
    localStorage.setItem(LS.ccy, payoutCcy);
  }
  onFormChange();
}

function renderRecipientCheck() {
  const box = el('recipient-check');
  const raw = el('recipient').value;
  const res = validateRecipient(raw, currentChain());
  if (res.code === 'EMPTY') { box.className = 'check-line'; box.innerHTML = ''; return; }

  const known = findContact(res.normalized || raw);
  const sentBefore = receipts.some(r => r.to === (res.normalized || raw) && r.status === 'delivered');
  let extra = '';
  if (res.ok && known) {
    extra = `<div class="check-sub">Saved as <strong>${esc(known.alias)}</strong>${sentBefore ? ' · sent before' : ''}</div>`;
  } else if (res.ok && res.kind === 'address' && !sentBefore) {
    extra = `<div class="check-sub warn">First transfer to this address. Sending a small test amount first is standard practice.</div>`;
  }
  box.className = 'check-line ' + res.level;
  box.innerHTML = `<span class="check-icon">${res.level === 'ok' ? '✓' : res.level === 'warn' ? '!' : '✕'}</span>
    <div><div>${esc(res.msg)}</div>${extra}
    ${res.fix ? `<button class="link-btn" onclick="applyFix('${res.fix.action}')">${esc(res.fix.label)}</button>` : ''}</div>`;
}

function applyFix(action) {
  if (action.startsWith('switchTo:')) {
    el('chain').value = action.split(':')[1];
    onFormChange();
    toast('Network switched to ' + CHAINS[currentChain()].name);
  }
}

let fxOpen = false;
function toggleFx() {
  fxOpen = !fxOpen;
  const b = el('fx-detail'), c = el('fx-caret');
  if (b) b.classList.toggle('hidden', !fxOpen);
  if (c) c.textContent = fxOpen ? '▴' : '▾';
}

// Transparent FX breakdown, shared by the quote and the review sheet.
function fxBreakdownHtml(fx, usd) {
  const c = fx.cur;
  return `
    <div class="q-line"><span>Amount to convert</span><span>${fmt(usd)} USD</span></div>
    <div class="q-line"><span>Mid-market rate</span><span>1 USD = ${fmtRate(fx.mid)} ${c.code}</span></div>
    <div class="q-line"><span>FX margin · ${fx.marginPct.toFixed(2)}%</span><span>−${fmt(fx.marginCostUsd)} USD</span></div>
    <div class="q-line"><span>Your locked rate</span><span>1 USD = ${fmtRate(fx.rate)} ${c.code}</span></div>
    <div class="q-line total"><span>Recipient receives</span><span>${fmtLocal(fx.local, c)}</span></div>
    <div class="fx-disclose">Fixed illustrative demo rate — not a live market quote. Payout rail: ${esc(c.rail)}.</div>`;
}

function renderQuote() {
  const amt = parseFloat(el('amount').value) || 0;
  const chain = currentChain(), token = currentToken();
  const isErrand = ERRAND_RE.test((el('recipient').value || '').trim());
  const feePct = isErrand ? 0.50 : currentFeePct();
  const f = computeFlow(amt, feePct, chain);
  const t = tierStatus();
  const fx = fxQuote(f.recipientGets, payoutCcyFor(isErrand));

  const receiveBig = fx.isUSD
    ? `${fmt(f.recipientGets)} ${token}`
    : `${fmtLocal(fx.local, fx.cur)}`;
  const receiveSub = fx.isUSD ? '' :
    `<span class="q-sub">≈ ${fmt(f.recipientGets)} ${token} · ${fmtRate(fx.rate)} ${fx.cur.code}/USD</span>`;

  const fxBlock = fx.isUSD ? '' : `
    <button type="button" class="fx-toggle" onclick="toggleFx()" aria-expanded="${fxOpen}">
      <span>Exchange rate &amp; margin</span>
      <span class="fx-caret" id="fx-caret">${fxOpen ? '▴' : '▾'}</span>
    </button>
    <div id="fx-detail" class="quote-lines fx-lines ${fxOpen ? '' : 'hidden'}">${fxBreakdownHtml(fx, f.recipientGets)}</div>`;

  el('quote').innerHTML = `
    <div class="quote-head">
      <div><span class="q-label">You send</span><span class="q-big">${fmt(f.amount)} ${token}</span></div>
      <div class="q-arrow">→</div>
      <div class="q-right"><span class="q-label">They receive</span><span class="q-big gold">${receiveBig}</span>${receiveSub}</div>
    </div>
    <div class="quote-lines">
      <div class="q-line"><span>Amount</span><span>${fmt(f.amount)} ${token}</span></div>
      <div class="q-line"><span>${isErrand ? 'Errand fee' : 'Send fee'} · ${f.feePct.toFixed(2)}%${isErrand ? ' flat' : ` · Tier ${t.num}`}</span><span>−${fmt(f.sendFee)} ${token}</span></div>
      <div class="q-line"><span>Network fee · ${CHAINS[chain].name}</span><span>+${f.networkFee.toFixed(3)} ${token}</span></div>
      <div class="q-line total"><span>Total debited</span><span>${fmtT(f.totalDebit)} ${token}</span></div>
    </div>
    ${fxBlock}
    <div class="quote-foot">Arrives in ~${CHAINS[chain].etaSec}s · quoted ${new Date().toLocaleTimeString()} · ${fx.isUSD ? 'stablecoin, no FX conversion applied' : `rate locked ${Math.round(FX_LOCK_MS / 60e3)} min on confirm`}</div>`;
}

function fillMax() {
  const chain = currentChain(), token = currentToken();
  const max = money(Math.max(0, q3(avail(chain, token) - NETWORK_FEE[chain])));
  const cap = limitStatus();
  const capped = money(Math.min(max, cap.perTx, cap.dailyLeft, cap.weeklyLeft));
  el('amount').value = capped.toFixed(2);
  onFormChange();
  if (capped < max) toast('Capped by your Tier ' + tierStatus().num + ' limit');
}

/* ============================================================ *
 * 13. Preflight → review
 * ============================================================ */

function showFormError(html) {
  const b = el('form-error');
  b.classList.remove('hidden');
  b.innerHTML = html;
}
function clearFormError() { el('form-error').classList.add('hidden'); }

function preflight() {
  const chain = currentChain(), token = currentToken();
  const raw = (el('recipient').value || '').trim();
  const amt = money(parseFloat(el('amount').value) || 0);

  if (!(amt > 0)) {
    return { err: { msg: 'Enter an amount greater than zero.', title: 'No amount yet' } };
  }
  const rec = validateRecipient(raw, chain);
  if (!rec.ok) {
    return { err: {
      title: rec.code === 'CHECKSUM' ? 'This address has a typo'
           : rec.code === 'WRONG_NETWORK' ? 'Wrong network for this address'
           : 'Recipient address is not valid',
      msg: rec.msg, fix: rec.fix } };
  }

  const isErrand = rec.kind === 'errand';
  const feePct = isErrand ? 0.50 : currentFeePct();
  const f = computeFlow(amt, feePct, chain);
  const have = avail(chain, token);

  if (f.totalDebit > have) {
    const other = bestAlternative(token, f.totalDebit, chain);
    return { err: {
      title: `Not enough ${token} on ${CHAINS[chain].name}`,
      msg: `This transfer needs ${fmtT(f.totalDebit)} ${token} (${fmt(f.amount)} plus the ${f.networkFee.toFixed(3)} network fee) and you hold ${fmtT(have)}.`,
      fix: other
        ? { label: `Switch to ${CHAINS[other].name} (${fmtT(avail(other, token))} ${token})`, action: 'switchTo:' + other }
        : { label: 'Use your maximum (' + fmt(money(Math.max(0, q3(have - f.networkFee)))) + ')', action: 'useMax' } } };
  }

  const lim = limitStatus();
  const t = tierStatus();
  if (!isErrand && f.amount > lim.perTx) {
    return { err: {
      title: 'Above your per-transfer limit',
      msg: `Tier ${t.num} · ${t.cur.name} allows ${fmt(lim.perTx)} per transfer. ${t.next ? `Reaching ${t.next.name} at ${fmt(t.next.from)} lifetime volume raises it to ${fmt(t.next.perTx)}.` : ''}`,
      fix: { label: `Send ${fmt(lim.perTx)} instead`, action: 'setAmount:' + lim.perTx } } };
  }
  if (!isErrand && f.amount > lim.dailyLeft) {
    return { err: {
      title: 'Above your remaining daily limit',
      msg: `You have ${fmt(lim.dailyLeft)} left of your ${fmt(lim.daily)} rolling 24-hour limit (${fmt(lim.dailyUsed)} already sent).`,
      fix: lim.dailyLeft > 0 ? { label: `Send ${fmt(lim.dailyLeft)} instead`, action: 'setAmount:' + lim.dailyLeft } : null } };
  }
  if (!isErrand && f.amount > lim.weeklyLeft) {
    return { err: {
      title: 'Above your remaining weekly limit',
      msg: `You have ${fmt(lim.weeklyLeft)} left of your ${fmt(lim.weekly)} rolling 7-day limit.`,
      fix: lim.weeklyLeft > 0 ? { label: `Send ${fmt(lim.weeklyLeft)} instead`, action: 'setAmount:' + lim.weeklyLeft } : null } };
  }

  return { ok: true, flow: f, chain, token, to: rec.normalized, rec, isErrand,
           memo: (el('memo').value || '').trim() };
}

function bestAlternative(token, need, notChain) {
  let best = null;
  for (const c of Object.keys(CHAINS)) {
    if (c === notChain) continue;
    if (avail(c, token) >= need + NETWORK_FEE[c] && (!best || avail(c, token) > avail(best, token))) best = c;
  }
  return best;
}

function applyErrFix(action) {
  if (action === 'useMax') { fillMax(); clearFormError(); return; }
  if (action.startsWith('setAmount:')) {
    el('amount').value = money(parseFloat(action.split(':')[1])).toFixed(2);
    onFormChange(); clearFormError(); return;
  }
  applyFix(action); clearFormError();
}

function openReview() {
  const p = preflight();
  if (p.err) {
    showFormError(`<div class="err-title">${esc(p.err.title)}</div>
      <div>${esc(p.err.msg)}</div>
      ${p.err.fix ? `<button class="link-btn" onclick="applyErrFix('${p.err.fix.action}')">${esc(p.err.fix.label)}</button>` : ''}`);
    el('form-error').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  clearFormError();
  const fx = fxQuote(p.flow.recipientGets, payoutCcyFor(p.isErrand));
  p.fx = fx;
  p.rateLockUntil = Date.now() + FX_LOCK_MS;
  pendingFlow = p;

  const f = p.flow, C = CHAINS[p.chain];
  const known = findContact(p.to);
  const firstTime = !receipts.some(r => r.to === p.to && r.status === 'delivered');
  const warns = [];
  if (firstTime && !p.isErrand) {
    warns.push(`First transfer to this address. Consider sending a small test amount first — on-chain transfers cannot be reversed or recalled.`);
  }
  if (p.rec.code === 'NO_CHECKSUM') warns.push(p.rec.msg);
  if (p.isErrand) warns.push('Errand payouts use the flat 0.50% rate; your loyalty discount applies to personal sends only.');

  openSheet('Review transfer', `
    <div class="rv-hero">
      <div class="rv-amt">${fmt(f.amount)} <span>${p.token}</span></div>
      <div class="rv-to">to ${known ? `<strong>${esc(known.alias)}</strong>` : ''}
        <span class="mono">${esc(shortAddr(p.to))}</span>
        <span class="chip-chain ${p.chain}">${C.short}</span></div>
    </div>

    <div class="rv-receive">
      <span>They receive</span>
      <strong>${fx.isUSD ? `${fmt(f.recipientGets)} ${p.token}` : fmtLocal(fx.local, fx.cur)}</strong>
      ${fx.isUSD ? '' : `<span class="rv-receive-sub">${fx.cur.flag} via ${esc(fx.cur.rail)} · ≈ ${fmt(f.recipientGets)} ${p.token}</span>`}
    </div>

    <div class="quote-lines rv-lines">
      <div class="q-line"><span>Amount</span><span>${fmt(f.amount)} ${p.token}</span></div>
      <div class="q-line"><span>${p.isErrand ? 'Errand fee' : 'Send fee'} · ${f.feePct.toFixed(2)}%</span><span>−${fmt(f.sendFee)} ${p.token}</span></div>
      <div class="q-line"><span>Network fee · ${C.name}</span><span>+${f.networkFee.toFixed(3)} ${p.token}</span></div>
      <div class="q-line total"><span>Total debited</span><span>${fmtT(f.totalDebit)} ${p.token}</span></div>
      <div class="q-line sub"><span>Balance after</span><span>${fmtT(q3(avail(p.chain, p.token) - f.totalDebit))} ${p.token}</span></div>
      <div class="q-line sub"><span>Estimated arrival</span><span>~${C.etaSec}s</span></div>
      ${p.memo ? `<div class="q-line sub"><span>Reference</span><span>${esc(p.memo)}</span></div>` : ''}
      ${currentVoice && currentVoice.transcript ? `<div class="q-line sub"><span>Heard</span><span>“${esc(currentVoice.transcript)}”</span></div>` : ''}
    </div>

    ${fx.isUSD ? '' : `
    <div class="rv-fx">
      <div class="rv-fx-head">
        <span>Exchange rate</span>
        <span class="rv-fx-lock" id="rv-fx-lock">🔒 locked 10:00</span>
      </div>
      <div class="quote-lines fx-lines">${fxBreakdownHtml(fx, f.recipientGets)}</div>
    </div>`}

    ${warns.map(w => `<div class="rv-warn">${esc(w)}</div>`).join('')}

    ${!known && !p.isErrand ? `<label class="switch"><input type="checkbox" id="rv-save"> Save this recipient for next time</label>
      <input id="rv-alias" class="alias-in hidden" maxlength="24" placeholder="Name this recipient">` : ''}

    <label class="switch"><input type="checkbox" id="rv-repeat"> Repeat this transfer on a schedule</label>

    <div class="rv-quoted">Quoted ${new Date().toLocaleString()} · figures locked until you confirm or close.</div>
    <button id="confirm-btn" class="primary" disabled onclick="confirmTransfer()">Checking…</button>
    <button class="ghost-btn wide" onclick="closeSheet()">Back to edit</button>
    <div class="rv-legal">FICTIONAL DEMO · SIMULATED VIRTUAL CREDITS · NO REAL MONEY OR VALUE · nothing is broadcast to any network.</div>
  `, () => { pendingFlow = null; if (rateLockTimer) { clearInterval(rateLockTimer); rateLockTimer = null; } });

  // Rate-lock countdown. Rates are fixed, so on expiry we simply re-hold the same
  // quote and reset the clock — the number the user saw is the number they get.
  if (rateLockTimer) clearInterval(rateLockTimer);
  if (!fx.isUSD) {
    rateLockTimer = setInterval(() => {
      const lock = el('rv-fx-lock');
      if (!lock || !pendingFlow) { clearInterval(rateLockTimer); rateLockTimer = null; return; }
      let ms = pendingFlow.rateLockUntil - Date.now();
      if (ms <= 0) { pendingFlow.rateLockUntil = Date.now() + FX_LOCK_MS; ms = FX_LOCK_MS; lock.textContent = '🔄 rate refreshed · unchanged'; return; }
      const s = Math.floor(ms / 1000);
      lock.textContent = `🔒 locked ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
  }

  const save = el('rv-save');
  if (save) save.addEventListener('change', () => el('rv-alias').classList.toggle('hidden', !save.checked));

  // Deliberate one-second pause before an irreversible action can be confirmed.
  const btn = el('confirm-btn');
  let left = 1;
  btn.textContent = 'Confirm in 1s';
  const iv = setInterval(() => {
    left--;
    if (left <= 0) {
      clearInterval(iv);
      btn.disabled = false;
      btn.textContent = `Confirm and send ${fmt(f.amount)} ${p.token}`;
    }
  }, 1000);
}

/* ============================================================ *
 * 14. Settlement + status lifecycle
 * ============================================================ */

function debit(chain, token, amt) {
  const k = balKey(chain, token);
  if (q3(balances[k]) < q3(amt)) return false;
  balances[k] = q3(balances[k] - amt);
  return true;
}
function credit(chain, token, amt) {
  const k = balKey(chain, token);
  balances[k] = q3((balances[k] || 0) + amt);
}

function confirmTransfer() {
  const p = pendingFlow;
  if (!p) return;
  const f = p.flow;

  if (!flowIsSound(f)) {
    toast('Arithmetic guard tripped — nothing moved.');
    return;
  }
  // Re-check the balance at confirm time; a schedule may have fired during review.
  if (f.totalDebit > avail(p.chain, p.token)) {
    closeSheet();
    showFormError(`<div class="err-title">Balance changed while you were reviewing</div>
      <div>Your ${p.token} balance on ${CHAINS[p.chain].name} is now ${fmtT(avail(p.chain, p.token))}, which is short of the ${fmtT(f.totalDebit)} this transfer needs. Nothing was sent.</div>`);
    return;
  }

  const saveBox = el('rv-save');
  const wantsRepeat = el('rv-repeat') && el('rv-repeat').checked;
  if (saveBox && saveBox.checked) {
    const alias = (el('rv-alias').value || '').trim() || shortAddr(p.to);
    addContact(alias, p.to, p.chain);
  }

  debit(p.chain, p.token, f.totalDebit);
  vaultBalance = money(vaultBalance + f.sendFee);

  const fx = p.fx || fxQuote(f.recipientGets, payoutCcyFor(p.isErrand));
  const id = 'tx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const tx = {
    id, ts: Date.now(), type: p.isErrand ? 'errand' : 'send',
    chain: p.chain, token: p.token, to: p.to,
    amount: f.amount, sendFee: f.sendFee, networkFee: f.networkFee,
    recipientGets: f.recipientGets, totalDebit: f.totalDebit, feePct: f.feePct,
    // FX payout — omitted (null) when the recipient keeps stablecoin.
    fx: fx.isUSD ? null : { ccy: fx.cur.code, mid: fx.mid, rate: fx.rate, marginPct: fx.marginPct, marginCostUsd: fx.marginCostUsd, local: fx.local },
    memo: p.memo || '', status: 'submitted',
    hash: makeHash(id, p.chain),
    voice: currentVoice ? { transcript: currentVoice.transcript || '', ts: currentVoice.ts } : null,
    timeline: [{ status: 'submitted', ts: Date.now() }]
  };
  receipts.unshift(tx);
  saveState();
  closeSheet();

  currentVoice = null;
  el('memo').value = '';
  renderBalances();
  renderLiveTx(tx);
  runLifecycle(tx);

  if (wantsRepeat) setTimeout(() => openScheduleEditor(null, tx), 400);
}

function advance(tx, status, extra) {
  tx.status = status;
  tx.timeline.push(Object.assign({ status, ts: Date.now() }, extra || {}));
  saveState();
  renderLiveTx(tx);
  if (activeTab === 'history') renderHistory();
}

function runLifecycle(tx) {
  const C = CHAINS[tx.chain];
  const speed = options.fast ? 0.08 : 1;
  const t1 = setTimeout(() => {
    if (options.forceFail) {
      // Refund in full: an unbroadcast transfer must never leave value stranded.
      credit(tx.chain, tx.token, tx.totalDebit);
      vaultBalance = money(vaultBalance - tx.sendFee);
      advance(tx, 'failed', { reason: 'Simulated network rejection (demo control).' });
      options.forceFail = false;
      const cb = el('opt-fail'); if (cb) cb.checked = false;
      saveState();
      renderBalances();
      notify('Transfer failed', `${fmt(tx.amount)} ${tx.token} to ${labelFor(tx.to)} was not sent. Your ${fmtT(tx.totalDebit)} has been returned in full.`, tx.id);
      return;
    }
    advance(tx, 'confirming');
    const t2 = setTimeout(() => {
      advance(tx, 'delivered');
      renderBalances();
      notify('Transfer delivered', `${labelFor(tx.to)} received ${txReceived(tx)}${tx.fx ? '' : ` on ${C.name}`}.`, tx.id);
      // A settled transfer is the moment that counts as real product usage.
      if (window.legionTrack) window.legionTrack('activate');
      const before = _lastTierIdx;
      renderTier();
      if (before !== null && tierStatus().idx > before) {
        notify('Fee tier upgraded', `You reached Tier ${tierStatus().num} · ${tierStatus().cur.name}. Your send fee is now ${currentFeePct().toFixed(2)}%.`, null);
      }
    }, C.confirmMs[1] * speed);
    liveTimers.push(t2);
  }, CHAINS[tx.chain].confirmMs[0] * speed);
  liveTimers.push(t1);
}

const STATUS_META = {
  submitted:  { label: 'Submitted',  cls: 'pending', pct: 33, blurb: 'Signed and queued.' },
  confirming: { label: 'Confirming', cls: 'pending', pct: 66, blurb: 'Waiting for network confirmation.' },
  delivered:  { label: 'Delivered',  cls: 'ok',      pct: 100, blurb: 'Credited to the recipient.' },
  failed:     { label: 'Failed',     cls: 'bad',     pct: 100, blurb: 'Not sent. Funds returned.' },
  scheduled:  { label: 'Scheduled',  cls: 'pending', pct: 0,  blurb: 'Queued for a future run.' }
};

function renderLiveTx(tx) {
  const box = el('live-tx');
  if (!box) return;
  const m = STATUS_META[tx.status];
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="lt-head">
      <span class="pill ${m.cls}">${m.label}</span>
      <button class="link-btn" onclick="openTxDetail('${tx.id}')">Details</button>
    </div>
    <div class="lt-main">${fmt(tx.amount)} ${tx.token} → ${esc(labelFor(tx.to))}</div>
    <div class="lt-bar"><div class="lt-fill ${m.cls}" style="width:${m.pct}%"></div></div>
    <div class="lt-sub">${esc(m.blurb)} ${tx.status === 'delivered'
      ? `${esc(labelFor(tx.to))} received <strong>${txReceived(tx)}</strong>.`
      : tx.status === 'failed' ? `<strong>${fmtT(tx.totalDebit)} ${tx.token}</strong> returned to your balance.`
      : `Estimated arrival ~${CHAINS[tx.chain].etaSec}s.`}</div>
    ${tx.status === 'failed' ? `<button class="ghost-btn" onclick="repeatTx('${tx.id}')">Try again</button>` : ''}
    ${tx.status === 'delivered' ? `<button class="ghost-btn" onclick="openReceipt('${tx.id}')">Receipt</button>
       <button class="ghost-btn" onclick="repeatTx('${tx.id}')">Send again</button>` : ''}`;
}

/* ============================================================ *
 * 15. Contacts
 * ============================================================ */

function findContact(addr) { return contacts.find(c => c.addr === addr) || null; }
function labelFor(addr) {
  const c = findContact(addr);
  return c ? c.alias : shortAddr(addr);
}
function addContact(alias, addr, chain) {
  if (findContact(addr)) return;
  contacts.unshift({ alias, addr, chain, added: Date.now() });
  saveState();
  toast(`Saved ${alias}`);
}

function renderRecentChips() {
  const box = el('recent-chips');
  const seen = new Set();
  const recents = [];
  for (const r of receipts) {
    if (r.status !== 'delivered' || seen.has(r.to)) continue;
    seen.add(r.to);
    recents.push(r);
    if (recents.length >= 4) break;
  }
  if (!recents.length && !contacts.length) { box.innerHTML = ''; return; }
  const items = recents.length ? recents : contacts.slice(0, 4).map(c => ({ to: c.addr, chain: c.chain }));
  box.innerHTML = items.map(r =>
    `<button class="chip" onclick="pickRecipient('${esc(r.to)}','${r.chain}')">${esc(labelFor(r.to))}</button>`
  ).join('') + `<button class="chip ghost" onclick="openContacts()">All ›</button>`;
}

function pickRecipient(addr, chain) {
  if (chain && CHAINS[chain]) el('chain').value = chain;
  el('recipient').value = addr;
  onFormChange();
  clearFormError();
}

function openContacts() {
  const list = contacts.length
    ? contacts.map((c, i) => `
        <div class="ct-row">
          <button class="ct-pick" onclick="pickRecipient('${esc(c.addr)}','${c.chain}');closeSheet()">
            <span class="ct-alias">${esc(c.alias)}</span>
            <span class="ct-addr mono">${esc(shortAddr(c.addr))} <span class="chip-chain ${c.chain}">${CHAINS[c.chain] ? CHAINS[c.chain].short : ''}</span></span>
          </button>
          <button class="icon-btn" onclick="removeContact(${i})" aria-label="Remove">✕</button>
        </div>`).join('')
    : `<div class="empty">No saved recipients yet. You can save one from the review screen before confirming a transfer.</div>`;

  openSheet('Saved recipients', list + `
    <div class="ct-add">
      <input id="ct-alias" maxlength="24" placeholder="Name">
      <input id="ct-addr" placeholder="Address" spellcheck="false">
      <select id="ct-chain">${Object.values(CHAINS).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
      <button class="ghost-btn" onclick="addContactFromSheet()">Add recipient</button>
      <div id="ct-err" class="ct-err"></div>
    </div>`);
}

function addContactFromSheet() {
  const alias = (el('ct-alias').value || '').trim();
  const addr = (el('ct-addr').value || '').trim();
  const chain = el('ct-chain').value;
  const errBox = el('ct-err');
  if (!alias) { errBox.textContent = 'Give this recipient a name so you can recognise it later.'; return; }
  const res = validateRecipient(addr, chain);
  if (!res.ok) { errBox.textContent = res.msg; return; }
  addContact(alias, res.normalized, chain);
  closeSheet();
  openContacts();
}

function removeContact(i) {
  contacts.splice(i, 1);
  saveState();
  closeSheet();
  openContacts();
  renderRecentChips();
}

/* ============================================================ *
 * 16. Activity — filters, list, detail, receipt, export
 * ============================================================ */

let filters = { q: '', range: 'all', from: '', to: '', type: 'all', status: 'all', chain: 'all', token: 'all', min: '', max: '' };
let filtersOpen = false;

function toggleFilters() {
  filtersOpen = !filtersOpen;
  el('filters').classList.toggle('hidden', !filtersOpen);
  if (filtersOpen) renderFilters();
}

function renderFilters() {
  const seg = (name, opts) => `<div class="seg">${opts.map(o =>
    `<button class="${filters[name] === o[0] ? 'on' : ''}" onclick="setFilter('${name}','${o[0]}')">${o[1]}</button>`).join('')}</div>`;

  el('filters').innerHTML = `
    <input id="f-q" class="f-search" placeholder="Search name, address, reference, or hash" value="${esc(filters.q)}" oninput="setFilter('q',this.value)">
    <div class="f-label">Date</div>
    ${seg('range', [['all', 'All'], ['7', '7d'], ['30', '30d'], ['90', '90d'], ['custom', 'Custom']])}
    ${filters.range === 'custom' ? `<div class="f-dates">
      <input type="date" id="f-from" value="${filters.from}" onchange="setFilter('from',this.value)">
      <span>→</span>
      <input type="date" id="f-to" value="${filters.to}" onchange="setFilter('to',this.value)">
    </div>` : ''}
    <div class="f-label">Type</div>
    ${seg('type', [['all', 'All'], ['send', 'Sends'], ['errand', 'Errands'], ['scheduled', 'Scheduled']])}
    <div class="f-label">Status</div>
    ${seg('status', [['all', 'All'], ['delivered', 'Delivered'], ['pending', 'In flight'], ['failed', 'Failed']])}
    <div class="f-label">Network / token</div>
    ${seg('chain', [['all', 'All']].concat(Object.values(CHAINS).map(c => [c.id, c.name])))}
    ${seg('token', [['all', 'All']].concat(TOKENS.map(t => [t, t])))}
    <div class="f-label">Amount</div>
    <div class="f-amt">
      <input type="number" placeholder="Min" value="${filters.min}" oninput="setFilter('min',this.value)">
      <span>–</span>
      <input type="number" placeholder="Max" value="${filters.max}" oninput="setFilter('max',this.value)">
    </div>
    <button class="ghost-btn wide" onclick="resetFilters()">Clear filters</button>`;
}

function setFilter(k, v) {
  filters[k] = v;
  const needsRerender = (k !== 'q' && k !== 'min' && k !== 'max');
  if (needsRerender) renderFilters();
  renderHistory(false);
  if (k === 'q') { const i = el('f-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
}

function resetFilters() {
  filters = { q: '', range: 'all', from: '', to: '', type: 'all', status: 'all', chain: 'all', token: 'all', min: '', max: '' };
  renderFilters();
  renderHistory(false);
}

function filteredReceipts() {
  const q = filters.q.trim().toLowerCase();
  return receipts.filter(r => {
    if (filters.chain !== 'all' && r.chain !== filters.chain) return false;
    if (filters.token !== 'all' && r.token !== filters.token) return false;
    if (filters.type !== 'all') {
      if (filters.type === 'scheduled' ? !r.scheduleId : r.type !== filters.type) return false;
    }
    if (filters.status !== 'all') {
      if (filters.status === 'pending') { if (r.status !== 'submitted' && r.status !== 'confirming') return false; }
      else if (r.status !== filters.status) return false;
    }
    if (filters.range !== 'all') {
      if (filters.range === 'custom') {
        if (filters.from && r.ts < new Date(filters.from + 'T00:00:00').getTime()) return false;
        if (filters.to && r.ts > new Date(filters.to + 'T23:59:59').getTime()) return false;
      } else if (r.ts < Date.now() - parseInt(filters.range, 10) * 86400e3) return false;
    }
    if (filters.min !== '' && r.amount < parseFloat(filters.min)) return false;
    if (filters.max !== '' && r.amount > parseFloat(filters.max)) return false;
    if (q) {
      const hay = [r.to, labelFor(r.to), r.memo, r.hash, r.token, r.type].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderHistory(rerenderFilters = true) {
  if (rerenderFilters && filtersOpen) renderFilters();
  const rows = filteredReceipts();
  const active = Object.entries(filters).filter(([k, v]) => v && v !== 'all' && v !== '').length;
  el('filter-toggle').textContent = active ? `Filters · ${active}` : 'Filters';

  const sum = money(rows.filter(r => r.status === 'delivered').reduce((s, r) => s + r.amount, 0));
  const fees = money(rows.filter(r => r.status === 'delivered').reduce((s, r) => s + r.sendFee, 0));
  el('hist-summary').innerHTML = `
    <div class="hs-item"><span>${rows.length}</span>transfers</div>
    <div class="hs-item"><span>${fmt(sum)}</span>sent</div>
    <div class="hs-item"><span>${fmt(fees)}</span>fees paid</div>
    <div class="hs-item"><span>${fmt(totalFeeSaved())}</span>saved vs 0.50%</div>`;

  if (!rows.length) {
    el('hist-list').innerHTML = `<div class="empty">${receipts.length
      ? 'No transfers match these filters.'
      : 'No transfers yet. Your first send will appear here with its full receipt.'}</div>`;
    return;
  }

  el('hist-list').innerHTML = rows.slice(0, 60).map(r => {
    const m = STATUS_META[r.status] || STATUS_META.delivered;
    return `<button class="hist-row" onclick="openTxDetail('${r.id}')">
      <span class="hr-icon ${m.cls}">${r.status === 'failed' ? '!' : r.type === 'errand' ? '⇄' : '↑'}</span>
      <span class="hr-mid">
        <span class="hr-top">${esc(labelFor(r.to))}${r.scheduleId ? ' <span class="tag">auto</span>' : ''}${r.type === 'errand' ? ' <span class="tag">errand</span>' : ''}</span>
        <span class="hr-sub">${relTime(r.ts)} · ${CHAINS[r.chain] ? CHAINS[r.chain].name : r.chain}${r.memo ? ' · ' + esc(r.memo) : ''}</span>
      </span>
      <span class="hr-right">
        <span class="hr-amt">−${fmtT(r.totalDebit)}</span>
        <span class="pill sm ${m.cls}">${m.label}</span>
      </span>
    </button>`;
  }).join('') + (rows.length > 60 ? `<div class="empty sm">Showing the 60 most recent of ${rows.length} matches. Narrow the filters or export to see them all.</div>` : '');
}

function txById(id) { return receipts.find(r => r.id === id); }

// What the recipient actually got — local currency if converted, else stablecoin.
function txReceived(r) {
  if (r.fx && CURRENCIES[r.fx.ccy]) return fmtLocal(r.fx.local, CURRENCIES[r.fx.ccy]);
  return `${fmt(r.recipientGets)} ${r.token}`;
}
// FX detail rows for a settled transfer (empty when no conversion happened).
function txFxLines(r) {
  if (!r.fx || !CURRENCIES[r.fx.ccy]) return '';
  const c = CURRENCIES[r.fx.ccy];
  return `<div class="q-line"><span>Mid-market rate</span><span>1 USD = ${fmtRate(r.fx.mid)} ${c.code}</span></div>
    <div class="q-line"><span>FX margin · ${(r.fx.marginPct || 0).toFixed(2)}%</span><span>−${fmt(r.fx.marginCostUsd)} USD</span></div>
    <div class="q-line"><span>Locked rate</span><span>1 USD = ${fmtRate(r.fx.rate)} ${c.code}</span></div>`;
}

function openTxDetail(id) {
  const r = txById(id);
  if (!r) return;
  const C = CHAINS[r.chain] || { name: r.chain, short: r.chain };
  const m = STATUS_META[r.status];

  const timeline = ['submitted', 'confirming', 'delivered'].map(s => {
    const hit = r.timeline.find(t => t.status === s);
    const failed = r.status === 'failed';
    const done = !!hit;
    return `<div class="tl-step ${done ? 'done' : ''} ${failed && !done ? 'skipped' : ''}">
      <span class="tl-dot"></span>
      <span class="tl-label">${STATUS_META[s].label}</span>
      <span class="tl-time">${hit ? new Date(hit.ts).toLocaleTimeString() : failed ? 'not reached' : 'pending'}</span>
    </div>`;
  }).join('') + (r.status === 'failed' ? `<div class="tl-step done fail">
      <span class="tl-dot"></span><span class="tl-label">Failed</span>
      <span class="tl-time">${new Date(r.timeline[r.timeline.length - 1].ts).toLocaleTimeString()}</span></div>` : '');

  const failReason = r.status === 'failed'
    ? `<div class="rv-warn">${esc((r.timeline.find(t => t.reason) || {}).reason || 'Not sent.')} The full ${fmtT(r.totalDebit)} ${r.token} was returned to your ${C.name} balance — no fee was kept.</div>` : '';

  openSheet('Transfer details', `
    <div class="rv-hero">
      <div class="rv-amt">${fmt(r.amount)} <span>${r.token}</span></div>
      <div class="rv-to">to ${esc(labelFor(r.to))} <span class="chip-chain ${r.chain}">${C.short}</span></div>
      <span class="pill ${m.cls}">${m.label}</span>
    </div>
    ${failReason}
    <div class="tl">${timeline}</div>
    <div class="quote-lines rv-lines">
      <div class="q-line"><span>Send fee · ${(r.feePct || 0).toFixed(2)}%</span><span>${fmt(r.sendFee)} ${r.token}</span></div>
      <div class="q-line"><span>Network fee</span><span>${(r.networkFee || 0).toFixed(3)} ${r.token}</span></div>
      <div class="q-line"><span>${r.fx ? 'Converted from' : 'Recipient receives'}</span><span>${fmt(r.recipientGets)} ${r.token}</span></div>
      ${txFxLines(r)}
      <div class="q-line total"><span>Recipient receives</span><span>${txReceived(r)}</span></div>
      <div class="q-line sub"><span>Total debited</span><span>${fmtT(r.totalDebit)} ${r.token}</span></div>
    </div>
    <div class="kv">
      <div><span>Date</span><span>${new Date(r.ts).toLocaleString()}</span></div>
      <div><span>Type</span><span>${r.type === 'errand' ? 'Errand payout' : 'Personal send'}${r.scheduleId ? ' · scheduled' : ''}</span></div>
      <div><span>Network</span><span>${C.name}</span></div>
      <div><span>To</span><span class="mono wrap">${esc(r.to)}</span></div>
      ${r.memo ? `<div><span>Reference</span><span>${esc(r.memo)}</span></div>` : ''}
      ${r.voice && r.voice.transcript ? `<div><span>Voice input</span><span>“${esc(r.voice.transcript)}”</span></div>` : ''}
      <div><span>Transaction ID</span><span class="mono wrap">${esc(r.hash)}</span></div>
    </div>
    <div class="sim-note">This identifier was generated on your device in the correct shape for ${C.name}. It exists on no real chain, so there is no explorer to open.</div>
    <div class="row-btns">
      <button class="ghost-btn" onclick="copyText('${esc(r.hash)}')">Copy ID</button>
      <button class="ghost-btn" onclick="openReceipt('${r.id}')">Receipt</button>
      <button class="ghost-btn" onclick="repeatTx('${r.id}')">Send again</button>
    </div>`);
}

function openReceipt(id) {
  const r = txById(id);
  if (!r) return;
  const C = CHAINS[r.chain] || { name: r.chain };
  const text = receiptText(r);
  openSheet('Transfer receipt', `
    <div class="receipt-doc">
      <div class="rc-brand">StableLink</div>
      <div class="rc-title">Transfer receipt</div>
      <div class="rc-status ${STATUS_META[r.status].cls}">${STATUS_META[r.status].label}</div>
      <div class="rc-lines">
        <div><span>Date</span><span>${new Date(r.ts).toLocaleString()}</span></div>
        <div><span>To</span><span>${esc(labelFor(r.to))}</span></div>
        <div><span>Address</span><span class="mono wrap">${esc(r.to)}</span></div>
        <div><span>Network</span><span>${C.name}</span></div>
        <div><span>Amount</span><span>${fmt(r.amount)} ${r.token}</span></div>
        <div><span>Send fee (${(r.feePct || 0).toFixed(2)}%)</span><span>${fmt(r.sendFee)} ${r.token}</span></div>
        <div><span>Network fee</span><span>${(r.networkFee || 0).toFixed(3)} ${r.token}</span></div>
        ${r.fx && CURRENCIES[r.fx.ccy] ? `
        <div><span>Converted from</span><span>${fmt(r.recipientGets)} ${r.token}</span></div>
        <div><span>Mid-market rate</span><span>1 USD = ${fmtRate(r.fx.mid)} ${r.fx.ccy}</span></div>
        <div><span>FX margin (${(r.fx.marginPct || 0).toFixed(2)}%)</span><span>−${fmt(r.fx.marginCostUsd)} USD</span></div>
        <div><span>Locked rate</span><span>1 USD = ${fmtRate(r.fx.rate)} ${r.fx.ccy}</span></div>` : ''}
        <div class="rc-total"><span>Recipient received</span><span>${txReceived(r)}</span></div>
        <div><span>Total debited</span><span>${fmtT(r.totalDebit)} ${r.token}</span></div>
        ${r.memo ? `<div><span>Reference</span><span>${esc(r.memo)}</span></div>` : ''}
        <div><span>Transaction ID</span><span class="mono wrap">${esc(r.hash)}</span></div>
      </div>
      <div class="rc-foot">FICTIONAL DEMO · SIMULATED VIRTUAL CREDITS · NO REAL MONEY OR VALUE · not a financial document</div>
    </div>
    <div class="row-btns">
      <button class="ghost-btn" onclick="copyText(\`${text.replace(/`/g, '')}\`)">Copy receipt</button>
      <button class="ghost-btn" onclick="shareReceipt('${r.id}')">Share</button>
    </div>`);
}

function receiptText(r) {
  const C = CHAINS[r.chain] || { name: r.chain };
  return [
    'StableLink transfer receipt',
    new Date(r.ts).toLocaleString(),
    `To: ${labelFor(r.to)} (${r.to})`,
    `Network: ${C.name}`,
    `Amount: ${fmt(r.amount)} ${r.token}`,
    `Send fee (${(r.feePct || 0).toFixed(2)}%): ${fmt(r.sendFee)} ${r.token}`,
    `Network fee: ${(r.networkFee || 0).toFixed(3)} ${r.token}`,
    r.fx && CURRENCIES[r.fx.ccy] ? `Converted from: ${fmt(r.recipientGets)} ${r.token}` : '',
    r.fx && CURRENCIES[r.fx.ccy] ? `Mid-market rate: 1 USD = ${fmtRate(r.fx.mid)} ${r.fx.ccy}` : '',
    r.fx && CURRENCIES[r.fx.ccy] ? `FX margin (${(r.fx.marginPct || 0).toFixed(2)}%): -${fmt(r.fx.marginCostUsd)} USD` : '',
    r.fx && CURRENCIES[r.fx.ccy] ? `Locked rate: 1 USD = ${fmtRate(r.fx.rate)} ${r.fx.ccy}` : '',
    `Recipient received: ${txReceived(r)}`,
    `Total debited: ${fmtT(r.totalDebit)} ${r.token}`,
    r.memo ? `Reference: ${r.memo}` : '',
    `ID: ${r.hash}`,
    `Status: ${STATUS_META[r.status].label}`,
    'FICTIONAL DEMO — SIMULATED VIRTUAL CREDITS — NO REAL MONEY OR VALUE'
  ].filter(Boolean).join('\n');
}

function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => toast('Copied'), () => toast('Copy blocked by the browser'));
  } else toast('Copy is unavailable in this browser');
}

function shareReceipt(id) {
  const r = txById(id);
  if (!r) return;
  const text = receiptText(r);
  if (window.legionTrack) window.legionTrack('share');
  if (navigator.share) navigator.share({ title: 'StableLink receipt', text }).catch(() => {});
  else copyText(text);
}

function repeatTx(id) {
  const r = txById(id);
  if (!r) return;
  closeSheet();
  showTab('send');
  el('chain').value = r.chain;
  el('token').value = r.token;
  el('recipient').value = r.to;
  el('amount').value = r.amount.toFixed(2);
  el('memo').value = r.memo || '';
  if (r.fx && CURRENCIES[r.fx.ccy]) { payoutCcy = r.fx.ccy; localStorage.setItem(LS.ccy, payoutCcy); }
  const ccySel = el('payout-ccy'); if (ccySel) ccySel.value = payoutCcy;
  onFormChange();
  toast('Details copied into the form — review before sending.');
}

function exportHistory(kind) {
  const rows = filteredReceipts();
  let blob, name;
  if (kind === 'csv') {
    const head = ['date', 'status', 'type', 'network', 'token', 'recipient_label', 'recipient', 'amount', 'send_fee_pct', 'send_fee', 'network_fee', 'recipient_received_usd', 'payout_currency', 'fx_mid_rate', 'fx_margin_pct', 'fx_locked_rate', 'recipient_received', 'total_debited', 'reference', 'transaction_id'];
    const esq = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const body = rows.map(r => [
      new Date(r.ts).toISOString(), r.status, r.type, (CHAINS[r.chain] || {}).name || r.chain, r.token,
      labelFor(r.to), r.to, money(r.amount).toFixed(2), (r.feePct || 0).toFixed(2), money(r.sendFee).toFixed(2),
      (r.networkFee || 0).toFixed(3), money(r.recipientGets).toFixed(2),
      r.fx ? r.fx.ccy : r.token, r.fx ? r.fx.mid : '', r.fx ? (r.fx.marginPct || 0).toFixed(2) : '', r.fx ? r.fx.rate : '',
      r.fx && CURRENCIES[r.fx.ccy] ? r.fx.local.toFixed(CURRENCIES[r.fx.ccy].dp) + ' ' + r.fx.ccy : money(r.recipientGets).toFixed(2) + ' ' + r.token,
      q3(r.totalDebit).toFixed(3), r.memo || '', r.hash
    ].map(esq).join(','));
    blob = new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' });
    name = 'stablelink-activity-' + Date.now() + '.csv';
  } else {
    blob = new Blob([JSON.stringify({
      exported: new Date().toISOString(),
      filters,
      tier: tierStatus().cur.name,
      effectiveFeePct: currentFeePct(),
      fxMarginPct: FX_MARGIN_PCT,
      fxRatesNote: 'Fixed illustrative demo rates, not live market quotes.',
      lifetimeVolume: lifetimeVolume(),
      balances, vaultBalance,
      matchedTransfers: rows.length,
      transfers: rows,
      disclosure: 'FICTIONAL DEMO · SIMULATED VIRTUAL CREDITS ONLY · 18+ · NO REAL MONEY OR VALUE · transaction identifiers are locally generated and exist on no chain'
    }, null, 2)], { type: 'application/json' });
    name = 'stablelink-activity-' + Date.now() + '.json';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (window.legionTrack) window.legionTrack('share');
  toast(`Exported ${rows.length} transfers`);
}

/* ============================================================ *
 * 17. Scheduled transfers
 * ============================================================ */

const FREQS = {
  demo:    { label: 'Every 2 minutes (demo)', ms: 120e3 },
  daily:   { label: 'Daily',   ms: 86400e3 },
  weekly:  { label: 'Weekly',  ms: 7 * 86400e3 },
  monthly: { label: 'Monthly', ms: 30 * 86400e3 }
};

function openScheduleEditor(idx, seed) {
  const s = idx != null ? schedules[idx] : null;
  const src = s || seed || {};
  openSheet(s ? 'Edit schedule' : 'New schedule', `
    <label class="sh-label">Recipient</label>
    <input id="sc-to" placeholder="Address or errand ID" value="${esc(src.to || '')}" spellcheck="false">
    <div class="field-row">
      <div class="field"><label class="sh-label">Network</label>
        <select id="sc-chain">${Object.values(CHAINS).map(c => `<option value="${c.id}" ${src.chain === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
      <div class="field"><label class="sh-label">Token</label>
        <select id="sc-token">${TOKENS.map(t => `<option ${src.token === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    </div>
    <label class="sh-label">Amount</label>
    <input id="sc-amt" type="number" step="0.01" value="${src.amount != null ? money(src.amount).toFixed(2) : '25.00'}">
    <label class="sh-label">Recipient gets paid in</label>
    <select id="sc-ccy">${CCY_CODES.map(code => `<option value="${code}" ${(src.ccy || (src.fx && src.fx.ccy) || 'USD') === code ? 'selected' : ''}>${CURRENCIES[code].flag} ${code} — ${CURRENCIES[code].name}</option>`).join('')}</select>
    <label class="sh-label">Frequency</label>
    <select id="sc-freq">${Object.entries(FREQS).map(([k, v]) => `<option value="${k}" ${src.freq === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
    <label class="sh-label">Reference <span class="opt">optional</span></label>
    <input id="sc-memo" maxlength="64" value="${esc(src.memo || '')}">
    <div id="sc-err" class="ct-err"></div>
    <div class="sim-note">Each run is quoted at your fee tier on the day it executes, and it is announced in your notifications. Runs only happen while this page is open.</div>
    <button class="primary" onclick="saveSchedule(${idx != null ? idx : 'null'})">${s ? 'Save changes' : 'Create schedule'}</button>
    ${s ? `<button class="ghost-btn wide danger" onclick="deleteSchedule(${idx})">Delete schedule</button>` : ''}`);
}

function saveSchedule(idx) {
  const to = (el('sc-to').value || '').trim();
  const chain = el('sc-chain').value, token = el('sc-token').value;
  const amount = money(parseFloat(el('sc-amt').value) || 0);
  const ccySel = el('sc-ccy'); const ccy = ccySel && CURRENCIES[ccySel.value] ? ccySel.value : 'USD';
  const freq = el('sc-freq').value;
  const memo = (el('sc-memo').value || '').trim();
  const errBox = el('sc-err');

  if (!(amount > 0)) { errBox.textContent = 'Enter an amount greater than zero.'; return; }
  const res = validateRecipient(to, chain);
  if (!res.ok) { errBox.textContent = res.msg; return; }

  const rec = {
    id: idx != null ? schedules[idx].id : 'sc_' + Date.now().toString(36),
    to: res.normalized, chain, token, amount, ccy, freq, memo,
    active: idx != null ? schedules[idx].active : true,
    nextRun: idx != null && schedules[idx].freq === freq ? schedules[idx].nextRun : Date.now() + FREQS[freq].ms,
    runs: idx != null ? schedules[idx].runs : 0,
    warned: false
  };
  if (idx != null) schedules[idx] = rec; else schedules.unshift(rec);
  saveState();
  closeSheet();
  renderSchedules();
  renderNav();
  toast(idx != null ? 'Schedule updated' : 'Schedule created');
}

function deleteSchedule(idx) {
  schedules.splice(idx, 1);
  saveState(); closeSheet(); renderSchedules(); renderNav();
  toast('Schedule deleted');
}
function toggleSchedule(idx) {
  const s = schedules[idx];
  s.active = !s.active;
  if (s.active) s.nextRun = Date.now() + FREQS[s.freq].ms;
  saveState(); renderSchedules(); renderNav();
}

function renderSchedules() {
  const box = el('schedule-list');
  if (!box) return;
  if (!schedules.length) {
    box.innerHTML = `<div class="empty">No scheduled transfers. You can create one here, or tick “repeat on a schedule” while reviewing a transfer.</div>`;
    return;
  }
  box.innerHTML = schedules.map((s, i) => {
    const short = avail(s.chain, s.token) < q3(s.amount + NETWORK_FEE[s.chain]);
    const due = Math.max(0, s.nextRun - Date.now());
    return `<div class="sched ${s.active ? '' : 'off'}">
      <div class="sc-head">
        <div>
          <div class="sc-title">${fmt(s.amount)} ${s.token} → ${esc(labelFor(s.to))}</div>
          <div class="sc-sub">${FREQS[s.freq].label} · ${CHAINS[s.chain].name}${s.ccy && s.ccy !== 'USD' && CURRENCIES[s.ccy] ? ' · pays out in ' + CURRENCIES[s.ccy].flag + ' ' + s.ccy : ''}${s.memo ? ' · ' + esc(s.memo) : ''}</div>
        </div>
        <span class="pill sm ${s.active ? 'pending' : ''}">${s.active ? 'Active' : 'Paused'}</span>
      </div>
      <div class="sc-next">${s.active ? `Next run in ${fmtDuration(due)} · ${s.runs} completed` : `Paused · ${s.runs} completed`}</div>
      ${short && s.active ? `<div class="rv-warn sm">Balance is short for the next run: it needs ${fmtT(q3(s.amount + NETWORK_FEE[s.chain]))} ${s.token} on ${CHAINS[s.chain].name} and you hold ${fmtT(avail(s.chain, s.token))}. Top up or lower the amount before it runs.</div>` : ''}
      <div class="row-btns">
        <button class="ghost-btn" onclick="toggleSchedule(${i})">${s.active ? 'Pause' : 'Resume'}</button>
        <button class="ghost-btn" onclick="openScheduleEditor(${i})">Edit</button>
        <button class="ghost-btn danger" onclick="deleteSchedule(${i})">Delete</button>
      </div>
    </div>`;
  }).join('');
}

function fmtDuration(ms) {
  if (ms < 60e3) return Math.ceil(ms / 1000) + 's';
  if (ms < 3600e3) return Math.ceil(ms / 60e3) + 'm';
  if (ms < 86400e3) return Math.round(ms / 3600e3) + 'h';
  return Math.round(ms / 86400e3) + 'd';
}

// Runs due schedules and issues the 24h low-balance warning.
function tickSchedules() {
  let changed = false;
  schedules.forEach(s => {
    if (!s.active) return;
    const need = q3(s.amount + NETWORK_FEE[s.chain]);
    const until = s.nextRun - Date.now();

    if (until > 0 && until < 86400e3 && avail(s.chain, s.token) < need && !s.warned) {
      s.warned = true; changed = true;
      notify('Scheduled transfer needs a top-up',
        `${fmt(s.amount)} ${s.token} to ${labelFor(s.to)} runs in ${fmtDuration(until)} and needs ${fmtT(need)} ${s.token} on ${CHAINS[s.chain].name}. You hold ${fmtT(avail(s.chain, s.token))}.`, null);
    }
    if (until <= 0) {
      s.nextRun = Date.now() + FREQS[s.freq].ms;
      s.warned = false;
      changed = true;
      if (avail(s.chain, s.token) < need) {
        notify('Scheduled transfer skipped',
          `${fmt(s.amount)} ${s.token} to ${labelFor(s.to)} did not run: it needs ${fmtT(need)} and you hold ${fmtT(avail(s.chain, s.token))} on ${CHAINS[s.chain].name}. It will try again next cycle.`, null);
      } else {
        runScheduled(s);
      }
    }
  });
  if (changed) { saveState(); if (activeTab === 'scheduled') renderSchedules(); }
}

function runScheduled(s) {
  const isErrand = ERRAND_RE.test(s.to);
  const f = computeFlow(s.amount, isErrand ? 0.50 : currentFeePct(), s.chain);
  if (!flowIsSound(f) || !debit(s.chain, s.token, f.totalDebit)) return;
  vaultBalance = money(vaultBalance + f.sendFee);
  const fx = fxQuote(f.recipientGets, isErrand ? 'USD' : (s.ccy || 'USD'));
  const id = 'tx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const tx = {
    id, ts: Date.now(), type: isErrand ? 'errand' : 'send', chain: s.chain, token: s.token, to: s.to,
    amount: f.amount, sendFee: f.sendFee, networkFee: f.networkFee, recipientGets: f.recipientGets,
    totalDebit: f.totalDebit, feePct: f.feePct,
    fx: fx.isUSD ? null : { ccy: fx.cur.code, mid: fx.mid, rate: fx.rate, marginPct: fx.marginPct, marginCostUsd: fx.marginCostUsd, local: fx.local },
    memo: s.memo || '', status: 'submitted',
    hash: makeHash(id, s.chain), scheduleId: s.id, voice: null,
    timeline: [{ status: 'submitted', ts: Date.now() }]
  };
  receipts.unshift(tx);
  s.runs++;
  saveState();
  renderBalances();
  notify('Scheduled transfer sent', `${fmt(f.amount)} ${s.token} to ${labelFor(s.to)} — ${txReceived(tx)} will arrive.`, tx.id);
  runLifecycle(tx);
}

/* ============================================================ *
 * 18. Notifications
 * ============================================================ */

function notify(title, body, txId) {
  notifications.unshift({ id: 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title, body, txId, ts: Date.now(), read: false });
  saveState();
  renderBell();
  toast(title);
}

function renderBell() {
  const n = notifications.filter(x => !x.read).length;
  const b = el('bell-badge');
  b.textContent = n > 9 ? '9+' : String(n);
  b.classList.toggle('hidden', n === 0);
}

function openNotifications() {
  const list = notifications.length
    ? notifications.slice(0, 25).map(n => `
      <div class="nt ${n.read ? '' : 'unread'}" ${n.txId ? `onclick="closeSheet();setTimeout(()=>openTxDetail('${n.txId}'),200)"` : ''}>
        <div class="nt-title">${esc(n.title)}</div>
        <div class="nt-body">${esc(n.body)}</div>
        <div class="nt-time">${relTime(n.ts)}</div>
      </div>`).join('')
    : `<div class="empty">Nothing yet. Transfer updates, schedule runs and tier changes land here.</div>`;
  openSheet('Activity notifications', list +
    (notifications.length ? `<button class="ghost-btn wide" onclick="clearNotifications()">Clear all</button>` : ''));
  notifications.forEach(n => n.read = true);
  saveState();
  renderBell();
}

function clearNotifications() {
  notifications = [];
  saveState(); renderBell(); closeSheet();
}

/* ============================================================ *
 * 19. Errands
 * ============================================================ */

const ERRAND_TASKS = [
  { id: 'errand-helper-7',  label: 'Grocery run',      amt: 25, chain: 'sol' },
  { id: 'errand-helper-11', label: 'Pharmacy pickup',  amt: 12, chain: 'sol' },
  { id: 'errand-helper-3',  label: 'Package drop-off', amt: 40, chain: 'base' }
];

function renderErrands() {
  const box = el('errand-tasks');
  if (!box) return;
  box.innerHTML = ERRAND_TASKS.map(t => {
    const f = computeFlow(t.amt, 0.50, t.chain);
    return `<div class="task-card">
      <div class="tc-head"><strong>${t.label}</strong><span class="chip-chain ${t.chain}">${CHAINS[t.chain].short}</span></div>
      <div class="tc-sub mono">${t.id}</div>
      <div class="quote-lines">
        <div class="q-line"><span>Payout</span><span>${fmt(f.amount)} USDC</span></div>
        <div class="q-line"><span>Errand fee · 0.50% flat</span><span>−${fmt(f.sendFee)}</span></div>
        <div class="q-line"><span>Network fee</span><span>+${f.networkFee.toFixed(3)}</span></div>
        <div class="q-line total"><span>Helper receives</span><span>${fmt(f.recipientGets)} USDC</span></div>
      </div>
      <button class="ghost-btn wide" onclick="payErrand('${t.id}')">Pay this errand</button>
    </div>`;
  }).join('');
}

function payErrand(id) {
  const t = ERRAND_TASKS.find(x => x.id === id);
  if (!t) return;
  showTab('send');
  el('chain').value = t.chain;
  el('token').value = 'USDC';
  el('recipient').value = t.id;
  el('amount').value = t.amt.toFixed(2);
  el('memo').value = t.label;
  onFormChange();
  openReview();
}

/* ============================================================ *
 * 20. Voice — real speech recognition, always read back for correction
 * ============================================================ */

function startVoiceTransfer() {
  const btn = el('voice-btn');
  const status = el('voice-status');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SR) {
    status.innerHTML = `<span class="warn">Speech recognition is not available in this browser, so voice entry is off. Chrome and Edge support it. Type the details instead.</span>`;
    return;
  }
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = '● Listening…';
  status.textContent = 'Try: “send 25 USDC to Alice for rent”';
  startWaveform();

  recog = new SR();
  recog.lang = 'en-US';
  recog.interimResults = true;
  recog.maxAlternatives = 1;

  let finalText = '';
  recog.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    status.textContent = '“' + (finalText + interim).trim() + '”';
  };
  recog.onerror = ev => {
    stopWaveform();
    btn.disabled = false; btn.textContent = '🎙 Fill by voice';
    status.innerHTML = ev.error === 'not-allowed'
      ? `<span class="warn">Microphone access was declined, so nothing was recorded. Allow the microphone in your browser settings, or type the details instead.</span>`
      : `<span class="warn">No speech was captured. Try again in a quieter spot, or type the details instead.</span>`;
  };
  recog.onend = () => {
    stopWaveform();
    btn.disabled = false; btn.textContent = '🎙 Fill by voice';
    const text = finalText.trim();
    if (!text) return;
    applyVoiceParse(text);
  };
  recog.start();
  setTimeout(() => { try { recog.stop(); } catch (e) {} }, 7000);
}

/* Parses only what it can defend, reports exactly what it changed, and never
 * confirms anything — the review sheet still stands between voice and money. */
function parseVoice(text) {
  const t = text.toLowerCase();
  const out = { changed: [], unmatched: [] };

  const amt = t.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (amt) out.amount = parseFloat(amt[1].replace(',', '.'));

  if (/\busdt\b|tether/.test(t)) out.token = 'USDT';
  else if (/\busdc\b/.test(t)) out.token = 'USDC';

  if (/\bsolana\b|\bsol\b/.test(t)) out.chain = 'sol';
  else if (/\bbase\b/.test(t)) out.chain = 'base';

  const to = t.match(/\bto\s+([a-z0-9\- ]{2,30}?)(?:\s+for\b|\s+on\b|\s+using\b|$)/);
  if (to) {
    const name = to[1].trim();
    const hit = contacts.find(c => c.alias.toLowerCase() === name) ||
                contacts.find(c => c.alias.toLowerCase().includes(name));
    if (hit) { out.to = hit.addr; out.toLabel = hit.alias; out.toChain = hit.chain; }
    else out.unmatchedName = name;
  }

  const memo = t.match(/\bfor\s+(.{2,40})$/);
  if (memo) out.memo = memo[1].trim();

  return out;
}

function applyVoiceParse(text) {
  const p = parseVoice(text);
  const changed = [];

  if (p.chain) { el('chain').value = p.chain; changed.push('network ' + CHAINS[p.chain].name); }
  if (p.toChain) el('chain').value = p.toChain;
  if (p.token) { el('token').value = p.token; changed.push('token ' + p.token); }
  if (p.amount != null) { el('amount').value = money(p.amount).toFixed(2); changed.push('amount ' + fmt(p.amount)); }
  if (p.to) { el('recipient').value = p.to; changed.push('recipient ' + p.toLabel); }
  if (p.memo) { el('memo').value = p.memo.slice(0, 64); changed.push('reference “' + p.memo.slice(0, 24) + '”'); }

  currentVoice = { transcript: text, ts: Date.now() };
  onFormChange();

  const notes = [];
  if (p.unmatchedName) notes.push(`No saved recipient matches “${esc(p.unmatchedName)}”, so the recipient field was left alone.`);
  if (!changed.length) notes.push('Nothing recognisable was found, so no fields were changed.');

  el('voice-status').innerHTML =
    `<div class="vs-heard">Heard: “${esc(text)}”</div>
     ${changed.length ? `<div class="vs-set">Filled in: ${esc(changed.join(', '))}. Check the figures below before you review.</div>` : ''}
     ${notes.map(n => `<div class="warn">${n}</div>`).join('')}`;
}

// Waveform is decoration for the listening state — it drives no numbers.
function startWaveform() {
  const wrap = el('wave-wrap'), canvas = el('voice-wave');
  if (!wrap || !canvas) return;
  wrap.classList.remove('hidden');
  const ctx = canvas.getContext('2d');
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    sourceNode.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    window._vstream = stream;

    (function draw(time) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      analyser.getByteFrequencyData(dataArray);
      const cy = canvas.height / 2;
      for (let l = 0; l < 4; l++) {
        ctx.strokeStyle = `rgba(197,164,110,${0.32 - l * 0.07})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let x = 0; x <= canvas.width; x += 3) {
          const amp = (dataArray[Math.floor((x / canvas.width) * dataArray.length)] || 0) / 255;
          const y = cy + Math.sin(x / 42 + time / 380 + l) * (5 + amp * 26);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    })(0);
  }).catch(() => { wrap.classList.add('hidden'); });
}

function stopWaveform() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  const wrap = el('wave-wrap');
  if (wrap) wrap.classList.add('hidden');
  if (window._vstream) { window._vstream.getTracks().forEach(t => t.stop()); window._vstream = null; }
  if (audioCtx && audioCtx.state !== 'closed') { try { audioCtx.close(); } catch (e) {} }
}

/* ============================================================ *
 * 21. Wallet + settings
 * ============================================================ */

let walletConnected = false;
function connectWallet() {
  walletConnected = !walletConnected;
  const info = el('wallet-info'), btn = el('connect-btn');
  if (walletConnected) {
    const addr = toChecksumAddress(keccakHex('stablelink:demo-wallet').slice(0, 40));
    info.innerHTML = `<span class="mono">${esc(shortAddr(addr))}</span> · simulated`;
    btn.textContent = 'Disconnect';
    setStatus('Wallet linked (simulated). No real key was touched.');
  } else {
    info.textContent = 'Not connected · Solana / Base';
    btn.textContent = 'Connect wallet';
    setStatus('Wallet disconnected.');
  }
}

function renderFeeTable() {
  const st = tierStatus();
  el('fee-table').innerHTML = `
    <table class="fee-tbl">
      <thead><tr><th>Tier</th><th>Volume from</th><th>Send fee</th><th>Per transfer</th><th>Daily</th></tr></thead>
      <tbody>${TIERS.map((t, i) => `<tr class="${i === st.idx ? 'on' : ''}">
        <td>${i + 1} · ${t.name}</td><td>${fmt(t.from)}</td><td>${t.fee.toFixed(2)}%</td>
        <td>${fmt(t.perTx)}</td><td>${fmt(t.daily)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="fee-now">
      You are on <strong>Tier ${st.num} · ${st.cur.name}</strong> with ${fmt(st.vol)} lifetime settled volume.
      Remaining today: <strong>${fmt(limitStatus().dailyLeft)}</strong> of ${fmt(limitStatus().daily)} ·
      this week: <strong>${fmt(limitStatus().weeklyLeft)}</strong> of ${fmt(limitStatus().weekly)}.
      Errand payouts are excluded from these limits and always cost 0.50%.
    </div>`;
}

function renderFxTable() {
  const host = el('fx-rate-table');
  if (!host) return;
  const rows = CCY_CODES.filter(c => c !== 'USD').map(code => {
    const c = CURRENCIES[code];
    return `<tr class="${code === payoutCcy ? 'on' : ''}">
      <td>${c.flag} ${code}</td>
      <td>${fmtRate(c.mid)}</td>
      <td>${fmtRate(effRate(c))}</td>
      <td>${esc(c.rail)}</td></tr>`;
  }).join('');
  host.innerHTML = `
    <table class="fee-tbl fx-tbl">
      <thead><tr><th>Currency</th><th>Mid-market</th><th>Your rate</th><th>Payout rail</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="fee-now">
      One transparent <strong>${FX_MARGIN_PCT.toFixed(2)}%</strong> FX margin applies to conversions — shown as its own line on every quote and receipt. USD payouts keep stablecoin with no conversion and no margin. Rates are <strong>fixed illustrative demo values</strong>, not live market quotes.
    </div>`;
}

function resetDemo() {
  if (!confirm('Clear all simulated balances, transfers, recipients and schedules on this device?')) return;
  [LS.bal, LS.receipts, LS.contacts, LS.sched, LS.notif, LS.vault, LS.opts, LS.ccy, 'p10_balance', 'p10_personal_rate', 'p10_recipient_ledger'].forEach(k => localStorage.removeItem(k));
  location.reload();
}

/* ============================================================ *
 * 22. Boot
 * ============================================================ */

function initApp() {
  loadState();
  renderNav();
  renderBalances();
  renderBell();
  onFormChange();

  // Populate the payout-currency selector from the single CURRENCIES source.
  const ccySel = el('payout-ccy');
  if (ccySel) {
    ccySel.innerHTML = CCY_CODES.map(code => {
      const c = CURRENCIES[code];
      return `<option value="${code}">${c.flag} ${code} — ${c.name}${code === 'USD' ? ' (keep stablecoin)' : ''}</option>`;
    }).join('');
    ccySel.value = payoutCcy;
    ccySel.addEventListener('change', () => { onCcyChange(); clearFormError(); });
  }

  ['chain', 'token'].forEach(id => el(id).addEventListener('change', () => { onFormChange(); clearFormError(); }));
  ['amount', 'recipient', 'memo'].forEach(id => el(id).addEventListener('input', () => { onFormChange(); clearFormError(); }));

  const fail = el('opt-fail'), fast = el('opt-fast');
  fail.checked = !!options.forceFail;
  fast.checked = !!options.fast;
  fail.addEventListener('change', () => { options.forceFail = fail.checked; saveState(); });
  fast.addEventListener('change', () => { options.fast = fast.checked; saveState(); });

  // Any transfer left mid-flight by a reload is resolved rather than left hanging.
  receipts.filter(r => r.status === 'submitted' || r.status === 'confirming').forEach(r => {
    r.status = 'delivered';
    r.timeline.push({ status: 'delivered', ts: Date.now(), note: 'Settled on reload.' });
  });
  saveState();

  setInterval(tickSchedules, 5000);
  tickSchedules();

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !el('sheet').classList.contains('hidden')) closeSheet();
  });

  setStatus(`Tier ${tierStatus().num} · ${tierStatus().cur.name} — your send fee is ${currentFeePct().toFixed(2)}%.`);
  console.log('[StableLink] Ready. Fictional demo — simulated virtual credits, no real chain.');
}

initApp();

window.stableLink = {
  openReview, confirmTransfer, renderHistory, computeFlow, validateRecipient,
  toChecksumAddress, keccakHex, base58Decode, tierStatus, limitStatus
};
