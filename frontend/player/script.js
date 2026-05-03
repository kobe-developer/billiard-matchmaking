const API = window.location.origin + '/backend';

// ============================================================
// STATE
// ============================================================
let playerData = null;
let sessionId = null;
let countdownInterval = null;
let pollInterval = null;
let lbInterval = null;
let cooldownInterval = null;
let fightDebounce = false;
let currentTab = 'dashboard';
let isCountdownRunning = false;
let lastStatus = null;
let matchTimer = null;

// ============================================================
// AUTH
// ============================================================
function switchAuthTab(tab) {
   document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
   document.getElementById('form-signup').classList.toggle('hidden', tab !== 'signup');
   document.getElementById('tab-login').classList.toggle('tab-active', tab === 'login');
   document.getElementById('tab-login').classList.toggle('text-slate-400', tab !== 'login');
   document.getElementById('tab-signup').classList.toggle('tab-active', tab === 'signup');
   document.getElementById('tab-signup').classList.toggle('text-slate-400', tab !== 'signup');
}

async function doLogin() {
   const username = document.getElementById('login-username').value.trim();
   const password = document.getElementById('login-password').value;
   const errEl = document.getElementById('login-err');
   errEl.classList.add('hidden');

   if (!username || !password) {
      errEl.textContent = 'Username dan password wajib diisi';
      errEl.classList.remove('hidden');
      return;
   }

   try {
      const res = await apiFetch('/api/auth/login', { method: 'POST', body: { username, password } });
      localStorage.setItem('bp_token', res.token);
      localStorage.setItem('bp_role', res.role);

      if (res.role === 'staff') {
         window.location.href = 'staff.html';
         return;
      }

      playerData = res.player;
      localStorage.setItem('bp_player', JSON.stringify(playerData));
      showApp();
   } catch (e) {
      errEl.textContent = e.message || 'Login gagal';
      errEl.classList.remove('hidden');
   }
}

async function doSignup() {
   const username = document.getElementById('signup-username').value.trim();
   const password = document.getElementById('signup-password').value;
   const confirm = document.getElementById('signup-confirm').value;
   const errEl = document.getElementById('signup-err');
   errEl.classList.add('hidden');

   if (!username || !password || !confirm) {
      errEl.textContent = 'Semua field wajib diisi';
      errEl.classList.remove('hidden');
      return;
   }
   if (password !== confirm) {
      errEl.textContent = 'Password tidak cocok';
      errEl.classList.remove('hidden');
      return;
   }
   if (password.length < 6) {
      errEl.textContent = 'Password minimal 6 karakter';
      errEl.classList.remove('hidden');
      return;
   }

   const avatar = document.querySelector('input[name="avatar-choice"]:checked');

   try {
      await apiFetch('/api/auth/signup', { method: 'POST', body: { username, password, avatar: avatar.value } });
      showToast('Akun berhasil dibuat! Silakan login', 'success');
      switchAuthTab('login');
      document.getElementById('login-username').value = username;
   } catch (e) {
      errEl.textContent = e.message || 'Pendaftaran gagal';
      errEl.classList.remove('hidden');
   }
}

function doLogout() {
   clearAllIntervals();
   localStorage.clear();
   location.reload();
}

// ============================================================
// APP INIT
// ============================================================
function showApp() {
   document.getElementById('screen-auth').classList.add('hidden');
   document.getElementById('screen-app').classList.remove('hidden');
   loadPlayerData();
   showTab('dashboard');
}

function hideBtnFight(status) {
   if (status === true) {
      document.getElementById('btn-fight').classList.add('hidden');
   } else {
      document.getElementById('btn-fight').classList.remove('hidden');
   }
}

async function loadPlayerData() {
   try {
      hideBtnFight(true);
      const res = await apiFetch('/api/match/me');
      playerData = res;

      updateProfileUI();
      await updateFightButton();
      startMatchCheckLoop();
   } catch (e) {
      if (e.status === 401) doLogout();
   } finally {
      hideBtnFight(false);
   }
}

function startMatchCheckLoop() {
   try {
      const matchTimeSeconds = 10;
      matchTimer = setInterval(async () => {
         const res = await apiFetch('/api/match/me');
         playerData = res;
         updateProfileUI();
         updateFightButton();
      }, matchTimeSeconds * 1000);
   } catch (e) { }
}

function stopMatchCheck() {
   if (matchTimer) clearInterval(matchTimer);
}

