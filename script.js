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
let currentVoice = null; // {transcript-ish, ache, surprise, audioUrl?}
let mediaRecorder, audioChunks = [], audioCtx, analyser, source, dataArray, raf;

const FEE_BPS = 50; // 0.50% base — exact match shield

function saveState() {
  localStorage.setItem('p10_balance', balance.toFixed(2));
  localStorage.setItem('p10_personal_rate', personalRate.toFixed(2));
  localStorage.setItem('p10_receipts', JSON.stringify(receipts));
}

function updateBalanceUI() {
  const b = document.getElementById('balance');
  if (b) b.textContent = balance.toFixed(2);
  const pr = document.getElementById('personal-rate');
  if (pr) pr.textContent = personalRate.toFixed(2) + '%';
}

function recalcFee() {
  const amtEl = document.getElementById('amount');
  const finalEl = document.getElementById('final-fee');
  const nearBar = document.getElementById('near-bar');
  const nearText = document.getElementById('near-text');
  const savedEl = document.getElementById('saved-this');
  const volumeEl = document.getElementById('volume');
  const sunkFill = document.getElementById('sunk-fill');

  if (!amtEl || !finalEl) return;

  const amt = parseFloat(amtEl.value) || 0;
  let feePct = 0.50; // base
  // Personal rate evolution (ALWAYS LEARNING effect)
  feePct = Math.max(0.05, feePct - (personalRate * 0.6));

  const fee = amt * (feePct / 100);
  finalEl.textContent = `Harvest Credits used: ${fee.toFixed(2)} (fictional virtual goods • ${feePct.toFixed(2)}% of flow)`;

  // Near-miss visual (variable ratio weapon)
  const near = Math.max(0, Math.min(95, (0.50 - feePct) * 180 + 12 + (Math.random()-0.5)*8));
  if (nearBar) nearBar.style.width = near + '%';
  if (nearText) nearText.textContent = (0.50 - feePct).toFixed(3) + ' away from max efficiency (credits)';

  // Endowment "saved this flow"
  const saved = amt * ((0.50 - feePct) / 100);
  if (savedEl) savedEl.textContent = saved.toFixed(2);

  // Sunk rhythm (monthly)
  const vol = Math.min(2000, 872 + amt * 0.7);
  if (volumeEl) volumeEl.textContent = Math.floor(vol);
  if (sunkFill) sunkFill.style.width = Math.min(100, (vol / 2000) * 100) + '%';
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
        status.textContent = 'Voice captured. Lung remembers. Fee now reflects your breath.';

        // Evolve personal rate slightly from voice (ALWAYS LEARNING)
        personalRate = Math.min(1.8, personalRate + (surprise - 0.5) * 0.12);
        updateBalanceUI();
        recalcFee();

        // Birth seed: if high ache, plant Mirror Spore immediately
        if (ache > 0.72) {
          status.textContent += ' • Ache-Breath Mirror spore planted.';
        }

        stream.getTracks().forEach(t => t.stop());
        btn.disabled = false;
      };

      mediaRecorder.start();
      btn.textContent = '■ Stop & Capture';

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

  let feePct = 0.50 - (personalRate * 0.55);
  feePct = Math.max(0.04, feePct);
  const fee = amt * (feePct / 100);
  const net = amt - fee;

  // Prominent shield + confirm (미꾸라지)
  const voiceStr = currentVoice ? `Voice note (ache ${currentVoice.ache}) attached.` : 'No voice note.';
  if (!confirm(`Harvest Flow\n\nUse ${amt} ${token} worth of Harvest Helper Credits → ${recipient}\nCredits burned: ${feePct.toFixed(2)}% = ${fee.toFixed(2)} ${token} (fictional virtual goods)\nNet facilitation: ${net.toFixed(2)}\n\n${voiceStr}\n\nProminent disclosure: FICTIONAL ARTISTIC ONLY. SIMULATED. NO REAL VALUE. Credits fund Legion breath.`)) {
    return;
  }

  // Skim
  balance = Math.max(0, balance - amt);
  updateBalanceUI();

  const tx = {
    id: 'lung_' + Date.now().toString(36),
    ts: Date.now(),
    token,
    gross: amt,
    fee: parseFloat(fee.toFixed(2)),
    feePct: parseFloat(feePct.toFixed(2)),
    net: parseFloat(net.toFixed(2)),
    to: recipient,
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

  status.innerHTML = `Flow executed. Net ${tx.net} skimmed ${tx.fee}. Lung spore saved.${birthNote}<br><small>Re-observe in Notebook to evolve + birth.</small>`;

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

  // Update vault if visible
  const vaultTotal = document.getElementById('total-saved');
  if (vaultTotal) {
    const totalSaved = receipts.reduce((s, r) => s + (r.fee || 0), 0);
    vaultTotal.textContent = totalSaved.toFixed(2) + ' USDC saved';
  }

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

  const totalSaved = receipts.reduce((s, r) => s + (r.fee || 0), 0);
  const mirrorCount = receipts.filter(r => r.mirrorSpore).length;
  const graftCount = receipts.filter(r => r.echoGraft).length;

  let html = `<h2>📓 Lung Codex — ALWAYS LEARNING</h2>
    <p>Personal breath rate: <strong>${personalRate.toFixed(2)}%</strong>. Total skim saved in lung: <strong>${totalSaved.toFixed(2)} USDC</strong></p>
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

  // ALWAYS LEARNING effect: re-observe improves rate + may birth
  const oldRate = personalRate;
  personalRate = Math.min(2.1, personalRate + 0.11 + (r.surprise - 0.5) * 0.07);
  saveState();
  updateBalanceUI();

  let msg = `Re-observed. Breath evolved ${oldRate.toFixed(2)}% → ${personalRate.toFixed(2)}%.`;

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
  document.getElementById('transfer').classList.remove('hidden');
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
    const total = receipts.reduce((s, r) => s + (r.fee || 0), 0);
    const t = document.getElementById('total-saved');
    if (t) t.textContent = total.toFixed(2) + ' USDC saved';
  }
}

function showTransfer() {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.getElementById('transfer').classList.remove('hidden');
}

// p9 cross stub (web3 adult platform tips)
function triggerP9Tip() {
  const rec = document.getElementById('recipient');
  const amt = document.getElementById('amount');
  if (rec) rec.value = 'p9-creator-echo';
  if (amt) amt.value = '18';
  recalcFee();
  document.getElementById('transfer').classList.remove('hidden');
  document.getElementById('voice-status').textContent = 'p9 tip ready — voice note will feel authentic in live.';
}

// Boot + wire
function initLungFee() {
  updateBalanceUI();
  const amt = document.getElementById('amount');
  if (amt) {
    amt.addEventListener('input', recalcFee);
  }
  recalcFee();

  // p6 lung ready notice
  const st = document.getElementById('voice-status');
  if (st) st.textContent = 'p6 Lung connected. Voice is the transfer.';

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