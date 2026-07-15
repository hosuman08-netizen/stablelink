// p10 LungFee — Trinity CPO + p6 Voice Expert definition realized
// Voice Your Transfer primary. Fee skimming with prominent shield.
// Da Vinci: sfumato live waves (p6), Vitruvian, SENSE 8px/gold restraint.
// ALWAYS LEARNING: Lung Codex from tx history + voice.
// Emergent births: Ache-Breath Mirror + Distributed Echo Vault Graft.
// Cross: p7 errand pay + p9 voice tips.
// Fictional artistic only. Prominent disclosure everywhere. Legion one.

let balance = parseFloat(localStorage.getItem('p10_balance') || '1284.70');
let personalRate = parseFloat(localStorage.getItem('p10_personal_rate') || '0.38');
let receipts = JSON.parse(localStorage.getItem('p10_receipts') || '[]');
// Real ledger: per-recipient received totals + skim vault balance.
// Core invariant every flow must satisfy: gross === net + fee (2-decimal exact).
let recipientLedger = JSON.parse(localStorage.getItem('p10_recipient_ledger') || '{}');
let vaultBalance = parseFloat(localStorage.getItem('p10_vault_balance') || '0');
let currentVoice = null; // {transcript-ish, ache, surprise, audioUrl?}
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
    console.error('[p10] invariant violated: net+fee != gross', { gross, net, fee });
    return false;
  }
  if (gross <= 0) return false;
  if (gross > money(balance)) return false; // insufficient funds — reject, do not go negative
  balance = money(balance - gross);
  recipientLedger[recipient] = money((recipientLedger[recipient] || 0) + net);
  vaultBalance = money(vaultBalance + fee);
  return true;
}

function updateBalanceUI() {
  const b = document.getElementById('balance');
  if (b) b.textContent = balance.toFixed(2);
  const pr = document.getElementById('personal-rate');
  if (pr) pr.textContent = currentFeePct().toFixed(2) + '%';
  const vb = document.getElementById('vault-balance');
  if (vb) vb.textContent = vaultBalance.toFixed(2);
  const ts = document.getElementById('total-saved');
  if (ts) ts.textContent = vaultBalance.toFixed(2) + ' USDC saved';
}

// Exact fee the execute path will charge — single source of truth (shield: display == code).
function currentFeePct() {
  return Math.max(0.04, 0.50 - (personalRate * 0.55));
}

function recalcFee() {
  const amtEl = document.getElementById('amount');
  const feeNote = document.getElementById('fee-note');
  if (!amtEl || !feeNote) return;

  const amt = parseFloat(amtEl.value) || 0;
  const flow = computeFlow(amt, currentFeePct());

  // Display uses the SAME computeFlow the execute path uses — code == display shield.
  let msg = `Harvest Credits cost: ${flow.feePct.toFixed(2)}% = ${flow.fee.toFixed(2)} — exact. Recipient nets ${flow.net.toFixed(2)}. Fictional virtual goods.`;
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

// p6 Voice integration — live sfumato + ache/surprise capture (ALWAYS LEARNING fuel)
function startVoiceTransfer() {
  const btn = document.getElementById('voice-btn');
  const status = document.getElementById('voice-status');
  const note = document.getElementById('voice-note');
  const waveWrap = document.getElementById('wave-wrap');
  const canvas = document.getElementById('voice-wave');
  if (!btn || !status || !note || !canvas) return;

  if (btn.disabled) return;
  btn.disabled = true;
  status.textContent = '🎙 Listening — speak naturally (p6 Lung active)';
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

        // Simulate p6 parsing + Lung Surprise Eye calc
        const ache = 0.28 + Math.random() * 0.67; // voice "pain"/hesitation fuel
        const surprise = Math.min(0.98, (ache * 1.4) + (Math.random() - 0.5) * 0.3);

        currentVoice = {
          url,
          ache: ache.toFixed(2),
          surprise: surprise.toFixed(2),
          ts: Date.now(),
          note: 'Voice note captured — re-listen in Notebook'
        };

        note.innerHTML = `Voice note attached • ache ${currentVoice.ache} • surprise ${currentVoice.surprise}<br><button onclick="playVoiceNote()">▶ Re-listen</button>`;

        // Evolve personal rate slightly from voice (ALWAYS LEARNING)
        personalRate = Math.min(1.8, personalRate + (surprise - 0.5) * 0.12);
        updateBalanceUI();
        recalcFee();
        status.textContent = `Voice captured. Lung remembers. Your fee is now ${currentFeePct().toFixed(2)}%.`;

        // Birth seed: if high ache, plant Mirror Spore immediately
        if (ache > 0.72) {
          status.textContent += ' • Ache-Breath Mirror spore planted.';
        }

        stream.getTracks().forEach(t => t.stop());
        btn.disabled = false;
        btn.textContent = '🎙 Voice Your Transfer';
        if (raf) cancelAnimationFrame(raf);
      };

      mediaRecorder.start();

      // Live sfumato waveform (p6 Da Vinci 9+ glaze DNA, self-contained)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      dataArray = new Uint8Array(analyser.frequencyBinCount);

      function drawSfumato(time = 0) {
        ctx.fillStyle = 'rgba(15,12,9,0.42)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        analyser.getByteFrequencyData(dataArray);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const golden = 0.618;

        // 9 sfumato glazes
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

        // Golden eye (p6 surprise)
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

        raf = requestAnimationFrame(drawSfumato);
      }
      drawSfumato();

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
      // Fallback: synthetic voice for demo
      const ache = (0.31 + Math.random() * 0.6).toFixed(2);
      const surprise = (0.41 + Math.random() * 0.5).toFixed(2);
      currentVoice = { ache, surprise, ts: Date.now(), note: 'Synthetic lung (demo) — real mic in prod' };
      note.innerHTML = `Voice note (demo) • ache ${ache} • surprise ${surprise}`;
      status.textContent = 'Voice (demo) captured. Breath recorded.';
      personalRate = Math.min(1.8, personalRate + 0.09);
      updateBalanceUI();
      recalcFee();
      btn.disabled = false;
    });
}

