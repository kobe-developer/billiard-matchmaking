const API = window.location.origin + '/backend';

let allPlayers = [];
let selectedPlayerId = null;
let selectedHC = null;
let selectedPlayerA = null;
let selectedPlayerB = null;
let selectedWinner = null;

// ============================================================
// AUTH
// ============================================================
async function doStaffLogin() {
   const username = document.getElementById('staff-username').value.trim();
   const password = document.getElementById('staff-password').value;
   const errEl = document.getElementById('login-err');
   errEl.classList.add('hidden');

   try {
      const res = await apiFetch('/api/auth/login', { method: 'POST', body: { username, password } });
      if (res.role !== 'staff') {
         errEl.textContent = 'Akun ini bukan staff';
         errEl.classList.remove('hidden');
         return;
      }
      localStorage.setItem('bp_token', res.token);
      localStorage.setItem('bp_role', 'staff');
      showApp();
   } catch (e) {
      errEl.textContent = e.message || 'Login gagal';
      errEl.classList.remove('hidden');
   }
}

function doLogout() {
   localStorage.clear();
   location.reload();
}

function showApp() {
   document.getElementById('screen-login').classList.add('hidden');
   document.getElementById('screen-app').classList.remove('hidden');
   switchTab('players');
}

// ============================================================
// NAVIGATION
// ============================================================
function switchTab(tab) {
   ['players', 'match', 'history'].forEach(t => {
      document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
      const btn = document.querySelector(`[data-tab="${t}"]`);
      if (btn) {
         btn.classList.toggle('bg-violet-500/20', t === tab);
         btn.classList.toggle('text-violet-300', t === tab);
         btn.classList.toggle('text-slate-400', t !== tab);
      }
   });

   if (tab === 'players') loadPlayers();
   if (tab === 'match') { loadPlayers(); resetMatchForm(); }
   if (tab === 'history') loadHistory();
}

// ============================================================
// PLAYER MANAGEMENT
// ============================================================
async function loadPlayers() {
   try {
      const res = await apiFetch('/api/staff/players');
      allPlayers = res.players;
      renderPlayers(allPlayers);
   } catch (e) {
      showToast(e.message || 'Gagal memuat pemain', 'error');
   }
}

function filterPlayers() {
   const q = document.getElementById('search-player').value.toLowerCase();
   const filtered = allPlayers.filter(p =>
      p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)
   );
   renderPlayers(filtered);
}

function renderPlayers(players) {
   const tbody = document.getElementById('players-tbody');
   if (!players || players.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400">Tidak ada data</td></tr>';
      return;
   }

   tbody.innerHTML = players.map(p => `
          <tr class="table-row border-b border-white/5 transition-colors">
            <td class="px-4 py-3">
              <div class="font-semibold">${p.name}</div>
              <div class="text-xs text-slate-400">@${p.username}</div>
              <div class="flex items-center gap-1.5 mt-1 sm:hidden">
                ${p.hc ? `<span class="badge text-white" style="background:${hcColorHex(p.hc)}">${p.hc}</span>` : '<span class="badge bg-white/10 text-slate-400">No HC</span>'}
                <span class="text-xs text-violet-400">${p.points}pts</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center hidden sm:table-cell">
              ${p.hc ? `<span class="badge text-white" style="background:${hcColorHex(p.hc)}">${p.hc}</span>` : '<span class="badge bg-white/10 text-slate-400">—</span>'}
            </td>
            <td class="px-4 py-3 text-center hidden md:table-cell text-violet-400 font-semibold">${p.points}</td>
            <td class="px-4 py-3 text-center hidden md:table-cell">
              <span class="text-green-400">${p.win}W</span> <span class="text-slate-600">/</span> <span class="text-red-400">${p.lose}L</span>
            </td>
            <td class="px-4 py-3 text-center hidden lg:table-cell">
              <span class="${p.daily_match >= 3 ? 'text-red-400' : 'text-slate-300'} font-semibold">${p.daily_match}/3</span>
              ${p.cooldown_until && new Date(p.cooldown_until) > new Date()
         ? '<span class="block text-xs text-yellow-400">cooldown</span>'
         : ''}
            </td>
            <td class="px-4 py-3">
              <div class="flex gap-1 justify-end flex-wrap">
                <button onclick="openHCModal(${p.id}, '${p.name}', '${p.hc || ''}')"
                  class="px-2.5 py-1.5 rounded-lg bg-violet-500/20 text-violet-300 text-xs hover:bg-violet-500/30 transition-colors whitespace-nowrap">
                  Set HC
                </button>
                <button onclick="openResetLimitModal(${p.id}, '${p.name}')"
                  class="px-2.5 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 text-xs hover:bg-blue-500/30 transition-colors whitespace-nowrap">
                  Reset Limit
                </button>
                <button onclick="openPWModal(${p.id}, '${p.name}')"
                  class="px-2.5 py-1.5 rounded-lg bg-orange-500/20 text-orange-300 text-xs hover:bg-orange-500/30 transition-colors whitespace-nowrap">
                  Reset PW
                </button>
              </div>
            </td>
          </tr>
        `).join('');
}

