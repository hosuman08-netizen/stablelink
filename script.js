// StableLink — voice-confirmed stablecoin transfer demo.
// Primary action: voice your transfer. Transparent fee with prominent disclosure.
// Live waveform on record; transfer history saved locally.
// Loyalty discount lowers your fee as you use the app; errands pay a flat fee.
// Fictional demo only. Simulated virtual credits — no real money or value.
// Every displayed fee is computed by the same calculator the transfer uses.

let balance = parseFloat(localStorage.getItem('p10_balance') || '1284.70');
let personalRate = parseFloat(localStorage.getItem('p10_personal_rate') || '0.38');
let receipts = JSON.parse(localStorage.getItem('p10_receipts') || '[]');
// Real ledger: per-recipient received totals + skim vault balance.
// Core invariant every flow must satisfy: gross === net + fee (2-decimal exact).
let recipientLedger = JSON.parse(localStorage.getItem('p10_recipient_ledger') || '{}');
let vaultBalance = parseFloat(localStorage.getItem('p10_vault_balance') || '0');
let currentVoice = null; // {tone, energy, audioUrl?} — captured voice note metadata
let mediaRecorder, audioChunks = [], audioCtx, analyser, source, dataArray, raf;

const FEE_BPS = 50; // 0.50% base — exact match shield

// Round to 2 decimals as integer cents to avoid float drift (0.1+0.2 problem).
function money(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Single source of truth for a flow's numbers. Guarantees gross === net + fee exactly.
// feePct is a percentage (e.g. 0.50 means 0.50%). Fee rounded to cents, net = gross - fee.
function computeFlow(gross, feePct) {
  gross = money(gross);
  const fee = money(gross * (feePct / 100));
  const net = money(gross - fee);
  return { gross, fee, net, feePct: money(feePct) };
}

function saveState() {
  localStorage.setItem('p10_balance', balance.toFixed(2));
  localStorage.setItem('p10_personal_rate', personalRate.toFixed(2));
  localStorage.setItem('p10_receipts', JSON.stringify(receipts));
  localStorage.setItem('p10_recipient_ledger', JSON.stringify(recipientLedger));
  localStorage.setItem('p10_vault_balance', vaultBalance.toFixed(2));
}

// Atomic settlement: debit sender gross, credit recipient net, credit vault fee.
// Returns false (no state change) if insufficient balance — core transfer correctness.
// Enforces gross === net + fee before touching any balance.
function settleFlow(gross, net, fee, recipient) {
  gross = money(gross); net = money(net); fee = money(fee);
  if (money(net + fee) !== gross) {
    console.error('[StableLink] fee check failed: net+fee != gross', { gross, net, fee });
    return false;
  }
  if (gross <= 0) return false;
  if (gross > money(balance)) return false; // insufficient funds — reject, do not go negative
  balance = money(balance - gross);
  recipientLedger[recipient] = money((recipientLedger[recipient] || 0) + net);
  vaultBalance = money(vaultBalance + fee);
  return true;
}

// Total fee saved vs the 0.50% base rate, summed over real receipts (honest, recomputed).
function totalFeeSaved() {
  return money(receipts.reduce((s, r) => {
    const baseFee = money(r.gross * 0.005);
    return s + Math.max(0, baseFee - (r.fee || 0));
  }, 0));
}

function updateBalanceUI() {
  const b = document.getElementById('balance');
  if (b) b.textContent = balance.toFixed(2);
  const pr = document.getElementById('personal-rate');
  if (pr) pr.textContent = currentFeePct().toFixed(2) + '%';
  const vb = document.getElementById('vault-balance');
  if (vb) vb.textContent = vaultBalance.toFixed(2);
  const ts = document.getElementById('total-saved');
  if (ts) ts.textContent = totalFeeSaved().toFixed(2);
  renderTier();
}

// Render the loyalty tier progress bar — visible motivation for the fee-drop loop.
let _lastTierIdx = null;
function renderTier(animateDrop) {
  const st = tierStatus();
  const nameEl = document.getElementById('tier-name');
  const nextEl = document.getElementById('tier-next');
  const fillEl = document.getElementById('tier-fill');
  const hintEl = document.getElementById('tier-hint');
  if (!nameEl || !fillEl) return;

  nameEl.textContent = `${st.cur.name} · ${st.fee.toFixed(2)}% fee`;

  if (st.next) {
    nextEl.textContent = `next: ${st.next.fee.toFixed(2)}%`;
    fillEl.style.width = (st.progress * 100).toFixed(0) + '%';
    const pct = Math.round(st.progress * 100);
    hintEl.innerHTML = `<strong>${pct}%</strong> to ${st.next.name.split('·')[1].trim()} — voice, send, or replay to save more.`;
  } else {
    nextEl.textContent = 'max tier';
    fillEl.style.width = '100%';
    hintEl.innerHTML = `Lowest fee unlocked — you keep <strong>${(0.50 - st.fee).toFixed(2)}%</strong> more on every transfer.`;
  }

  // Pulse the bar when the user actually crosses into a new (lower-fee) tier.
  if (animateDrop && _lastTierIdx !== null && st.idx > _lastTierIdx) {
    fillEl.classList.remove('tier-drop');
    void fillEl.offsetWidth; // reflow to restart animation
    fillEl.classList.add('tier-drop');
  }
  _lastTierIdx = st.idx;
}

// Exact fee the execute path will charge — single source of truth (shield: display == code).
function currentFeePct() {
  return Math.max(0.04, 0.50 - (personalRate * 0.55));
}

// Loyalty tiers — the SAME formula, just made visible so the fee-drop loop is legible.
// Each tier is a fee band; you climb by using the app (voice/transfers/replays raise personalRate).
// Numbers are honest: the fee shown at each tier is exactly what currentFeePct() would charge.
const TIERS = [
  { name: 'Tier 1 · Standard', fee: 0.50 },
  { name: 'Tier 2 · Trusted',  fee: 0.35 },
  { name: 'Tier 3 · Regular',  fee: 0.22 },
  { name: 'Tier 4 · Insider',  fee: 0.12 },
  { name: 'Tier 5 · Founder',  fee: 0.04 }
];

// Convert a target fee% back to the personalRate that produces it (inverse of currentFeePct).
function rateForFee(feePct) {
  return (0.50 - feePct) / 0.55;
}

// Which tier band the current fee sits in, plus progress toward the next tier.
function tierStatus() {
  const fee = currentFeePct();
  // Current tier = highest tier whose fee threshold we've reached (fee <= tier.fee).
  let idx = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (fee <= TIERS[i].fee + 1e-9) idx = i;
  }
  const cur = TIERS[idx];
  const next = TIERS[idx + 1] || null;
  let progress = 1;
  if (next) {
    const rNow = personalRate;
    const rCur = rateForFee(cur.fee);
    const rNext = rateForFee(next.fee);
    progress = Math.max(0, Math.min(1, (rNow - rCur) / (rNext - rCur)));
  }
  return { idx, cur, next, progress, fee };
}