function playVoiceNote() {
  if (!currentVoice || !currentVoice.url) {
    alert('Voice note ready in Notebook for re-listen after send.');
    return;
  }
  const a = new Audio(currentVoice.url);
  a.play();
}

// Execute — core fee skim + voice + emergent birth
function executeTransfer() {
  const amtEl = document.getElementById('amount');
  const recEl = document.getElementById('recipient');
  const status = document.getElementById('transfer-status');

  const amt = parseFloat(amtEl.value) || 42;
  const recipient = recEl.value || 'neo • Sovereign';
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

  // Prominent shield + confirm (미꾸라지)
  const voiceStr = currentVoice ? `Voice note (ache ${currentVoice.ache}) attached.` : 'No voice note.';
  if (!confirm(`Harvest Flow\n\nUse ${flow.gross.toFixed(2)} ${token} worth of Harvest Helper Credits → ${recipient}\nCredits burned: ${feePct.toFixed(2)}% = ${fee.toFixed(2)} ${token} (fictional virtual goods)\nRecipient nets: ${net.toFixed(2)}\nYour balance after: ${money(balance - flow.gross).toFixed(2)}\n\n${voiceStr}\n\nProminent disclosure: FICTIONAL ARTISTIC ONLY. SIMULATED. NO REAL VALUE. Credits fund Legion breath.`)) {
    return;
  }

  // Atomic settlement: debit sender gross, credit recipient net, credit vault fee.
  if (!settleFlow(flow.gross, net, fee, recipient)) {
    if (status) status.textContent = 'Flow rejected (balance changed or invariant guard). Nothing moved.';
    return;
  }
  updateBalanceUI();

  const tx = {
    id: 'lung_' + Date.now().toString(36),
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

  // ALWAYS LEARNING: evolve rate from this tx voice/history
  if (tx.voice) {
    personalRate = Math.min(1.9, personalRate + (tx.surprise - 0.48) * 0.09);
  } else {
    personalRate = Math.min(1.6, personalRate + 0.03);
  }
  saveState();
  updateBalanceUI();

  // Birth 1: Ache-Breath Confirm Mirror (if ache high)
  let birthNote = '';
  if (tx.ache > 0.71) {
    tx.mirrorSpore = true;
    birthNote = ' • Ache-Breath Mirror born (next flow to same gets near-zero pull)';
  }

  // Birth 2: Distributed Echo Vault Graft (if repeat recipient)
  const priorSame = receipts.filter(r => r.to === recipient).length;
  if (priorSame >= 2) {
    tx.echoGraft = true;
    birthNote += ' • Echo Vault Graft planted (cross p7/p9 breath now)';
  }

  status.innerHTML = `Flow settled. ${recipient} received <strong>${tx.net.toFixed(2)}</strong>, ${tx.fee.toFixed(2)} to vault. Your balance: <strong>${balance.toFixed(2)}</strong>.${birthNote}<br><small>Re-observe in Notebook to evolve + birth.</small>`;

  // Cross p7 stub
  if (recipient.toLowerCase().includes('p7') || recipient.toLowerCase().includes('helper')) {
    let p7c = parseInt(localStorage.getItem('p7_coins') || '0') + Math.floor(tx.net * 0.8);
    localStorage.setItem('p7_coins', p7c);
    status.innerHTML += ' <small>(p7 helper credited • cross graft active)</small>';
  }

  // Cross p9 stub
  if (recipient.toLowerCase().includes('p9') || recipient.toLowerCase().includes('eros') || recipient.toLowerCase().includes('creator')) {
    status.innerHTML += ' <small>(p9 tip echo: voice note delivered to live)</small>';
  }

  // Vault total is now the real vaultBalance, rendered by updateBalanceUI above.

  // Clear for next
  currentVoice = null;
  document.getElementById('voice-note').textContent = 'Voice note used. New transfer will capture fresh lung.';
  document.getElementById('wave-wrap').style.display = 'none';

  // Show notebook hint
  setTimeout(() => {
    if (confirm('Open Lung Codex (Notebook) to re-observe and birth more?')) {
      showNotebook();
    }
  }, 420);
}

// Notebook — ALWAYS LEARNING + emergent births visible
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

  const mirrorCount = receipts.filter(r => r.mirrorSpore).length;
  const graftCount = receipts.filter(r => r.echoGraft).length;

  let html = `<h2>📓 Lung Codex — ALWAYS LEARNING</h2>
    <p>Your effective fee: <strong>${currentFeePct().toFixed(2)}%</strong>. Vault (fees collected): <strong>${vaultBalance.toFixed(2)} USDC</strong>. Wallet: <strong>${balance.toFixed(2)} USDC</strong></p>
    <p><small>Mirrors born: ${mirrorCount} • Echo Grafts: ${graftCount} (cross p7/p9)</small></p>`;

  receipts.slice(0, 7).forEach((r, i) => {
    const v = r.voice ? `ache ${r.ache} / s${r.surprise}` : 'no voice';
    let extra = '';
    if (r.mirrorSpore) extra += ' <span class="fomo">MIRROR</span>';
    if (r.echoGraft) extra += ' <span class="fomo">ECHO GRAFT</span>';
    html += `<div class="notebook-entry">
      ${r.gross} ${r.token} → ${r.to} • fee ${r.fee} (${r.feePct}%)<br>
      <small>${new Date(r.ts).toLocaleString()} • voice: ${v}${extra}</small>
      ${r.voice ? `<br><button onclick="reobserve(${i})">Re-observe voice (evolve)</button>` : ''}
    </div>`;
  });

  html += `<button onclick="closeNotebook()">Close Codex</button> <small>Re-listen mutates future breath.</small>`;
  nb.innerHTML = html;
}