// Set Handicap
function openHCModal(playerId, name, currentHC) {
   selectedPlayerId = playerId;
   selectedHC = currentHC || null;
   document.getElementById('modal-hc-name').textContent = `Pemain: ${name}`;

   // Reset & highlight current
   document.querySelectorAll('.hc-btn').forEach(btn => {
      const isActive = btn.dataset.hc === currentHC;
      btn.classList.toggle('bg-violet-500/30', isActive);
      btn.classList.toggle('border-violet-500', isActive);
      btn.classList.toggle('text-violet-300', isActive);
      btn.classList.toggle('border-white/10', !isActive);
   });

   document.getElementById('btn-save-hc').disabled = !currentHC;
   document.getElementById('modal-hc').classList.remove('hidden');
}

function selectHC(hc) {
   selectedHC = hc;
   document.querySelectorAll('.hc-btn').forEach(btn => {
      const isActive = btn.dataset.hc === hc;
      btn.classList.toggle('bg-violet-500/30', isActive);
      btn.classList.toggle('border-violet-500', isActive);
      btn.classList.toggle('text-violet-300', isActive);
      btn.classList.toggle('border-white/10', !isActive);
   });
   document.getElementById('btn-save-hc').disabled = false;
}

async function saveHC() {
   if (!selectedPlayerId || !selectedHC) return;
   try {
      await apiFetch(`/api/staff/player/${selectedPlayerId}/handicap`, {
         method: 'PUT', body: { hc: selectedHC }
      });
      showToast('HC berhasil diupdate', 'success');
      closeModal('modal-hc');
      loadPlayers();
   } catch (e) {
      showToast(e.message || 'Gagal update HC', 'error');
   }
}

async function resetLimit() {
   try {
      await apiFetch(`/api/staff/player/${selectedPlayerId}/reset-limit`, { method: 'PUT' });
      closeModal('modal-reset-limit');
      showToast(`Jatah match direset`, 'success');
      loadPlayers();
   } catch (e) {
      showToast(e.message || 'Gagal reset limit', 'error');
   }
}

// Reset Password
function openPWModal(playerId, name) {
   selectedPlayerId = playerId;
   document.getElementById('modal-pw-name').textContent = `Pemain: ${name}`;
   document.getElementById('new-password').value = '';
   document.getElementById('modal-pw').classList.remove('hidden');
}

function openResetLimitModal(playerId, name) {
   selectedPlayerId = playerId;
   document.getElementById('reset-limit-player-name').textContent = `Pemain: ${name}`;
   document.getElementById('modal-reset-limit').classList.remove('hidden');
}

async function savePassword() {
   const pw = document.getElementById('new-password').value;
   if (pw.length < 6) { showToast('Password minimal 6 karakter', 'warn'); return; }
   try {
      await apiFetch(`/api/staff/player/${selectedPlayerId}/reset-password`, {
         method: 'PUT', body: { new_password: pw }
      });
      showToast('Password berhasil direset', 'success');
      closeModal('modal-pw');
   } catch (e) {
      showToast(e.message || 'Gagal reset password', 'error');
   }
}