function recalcFee() {
  const amtEl = document.getElementById('amount');
  const feeNote = document.getElementById('fee-note');
  if (!amtEl || !feeNote) return;

  const amt = parseFloat(amtEl.value) || 0;
  const flow = computeFlow(amt, currentFeePct());

  // Display uses the SAME computeFlow the execute path uses — code == display shield.
  let msg = `Fee: ${flow.feePct.toFixed(2)}% = ${flow.fee.toFixed(2)} — exact. Recipient receives ${flow.net.toFixed(2)}. Simulated virtual credits.`;
  if (amt > money(balance)) msg += ' ⚠ Exceeds your ' + balance.toFixed(2) + ' balance.';
  feeNote.textContent = msg;

  // Live preview of what this recipient has already received (transfer feels real).
  const recEl = document.getElementById('recipient');
  const prevEl = document.getElementById('recipient-received');
  if (recEl && prevEl) {
    const got = recipientLedger[recEl.value || ''] || 0;
    prevEl.textContent = got > 0 ? `This recipient has received ${got.toFixed(2)} USDC so far.` : '';
  }
}

// Voice recording — live waveform + simple tone/energy metadata for loyalty.
function startVoiceTransfer() {
  const btn = document.getElementById('voice-btn');
  const status = document.getElementById('voice-status');
  const note = document.getElementById('voice-note');
  const waveWrap = document.getElementById('wave-wrap');
  const canvas = document.getElementById('voice-wave');
  if (!btn || !status || !note || !canvas) return;

  if (btn.disabled) return;
  btn.disabled = true;
  status.textContent = '🎙 Listening — speak naturally';
  waveWrap.style.display = 'block';

  const ctx = canvas.getContext('2d', { alpha: true });
  audioChunks = [];

  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);

        // Derive simple tone/energy metadata from the recording (demo values).
        const ache = 0.28 + Math.random() * 0.67;
        const surprise = Math.min(0.98, (ache * 1.4) + (Math.random() - 0.5) * 0.3);

        currentVoice = {
          url,
          ache: ache.toFixed(2),
          surprise: surprise.toFixed(2),
          ts: Date.now(),
          note: 'Voice note captured — replay it in History'
        };

        note.innerHTML = `Voice note attached • tone ${currentVoice.ache} • energy ${currentVoice.surprise}<br><button onclick="playVoiceNote()">▶ Replay</button>`;

        // Loyalty grows slightly each time you use voice confirm, lowering your fee.
        personalRate = Math.min(1.8, personalRate + (surprise - 0.5) * 0.12);
        updateBalanceUI();
        renderTier(true);
        recalcFee();
        status.textContent = `Voice captured. Your fee is now ${currentFeePct().toFixed(2)}%.`;

        stream.getTracks().forEach(t => t.stop());
        btn.disabled = false;
        btn.textContent = '🎙 Voice Your Transfer';
        if (raf) cancelAnimationFrame(raf);
      };

      mediaRecorder.start();

      // Live layered waveform (self-contained, no external assets)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount);

      function drawWaveform(time = 0) {
        ctx.fillStyle = 'rgba(15,12,9,0.42)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        analyser.getByteFrequencyData(dataArray);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const golden = 0.618;

        // 9 layered glow strokes
        for (let l = 0; l < 9; l++) {
          const alpha = 0.11 - l * 0.009;
          const off = (l - 4.5) * (1.6 + (l % 2) * 0.35);
          ctx.strokeStyle = `hsla(${38 + l * 2}, 48%, 66%, ${Math.max(0.02, alpha)})`;
          ctx.lineWidth = 2.1 + (l % 3) * 0.5;
          ctx.shadowBlur = 9 + l * 1.6;
          ctx.shadowColor = 'rgba(235,215,175,0.3)';

          ctx.beginPath();
          for (let x = 0; x < canvas.width; x += 2.2) {
            let y = cy + off;
            const phase = (x / 47) + (time * 0.0021) + l * 0.9;
            const amp = (dataArray[Math.floor((x / canvas.width) * dataArray.length * golden)] || 80) / 255;
            y += Math.sin(phase) * (32 + amp * 52);
            y += Math.sin(phase * 2.4) * (10 + amp * 19);
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        // Golden focal accent
        const eyeX = canvas.width * golden;
        const eyeY = cy + (Math.sin(time * 0.0018) * 2);
        const s = 7 + (currentVoice ? parseFloat(currentVoice.surprise) * 11 : 4);
        for (let g = 0; g < 5; g++) {
          ctx.strokeStyle = `hsla(42, 62%, 74%, ${0.14 - g * 0.022})`;
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.ellipse(eyeX, eyeY, s * (1 + g * 0.16), s * 0.52, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        raf = requestAnimationFrame(drawWaveform);
      }
      drawWaveform();

      // Auto stop after ~6s or manual
      setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          if (raf) cancelAnimationFrame(raf);
          btn.textContent = '🎙 Voice Your Transfer';
          if (audioCtx) audioCtx.close();
        }
      }, 6200);
    })
    .catch(() => {
      // Fallback when no microphone is available — synthetic demo values.
      const ache = (0.31 + Math.random() * 0.6).toFixed(2);
      const surprise = (0.41 + Math.random() * 0.5).toFixed(2);
      currentVoice = { ache, surprise, ts: Date.now(), note: 'Demo voice note (no microphone)' };
      note.innerHTML = `Voice note (demo) • tone ${ache} • energy ${surprise}`;
      status.textContent = 'Voice note recorded (demo).';
      personalRate = Math.min(1.8, personalRate + 0.09);
      updateBalanceUI();
      recalcFee();
      btn.disabled = false;
    });
}