function updateProfileUI() {
   if (!playerData) return;
   const p = playerData;

   // Header
   document.getElementById('header-name').textContent = p.name;
   document.getElementById('header-hc').textContent = p.hc ? `HC ${p.hc}` : 'Belum ada HC';
   document.getElementById('header-player-info').classList.remove('hidden');

   // Profile card
   document.getElementById('profile-name').textContent = p.name;
   document.getElementById('profile-points').textContent = p.points ?? 0;
   document.getElementById('stat-win').textContent = p.win ?? 0;
   document.getElementById('stat-lose').textContent = p.lose ?? 0;
   document.getElementById('stat-streak').textContent = p.streak ?? 0;

   // HC badge
   const hcEl = document.getElementById('profile-hc');
   if (p.hc) {
      hcEl.textContent = `HC ${p.hc}`;
      hcEl.className = `text-xs px-2 py-0.5 rounded-full font-semibold text-white ${hcColor(p.hc)}`;
   } else {
      hcEl.textContent = 'Belum ada HC';
      hcEl.className = 'text-xs px-2 py-0.5 rounded-full font-semibold text-slate-400 bg-white/10';
   }

   // Daily match pips
   const used = p.daily_match ?? 0;
   for (let i = 0; i < 3; i++) {
      const pip = document.getElementById(`match-pip-${i}`);
      pip.className = `flex-1 h-2 rounded-full ${i < used ? 'bg-violet-500' : 'bg-white/10'}`;
   }
   document.getElementById('daily-match-text').textContent = `${used}/3`;

   // Cooldown
   if (p.cooldown_until && new Date(p.cooldown_until) > new Date()) {
      startCooldownTimer(p.cooldown_until);
   } else {
      document.getElementById('cooldown-banner').classList.add('hidden');
   }
}

async function updateFightButton() {
   const btn = document.getElementById('btn-fight');
   const { status } = await apiFetch('/api/match/active');

   if (status === 'active') {
      btn.disabled = true;
      btn.innerHTML = '⚔️ ON MATCH';
      return;
   }

   if (!playerData) return;

   const inCooldown = playerData.cooldown_until && new Date(playerData.cooldown_until) > new Date();
   const limitReached = playerData.daily_match >= 3;

   if (inCooldown) {
      btn.disabled = true;
      btn.textContent = '⏳ Cooldown...';
      return;
   }

   if (limitReached) {
      btn.disabled = true;
      btn.textContent = '🚫 Limit Habis';
      return;
   }

   btn.disabled = false;
   btn.innerHTML = '⚔️ FIGHT';
}

// ============================================================
// NAVIGATION
// ============================================================
function showTab(tab) {
   currentTab = tab;
   ['dashboard', 'leaderboard'].forEach(t => {
      document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
      const navBtn = document.querySelector(`[data-tab="${t}"]`);
      if (navBtn) {
         navBtn.classList.toggle('text-violet-400', t === tab);
         navBtn.classList.toggle('text-slate-400', t !== tab);
      }
   });

   if (tab === 'leaderboard') {
      fetchLeaderboard();
      stopMatchCheck();
      if (!lbInterval) lbInterval = setInterval(fetchLeaderboard, 5000);
   } else {
      if (lbInterval) { clearInterval(lbInterval); lbInterval = null; }
      loadPlayerData();
   }
}

// ============================================================
// MATCHMAKING
// ============================================================
let lastFightTime = 0;
async function debouncedFight() {
   if (playerData.hc == null) {
      showToast('Belum ada HC. Mohon info ke staff', 'error');
      return;
   }
   const now = Date.now();
   if (fightDebounce || now - lastFightTime < 2000) return;
   lastFightTime = now;
   fightDebounce = true;
   setTimeout(() => { fightDebounce = false; }, 2000);
   await startFight();
}

async function startFight() {
   try {
      const res = await apiFetch('/api/match/fight', { method: 'POST' });
      sessionId = res.session_id;

      showOverlay();
      if (res.status === 'queue') {
         showMatchState('searching');
         startPolling();
      } else if (res.status === 'waiting_ready') {
         showMatchState('ready');
         startCountdown(res.expires_at);
         startPolling();
      }
   } catch (e) {
      showToast(e.message || 'Gagal memulai match', 'error');
   }
}

async function cancelQueue() {
   if (!sessionId) { closeMatchOverlay(); return; }
   try {
      await apiFetch('/api/match/cancel', { method: 'POST', body: { session_id: sessionId } });
   } catch (e) { }
   closeMatchOverlay();
}