// ============================================================
// MATCH RESULT
// ============================================================
let searchDebounceA, searchDebounceB;

function searchPlayer(side) {
   const q = document.getElementById(`search-${side}`).value.toLowerCase();
   clearTimeout(side === 'a' ? searchDebounceA : searchDebounceB);

   const timer = setTimeout(() => {
      const dropdown = document.getElementById(`dropdown-${side}`);
      if (!q) { dropdown.classList.add('hidden'); return; }

      const filtered = allPlayers.filter(p =>
         p.name.toLowerCase().includes(q) &&
         p.id !== (side === 'a' ? selectedPlayerB?.id : selectedPlayerA?.id)
      );

      if (filtered.length === 0) {
         dropdown.innerHTML = '<div class="px-4 py-3 text-slate-400 text-sm">Tidak ditemukan</div>';
      } else {
         dropdown.innerHTML = filtered.slice(0, 6).map(p => `
              <button onclick="selectPlayer('${side}', ${p.id})"
                class="w-full px-4 py-2.5 text-left hover:bg-white/10 transition-colors flex items-center gap-2 text-sm">
                <div>
                  <div class="font-medium">${p.name}</div>
                  <div class="text-xs text-slate-400">${p.hc ? `HC ${p.hc}` : 'Belum ada HC'}</div>
                </div>
              </button>
            `).join('');
      }
      dropdown.classList.remove('hidden');
   }, 200);

   if (side === 'a') searchDebounceA = timer;
   else searchDebounceB = timer;
}

function selectPlayer(side, id) {
   const p = allPlayers.find(x => x.id === id);
   if (!p) return;

   if (side === 'a') {
      selectedPlayerA = p;
      document.getElementById('search-a').value = '';
      document.getElementById('dropdown-a').classList.add('hidden');
      document.getElementById('selected-a').classList.remove('hidden');
      document.getElementById('selected-a-name').textContent = p.name;
      const hcEl = document.getElementById('selected-a-hc');
      hcEl.textContent = p.hc || 'No HC';
      hcEl.style.background = p.hc ? hcColorHex(p.hc) : '#374151';
      hcEl.className = 'ml-2 text-xs px-1.5 py-0.5 rounded-full font-semibold text-white';
      document.getElementById('winner-label-a').textContent = p.name;
      document.getElementById('winner-btn-a').disabled = false;
   } else {
      selectedPlayerB = p;
      document.getElementById('search-b').value = '';
      document.getElementById('dropdown-b').classList.add('hidden');
      document.getElementById('selected-b').classList.remove('hidden');
      document.getElementById('selected-b-name').textContent = p.name;
      const hcEl = document.getElementById('selected-b-hc');
      hcEl.textContent = p.hc || 'No HC';
      hcEl.style.background = p.hc ? hcColorHex(p.hc) : '#374151';
      hcEl.className = 'ml-2 text-xs px-1.5 py-0.5 rounded-full font-semibold text-white';
      document.getElementById('winner-label-b').textContent = p.name;
      document.getElementById('winner-btn-b').disabled = false;
   }

   updateSubmitBtn();
}

function clearPlayer(side) {
   if (side === 'a') {
      selectedPlayerA = null;
      document.getElementById('selected-a').classList.add('hidden');
      document.getElementById('winner-label-a').textContent = 'Pemain A';
      document.getElementById('winner-btn-a').disabled = true;
   } else {
      selectedPlayerB = null;
      document.getElementById('selected-b').classList.add('hidden');
      document.getElementById('winner-label-b').textContent = 'Pemain B';
      document.getElementById('winner-btn-b').disabled = true;
   }
   selectedWinner = null;
   document.getElementById('point-preview').classList.add('hidden');
   updateSubmitBtn();
}

