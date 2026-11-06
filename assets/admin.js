// BCC Library — shared admin helpers
// Loaded after the Supabase CDN script and assets/supabaseClient.js.

// Display-only copy of the loan rules. The real enforcement is in
// admin_functions.sql — change the numbers there too if you change them here.
const ADMIN_CONFIG = { LOAN_DAYS: 7, FINE_PER_DAY: 25, MAX_BOOKS: 3 };

const db = supabaseClient;
const $ = (id) => document.getElementById(id);

// ---------- Small helpers ----------
function esc(value){
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

function parseDate(d){
  // Plain dates ("2026-10-17") are read as local days so they never shift
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
}

function fmtDate(d){
  if (!d) return '—';
  return parseDate(d).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' });
}

function peso(n){
  return '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function daysOverdue(due){
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.max(0, Math.round((today - parseDate(due)) / 86400000));
}

function addDays(days){
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// Keeps user-typed search text from breaking PostgREST .or() filters
function likeSafe(q){ return q.replace(/[,()%*\\]/g, ' ').trim(); }

let toastTimer;
function toast(message, isError){
  let el = $('toast');
  if (!el){ el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = message;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 5000 : 2800);
}

function openModal(id){ $(id).classList.add('show'); }
function closeModal(id){ $(id).classList.remove('show'); }

// ---------- Sidebar ----------
const NAV_ITEMS = [
  { key:'dashboard', label:'Dashboard', icon:'🏠', href:'dashboard.html' },
  { key:'books',     label:'Books',     icon:'📚', href:'books.html' },
  { key:'borrowing', label:'Borrowing', icon:'🔁', href:'borrowing.html' },
  { key:'students',  label:'Students',  icon:'🎓', href:'students.html' },
];

function renderSidebar(active, admin){
  $('sidebar').innerHTML = `
    <div class="brand">
      <div class="brand-mark">📚</div>
      <div><div class="brand-name">BCC Library</div><div class="brand-sub">Admin</div></div>
    </div>
    <nav class="nav">
      ${NAV_ITEMS.map(n => `<a href="${n.href}" class="${n.key === active ? 'active' : ''}"><span>${n.icon}</span>${n.label}</a>`).join('')}
    </nav>
    <div class="side-foot">
      <div class="who"><b>${esc(admin.full_name)}</b><span>${esc(admin.staff_code)} · ${esc(admin.role)}</span></div>
      <button class="btn ghost small" id="signOutBtn">Sign out</button>
    </div>`;
  $('signOutBtn').addEventListener('click', async () => {
    await db.auth.signOut();
    location.href = '../index.html';
  });
}

// ---------- Admin guard ----------
// Every admin page calls this first. It returns the admin's profile row,
// or null after redirecting someone who isn't a signed-in admin.
// This only controls what the page shows; the real protection is the
// row level security policies in the database.
async function initAdmin(active){
  const { data: { session } } = await db.auth.getSession();
  if (!session){ location.href = '../index.html'; return null; }

  const { data: admin, error } = await db
    .from('admins')
    .select('id, full_name, staff_code, role')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error){
    document.body.classList.remove('pending');
    document.body.innerHTML = '<p style="padding:30px;font-family:sans-serif">Could not verify your admin account: ' + esc(error.message) + '</p>';
    return null;
  }
  if (!admin){
    await db.auth.signOut();
    location.href = '../index.html';
    return null;
  }

  renderSidebar(active, admin);
  document.body.classList.remove('pending');
  return admin;
}

// ---------- Live-search dropdown used by the checkout form ----------
// search(q) -> array of items; render(item) -> html string; onPick(item|null)
function makePicker({ inputId, resultsId, search, render, label, onPick }){
  const input = $(inputId), box = $(resultsId);
  let timer, seq = 0;

  input.addEventListener('input', () => {
    onPick(null);
    clearTimeout(timer);
    const q = likeSafe(input.value);
    if (!q){ box.classList.remove('show'); box.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      const mine = ++seq;
      const items = await search(q);
      if (mine !== seq) return;           // a newer keystroke won
      box.innerHTML = items.length
        ? items.map((it, i) => `<div class="picker-item" data-i="${i}">${render(it)}</div>`).join('')
        : '<div class="picker-none">No matches</div>';
      box.classList.add('show');
      box.onclick = (e) => {
        const row = e.target.closest('.picker-item');
        if (!row) return;
        const item = items[Number(row.dataset.i)];
        input.value = label(item);
        box.classList.remove('show');
        onPick(item);
      };
    }, 200);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#' + resultsId) && e.target !== input) box.classList.remove('show');
  });

  return { clear(){ input.value = ''; box.classList.remove('show'); onPick(null); } };
}