async function clickReady() {
   if (!sessionId) return;
   const btn = document.getElementById('btn-ready');
   btn.disabled = true;
   btn.textContent = '✅ Menunggu lawan...';
   document.getElementById('status-me').textContent = '✅';

   try {
      const res = await apiFetch('/api/match/ready', { method: 'POST', body: { session_id: sessionId } });
      if (res.status === 'active') {
         onMatchActive();
      }
   } catch (e) {
      showToast(e.message || 'Gagal ready', 'error');
      btn.disabled = false;
      btn.textContent = '✅ READY';
   }
}

function startPolling() {
   if (pollInterval) clearInterval(pollInterval);
   pollInterval = setInterval(async () => {
      try {
         const res = await apiFetch('/api/match/status');
         handleMatchStatus(res);
      } catch (e) { }
   }, 2000);
}

function handleMatchStatus(res) {

   if (!res || res.status === 'idle') {
      clearPollInterval();
      isCountdownRunning = false;
      return;
   }

   if (res.status === 'waiting_ready') {
      showMatchState('ready');

      if (res.expires_at && !isCountdownRunning) {
         startCountdown(res.expires_at);
         isCountdownRunning = true;
      }

      if (res.opponent_name) {
         document.getElementById('opponent-name-display').textContent = `vs ${res.opponent_name}`;
         document.getElementById('status-opp-name').textContent = res.opponent_name;
         document.getElementById('active-opponent-name').textContent = res.opponent_name;
      }

      if (res.my_ready) {
         document.getElementById('status-me').textContent = '✅';
         const btn = document.getElementById('btn-ready');
         btn.disabled = true;
         btn.textContent = '✅ Menunggu lawan...';
      }
      if (res.opponent_ready) {
         document.getElementById('status-opp').textContent = '✅';
      }

   } else if (res.status === 'active') {
      isCountdownRunning = false;
      onMatchActive();
   } else if (res.status === 'canceled') {
      isCountdownRunning = false;
      onMatchCanceled();
   }
}

function onMatchActive() {
   clearPollInterval();
   clearCountdown();
   showMatchState('active');
   loadPlayerData();
}

function onMatchCanceled() {
   clearPollInterval();
   clearCountdown();
   showMatchState('canceled');
   loadPlayerData();
}

function startCountdown(expiresAt) {
   clearCountdown();
   const circle = document.getElementById('countdown-circle');
   const totalSecs = 40;

   function update() {
      const remaining = Math.max(0, Math.ceil((new Date(expiresAt) - new Date()) / 1000));
      document.getElementById('countdown-number').textContent = remaining;
      const progress = remaining / totalSecs;
      circle.style.strokeDashoffset = 283 * (1 - progress);

      if (remaining <= 0) {
         clearCountdown();
         loadPlayerData();
      }
   }

   update();
   countdownInterval = setInterval(update, 1000);
}

function startCooldownTimer(until) {
   document.getElementById('cooldown-banner').classList.remove('hidden');
   if (cooldownInterval) clearInterval(cooldownInterval);

   function update() {
      const diff = new Date(until) - new Date();
      if (diff <= 0) {
         document.getElementById('cooldown-banner').classList.add('hidden');
         clearInterval(cooldownInterval);
         loadPlayerData();
         return;
      }
      const secs = Math.ceil(diff / 1000);
      document.getElementById('cooldown-text').textContent = `${secs}s`;
      updateFightButton();
   }

   update();
   cooldownInterval = setInterval(update, 1000);
}

function showOverlay() { document.getElementById('overlay-match').classList.remove('hidden'); }
function closeMatchOverlay() {
   document.getElementById('overlay-match').classList.add('hidden');
   clearPollInterval();
   clearCountdown();
   sessionId = null;
   loadPlayerData();
   lastStatus = 'active';
   location.reload();
}

function showMatchState(state) {
   ['searching', 'ready', 'active', 'canceled'].forEach(s => {
      document.getElementById(`match-state-${s}`).classList.toggle('hidden', s !== state);
   });
}

function clearPollInterval() { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } }

function clearCountdown() {
   if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
   }
   isCountdownRunning = false;
}

function clearAllIntervals() {
   clearPollInterval(); clearCountdown();
   if (lbInterval) clearInterval(lbInterval);
   if (cooldownInterval) clearInterval(cooldownInterval);
   stopMatchCheck();
}

// ============================================================
// LEADERBOARD
// ============================================================
async function fetchLeaderboard() {
   try {
      const res = await apiFetch('/api/leaderboard');
      renderLeaderboard(res.leaderboard);
   } catch (e) { }
}