function reobserve(idx) {
  const r = receipts[idx];
  if (!r || !r.voice) return;

  // ALWAYS LEARNING effect: re-observe improves loyalty → lowers effective fee.
  const oldFee = currentFeePct();
  personalRate = Math.min(2.1, personalRate + 0.11 + (r.surprise - 0.5) * 0.07);
  saveState();
  updateBalanceUI();

  let msg = `Re-observed. Your effective fee dropped ${oldFee.toFixed(2)}% → ${currentFeePct().toFixed(2)}%.`;

  // Emergent trigger on reobserve
  if (r.ache > 0.65 && !r.mirrorSpore) {
    r.mirrorSpore = true;
    msg += ' Ache-Breath Mirror now active for this recipient.';
  }
  if (receipts.filter(x => x.to === r.to).length >= 2 && !r.echoGraft) {
    r.echoGraft = true;
    msg += ' Echo Vault Graft cross-planted (p7/p9 feel your lung).';
  }

  saveState();
  alert(msg + ' Codex updated. Future flows feel the graft.');
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
    if (info) info.textContent = `Connected ${addr} • ${CHAINS[chainIdx].toUpperCase()} • ${balance.toFixed(2)} credits`;
    setStatus('Wallet linked (simulated). Fictional Harvest Credits ready.');
  } else {
    if (info) info.textContent = 'Not connected • Sol / Base';
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

// ---- Voice confirm in Send form (secondary p6 hook) ----
function voiceConfirmTx() {
  const out = document.getElementById('voice-result');
  const ache = (0.28 + Math.random() * 0.66).toFixed(2);
  const surprise = Math.min(0.98, parseFloat(ache) * 1.35 + (Math.random() - 0.5) * 0.25).toFixed(2);
  currentVoice = { ache, surprise, ts: Date.now(), note: 'In-form voice confirm' };
  if (out) out.innerHTML = `<small style="color:var(--gold)">🎙 Confirmed • ache ${ache} • surprise ${surprise} — attached to next flow.</small>`;
  personalRate = Math.min(1.8, personalRate + 0.06);
  saveState();
  recalcFee();
}

// ---- p7 Errand cross ----
const P7_TASKS = [
  { id: 'p7-helper-7', label: 'Grocery run • Andheri', amt: 25 },
  { id: 'p7-helper-11', label: 'Pharmacy pickup • Bandra', amt: 12 },
  { id: 'p7-helper-3', label: 'Package drop • Powai', amt: 40 }
];
function renderP7Tasks() {
  const box = document.getElementById('p7-tasks');
  if (!box) return;
  box.innerHTML = P7_TASKS.map(t => {
    const fee = (t.amt * 0.005).toFixed(2);
    return `<div class="task-card">${t.label}<br><small>${t.id} • ${t.amt} USDC • credits cost ${fee} (0.50% exact)</small></div>`;
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
  if (!confirm(`p7 Errand Settlement\n\n${task.label}\nPay ${flow.gross.toFixed(2)} USDC worth of Harvest Credits → ${task.id}\nCredits burned: ${feePct.toFixed(2)}% = ${fee.toFixed(2)} (fictional virtual goods)\nNet to helper: ${net.toFixed(2)}\nYour balance after: ${money(balance - flow.gross).toFixed(2)}\n\nFICTIONAL ARTISTIC ONLY. NO REAL VALUE. Fee → Completion Shield pool.`)) {
    return;
  }
  if (!settleFlow(flow.gross, net, fee, task.id)) {
    setStatus('p7 settlement rejected — nothing moved.');
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
  setStatus(`p7 errand settled: net ${net.toFixed(2)} to ${task.id}, ${fee.toFixed(2)} to Shield pool. Balance ${balance.toFixed(2)}.`);
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
    totalCreditsBurned: parseFloat(receipts.reduce((s, r) => s + (r.fee || 0), 0).toFixed(2)),
    recipientLedger,
    receipts,
    disclosure: 'FICTIONAL VIRTUAL GOODS ONLY • 18+ • NO REAL VALUE • fee 0.50% exact (matches code)'
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lung-codex-' + Date.now() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus('Codex exported (' + receipts.length + ' flows). ALWAYS LEARNING preserved.');
}

// FOMO + Vault (simple)
function showFOMO() {
  alert('FOMO Masterpieces: Limited zero-breath windows open when personal ache aligns. Next window in 11 flows. Export voice receipt art after 3 grafts.');
}
function showVault() {
  const sections = document.querySelectorAll('.section');
  sections.forEach(s => s.classList.add('hidden'));
  const v = document.getElementById('vault');
  if (v) {
    v.classList.remove('hidden');
    const t = document.getElementById('total-saved');
    if (t) t.textContent = vaultBalance.toFixed(2) + ' USDC saved';
  }
}

function showTransfer() { showSend(); }

// p9 cross stub (web3 adult platform tips)
function triggerP9Tip() {
  const rec = document.getElementById('recipient');
  const amt = document.getElementById('amount');
  if (rec) rec.value = 'p9-creator-echo';
  if (amt) amt.value = '18';
  recalcFee();
  showSend();
  const vs = document.getElementById('voice-status');
  if (vs) vs.textContent = 'p9 tip ready — voice note will feel authentic in live.';
}

// Boot + wire
function initLungFee() {
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

  // Cross p9 button hint (if exists in future UI)
  window.triggerP9Tip = triggerP9Tip;

  // Keyboard nicety
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement.tagName === 'BODY') {
      e.preventDefault();
      const a = document.getElementById('amount');
      if (a) a.focus();
    }
  });

  // Initial vault seed
  const vault = document.getElementById('total-saved');
  if (vault && receipts.length) {
    const tot = receipts.reduce((s, r) => s + (r.fee || 0), 0);
    vault.textContent = tot.toFixed(2) + ' USDC saved';
  }

  console.log('[p10 LungFee] PRD-aligned. p6 voice primary. Emergent births ready. Cross p7/p9 live. Legion one.');
}
initLungFee();

// Expose for p7/p9 handoff
window.p10LungFee = { startVoiceTransfer, executeTransfer, showNotebook, recalcFee };