function selectWinner(side) {
   selectedWinner = side;
   const winner = side === 'a' ? selectedPlayerA : selectedPlayerB;
   const loser = side === 'a' ? selectedPlayerB : selectedPlayerA;

   ['a', 'b'].forEach(s => {
      const btn = document.getElementById(`winner-btn-${s}`);
      btn.classList.toggle('border-violet-500', s === side);
      btn.classList.toggle('border-yellow-500/50', s === side);
      btn.classList.toggle('bg-violet-500/20', s === side);
      btn.classList.toggle('border-white/10', s !== side);
   });

   // Show point preview using the matrix
   if (winner && loser) {
      const matrix = {
         '3B': { '3B': 20, '3A': 23, '3+': 26, '4B': 29, '4A': 32, '4+': 35 },
         '3A': { '3B': 17, '3A': 20, '3+': 23, '4B': 26, '4A': 29, '4+': 32 },
         '3+': { '3B': 14, '3A': 17, '3+': 20, '4B': 23, '4A': 26, '4+': 29 },
         '4B': { '3B': 11, '3A': 14, '3+': 17, '4B': 20, '4A': 23, '4+': 26 },
         '4A': { '3B': 8, '3A': 11, '3+': 14, '4B': 17, '4A': 20, '4+': 23 },
         '4+': { '3B': 5, '3A': 8, '3+': 11, '4B': 14, '4A': 17, '4+': 20 },
      };
      const basePoints = (winner.hc && loser.hc && matrix[winner.hc] && matrix[winner.hc][loser.hc])
         ? matrix[winner.hc][loser.hc] : 20;

      document.getElementById('point-preview-text').innerHTML = `
            <div class="flex justify-between">
              <span class="text-slate-400">Poin base (${winner.hc || 'N/A'} vs ${loser.hc || 'N/A'}):</span>
              <span class="text-green-400 font-semibold">+${basePoints}</span>
            </div>
            <div class="flex justify-between text-xs text-slate-500">
              <span>Penalti ketemu berulang dihitung otomatis dari history</span>
            </div>
          `;
      document.getElementById('point-preview').classList.remove('hidden');
   }

   updateSubmitBtn();
}

function updateSubmitBtn() {
   const btn = document.getElementById('btn-submit-result');
   btn.disabled = !(selectedPlayerA && selectedPlayerB && selectedWinner);
}

async function submitResult() {
   if (!selectedPlayerA || !selectedPlayerB || !selectedWinner) return;
   const winnerId = selectedWinner === 'a' ? selectedPlayerA.id : selectedPlayerB.id;
   const btn = document.getElementById('btn-submit-result');
   btn.disabled = true;
   btn.textContent = 'Menyimpan...';

   try {
      const res = await apiFetch('/api/staff/match/result', {
         method: 'POST',
         body: { player_a_id: selectedPlayerA.id, player_b_id: selectedPlayerB.id, winner_id: winnerId }
      });

      showToast(`${res.winner.name} menang! +${res.winner.points_gained} poin`, 'success');
      resetMatchForm();
      loadPlayers();
   } catch (e) {
      showToast(e.message || 'Gagal submit hasil', 'error');
      btn.disabled = false;
      btn.textContent = 'Submit Hasil Match';
   }
}

function resetMatchForm() {
   selectedPlayerA = null; selectedPlayerB = null; selectedWinner = null;
   ['a', 'b'].forEach(s => {
      document.getElementById(`search-${s}`).value = '';
      document.getElementById(`dropdown-${s}`).classList.add('hidden');
      document.getElementById(`selected-${s}`).classList.add('hidden');
      document.getElementById(`winner-label-${s}`).textContent = `Pemain ${s.toUpperCase()}`;
      document.getElementById(`winner-btn-${s}`).disabled = true;
      document.getElementById(`winner-btn-${s}`).className =
         'py-4 rounded-xl border-2 border-white/10 text-sm font-semibold transition-all hover:border-violet-500/50';
   });
   document.getElementById('point-preview').classList.add('hidden');
   document.getElementById('btn-submit-result').disabled = true;
   document.getElementById('btn-submit-result').textContent = 'Submit Hasil Match';
}