function renderLeaderboard(data) {
   const el = document.getElementById('leaderboard-list');
   if (!data || data.length === 0) {
      el.innerHTML = '<div class="text-slate-400 text-center py-8">Belum ada data</div>';
      return;
   }

   const medals = ['🥇', '🥈', '🥉'];
   el.innerHTML = data.map((p, i) => `
      <div class="card-glass rounded-xl px-4 py-3 flex items-center gap-3
      ${playerData && p.id === playerData.id ? 'border border-violet-500/50' : ''}">
      <div class="text-lg w-8 text-center font-bold ${i < 3 ? '' : 'text-slate-500'}">
         ${i < 3 ? medals[i] : i + 1}
      </div>
      <div class="flex-1 min-w-0 flex items-center gap-3">
         <div class="w-8 h-8 rounded-full bg-slate-700 flex-shrink-0 overflow-hidden border border-slate-600 shadow-inner">
            <img
            src="${p.avatar}"
            alt="${p.name}"
            class="w-full h-full object-cover"
            onerror="this.style.display='none'; this.parentElement.classList.add('bg-violet-600');"
            />
         </div>

         <div class="min-w-0 flex flex-col justify-center">
            <div class="font-semibold truncate text-sm leading-tight ${playerData && p.id === playerData.id ? 'text-violet-300' : ''}">
            ${p.name} ${playerData && p.id === playerData.id ? '(Kamu)' : ''}
            </div>
            <div class="text-[10px] text-slate-400 leading-tight">
            ${p.win}W / ${p.lose}L
            </div>
         </div>
      </div>
      <div class="text-right">
         ${p.hc ? `<span class="text-xs px-1.5 py-0.5 rounded-full text-white font-semibold ${hcColor(p.hc)}">${p.hc}</span>` : ''}
         <div class="text-violet-400 font-bold text-sm mt-0.5">${p.points} pts</div>
      </div>
      </div>
   `).join('');
}

// ============================================================
// UTILITIES
// ============================================================
async function apiFetch(path, opts = {}) {
   const tk = localStorage.getItem('bp_token');
   const res = await fetch(`${API}${path}`, {
      method: opts.method || 'GET',
      headers: {
         'Content-Type': 'application/json',
         'Accept': 'application/json',
         ...(tk ? { 'Authorization': `Bearer ${tk}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok) throw { status: res.status, message: data.error || 'Error' };
   return data;
}

function showToast(msg, type = 'info') {
   const colors = { info: '#3b82f6', success: '#22c55e', error: '#ef4444', warn: '#f59e0b' };
   const el = document.createElement('div');
   el.style.cssText = `position:fixed;top:20px;right:20px;z-index:9999;padding:12px 20px;
        border-radius:12px;background:${colors[type] || colors.info};color:white;
        font-size:14px;font-weight:500;box-shadow:0 8px 32px rgba(0,0,0,0.4);
        transition:all .3s ease;max-width:300px;`;
   el.textContent = msg;
   document.body.appendChild(el);
   setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-10px)'; setTimeout(() => el.remove(), 300); }, 3000);
}

function hcColor(hc) {
   const map = { '3B': '#64748b', '3A': '#3b82f6', '3+': '#06b6d4', '4B': '#7c3aed', '4A': '#9333ea', '4+': '#eab308' };
   return map[hc] || '#6b7280';
}

function createaAvatarChoises() {
   const choices = document.getElementById('avatar-choices');
   const avatars = ['1', '2', '3', '4', '5'].map((value) => {
      const checked = value === '1' ? 'checked' : '';

      return `
      <label class="relative cursor-pointer group">
         <input type="radio" name="avatar-choice" value="avatars/avatar-${value}.png" class="peer hidden" ${checked}>
         <div
            class="w-12 h-12 rounded-full border-2 border-transparent peer-checked:border-violet-500 peer-checked:bg-violet-500/20 p-0.5 transition-all">
            <img src="avatars/avatar-${value}.png" class="w-full h-full rounded-full object-cover bg-slate-800" />
         </div>
      </label>
      `;
   }).join('');

   choices.innerHTML = avatars;
}

// ============================================================
// BOOT
// ============================================================
(function init() {
   createaAvatarChoises();
   const tk = localStorage.getItem('bp_token');
   const role = localStorage.getItem('bp_role');
   if (tk && role === 'player') {
      showApp();
   }
})();