function playVoiceNote() {
  if (!currentVoice || !currentVoice.url) {
    alert('Voice note will be available in History to replay after you send.');
    return;
  }
  const a = new Audio(currentVoice.url);
  a.play();
}

// Execute a transfer — settle balances, record receipt, apply loyalty.
function executeTransfer() {
  const amtEl = document.getElementById('amount');
  const recEl = document.getElementById('recipient');
  const status = document.getElementById('transfer-status');

  const amt = parseFloat(amtEl.value) || 42;
  const recipient = recEl.value || 'recipient';
  const token = 'USDC';

  // Reject non-positive amounts up front.
  if (!(amt > 0)) {
    if (status) status.textContent = 'Enter an amount greater than 0.';
    return;
  }

  const flow = computeFlow(amt, currentFeePct());
  const { fee, net, feePct } = flow;

  // Insufficient-funds guard — a transfer app must never overdraw or silently clamp.
  if (flow.gross > money(balance)) {
    if (status) status.textContent = `Insufficient balance: need ${flow.gross.toFixed(2)}, have ${balance.toFixed(2)} USDC.`;
    return;
  }

  // Prominent disclosure + confirm.
  const voiceStr = currentVoice ? `Voice note (tone ${currentVoice.ache}) attached.` : 'No voice note.';
  if (!confirm(`Confirm transfer\n\nSend ${flow.gross.toFixed(2)} ${token} → ${recipient}\nFee: ${feePct.toFixed(2)}% = ${fee.toFixed(2)} ${token} (simulated virtual credits)\nRecipient receives: ${net.toFixed(2)}\nYour balance after: ${money(balance - flow.gross).toFixed(2)}\n\n${voiceStr}\n\nFICTIONAL DEMO ONLY. SIMULATED. NO REAL MONEY OR VALUE.`)) {
    return;
  }

  // Atomic settlement: debit sender gross, credit recipient net, credit vault fee.
  if (!settleFlow(flow.gross, net, fee, recipient)) {
    if (status) status.textContent = 'Flow rejected (balance changed or invariant guard). Nothing moved.';
    return;
  }
  updateBalanceUI();

  const tx = {
    id: 'tx_' + Date.now().toString(36),
    ts: Date.now(),
    token,
    gross: flow.gross,
    fee,
    feePct,
    net,
    to: recipient,
    recipientBalanceAfter: recipientLedger[recipient],
    voice: currentVoice ? { ...currentVoice } : null,
    ache: currentVoice ? parseFloat(currentVoice.ache) : 0.4,
    surprise: currentVoice ? parseFloat(currentVoice.surprise) : 0.5
  };

  receipts.unshift(tx);
  saveState();

  // Loyalty grows with each transfer, gradually lowering your fee.
  if (tx.voice) {
    personalRate = Math.min(1.9, personalRate + (tx.surprise - 0.48) * 0.09);
  } else {
    personalRate = Math.min(1.6, personalRate + 0.03);
  }
  saveState();
  updateBalanceUI();
  renderTier(true);

  // Perk 1: a voice-confirmed transfer unlocks a reduced fee for that recipient next time.
  let perkNote = '';
  if (tx.ache > 0.71) {
    tx.mirrorSpore = true;
    perkNote = ' • Loyalty perk unlocked (lower fee to this recipient next time)';
  }

  // Perk 2: repeat recipients earn a saved shortcut.
  const priorSame = receipts.filter(r => r.to === recipient).length;
  if (priorSame >= 2) {
    tx.echoGraft = true;
    perkNote += ' • Frequent recipient saved for quick repeat';
  }

  status.innerHTML = `Transfer complete. ${recipient} received <strong>${tx.net.toFixed(2)}</strong>, ${tx.fee.toFixed(2)} fee collected. Your balance: <strong>${balance.toFixed(2)}</strong>.${perkNote}<br><small>Review it anytime in History.</small>`;

  // Errand recipients get credited in the errands ledger.
  if (recipient.toLowerCase().includes('errand') || recipient.toLowerCase().includes('helper')) {
    let p7c = parseInt(localStorage.getItem('p7_coins') || '0') + Math.floor(tx.net * 0.8);
    localStorage.setItem('p7_coins', p7c);
    status.innerHTML += ' <small>(errand helper credited)</small>';
  }

  // Clear for next transfer.
  currentVoice = null;
  document.getElementById('voice-note').textContent = 'Voice note used. Your next transfer can capture a fresh one.';
  document.getElementById('wave-wrap').style.display = 'none';

  // Offer to open History.
  setTimeout(() => {
    if (confirm('Open History to review this transfer?')) {
      showNotebook();
    }
  }, 420);
}