// ============================================================
// MATCH HISTORY
// ============================================================
async function loadHistory() {
   try {
      const res = await apiFetch('/api/staff/match/history?limit=30');
      renderHistory(res.history);
   } catch (e) {
      showToast('Gagal memuat history', 'error');
   }
}

function renderHistory(history) {
   const el = document.getElementById('history-list');
   if (!history || history.length === 0) {
      el.innerHTML = '<div class="card-glass rounded-xl text-center py-8 text-slate-400">Belum ada riwayat match</div>';
      return;
   }

   el.innerHTML = history.map(h => `
          <div class="card-glass rounded-xl px-4 py-3 flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-sm ${h.winner_name === h.player1_name ? 'text-green-400' : 'text-slate-300'}">${h.player1_name}</span>
                ${h.player1_hc ? `<span class="badge text-white text-xs" style="background:${hcColorHex(h.player1_hc)}">${h.player1_hc}</span>` : ''}
                <span class="text-slate-600">vs</span>
                <span class="font-semibold text-sm ${h.winner_name === h.player2_name ? 'text-green-400' : 'text-slate-300'}">${h.player2_name}</span>
                ${h.player2_hc ? `<span class="badge text-white text-xs" style="background:${hcColorHex(h.player2_hc)}">${h.player2_hc}</span>` : ''}
              </div>
              <div class="text-xs text-slate-400 mt-0.5">
                🏆 ${h.winner_name} +${h.points_gained} poin
                ${h.penalty_applied > 0 ? `<span class="text-yellow-400">(penalti -${h.penalty_applied})</span>` : ''}
              </div>
            </div>
            <div class="text-xs text-slate-500 whitespace-nowrap">${timeAgo(h.created_at)}</div>
          </div>
        `).join('');
}

// ============================================================
// EVENT RESET
// ============================================================
function openEventResetModal() {
   document.getElementById('modal-event').classList.remove('hidden');
}

async function doEventReset() {
   try {
      await apiFetch('/api/staff/event/reset', { method: 'PUT' });
      showToast('Event reset berhasil! Semua poin direset.', 'success');
      closeModal('modal-event');
      if (document.getElementById('tab-players').classList.contains('hidden') === false) loadPlayers();
   } catch (e) {
      showToast(e.message || 'Gagal event reset', 'error');
   }
}

// ============================================================
// UTILITIES
// ============================================================
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

async function apiFetch(path, opts = {}) {
   const tk = localStorage.getItem('bp_token');
   const res = await fetch(`${API}${path}`, {
      method: opts.method || 'GET',
      headers: {
         'Content-Type': 'application/json',
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
        transition:all .3s ease;max-width:320px;`;
   el.textContent = msg;
   document.body.appendChild(el);
   setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-10px)'; setTimeout(() => el.remove(), 300); }, 3500);
}

function hcColorHex(hc) {
   const map = { '3B': '#64748b', '3A': '#3b82f6', '3+': '#06b6d4', '4B': '#7c3aed', '4A': '#9333ea', '4+': '#ca8a04' };
   return map[hc] || '#6b7280';
}

function timeAgo(dateStr) {
   const diff = Date.now() - new Date(dateStr).getTime();
   const mins = Math.floor(diff / 60000);
   if (mins < 1) return 'baru saja';
   if (mins < 60) return `${mins} mnt lalu`;
   const hrs = Math.floor(mins / 60);
   if (hrs < 24) return `${hrs} jam lalu`;
   return `${Math.floor(hrs / 24)} hari lalu`;
}

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
   if (!e.target.closest('#search-a') && !e.target.closest('#dropdown-a'))
      document.getElementById('dropdown-a').classList.add('hidden');
   if (!e.target.closest('#search-b') && !e.target.closest('#dropdown-b'))
      document.getElementById('dropdown-b').classList.add('hidden');
});

// ============================================================
// BOOT
// ============================================================
(function init() {
   const tk = localStorage.getItem('bp_token');
   const role = localStorage.getItem('bp_role');
   if (tk && role === 'staff') {
      showApp();
   }
})();