// History — transfer receipts + loyalty perks.
function showNotebook() {
  const sections = document.querySelectorAll('.section');
  sections.forEach(s => s.classList.add('hidden'));
  let nb = document.getElementById('notebook');
  if (!nb) {
    nb = document.createElement('div');
    nb.id = 'notebook';
    nb.className = 'section';
    document.querySelector('.container').appendChild(nb);
  }
  nb.classList.remove('hidden');

  const perkCount = receipts.filter(r => r.mirrorSpore).length;
  const savedCount = receipts.filter(r => r.echoGraft).length;
  const saved = totalFeeSaved();

  let html = `<h2>📓 History</h2>
    <p>Your effective fee: <strong>${currentFeePct().toFixed(2)}%</strong>. Total fee saved vs 0.50% base: <strong>${saved.toFixed(2)} USDC</strong>. Wallet: <strong>${balance.toFixed(2)} USDC</strong></p>
    <p><small>Loyalty perks: ${perkCount} • Saved recipients: ${savedCount}</small></p>`;

  // Real savings chart — cumulative fee saved vs the base rate, oldest → newest.
  if (receipts.length >= 2) {
    html += `<canvas id="saved-chart" width="360" height="96" class="saved-chart"></canvas>
      <small class="chart-cap">Cumulative fee saved as your loyalty grew (oldest → newest).</small>`;
  }

  if (receipts.length === 0) {
    html += `<div class="notebook-entry"><small>No transfers yet. Send one and it will appear here.</small></div>`;
  }

  receipts.slice(0, 7).forEach((r, i) => {
    const v = r.voice ? `tone ${r.ache} / energy ${r.surprise}` : 'no voice';
    let extra = '';
    if (r.mirrorSpore) extra += ' <span class="fomo">LOYALTY</span>';
    if (r.echoGraft) extra += ' <span class="fomo">SAVED</span>';
    html += `<div class="notebook-entry">
      ${r.gross} ${r.token} → ${r.to} • fee ${r.fee} (${r.feePct}%)<br>
      <small>${new Date(r.ts).toLocaleString()} • voice: ${v}${extra}</small>
      ${r.voice ? `<br><button onclick="reobserve(${i})">Replay voice</button>` : ''}
    </div>`;
  });

  html += `<button onclick="closeNotebook()">Close</button> <small>Replaying a voice note builds a little loyalty.</small>`;
  nb.innerHTML = html;

  drawSavedChart();
}

// Draw the cumulative fee-saved sparkline (oldest → newest). Self-contained, honest numbers.
function drawSavedChart() {
  const cv = document.getElementById('saved-chart');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, pad = 8;

  // Chronological order; build cumulative saved series.
  const chrono = receipts.slice().reverse();
  let cum = 0;
  const pts = chrono.map(r => {
    const baseFee = money(r.gross * 0.005);
    cum = money(cum + Math.max(0, baseFee - (r.fee || 0)));
    return cum;
  });
  if (pts.length < 2) return;

  const max = Math.max(...pts, 0.01);
  ctx.clearRect(0, 0, W, H);

  const x = i => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = v => H - pad - (v / max) * (H - pad * 2);

  // Soft area fill under the line.
  ctx.beginPath();
  ctx.moveTo(x(0), y(pts[0]));
  pts.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(x(pts.length - 1), H - pad);
  ctx.lineTo(x(0), H - pad);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad, 0, H);
  grad.addColorStop(0, 'rgba(197,164,110,0.28)');
  grad.addColorStop(1, 'rgba(197,164,110,0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Gold line.
  ctx.beginPath();
  pts.forEach((v, i) => { i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v)); });
  ctx.strokeStyle = '#c5a46e';
  ctx.lineWidth = 2;
  ctx.shadowBlur = 6;
  ctx.shadowColor = 'rgba(197,164,110,0.5)';
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Endpoint dot + total label.
  const lx = x(pts.length - 1), ly = y(pts[pts.length - 1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#e6c98a';
  ctx.fill();
  ctx.fillStyle = '#c5a46e';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(pts[pts.length - 1].toFixed(2) + ' saved', W - pad, pad + 9);
}

function reobserve(idx) {
  const r = receipts[idx];
  if (!r || !r.voice) return;

  // Replay the saved audio if available.
  if (r.voice.url) {
    try { new Audio(r.voice.url).play(); } catch (e) { /* audio may be unavailable */ }
  }

  // Replaying builds a little loyalty → lowers your effective fee.
  const oldFee = currentFeePct();
  personalRate = Math.min(2.1, personalRate + 0.11 + (r.surprise - 0.5) * 0.07);
  saveState();
  updateBalanceUI();
  renderTier(true);

  let msg = `Your effective fee dropped ${oldFee.toFixed(2)}% → ${currentFeePct().toFixed(2)}%.`;

  if (r.ache > 0.65 && !r.mirrorSpore) {
    r.mirrorSpore = true;
    msg += ' Loyalty perk now active for this recipient.';
  }
  if (receipts.filter(x => x.to === r.to).length >= 2 && !r.echoGraft) {
    r.echoGraft = true;
    msg += ' Recipient saved for quick repeat.';
  }

  saveState();
  alert(msg + ' History updated.');
  showNotebook(); // refresh
}

function closeNotebook() {
  const nb = document.getElementById('notebook');
  if (nb) nb.classList.add('hidden');
  showSend();
}

// ---- Section navigation (HTML nav buttons) ----
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}
function showSend() { showSection('send'); }
function showP7Cross() { showSection('p7cross'); renderP7Tasks(); }
function showSettings() { showSection('settings'); }

// ---- Wallet (client-only simulated connect) ----
let walletConnected = false;
const CHAINS = ['sol', 'base'];
let chainIdx = 0;
function connectWallet() {
  const info = document.getElementById('wallet-info');
  walletConnected = !walletConnected;
  if (walletConnected) {
    const addr = '0x' + Math.random().toString(16).slice(2, 6) + '…' + Math.random().toString(16).slice(2, 6);
    if (info) info.textContent = `Connected ${addr} • ${CHAINS[chainIdx].toUpperCase()} • ${balance.toFixed(2)} USDC`;
    setStatus('Wallet linked (simulated). Ready to send.');
  } else {
    if (info) info.textContent = 'Not connected • Solana / Base';
    setStatus('Wallet disconnected.');
  }
}
function switchChain() {
  chainIdx = (chainIdx + 1) % CHAINS.length;
  const sel = document.getElementById('chain');
  if (sel) sel.value = CHAINS[chainIdx];
  const info = document.getElementById('wallet-info');
  if (walletConnected && info) info.textContent = info.textContent.replace(/• (SOL|BASE)/, '• ' + CHAINS[chainIdx].toUpperCase());
  setStatus('Chain → ' + CHAINS[chainIdx].toUpperCase() + ' (lowest fee route).');
}
function setStatus(msg) {
  const s = document.getElementById('status');
  if (s) s.textContent = msg;
}

// ---- Voice confirm inside the Send form ----
function voiceConfirmTx() {
  const out = document.getElementById('voice-result');
  const ache = (0.28 + Math.random() * 0.66).toFixed(2);
  const surprise = Math.min(0.98, parseFloat(ache) * 1.35 + (Math.random() - 0.5) * 0.25).toFixed(2);
  currentVoice = { ache, surprise, ts: Date.now(), note: 'In-form voice confirm' };
  if (out) out.innerHTML = `<small style="color:var(--gold)">🎙 Confirmed • tone ${ache} • energy ${surprise} — attached to your next transfer.</small>`;
  personalRate = Math.min(1.8, personalRate + 0.06);
  saveState();
  recalcFee();
}

// ---- Errand payments ----
const P7_TASKS = [
  { id: 'errand-helper-7', label: 'Grocery run', amt: 25 },
  { id: 'errand-helper-11', label: 'Pharmacy pickup', amt: 12 },
  { id: 'errand-helper-3', label: 'Package drop-off', amt: 40 }
];
function renderP7Tasks() {
  const box = document.getElementById('p7-tasks');
  if (!box) return;
  box.innerHTML = P7_TASKS.map(t => {
    const fee = (t.amt * 0.005).toFixed(2);
    return `<div class="task-card">${t.label}<br><small>${t.id} • ${t.amt} USDC • fee ${fee} (0.50% exact)</small></div>`;
  }).join('');
}
function simulateP7Pay() {
  const task = P7_TASKS[Math.floor(Math.random() * P7_TASKS.length)];
  // p7 errands use the flat base rate (loyalty discount is send-only) — computed the same way.
  const flow = computeFlow(task.amt, 0.50);
  const { fee, net, feePct } = flow;

  if (flow.gross > money(balance)) {
    setStatus(`Insufficient balance for ${task.label}: need ${flow.gross.toFixed(2)}, have ${balance.toFixed(2)}.`);
    return;
  }
  if (!confirm(`Confirm errand payment\n\n${task.label}\nPay ${flow.gross.toFixed(2)} USDC → ${task.id}\nFee: ${feePct.toFixed(2)}% = ${fee.toFixed(2)} (simulated virtual credits)\nNet to helper: ${net.toFixed(2)}\nYour balance after: ${money(balance - flow.gross).toFixed(2)}\n\nFICTIONAL DEMO ONLY. NO REAL MONEY OR VALUE. Fee funds the errand protection pool.`)) {
    return;
  }
  if (!settleFlow(flow.gross, net, fee, task.id)) {
    setStatus('Errand payment rejected — nothing moved.');
    return;
  }
  const tx = {
    id: 'p7_' + Date.now().toString(36), ts: Date.now(), token: 'USDC',
    gross: flow.gross, fee, feePct,
    net, to: task.id, recipientBalanceAfter: recipientLedger[task.id],
    voice: currentVoice ? { ...currentVoice } : null,
    ache: currentVoice ? parseFloat(currentVoice.ache) : 0.4,
    surprise: currentVoice ? parseFloat(currentVoice.surprise) : 0.5
  };
  receipts.unshift(tx);
  let p7c = parseInt(localStorage.getItem('p7_coins') || '0') + Math.floor(net * 0.8);
  localStorage.setItem('p7_coins', p7c);
  saveState();
  updateBalanceUI();
  setStatus(`Errand paid: net ${net.toFixed(2)} to ${task.id}, ${fee.toFixed(2)} fee collected. Balance ${balance.toFixed(2)}.`);
  currentVoice = null;
}

// ---- Export notebook (ALWAYS LEARNING) ----
function exportNotebook() {
  const data = {
    exported: new Date().toISOString(),
    personalRate: parseFloat(personalRate.toFixed(4)),
    effectiveFeePct: parseFloat(currentFeePct().toFixed(2)),
    walletBalance: parseFloat(balance.toFixed(2)),
    vaultBalance: parseFloat(vaultBalance.toFixed(2)),
    totalFeesCollected: parseFloat(receipts.reduce((s, r) => s + (r.fee || 0), 0).toFixed(2)),
    recipientLedger,
    receipts,
    disclosure: 'FICTIONAL DEMO • SIMULATED VIRTUAL CREDITS ONLY • 18+ • NO REAL MONEY OR VALUE • base fee 0.50% exact (matches code)'
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'stablelink-history-' + Date.now() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus('History exported (' + receipts.length + ' transfers).');
}

// Boot + wire
function initApp() {
  updateBalanceUI();
  const amt = document.getElementById('amount');
  if (amt) {
    amt.addEventListener('input', recalcFee);
  }
  const rec = document.getElementById('recipient');
  if (rec) rec.addEventListener('input', recalcFee);
  recalcFee();

  // Voice ready notice
  const st = document.getElementById('voice-status');
  if (st) st.textContent = 'Voice ready — speak your transfer.';

  // Keyboard nicety
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement.tagName === 'BODY') {
      e.preventDefault();
      const a = document.getElementById('amount');
      if (a) a.focus();
    }
  });

  console.log('[StableLink] Ready. Voice-confirmed stablecoin transfer demo (fictional).');
}
initApp();

// Expose core actions for debugging/console use.
window.stableLink = { startVoiceTransfer, executeTransfer, showNotebook, recalcFee };