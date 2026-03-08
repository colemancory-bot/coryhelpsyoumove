// ═══════════════════════════════════════════════════════════════
// CRM DASHBOARD — crm.js
// Phase 1: Contacts, Pipeline, Tasks, Documents, Transactions
// ═══════════════════════════════════════════════════════════════

// ── Supabase Init ──
var SUPABASE_URL = 'https://kzaabnnwjupjqvydiqlz.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6YWFibm53anVwanF2eWRpcWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMTE5NDMsImV4cCI6MjA4NjY4Nzk0M30.2B2sJnAuDim_yhn5UFKxXzdZw58ne4E20-ulW8pTwPA';
var _sb = null;
try {
  _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cc-supabase-auth', storage: window.localStorage }
  });
} catch(e) { console.warn('[CRM] Supabase init error:', e); }

var _currentUser = null;
var _currentTab = 'today';
var _contactsCache = [];
var _selectedContacts = new Set();

// ── Auth Check ──
// DEV_BYPASS: set to true to skip login on localhost (remove before deploying!)
var DEV_BYPASS = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

(async function initCRM() {
  var gate = document.getElementById('crmAuthGate');
  var app = document.getElementById('crmApp');
  if (!_sb) { gate.innerHTML = '<div class="crm-auth-denied"><h2>Connection Error</h2><p>Could not connect to database.</p><a href="/">Back to site</a></div>'; return; }

  // Dev bypass for local testing — skip auth, go straight to dashboard
  if (DEV_BYPASS) {
    console.log('[CRM] 🔓 Dev bypass active — skipping auth on localhost');
    _currentUser = { id: 'dev-local', email: 'dev@localhost' };
    gate.style.display = 'none';
    app.style.display = 'flex';
    initThemeToggle();
    renderSidebar();
    initGlobalSearch();
    initFAB();
    switchTab('today');
    return;
  }

  try {
    var { data: { session } } = await _sb.auth.getSession();
    if (!session) {
      // Try refresh
      var { data: refreshData } = await _sb.auth.refreshSession();
      session = refreshData?.session;
    }
    if (!session) { showLoginForm(gate); return; }

    // Check admin role
    var { data: profile } = await _sb.from('profiles').select('role').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') {
      gate.innerHTML = '<div class="crm-auth-denied"><h2>Access Denied</h2><p>Admin access required.</p><a href="/">Back to site</a></div>';
      return;
    }

    _currentUser = session.user;
    gate.style.display = 'none';
    app.style.display = 'flex';
    initThemeToggle();
    renderSidebar();
    initGlobalSearch();
    initFAB();
    switchTab('today');
  } catch(e) {
    console.error('[CRM] Auth error:', e);
    showLoginForm(gate);
  }
})();

function showLoginForm(gate) {
  gate.innerHTML = '<div class="crm-auth-form"><h2 class="fd">Cory CRM</h2><p>Sign in to access your dashboard</p>' +
    '<input class="crm-input" id="loginEmail" type="email" placeholder="Email" />' +
    '<input class="crm-input" id="loginPass" type="password" placeholder="Password" />' +
    '<button class="crm-btn crm-btn-primary" onclick="doLogin()">Sign In</button>' +
    '<div class="crm-auth-error" id="loginError"></div></div>';
}

async function doLogin() {
  var email = document.getElementById('loginEmail').value.trim();
  var pass = document.getElementById('loginPass').value;
  var err = document.getElementById('loginError');
  if (!email || !pass) { err.textContent = 'Please enter email and password.'; return; }
  try {
    var { error } = await _sb.auth.signInWithPassword({ email: email, password: pass });
    if (error) { err.textContent = error.message; return; }
    window.location.reload();
  } catch(e) { err.textContent = 'Login failed.'; }
}

// ── Theme Toggle ──
function initThemeToggle() {
  var btn = document.getElementById('themeToggle');
  if (!btn) return;
  updateThemeIcon();
  btn.onclick = function() {
    var html = document.documentElement;
    var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon();
  };
}
function updateThemeIcon() {
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  var sun = document.querySelector('.t-sun');
  var moon = document.querySelector('.t-moon');
  if (sun) sun.style.display = isDark ? 'inline' : 'none';
  if (moon) moon.style.display = isDark ? 'none' : 'inline';
}

// ── Sidebar ──
var SIDEBAR_TABS = [
  { id: 'today', label: 'Today', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' },
  { id: 'contacts', label: 'Contacts', icon: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>' },
  { id: 'pipeline', label: 'Pipeline', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' },
  { id: 'tasks', label: 'Tasks', icon: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>' },
  { id: 'documents', label: 'Documents', icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>' },
  { id: 'transactions', label: 'Transactions', icon: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' },
  { id: 'showings', label: 'Showings', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
  { id: 'questions', label: 'Questions', icon: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' },
  { id: 'analytics', label: 'Analytics', icon: '<svg viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>' },
  { id: 'listings', label: 'Listings', icon: '<svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>' },
  { id: 'cma', label: 'CMA', icon: '<svg viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/><rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>' }
];

function renderSidebar() {
  var sb = document.getElementById('crmSidebar');
  if (!sb) return;
  var html = '<div class="crm-sidebar-section"><div class="crm-sidebar-label">Main</div>';
  SIDEBAR_TABS.forEach(function(t) {
    html += '<div class="crm-sidebar-item' + (_currentTab === t.id ? ' active' : '') + '" data-tab="' + t.id + '" onclick="switchTab(\'' + t.id + '\')">' + t.icon + '<span>' + t.label + '</span></div>';
  });
  html += '</div>';
  sb.innerHTML = html;
}

function switchTab(tab) {
  _currentTab = tab;
  _selectedContacts.clear();
  renderSidebar();
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="crm-loading"><div class="crm-spinner"></div></div>';
  // Update topbar title
  var titleEl = document.querySelector('.crm-title');
  var tabObj = SIDEBAR_TABS.find(function(t) { return t.id === tab; });
  if (titleEl && tabObj) titleEl.textContent = tabObj.label;

  if (tab === 'today') loadToday();
  else if (tab === 'contacts') loadContacts();
  else if (tab === 'pipeline') loadPipeline();
  else if (tab === 'tasks') loadTasks();
  else if (tab === 'documents') loadDocuments();
  else if (tab === 'transactions') loadTransactions();
  else if (tab === 'showings') loadShowings();
  else if (tab === 'questions') loadQuestions();
  else if (tab === 'analytics') loadAnalytics();
  else if (tab === 'listings') loadListings();
  else if (tab === 'cma') loadCMA();
}

// ── Global Search ──
var _searchDebounce = null;
function initGlobalSearch() {
  var input = document.getElementById('globalSearch');
  var results = document.getElementById('globalSearchResults');
  if (!input) return;

  input.addEventListener('input', function() {
    clearTimeout(_searchDebounce);
    var q = input.value.trim();
    if (q.length < 2) { results.classList.remove('open'); return; }
    _searchDebounce = setTimeout(function() { runGlobalSearch(q); }, 300);
  });
  input.addEventListener('focus', function() { if (input.value.trim().length >= 2) results.classList.add('open'); });
  document.addEventListener('click', function(e) { if (!e.target.closest('.crm-global-search-wrap')) results.classList.remove('open'); });
  // Ctrl+K shortcut
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); input.focus(); input.select(); }
    if (e.key === 'Escape') { input.blur(); results.classList.remove('open'); }
  });
}

async function runGlobalSearch(query) {
  var results = document.getElementById('globalSearchResults');
  var q = '%' + query + '%';
  try {
    var [contactsResp, txResp, docsResp, listingsResp] = await Promise.all([
      _sb.from('contacts').select('id, first_name, last_name, email, stage').or('first_name.ilike.' + q + ',last_name.ilike.' + q + ',email.ilike.' + q + ',phone.ilike.' + q).limit(5),
      _sb.from('transactions').select('id, property_address, status').ilike('property_address', q).limit(3),
      _sb.from('documents').select('id, file_name, category').ilike('file_name', q).limit(3),
      _sb.from('mls_listings').select('listing_key, listing_id, full_address, city, list_price, standard_status').or('full_address.ilike.' + q + ',listing_id.ilike.' + q + ',city.ilike.' + q).limit(5)
    ]);
    var html = '';
    if (listingsResp.data && listingsResp.data.length) {
      html += '<div class="crm-search-category">Listings</div>';
      listingsResp.data.forEach(function(l) {
        html += '<div class="crm-search-item" onclick="_listingsFilters.search=\'' + esc(l.full_address || l.listing_id) + '\';switchTab(\'listings\')">' +
          '<span>' + esc(l.full_address || '') + '</span><span class="crm-badge" style="font-size:0.65rem">' + (l.list_price ? '$' + l.list_price.toLocaleString() : '') + '</span></div>';
      });
    }
    if (contactsResp.data && contactsResp.data.length) {
      html += '<div class="crm-search-category">Contacts</div>';
      contactsResp.data.forEach(function(c) {
        html += '<div class="crm-search-item" onclick="switchTab(\'contacts\'); setTimeout(function(){openContact(\'' + c.id + '\')},100)">' +
          '<span>' + esc(c.first_name + ' ' + c.last_name) + '</span><span class="crm-badge crm-stage-badge" data-stage="' + c.stage + '">' + stageLabel(c.stage) + '</span></div>';
      });
    }
    if (txResp.data && txResp.data.length) {
      html += '<div class="crm-search-category">Transactions</div>';
      txResp.data.forEach(function(t) {
        html += '<div class="crm-search-item" onclick="openTransaction(\'' + t.id + '\')">' + esc(t.property_address) + '</div>';
      });
    }
    if (docsResp.data && docsResp.data.length) {
      html += '<div class="crm-search-category">Documents</div>';
      docsResp.data.forEach(function(d) {
        html += '<div class="crm-search-item" onclick="switchTab(\'documents\')">' + esc(d.file_name) + '</div>';
      });
    }
    if (!html) html = '<div class="crm-search-empty">No results found</div>';
    results.innerHTML = html;
    results.classList.add('open');
  } catch(e) { console.error('[Search]', e); }
}

// ── FAB (Quick Add) ──
function initFAB() {
  var fab = document.getElementById('crmFab');
  var menu = document.getElementById('crmFabMenu');
  if (!fab || !menu) return;

  menu.innerHTML = [
    { icon: '<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>', label: 'Log Call', action: 'fabLogCall' },
    { icon: '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>', label: 'Add Note', action: 'fabAddNote' },
    { icon: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>', label: 'Add Task', action: 'fabAddTask' },
    { icon: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>', label: 'Add Contact', action: 'fabAddContact' }
  ].map(function(item) {
    return '<div class="crm-fab-item" onclick="' + item.action + '(); closeFAB();">' + item.icon + '<span>' + item.label + '</span></div>';
  }).join('');

  fab.onclick = function() { fab.classList.toggle('open'); menu.classList.toggle('open'); };
  document.addEventListener('click', function(e) { if (!e.target.closest('.crm-fab') && !e.target.closest('.crm-fab-menu')) closeFAB(); });
}
function closeFAB() {
  var fab = document.getElementById('crmFab');
  var menu = document.getElementById('crmFabMenu');
  if (fab) fab.classList.remove('open');
  if (menu) menu.classList.remove('open');
}

function fabLogCall() { showQuickModal('Log Call', '<div class="crm-form-group"><label class="crm-form-label">Contact</label><select class="crm-select" id="fabContactSelect"><option value="">Loading...</option></select></div><div class="crm-form-group"><label class="crm-form-label">Notes</label><textarea class="crm-textarea" id="fabCallNotes" rows="3" placeholder="Call notes..."></textarea></div>', async function() { var cid=document.getElementById('fabContactSelect').value; var notes=document.getElementById('fabCallNotes').value.trim(); if(!cid){toast('Select a contact','error');return false;} await _sb.from('contact_activity').insert({contact_id:cid,activity_type:'call_logged',description:notes||'Phone call logged'}); await _sb.from('contacts').update({last_contacted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',cid); toast('Call logged','success'); return true; }); loadContactDropdown('fabContactSelect'); }

function fabAddNote() { showQuickModal('Add Note', '<div class="crm-form-group"><label class="crm-form-label">Contact</label><select class="crm-select" id="fabContactSelect"><option value="">Loading...</option></select></div><div class="crm-form-group"><label class="crm-form-label">Note</label><textarea class="crm-textarea" id="fabNoteText" rows="3" placeholder="Note text..."></textarea></div>', async function() { var cid=document.getElementById('fabContactSelect').value; var text=document.getElementById('fabNoteText').value.trim(); if(!cid||!text){toast('Fill all fields','error');return false;} await _sb.from('contact_notes').insert({contact_id:cid,note_text:text,created_by:_currentUser.id}); await _sb.from('contact_activity').insert({contact_id:cid,activity_type:'note_added',description:'Note added'}); toast('Note added','success'); return true; }); loadContactDropdown('fabContactSelect'); }

function fabAddTask() { showQuickModal('Add Task', '<div class="crm-form-group"><label class="crm-form-label">Title</label><input class="crm-input" id="fabTaskTitle" placeholder="Task title" /></div><div class="crm-form-row"><div class="crm-form-group"><label class="crm-form-label">Contact</label><select class="crm-select" id="fabContactSelect"><option value="">None</option></select></div><div class="crm-form-group"><label class="crm-form-label">Due Date</label><input class="crm-input" id="fabTaskDue" type="date" /></div></div><div class="crm-form-group"><label class="crm-form-label">Priority</label><select class="crm-select" id="fabTaskPriority"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>', async function() { var title=document.getElementById('fabTaskTitle').value.trim(); if(!title){toast('Enter a title','error');return false;} var cid=document.getElementById('fabContactSelect').value||null; var due=document.getElementById('fabTaskDue').value||null; var pri=document.getElementById('fabTaskPriority').value; await _sb.from('tasks').insert({contact_id:cid,title:title,due_date:due,priority:pri}); toast('Task created','success'); return true; }); loadContactDropdown('fabContactSelect'); }

function fabAddContact() { showQuickModal('Add Contact', '<div class="crm-form-row"><div class="crm-form-group"><label class="crm-form-label">First Name</label><input class="crm-input" id="fabFirst" /></div><div class="crm-form-group"><label class="crm-form-label">Last Name</label><input class="crm-input" id="fabLast" /></div></div><div class="crm-form-row"><div class="crm-form-group"><label class="crm-form-label">Email</label><input class="crm-input" id="fabEmail" type="email" /></div><div class="crm-form-group"><label class="crm-form-label">Phone</label><input class="crm-input" id="fabPhone" type="tel" /></div></div><div class="crm-form-group"><label class="crm-form-label">Source</label><select class="crm-select" id="fabSource"><option value="manual">Manual</option><option value="referral">Referral</option><option value="other">Other</option></select></div><div id="fabDuplicateWarn"></div>', async function() { var first=document.getElementById('fabFirst').value.trim(); var last=document.getElementById('fabLast').value.trim(); var email=document.getElementById('fabEmail').value.trim(); var phone=document.getElementById('fabPhone').value.trim(); if(!first&&!email){toast('Enter name or email','error');return false;} await _sb.from('contacts').insert({first_name:first,last_name:last,email:email,phone:phone,source:document.getElementById('fabSource').value}); toast('Contact added','success'); return true; });
  // Duplicate detection
  var emailInput = document.getElementById('fabEmail');
  var phoneInput = document.getElementById('fabPhone');
  if (emailInput) emailInput.addEventListener('blur', function() { checkDuplicate(emailInput.value, phoneInput?.value); });
  if (phoneInput) phoneInput.addEventListener('blur', function() { checkDuplicate(emailInput?.value, phoneInput.value); });
}

async function checkDuplicate(email, phone) {
  var warn = document.getElementById('fabDuplicateWarn');
  if (!warn) return;
  if ((!email || !email.trim()) && (!phone || !phone.trim())) { warn.innerHTML = ''; return; }
  var query = _sb.from('contacts').select('id, first_name, last_name, email');
  if (email && email.trim()) query = query.ilike('email', email.trim());
  else if (phone && phone.trim()) query = query.ilike('phone', phone.trim());
  var { data } = await query.limit(1);
  if (data && data.length) {
    warn.innerHTML = '<div class="crm-duplicate-warn"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Possible duplicate: <a href="#" onclick="closeModal();openContact(\'' + data[0].id + '\')">' + esc(data[0].first_name + ' ' + data[0].last_name) + ' (' + esc(data[0].email) + ')</a></div>';
  } else { warn.innerHTML = ''; }
}

async function loadContactDropdown(selectId) {
  var sel = document.getElementById(selectId);
  if (!sel) return;
  var { data } = await _sb.from('contacts').select('id, first_name, last_name, email').eq('is_archived', false).order('first_name').limit(200);
  var opts = '<option value="">Select contact...</option>';
  (data || []).forEach(function(c) { opts += '<option value="' + c.id + '">' + esc(c.first_name + ' ' + c.last_name) + (c.email ? ' (' + esc(c.email) + ')' : '') + '</option>'; });
  sel.innerHTML = opts;
}

// ── Modal System ──
function showQuickModal(title, bodyHtml, onSubmit) {
  var overlay = document.createElement('div');
  overlay.className = 'crm-modal-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) closeModal(); };
  overlay.innerHTML = '<div class="crm-modal"><div class="crm-modal-title fd">' + title + '</div><div class="crm-modal-body">' + bodyHtml + '</div><div class="crm-modal-footer"><button class="crm-btn crm-btn-secondary" onclick="closeModal()">Cancel</button><button class="crm-btn crm-btn-primary" id="modalSubmit">Save</button></div></div>';
  document.body.appendChild(overlay);
  var submitBtn = document.getElementById('modalSubmit');
  submitBtn.onclick = async function() {
    submitBtn.disabled = true; submitBtn.textContent = 'Saving...';
    var result = await onSubmit();
    if (result !== false) closeModal();
    else { submitBtn.disabled = false; submitBtn.textContent = 'Save'; }
  };
}
function closeModal() { var m = document.querySelector('.crm-modal-overlay'); if (m) m.remove(); }

// ── Toast Notifications ──
function toast(message, type) {
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var t = document.createElement('div');
  t.className = 'crm-toast ' + (type || 'info');
  t.innerHTML = '<span>' + message + '</span><span class="crm-toast-close" onclick="this.parentElement.remove()">&times;</span>';
  container.appendChild(t);
  setTimeout(function() { t.classList.add('hiding'); setTimeout(function() { t.remove(); }, 200); }, 3000);
}

// ══════════════════════════════════════
// TODAY VIEW (Default Dashboard)
// ══════════════════════════════════════
async function loadToday() {
  var main = document.getElementById('crmMain');
  try {
    var today = new Date().toISOString().split('T')[0];
    var weekAgo = new Date(Date.now() - 7*86400000).toISOString();
    var twoWeeksAgo = new Date(Date.now() - 14*86400000).toISOString();

    // Use allSettled so one failing query doesn't block the rest
    var results = await Promise.allSettled([
      _sb.from('tasks').select('*, contacts(first_name, last_name)').eq('status', 'pending').order('due_date').limit(20),
      _sb.from('contacts').select('id, first_name, last_name, email, source, created_at').eq('stage', 'new').gte('created_at', new Date(Date.now() - 48*3600000).toISOString()).order('created_at', { ascending: false }).limit(10),
      _sb.from('contacts').select('id, first_name, last_name, email, stage, last_contacted_at').eq('is_archived', false).in('stage', ['new', 'contacted', 'showing']).or('last_contacted_at.is.null,last_contacted_at.lt.' + twoWeeksAgo).limit(20),
      _sb.from('showing_requests').select('*').in('status', ['pending', 'confirmed']).order('created_at', { ascending: false }).limit(5),
      _sb.from('documents').select('id, file_name, sent_at, viewed_at, status, contact_id, contacts(first_name, last_name)').eq('status', 'sent').is('viewed_at', null).limit(10),
      _sb.from('transactions').select('id, property_address, close_date, status, contact_id, contacts(first_name, last_name)').eq('status', 'active').not('close_date', 'is', null).limit(10),
      _sb.from('contact_activity').select('*').order('created_at', { ascending: false }).limit(10),
      _sb.from('contacts').select('id', { count: 'exact' }).eq('is_archived', false)
    ]);
    var safe = function(r) { return r.status === 'fulfilled' ? r.value : { data: [], count: 0 }; };
    var tasksResp = safe(results[0]);
    var newLeadsResp = safe(results[1]);
    var staleResp = safe(results[2]);
    var showingsResp = safe(results[3]);
    var docsResp = safe(results[4]);
    var txResp = safe(results[5]);
    var actResp = safe(results[6]);
    var contactsCountResp = safe(results[7]);

    var overdueTasks = (tasksResp.data || []).filter(function(t) { return t.due_date && t.due_date < today; });
    var todayTasks = (tasksResp.data || []).filter(function(t) { return t.due_date === today; });
    var upcomingTasks = (tasksResp.data || []).filter(function(t) { return !t.due_date || t.due_date > today; });
    var closingTx = (txResp.data || []).filter(function(t) { var d = new Date(t.close_date); return d <= new Date(Date.now() + 14*86400000); });

    // Stats
    var html = '<div class="crm-stats-grid">';
    html += statCard(contactsCountResp.count || 0, 'Total Contacts', 'accent');
    html += statCard((newLeadsResp.data || []).length, 'New Leads (48h)', 'blue');
    html += statCard(overdueTasks.length, 'Overdue Tasks', 'red');
    html += statCard(todayTasks.length, 'Due Today', 'amber');
    html += statCard((showingsResp.data || []).length, 'Active Showings', 'teal');
    html += statCard(closingTx.length, 'Approaching Close', 'green');
    html += '</div>';

    html += '<div class="crm-today-grid">';

    // Overdue + Today tasks
    html += '<div class="crm-today-section">';
    html += '<div class="crm-today-section-title"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M9 11l3 3L22 4"/></svg>Tasks</div>';
    if (overdueTasks.length) {
      overdueTasks.forEach(function(t) { html += todayTaskRow(t, 'overdue'); });
    }
    todayTasks.forEach(function(t) { html += todayTaskRow(t, 'today'); });
    upcomingTasks.slice(0, 3).forEach(function(t) { html += todayTaskRow(t, 'future'); });
    if (!overdueTasks.length && !todayTasks.length && !upcomingTasks.length) html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No pending tasks</div></div>';
    html += '</div>';

    // Stale leads
    html += '<div class="crm-today-section">';
    html += '<div class="crm-today-section-title"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>Follow-up Needed</div>';
    if (staleResp.data && staleResp.data.length) {
      staleResp.data.forEach(function(c) {
        var days = staleDays(c);
        var cls = days >= 30 ? 'red' : 'amber';
        html += '<div class="crm-today-item"><span class="crm-stale-dot ' + cls + '"></span><span class="crm-table-link" onclick="openContact(\'' + c.id + '\')">' + esc(c.first_name + ' ' + c.last_name) + '</span><span class="crm-badge crm-stale-badge ' + cls + '">' + days + 'd</span></div>';
      });
    } else { html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">All contacts are up to date</div></div>'; }
    html += '</div>';

    // New leads
    html += '<div class="crm-today-section">';
    html += '<div class="crm-today-section-title"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>New Leads</div>';
    if (newLeadsResp.data && newLeadsResp.data.length) {
      newLeadsResp.data.forEach(function(c) {
        html += '<div class="crm-today-item"><span class="crm-table-link" onclick="openContact(\'' + c.id + '\')">' + esc(c.first_name + ' ' + c.last_name) + '</span><span class="crm-badge crm-source-badge">' + c.source + '</span><span class="crm-table-muted">' + timeAgo(c.created_at) + '</span></div>';
      });
    } else { html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No new leads</div></div>'; }
    html += '</div>';

    // Docs awaiting
    html += '<div class="crm-today-section">';
    html += '<div class="crm-today-section-title"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg>Docs Awaiting Review</div>';
    if (docsResp.data && docsResp.data.length) {
      docsResp.data.forEach(function(d) {
        var cName = d.contacts ? d.contacts.first_name + ' ' + d.contacts.last_name : 'Unknown';
        html += '<div class="crm-today-item"><span>' + esc(d.file_name) + '</span><span class="crm-table-muted">Sent to ' + esc(cName) + ' ' + timeAgo(d.sent_at) + '</span></div>';
      });
    } else { html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No pending documents</div></div>'; }
    html += '</div>';

    html += '</div>'; // end today-grid

    // Recent activity
    html += '<div class="crm-section-title fd" style="margin-top:1.5rem">Recent Activity</div>';
    html += renderActivityList(actResp.data || []);

    main.innerHTML = html;
  } catch(e) { console.error('[Today]', e); main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Error loading dashboard</div></div>'; }
}

function todayTaskRow(t, cls) {
  var cName = t.contacts ? t.contacts.first_name + ' ' + t.contacts.last_name : '';
  return '<div class="crm-today-item"><label class="crm-checkbox"><input type="checkbox" onchange="completeTask(\'' + t.id + '\')"><div class="crm-checkbox-box"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div></label><span class="crm-task-title">' + esc(t.title) + '</span>' + (cName ? '<span class="crm-task-contact" onclick="openContact(\'' + t.contact_id + '\')">' + esc(cName) + '</span>' : '') + '<span class="crm-task-due ' + cls + '">' + (t.due_date || 'No date') + '</span><span class="crm-badge crm-priority-badge" data-priority="' + t.priority + '">' + t.priority + '</span></div>';
}

function statCard(num, label, color) {
  return '<div class="crm-stat-card ' + color + '"><div class="crm-stat-num fd">' + num + '</div><div class="crm-stat-label">' + label + '</div></div>';
}

// ══════════════════════════════════════
// CONTACTS
// ══════════════════════════════════════
var _contactFilters = { search: '', stage: '', source: '' };

async function loadContacts() {
  var main = document.getElementById('crmMain');
  try {
    var query = _sb.from('contacts').select('*').eq('is_archived', false).order('updated_at', { ascending: false }).limit(200);
    if (_contactFilters.stage) query = query.eq('stage', _contactFilters.stage);
    if (_contactFilters.source) query = query.eq('source', _contactFilters.source);
    var { data } = await query;
    _contactsCache = data || [];

    var filtered = _contactsCache;
    if (_contactFilters.search) {
      var s = _contactFilters.search.toLowerCase();
      filtered = filtered.filter(function(c) {
        return (c.first_name + ' ' + c.last_name).toLowerCase().includes(s) || (c.email || '').toLowerCase().includes(s) || (c.phone || '').includes(s);
      });
    }

    var html = '<div class="crm-page-header"><div><div class="crm-page-title fd">Contacts</div><div class="crm-page-subtitle">' + filtered.length + ' contacts</div></div><button class="crm-btn crm-btn-primary" onclick="fabAddContact()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Contact</button></div>';

    // Search + Filters
    html += '<div class="crm-search-bar">';
    html += '<input class="crm-input" placeholder="Search name, email, phone..." value="' + esc(_contactFilters.search) + '" oninput="filterContacts(\'search\',this.value)" />';
    html += '<select class="crm-select" onchange="filterContacts(\'stage\',this.value)"><option value="">All Stages</option>';
    ['new','contacted','showing','under_contract','closed','past_client'].forEach(function(s) { html += '<option value="' + s + '"' + (_contactFilters.stage===s?' selected':'') + '>' + stageLabel(s) + '</option>'; });
    html += '</select>';
    html += '<select class="crm-select" onchange="filterContacts(\'source\',this.value)"><option value="">All Sources</option>';
    ['chatbot','consultation_form','account_signup','manual','referral','other'].forEach(function(s) { html += '<option value="' + s + '"' + (_contactFilters.source===s?' selected':'') + '>' + s + '</option>'; });
    html += '</select></div>';

    // Table
    html += '<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th style="width:30px"><label class="crm-checkbox"><input type="checkbox" id="selectAll" onchange="toggleAllContacts(this.checked)"><div class="crm-checkbox-box"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div></label></th><th>Name</th><th>Email</th><th>Phone</th><th>Stage</th><th>Source</th><th>Last Contact</th></tr></thead><tbody>';
    if (filtered.length) {
      filtered.forEach(function(c) {
        var days = staleDays(c);
        var staleHtml = '';
        if (days >= 30 && ['new','contacted','showing'].includes(c.stage)) staleHtml = ' <span class="crm-stale-dot red"></span>';
        else if (days >= 14 && ['new','contacted','showing'].includes(c.stage)) staleHtml = ' <span class="crm-stale-dot amber"></span>';
        html += '<tr><td><label class="crm-checkbox"><input type="checkbox" value="' + c.id + '" onchange="toggleContactSelect(this)" ' + (_selectedContacts.has(c.id)?'checked':'') + '><div class="crm-checkbox-box"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div></label></td>';
        html += '<td><span class="crm-table-link" onclick="openContact(\'' + c.id + '\')">' + esc(c.first_name + ' ' + c.last_name) + '</span>' + staleHtml + '</td>';
        html += '<td>' + esc(c.email || '') + '</td><td>' + esc(c.phone || '') + '</td>';
        html += '<td><span class="crm-badge crm-stage-badge" data-stage="' + c.stage + '">' + stageLabel(c.stage) + '</span></td>';
        html += '<td><span class="crm-badge crm-source-badge">' + (c.source || '') + '</span></td>';
        html += '<td class="crm-table-muted">' + (c.last_contacted_at ? timeAgo(c.last_contacted_at) : 'Never') + '</td></tr>';
      });
    } else {
      html += '<tr><td colspan="7"><div class="crm-empty-state"><div class="crm-empty-state-text">No contacts found</div></div></td></tr>';
    }
    html += '</tbody></table></div>';

    // Bulk action bar
    html += '<div class="crm-bulk-bar" id="bulkBar"><span class="crm-bulk-count" id="bulkCount">0 selected</span><div class="crm-bulk-actions"><select class="crm-select crm-btn-sm" id="bulkStage"><option value="">Change Stage...</option>';
    ['new','contacted','showing','under_contract','closed','past_client'].forEach(function(s) { html += '<option value="' + s + '">' + stageLabel(s) + '</option>'; });
    html += '</select><button class="crm-btn crm-btn-secondary crm-btn-sm" onclick="bulkChangeStage()">Apply</button><button class="crm-btn crm-btn-danger crm-btn-sm" onclick="bulkArchive()">Archive</button></div></div>';

    main.innerHTML = html;
    updateBulkBar();
  } catch(e) { console.error('[Contacts]', e); main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Error loading contacts</div></div>'; }
}

function filterContacts(key, val) {
  _contactFilters[key] = val;
  loadContacts();
}

function toggleContactSelect(cb) {
  if (cb.checked) _selectedContacts.add(cb.value);
  else _selectedContacts.delete(cb.value);
  updateBulkBar();
}

function toggleAllContacts(checked) {
  _selectedContacts.clear();
  if (checked) _contactsCache.forEach(function(c) { _selectedContacts.add(c.id); });
  document.querySelectorAll('.crm-table input[type="checkbox"][value]').forEach(function(cb) { cb.checked = checked; });
  updateBulkBar();
}

function updateBulkBar() {
  var bar = document.getElementById('bulkBar');
  var count = document.getElementById('bulkCount');
  if (!bar) return;
  if (_selectedContacts.size > 0) { bar.classList.add('visible'); count.textContent = _selectedContacts.size + ' selected'; }
  else { bar.classList.remove('visible'); }
}

async function bulkChangeStage() {
  var stage = document.getElementById('bulkStage').value;
  if (!stage || !_selectedContacts.size) return;
  var ids = Array.from(_selectedContacts);
  await _sb.from('contacts').update({ stage: stage, updated_at: new Date().toISOString() }).in('id', ids);
  toast(_selectedContacts.size + ' contacts updated', 'success');
  _selectedContacts.clear();
  loadContacts();
}

async function bulkArchive() {
  if (!_selectedContacts.size) return;
  var ids = Array.from(_selectedContacts);
  await _sb.from('contacts').update({ is_archived: true, updated_at: new Date().toISOString() }).in('id', ids);
  toast(_selectedContacts.size + ' contacts archived', 'success');
  _selectedContacts.clear();
  loadContacts();
}

// ── Contact Detail ──
async function openContact(id) {
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="crm-loading"><div class="crm-spinner"></div></div>';
  try {
    var [contactResp, notesResp, tasksResp, actResp, txResp, docsResp] = await Promise.all([
      _sb.from('contacts').select('*').eq('id', id).single(),
      _sb.from('contact_notes').select('*').eq('contact_id', id).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(50),
      _sb.from('tasks').select('*').eq('contact_id', id).order('due_date').limit(20),
      _sb.from('contact_activity').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(30),
      _sb.from('transactions').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(10),
      _sb.from('documents').select('*').eq('contact_id', id).order('created_at', { ascending: false }).limit(20)
    ]);

    var c = contactResp.data;
    if (!c) { main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Contact not found</div></div>'; return; }

    // Also fetch user activity if contact has an account
    var userAct = [];
    if (c.user_id) {
      var uaResp = await _sb.from('user_activity').select('*').eq('user_id', c.user_id).order('created_at', { ascending: false }).limit(20);
      userAct = uaResp.data || [];
    }

    var days = staleDays(c);
    var html = '<div style="margin-bottom:0.5rem"><button class="crm-btn crm-btn-ghost crm-btn-sm" onclick="loadContacts()">&larr; Back to Contacts</button></div>';

    // Stale alert
    if (days >= 30 && ['new','contacted','showing'].includes(c.stage)) {
      html += '<div class="crm-stale-alert red"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>You haven\'t reached out in ' + days + ' days</div>';
    } else if (days >= 14 && ['new','contacted','showing'].includes(c.stage)) {
      html += '<div class="crm-stale-alert amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Last contact was ' + days + ' days ago</div>';
    }

    // Header
    html += '<div class="crm-contact-header"><div><div class="crm-contact-name fd">' + esc(c.first_name + ' ' + c.last_name) + '</div><div class="crm-contact-meta"><span><svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>' + esc(c.email || 'No email') + '</span><span><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>' + esc(c.phone || 'No phone') + '</span><span class="crm-badge crm-source-badge">' + (c.source || '') + '</span></div></div><div style="display:flex;gap:0.5rem"><button class="crm-btn crm-btn-primary crm-btn-sm" onclick="quickLogCall(\'' + id + '\')"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72"/></svg>Log Call</button><button class="crm-btn crm-btn-secondary crm-btn-sm" onclick="editContact(\'' + id + '\')">Edit</button></div></div>';

    // Stage selector
    html += '<div class="crm-stage-selector">';
    ['new','contacted','showing','under_contract','closed','past_client'].forEach(function(s) {
      html += '<button class="crm-stage-pill' + (c.stage===s?' active':'') + '" data-stage="' + s + '" onclick="changeStage(\'' + id + '\',\'' + s + '\')">' + stageLabel(s) + '</button>';
    });
    html += '</div>';

    // Tags
    if (c.tags && c.tags.length) {
      html += '<div style="margin-bottom:0.75rem">';
      c.tags.forEach(function(tag) { html += '<span class="crm-tag">' + esc(tag) + '</span>'; });
      html += '</div>';
    }

    // Two-column body
    html += '<div class="crm-contact-body"><div class="crm-contact-left">';

    // Notes section
    html += '<div class="crm-card"><div class="crm-section-title fd">Notes</div>';
    html += '<div class="crm-form-inline" style="margin-bottom:0.75rem"><textarea class="crm-textarea" id="newNote" rows="2" placeholder="Add a note..." style="min-height:50px"></textarea><button class="crm-btn crm-btn-primary crm-btn-sm" onclick="addNote(\'' + id + '\')">Add</button></div>';
    html += '<div class="crm-notes-list">';
    (notesResp.data || []).forEach(function(n) {
      html += '<div class="crm-note-card' + (n.is_pinned?' pinned':'') + '"><div class="crm-note-text">' + esc(n.note_text) + '</div><div class="crm-note-footer"><span class="crm-note-time">' + timeAgo(n.created_at) + '</span><span class="crm-note-pin' + (n.is_pinned?' active':'') + '" onclick="togglePin(\'' + n.id + '\',' + !n.is_pinned + ',\'' + id + '\')">' + (n.is_pinned?'Unpin':'Pin') + '</span></div></div>';
    });
    if (!(notesResp.data || []).length) html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No notes yet</div></div>';
    html += '</div></div>';

    // Chat transcript
    if (c.chat_transcript) {
      html += '<div class="crm-card"><div class="crm-section-title fd">Chat Transcript</div><div class="crm-transcript">' + esc(c.chat_transcript) + '</div></div>';
    }

    // Transactions
    html += '<div class="crm-card"><div class="crm-section-title fd">Transactions</div>';
    if ((txResp.data || []).length) {
      (txResp.data || []).forEach(function(t) {
        html += '<div class="crm-tx-card" onclick="openTransaction(\'' + t.id + '\')"><div class="crm-tx-card-info"><div class="crm-tx-card-address">' + esc(t.property_address || 'No address') + '</div><div class="crm-tx-card-meta">' + t.transaction_type + ' &middot; ' + t.status + (t.close_date ? ' &middot; Close: ' + t.close_date : '') + '</div></div><span class="crm-badge crm-stage-badge" data-stage="' + (t.status==='closed'?'closed':'under_contract') + '">' + t.status + '</span></div>';
      });
    } else { html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No transactions</div></div>'; }
    html += '<button class="crm-btn crm-btn-ghost crm-btn-sm" style="margin-top:0.5rem" onclick="createTransaction(\'' + id + '\')">+ New Transaction</button></div>';

    // Documents
    html += '<div class="crm-card"><div class="crm-section-title fd">Documents</div>';
    if ((docsResp.data || []).length) {
      docsResp.data.forEach(function(d) {
        html += '<div class="crm-today-item"><span>' + esc(d.file_name) + '</span><span class="crm-badge crm-doc-category" data-cat="' + d.category + '">' + d.category + '</span><span class="crm-badge crm-doc-status" data-status="' + d.status + '">' + d.status + '</span></div>';
      });
    } else { html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No documents</div></div>'; }
    html += '</div>';

    html += '</div>'; // end left

    // Right column
    html += '<div class="crm-contact-right">';

    // Tasks
    html += '<div class="crm-card"><div class="crm-section-title fd">Tasks</div>';
    var pendingTasks = (tasksResp.data || []).filter(function(t) { return t.status === 'pending'; });
    pendingTasks.forEach(function(t) {
      var cls = t.due_date && t.due_date < new Date().toISOString().split('T')[0] ? 'overdue' : t.due_date === new Date().toISOString().split('T')[0] ? 'today' : 'future';
      html += '<div class="crm-task-item"><label class="crm-checkbox"><input type="checkbox" onchange="completeTask(\'' + t.id + '\')"><div class="crm-checkbox-box"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div></label><span class="crm-task-title">' + esc(t.title) + '</span><span class="crm-task-due ' + cls + '">' + (t.due_date || '') + '</span></div>';
    });
    if (!pendingTasks.length) html += '<div class="crm-empty-state" style="padding:0.5rem"><div class="crm-empty-state-text">No tasks</div></div>';
    html += '<button class="crm-btn crm-btn-ghost crm-btn-sm" style="margin-top:0.5rem" onclick="fabAddTask()">+ Add Task</button></div>';

    // Activity timeline
    html += '<div class="crm-card"><div class="crm-section-title fd">Activity</div>';
    var allActivity = (actResp.data || []).map(function(a) { return Object.assign({}, a, { _source: 'crm' }); });
    userAct.forEach(function(a) { allActivity.push({ created_at: a.created_at, activity_type: a.activity_type, description: activityLabel(a.activity_type) + (a.property_key ? ' - ' + a.property_key.split('|')[0] : ''), _source: 'user' }); });
    allActivity.sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    html += '<div class="crm-timeline">';
    allActivity.slice(0, 20).forEach(function(a) {
      var dotClass = a._source === 'user' ? 'user-event' : a.activity_type === 'stage_changed' ? 'stage-change' : a.activity_type === 'task_completed' ? 'task-event' : a.activity_type.includes('doc') ? 'doc-event' : 'crm-event';
      html += '<div class="crm-timeline-item"><div class="crm-timeline-dot ' + dotClass + '"></div><div class="crm-timeline-desc">' + esc(a.description || a.activity_type) + '</div><div class="crm-timeline-time">' + timeAgo(a.created_at) + '</div></div>';
    });
    if (!allActivity.length) html += '<div class="crm-empty-state" style="padding:0.5rem"><div class="crm-empty-state-text">No activity yet</div></div>';
    html += '</div></div>';

    html += '</div></div>'; // end right + body

    main.innerHTML = html;
  } catch(e) { console.error('[Contact Detail]', e); main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Error loading contact</div></div>'; }
}

async function changeStage(contactId, newStage) {
  var { data: contact } = await _sb.from('contacts').select('stage').eq('id', contactId).single();
  if (!contact || contact.stage === newStage) return;
  await _sb.from('contacts').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', contactId);
  await _sb.from('contact_activity').insert({ contact_id: contactId, activity_type: 'stage_changed', description: 'Stage: ' + stageLabel(contact.stage) + ' → ' + stageLabel(newStage), metadata: { old_stage: contact.stage, new_stage: newStage } });
  if (newStage === 'contacted') {
    await _sb.from('tasks').insert({ contact_id: contactId, title: 'Follow up after initial contact', due_date: addDays(3), priority: 'normal' });
  }
  toast('Stage updated', 'success');
  openContact(contactId);
}

async function addNote(contactId) {
  var ta = document.getElementById('newNote');
  if (!ta || !ta.value.trim()) return;
  await _sb.from('contact_notes').insert({ contact_id: contactId, note_text: ta.value.trim(), created_by: _currentUser.id });
  await _sb.from('contact_activity').insert({ contact_id: contactId, activity_type: 'note_added', description: 'Note added' });
  toast('Note added', 'success');
  openContact(contactId);
}

async function togglePin(noteId, pin, contactId) {
  await _sb.from('contact_notes').update({ is_pinned: pin }).eq('id', noteId);
  openContact(contactId);
}

async function quickLogCall(contactId) {
  showQuickModal('Log Call', '<div class="crm-form-group"><label class="crm-form-label">Notes</label><textarea class="crm-textarea" id="callNotes" rows="3" placeholder="Call notes..."></textarea></div>', async function() {
    var notes = document.getElementById('callNotes').value.trim();
    await _sb.from('contact_activity').insert({ contact_id: contactId, activity_type: 'call_logged', description: notes || 'Phone call logged' });
    await _sb.from('contacts').update({ last_contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', contactId);
    toast('Call logged', 'success');
    openContact(contactId);
    return true;
  });
}

async function editContact(id) {
  var { data: c } = await _sb.from('contacts').select('*').eq('id', id).single();
  if (!c) return;
  showQuickModal('Edit Contact', '<div class="crm-form-row"><div class="crm-form-group"><label class="crm-form-label">First Name</label><input class="crm-input" id="editFirst" value="' + esc(c.first_name) + '" /></div><div class="crm-form-group"><label class="crm-form-label">Last Name</label><input class="crm-input" id="editLast" value="' + esc(c.last_name) + '" /></div></div><div class="crm-form-row"><div class="crm-form-group"><label class="crm-form-label">Email</label><input class="crm-input" id="editEmail" value="' + esc(c.email) + '" /></div><div class="crm-form-group"><label class="crm-form-label">Phone</label><input class="crm-input" id="editPhone" value="' + esc(c.phone) + '" /></div></div><div class="crm-form-group"><label class="crm-form-label">Tags (comma-separated)</label><input class="crm-input" id="editTags" value="' + esc((c.tags||[]).join(', ')) + '" /></div>', async function() {
    var tags = document.getElementById('editTags').value.split(',').map(function(t){return t.trim();}).filter(Boolean);
    await _sb.from('contacts').update({ first_name: document.getElementById('editFirst').value.trim(), last_name: document.getElementById('editLast').value.trim(), email: document.getElementById('editEmail').value.trim(), phone: document.getElementById('editPhone').value.trim(), tags: tags, updated_at: new Date().toISOString() }).eq('id', id);
    toast('Contact updated', 'success');
    openContact(id);
    return true;
  });
}

// ══════════════════════════════════════
// PIPELINE (Kanban)
// ══════════════════════════════════════
async function loadPipeline() {
  var main = document.getElementById('crmMain');
  try {
    var { data } = await _sb.from('contacts').select('*').eq('is_archived', false).order('updated_at', { ascending: false });
    var stages = ['new','contacted','showing','under_contract','closed','past_client'];
    var grouped = {};
    stages.forEach(function(s) { grouped[s] = []; });
    (data || []).forEach(function(c) { if (grouped[c.stage]) grouped[c.stage].push(c); });

    var html = '<div class="crm-page-header"><div class="crm-page-title fd">Pipeline</div></div>';
    html += '<div class="crm-kanban">';
    stages.forEach(function(s) {
      var contacts = grouped[s];
      html += '<div class="crm-kanban-col"><div class="crm-kanban-header"><span class="crm-kanban-title" style="color:var(--stage-' + s.replace('_','-') + ')">' + stageLabel(s) + '</span><span class="crm-badge crm-kanban-count" style="background:var(--stage-' + s.replace('_','-') + '-bg);color:var(--stage-' + s.replace('_','-') + ')">' + contacts.length + '</span></div><div class="crm-kanban-cards">';
      contacts.forEach(function(c) {
        var days = staleDays(c);
        var staleHtml = '';
        if (days >= 30) staleHtml = '<span class="crm-stale-dot red"></span>';
        else if (days >= 14) staleHtml = '<span class="crm-stale-dot amber"></span>';
        html += '<div class="crm-kanban-card" onclick="openContact(\'' + c.id + '\')"><div class="crm-kanban-card-name">' + esc(c.first_name + ' ' + c.last_name) + ' ' + staleHtml + '</div><div class="crm-kanban-card-email">' + esc(c.email || '') + '</div><div class="crm-kanban-card-footer"><span class="crm-kanban-card-time">' + timeAgo(c.updated_at) + '</span></div></div>';
      });
      if (!contacts.length) html += '<div class="crm-empty-state" style="padding:1rem;opacity:0.5"><div class="crm-empty-state-text">Empty</div></div>';
      html += '</div></div>';
    });
    html += '</div>';
    main.innerHTML = html;
  } catch(e) { console.error('[Pipeline]', e); main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Error loading pipeline</div></div>'; }
}

// ══════════════════════════════════════
// TASKS
// ══════════════════════════════════════
async function loadTasks() {
  var main = document.getElementById('crmMain');
  try {
    var { data } = await _sb.from('tasks').select('*, contacts(id, first_name, last_name)').order('due_date').limit(100);
    var today = new Date().toISOString().split('T')[0];
    var pending = (data || []).filter(function(t) { return t.status === 'pending'; });
    var completed = (data || []).filter(function(t) { return t.status === 'completed'; });
    var overdue = pending.filter(function(t) { return t.due_date && t.due_date < today; });
    var todayTasks = pending.filter(function(t) { return t.due_date === today; });
    var upcoming = pending.filter(function(t) { return !t.due_date || t.due_date > today; });

    var html = '<div class="crm-page-header"><div><div class="crm-page-title fd">Tasks</div><div class="crm-page-subtitle">' + pending.length + ' pending</div></div><button class="crm-btn crm-btn-primary" onclick="fabAddTask()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Task</button></div>';

    if (overdue.length) {
      html += '<div class="crm-task-section"><div class="crm-task-section-title overdue"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg>Overdue (' + overdue.length + ')</div><div class="crm-task-list">';
      overdue.forEach(function(t) { html += taskRow(t, 'overdue'); });
      html += '</div></div>';
    }
    if (todayTasks.length) {
      html += '<div class="crm-task-section"><div class="crm-task-section-title today">Today (' + todayTasks.length + ')</div><div class="crm-task-list">';
      todayTasks.forEach(function(t) { html += taskRow(t, 'today'); });
      html += '</div></div>';
    }
    html += '<div class="crm-task-section"><div class="crm-task-section-title upcoming">Upcoming (' + upcoming.length + ')</div><div class="crm-task-list">';
    upcoming.forEach(function(t) { html += taskRow(t, 'future'); });
    if (!upcoming.length) html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No upcoming tasks</div></div>';
    html += '</div></div>';

    if (completed.length) {
      html += '<div class="crm-task-section"><div class="crm-task-section-title completed" onclick="document.getElementById(\'completedTasks\').style.display=document.getElementById(\'completedTasks\').style.display===\'none\'?\'block\':\'none\'">Completed (' + completed.length + ') &#9660;</div><div class="crm-task-list" id="completedTasks" style="display:none">';
      completed.slice(0, 20).forEach(function(t) { html += taskRow(t, 'completed'); });
      html += '</div></div>';
    }

    main.innerHTML = html;
  } catch(e) { console.error('[Tasks]', e); }
}

function taskRow(t, cls) {
  var cName = t.contacts ? t.contacts.first_name + ' ' + t.contacts.last_name : '';
  var isCompleted = t.status === 'completed';
  return '<div class="crm-task-item' + (isCompleted?' completed':'') + '"><label class="crm-checkbox"><input type="checkbox" ' + (isCompleted?'checked disabled':'onchange="completeTask(\'' + t.id + '\')"') + '><div class="crm-checkbox-box"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div></label><span class="crm-task-title">' + esc(t.title) + '</span>' + (cName ? '<span class="crm-task-contact" onclick="openContact(\'' + t.contact_id + '\')">' + esc(cName) + '</span>' : '') + '<span class="crm-task-due ' + cls + '">' + (t.due_date || 'No date') + '</span><span class="crm-badge crm-priority-badge" data-priority="' + t.priority + '">' + t.priority + '</span></div>';
}

async function completeTask(taskId) {
  await _sb.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', taskId);
  var { data: task } = await _sb.from('tasks').select('contact_id, title').eq('id', taskId).single();
  if (task && task.contact_id) {
    await _sb.from('contact_activity').insert({ contact_id: task.contact_id, activity_type: 'task_completed', description: 'Completed: ' + task.title });
  }
  toast('Task completed', 'success');
  if (_currentTab === 'tasks') loadTasks();
  else if (_currentTab === 'today') loadToday();
}

// ══════════════════════════════════════
// DOCUMENTS
// ══════════════════════════════════════
async function loadDocuments() {
  var main = document.getElementById('crmMain');
  try {
    var { data } = await _sb.from('documents').select('*, contacts(first_name, last_name), transactions(property_address)').eq('is_template', false).order('created_at', { ascending: false }).limit(100);
    var { data: templates } = await _sb.from('documents').select('*').eq('is_template', true).order('file_name');

    var html = '<div class="crm-page-header"><div><div class="crm-page-title fd">Documents</div><div class="crm-page-subtitle">' + (data||[]).length + ' documents</div></div></div>';

    // Upload area
    html += '<div class="crm-doc-upload" id="docUpload" onclick="document.getElementById(\'docFileInput\').click()"><div class="crm-doc-upload-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div><div class="crm-doc-upload-text">Drop files here or click to browse</div><div class="crm-doc-upload-hint">PDF, images, documents up to 50MB</div></div>';
    html += '<input type="file" id="docFileInput" style="display:none" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif" onchange="handleDocUpload(this.files)" />';

    // Templates section
    if (templates && templates.length) {
      html += '<div class="crm-section-title fd" style="margin-top:1.5rem">Templates</div>';
      html += '<div class="crm-doc-grid">';
      templates.forEach(function(d) { html += docCard(d); });
      html += '</div>';
    }

    // Documents grid
    html += '<div class="crm-section-title fd" style="margin-top:1.5rem">All Documents</div>';
    if (data && data.length) {
      html += '<div class="crm-doc-grid">';
      data.forEach(function(d) { html += docCard(d); });
      html += '</div>';
    } else {
      html += '<div class="crm-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/></svg><div class="crm-empty-state-title">No documents yet</div><div class="crm-empty-state-text">Upload your first document above</div></div>';
    }
    main.innerHTML = html;
    initDragDrop();
  } catch(e) { console.error('[Documents]', e); }
}

function docCard(d) {
  var cName = d.contacts ? d.contacts.first_name + ' ' + d.contacts.last_name : '';
  var txAddr = d.transactions ? d.transactions.property_address : '';
  return '<div class="crm-doc-card"><div class="crm-doc-card-header"><div class="crm-doc-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg></div><div><div class="crm-doc-card-name">' + esc(d.file_name) + '</div><div class="crm-doc-card-size">' + formatSize(d.file_size) + (cName ? ' &middot; ' + esc(cName) : '') + (txAddr ? ' &middot; ' + esc(txAddr) : '') + '</div></div></div><div class="crm-doc-card-badges"><span class="crm-badge crm-doc-category" data-cat="' + d.category + '">' + d.category + '</span><span class="crm-badge crm-doc-status" data-status="' + d.status + '">' + d.status + '</span></div><div class="crm-doc-card-actions"><button class="crm-btn crm-btn-ghost crm-btn-sm" onclick="previewDoc(\'' + d.id + '\')">Preview</button><button class="crm-btn crm-btn-ghost crm-btn-sm" onclick="sendDoc(\'' + d.id + '\')">Send</button><button class="crm-btn crm-btn-danger crm-btn-sm" onclick="deleteDoc(\'' + d.id + '\')">Delete</button></div></div>';
}

function initDragDrop() {
  var area = document.getElementById('docUpload');
  if (!area) return;
  ['dragenter','dragover'].forEach(function(ev) { area.addEventListener(ev, function(e) { e.preventDefault(); area.classList.add('dragover'); }); });
  ['dragleave','drop'].forEach(function(ev) { area.addEventListener(ev, function(e) { e.preventDefault(); area.classList.remove('dragover'); }); });
  area.addEventListener('drop', function(e) { handleDocUpload(e.dataTransfer.files); });
}

async function handleDocUpload(files) {
  if (!files || !files.length) return;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var path = 'general/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      var { error: uploadError } = await _sb.storage.from('documents').upload(path, file);
      if (uploadError) { toast('Upload failed: ' + uploadError.message, 'error'); continue; }
      await _sb.from('documents').insert({ file_name: file.name, file_path: path, file_size: file.size, file_type: file.type, uploaded_by: _currentUser.id });
      toast(file.name + ' uploaded', 'success');
    } catch(e) { toast('Upload error', 'error'); console.error(e); }
  }
  loadDocuments();
}

async function previewDoc(docId) {
  var { data: doc } = await _sb.from('documents').select('*').eq('id', docId).single();
  if (!doc) return;
  var { data: urlData } = await _sb.storage.from('documents').createSignedUrl(doc.file_path, 3600);
  if (!urlData || !urlData.signedUrl) { toast('Could not load preview', 'error'); return; }
  var overlay = document.createElement('div');
  overlay.className = 'crm-doc-preview-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = '<div class="crm-doc-preview-panel"><div class="crm-doc-preview-header"><span style="font-weight:500">' + esc(doc.file_name) + '</span><button class="crm-btn crm-btn-ghost crm-btn-sm" onclick="this.closest(\'.crm-doc-preview-overlay\').remove()">Close</button></div><div class="crm-doc-preview-body"><iframe src="' + urlData.signedUrl + '"></iframe></div></div>';
  document.body.appendChild(overlay);
}

async function sendDoc(docId) {
  var token = crypto.randomUUID();
  var expires = new Date(Date.now() + 7 * 86400000).toISOString();
  await _sb.from('documents').update({ share_token: token, share_expires_at: expires, status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', docId);
  var url = window.location.origin + '/doc.html?token=' + token;
  await navigator.clipboard.writeText(url);
  toast('Share link copied to clipboard!', 'success');
  if (_currentTab === 'documents') loadDocuments();
}

async function deleteDoc(docId) {
  if (!confirm('Delete this document?')) return;
  var { data: doc } = await _sb.from('documents').select('file_path').eq('id', docId).single();
  if (doc) await _sb.storage.from('documents').remove([doc.file_path]);
  await _sb.from('documents').delete().eq('id', docId);
  toast('Document deleted', 'success');
  loadDocuments();
}

// ══════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════
async function loadTransactions() {
  var main = document.getElementById('crmMain');
  try {
    var { data } = await _sb.from('transactions').select('*, contacts(first_name, last_name)').order('created_at', { ascending: false }).limit(50);
    var html = '<div class="crm-page-header"><div><div class="crm-page-title fd">Transactions</div><div class="crm-page-subtitle">' + (data||[]).length + ' transactions</div></div><button class="crm-btn crm-btn-primary" onclick="createTransaction()"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Transaction</button></div>';

    if (data && data.length) {
      data.forEach(function(t) {
        var cName = t.contacts ? t.contacts.first_name + ' ' + t.contacts.last_name : 'No client';
        html += '<div class="crm-tx-card" onclick="openTransaction(\'' + t.id + '\')"><div class="crm-tx-card-info"><div class="crm-tx-card-address">' + esc(t.property_address || 'No address') + '</div><div class="crm-tx-card-meta">' + esc(cName) + ' &middot; ' + t.transaction_type + (t.contract_price ? ' &middot; $' + t.contract_price.toLocaleString() : '') + (t.close_date ? ' &middot; Close: ' + t.close_date : '') + '</div></div><span class="crm-badge crm-stage-badge" data-stage="' + (t.status==='closed'?'closed':'under_contract') + '">' + t.status + '</span></div>';
      });
    } else {
      html += '<div class="crm-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg><div class="crm-empty-state-title">No transactions yet</div><div class="crm-empty-state-text">Create your first transaction to start tracking deals</div></div>';
    }
    main.innerHTML = html;
  } catch(e) { console.error('[Transactions]', e); }
}

var PURCHASE_CHECKLIST = ['Offer Submitted', 'Offer Accepted', 'Earnest Money Deposited', 'Inspection Scheduled', 'Inspection Complete', 'Appraisal Ordered', 'Appraisal Complete', 'Title Search', 'Loan Approval', 'Final Walk-Through', 'Closing'];
var SALE_CHECKLIST = ['Listing Agreement Signed', 'Disclosure Forms Complete', 'Offer Received', 'Offer Accepted', 'Inspection Complete', 'Appraisal Complete', 'Title Work', 'Closing'];

async function createTransaction(preContactId) {
  showQuickModal('New Transaction', '<div class="crm-form-group"><label class="crm-form-label">Client</label><select class="crm-select" id="txContact"><option value="">Select...</option></select></div><div class="crm-form-group"><label class="crm-form-label">Property Address</label><input class="crm-input" id="txAddress" /></div><div class="crm-form-row"><div class="crm-form-group"><label class="crm-form-label">Type</label><select class="crm-select" id="txType"><option value="purchase">Purchase</option><option value="sale">Sale</option><option value="lease">Lease</option></select></div><div class="crm-form-group"><label class="crm-form-label">Contract Price</label><input class="crm-input" id="txPrice" type="number" /></div></div><div class="crm-form-group"><label class="crm-form-label">Expected Close Date</label><input class="crm-input" id="txClose" type="date" /></div>', async function() {
    var cid = document.getElementById('txContact').value;
    var addr = document.getElementById('txAddress').value.trim();
    var type = document.getElementById('txType').value;
    var price = parseInt(document.getElementById('txPrice').value) || null;
    var close = document.getElementById('txClose').value || null;
    if (!addr) { toast('Enter property address', 'error'); return false; }

    var { data: tx } = await _sb.from('transactions').insert({ contact_id: cid || null, property_address: addr, transaction_type: type, contract_price: price, close_date: close }).select().single();

    // Auto-populate checklist
    var checklist = type === 'sale' ? SALE_CHECKLIST : PURCHASE_CHECKLIST;
    var items = checklist.map(function(title, i) { return { transaction_id: tx.id, title: title, sort_order: i }; });
    await _sb.from('transaction_checklist').insert(items);

    if (cid) {
      await _sb.from('contact_activity').insert({ contact_id: cid, activity_type: 'transaction_created', description: 'Transaction created: ' + addr });
    }
    toast('Transaction created', 'success');
    openTransaction(tx.id);
    return true;
  });
  loadContactDropdown('txContact');
  if (preContactId) setTimeout(function() { var sel = document.getElementById('txContact'); if (sel) sel.value = preContactId; }, 500);
}

async function openTransaction(id) {
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="crm-loading"><div class="crm-spinner"></div></div>';
  try {
    var [txResp, checkResp, docsResp] = await Promise.all([
      _sb.from('transactions').select('*, contacts(id, first_name, last_name, email)').eq('id', id).single(),
      _sb.from('transaction_checklist').select('*, documents(file_name)').eq('transaction_id', id).order('sort_order'),
      _sb.from('documents').select('*').eq('transaction_id', id).order('created_at', { ascending: false })
    ]);

    var tx = txResp.data;
    if (!tx) { main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Transaction not found</div></div>'; return; }
    var cName = tx.contacts ? tx.contacts.first_name + ' ' + tx.contacts.last_name : 'No client';
    var items = checkResp.data || [];
    var completedCount = items.filter(function(i) { return i.is_completed; }).length;

    var html = '<div style="margin-bottom:0.5rem"><button class="crm-btn crm-btn-ghost crm-btn-sm" onclick="loadTransactions()">&larr; Back</button></div>';

    // Header
    html += '<div class="crm-page-header"><div><div class="crm-page-title fd">' + esc(tx.property_address || 'Transaction') + '</div><div class="crm-page-subtitle">' + esc(cName) + ' &middot; ' + tx.transaction_type + (tx.contract_price ? ' &middot; $' + tx.contract_price.toLocaleString() : '') + ' &middot; ' + tx.status + (tx.close_date ? ' &middot; Close: ' + tx.close_date : '') + '</div></div></div>';

    // Visual timeline bar
    if (items.length) {
      html += '<div class="crm-tx-timeline-bar">';
      items.forEach(function(item, idx) {
        var cls = item.is_completed ? 'completed' : (idx === completedCount ? 'active' : '');
        html += '<div class="crm-tx-milestone ' + cls + '"><div class="crm-tx-milestone-dot"><svg viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5"/></svg></div><div class="crm-tx-milestone-label">' + esc(item.title) + '</div>' + (idx < items.length - 1 ? '<div class="crm-tx-milestone-line"></div>' : '') + '</div>';
      });
      html += '</div>';
    }

    // Checklist
    html += '<div class="crm-card"><div class="crm-section-title fd">Checklist (' + completedCount + '/' + items.length + ')</div>';
    html += '<div class="crm-tx-checklist">';
    items.forEach(function(item) {
      html += '<div class="crm-tx-checklist-item' + (item.is_completed?' completed':'') + '"><label class="crm-checkbox"><input type="checkbox" ' + (item.is_completed?'checked':'') + ' onchange="toggleChecklistItem(\'' + item.id + '\',' + !item.is_completed + ',\'' + id + '\')"><div class="crm-checkbox-box"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div></label><span class="crm-tx-checklist-title">' + esc(item.title) + '</span>' + (item.due_date ? '<span class="crm-tx-checklist-due">' + item.due_date + '</span>' : '') + (item.documents ? '<span class="crm-tx-checklist-doc">' + esc(item.documents.file_name) + '</span>' : '') + '</div>';
    });
    html += '</div></div>';

    // Documents
    html += '<div class="crm-card"><div class="crm-section-title fd">Documents</div>';
    html += '<div class="crm-doc-upload" style="padding:1rem;margin-bottom:0.75rem" onclick="document.getElementById(\'txDocInput\').click()"><div class="crm-doc-upload-text" style="font-size:0.75rem">Upload document for this transaction</div></div>';
    html += '<input type="file" id="txDocInput" style="display:none" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onchange="handleTxDocUpload(this.files,\'' + id + '\',\'' + (tx.contact_id||'') + '\')" />';
    if ((docsResp.data || []).length) {
      html += '<div class="crm-doc-grid">';
      docsResp.data.forEach(function(d) { html += docCard(d); });
      html += '</div>';
    }
    html += '</div>';

    main.innerHTML = html;
  } catch(e) { console.error('[Transaction Detail]', e); }
}

async function toggleChecklistItem(itemId, checked, txId) {
  await _sb.from('transaction_checklist').update({ is_completed: checked, completed_at: checked ? new Date().toISOString() : null }).eq('id', itemId);
  openTransaction(txId);
}

async function handleTxDocUpload(files, txId, contactId) {
  if (!files || !files.length) return;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var path = (contactId || 'general') + '/' + txId + '/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      var { error: uploadError } = await _sb.storage.from('documents').upload(path, file);
      if (uploadError) { toast('Upload failed: ' + uploadError.message, 'error'); continue; }
      await _sb.from('documents').insert({ file_name: file.name, file_path: path, file_size: file.size, file_type: file.type, contact_id: contactId || null, transaction_id: txId, uploaded_by: _currentUser.id });
      toast(file.name + ' uploaded', 'success');
    } catch(e) { toast('Upload error', 'error'); }
  }
  openTransaction(txId);
}

// ══════════════════════════════════════
// SHOWINGS (ported from app.js)
// ══════════════════════════════════════
async function loadShowings() {
  var main = document.getElementById('crmMain');
  try {
    var { data } = await _sb.from('showing_requests').select('*').order('created_at', { ascending: false }).limit(50);
    var html = '<div class="crm-page-header"><div class="crm-page-title fd">Showings</div></div>';
    if (!data || !data.length) { main.innerHTML = html + '<div class="crm-empty-state"><div class="crm-empty-state-title">No showing requests yet</div></div>'; return; }

    data.forEach(function(s) {
      var pd = s.property_data || {};
      var slots = s.preferred_slots || [];
      html += '<div class="crm-card" style="margin-bottom:0.75rem"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem"><div><strong>' + esc(pd.address || 'Unknown') + '</strong>, ' + esc(pd.city || '') + '</div><span class="crm-badge crm-stage-badge" data-stage="' + (s.status==='confirmed'?'closed':s.status==='cancelled'?'past_client':'under_contract') + '">' + s.status + '</span></div>';
      html += '<div style="font-size:0.75rem;color:var(--crm-text-secondary);margin-bottom:0.5rem">' + esc(s.user_name || '') + ' &middot; ' + esc(s.user_email || '') + ' &middot; ' + esc(s.user_phone || '') + '</div>';
      html += '<div style="font-size:0.72rem;margin-bottom:0.5rem"><strong>Preferred:</strong> ';
      slots.forEach(function(sl, i) { html += (i + 1) + '. ' + sl.date + ' at ' + sl.time + '  '; });
      html += '</div>';
      if (s.status === 'pending') {
        html += '<div style="display:flex;gap:0.5rem;align-items:center"><select class="crm-select crm-btn-sm" id="confirmSlot_' + s.id + '" style="max-width:200px">';
        slots.forEach(function(sl, i) { html += '<option value="' + i + '">' + sl.date + ' ' + sl.time + '</option>'; });
        html += '</select><button class="crm-btn crm-btn-primary crm-btn-sm" onclick="confirmShowing(\'' + s.id + '\')">Confirm</button><button class="crm-btn crm-btn-danger crm-btn-sm" onclick="updateShowingStatus(\'' + s.id + '\',\'cancelled\')">Cancel</button></div>';
      }
      html += '</div>';
    });
    main.innerHTML = html;
  } catch(e) { console.error('[Showings]', e); }
}

async function confirmShowing(id) {
  try {
    var sel = document.getElementById('confirmSlot_' + id);
    if (!sel) return;
    var { data } = await _sb.from('showing_requests').select('preferred_slots').eq('id', id).single();
    var slot = data.preferred_slots[parseInt(sel.value)];
    await _sb.from('showing_requests').update({ status: 'confirmed', confirmed_slot: slot, updated_at: new Date().toISOString() }).eq('id', id);
    toast('Showing confirmed', 'success');
    loadShowings();
  } catch(e) { toast('Error confirming showing', 'error'); }
}

async function updateShowingStatus(id, status) {
  await _sb.from('showing_requests').update({ status: status, updated_at: new Date().toISOString() }).eq('id', id);
  toast('Showing ' + status, 'success');
  loadShowings();
}

// ══════════════════════════════════════
// QUESTIONS (ported from app.js)
// ══════════════════════════════════════
async function loadQuestions() {
  var main = document.getElementById('crmMain');
  try {
    var { data } = await _sb.from('property_questions').select('*').order('created_at', { ascending: false }).limit(50);
    var unanswered = (data || []).filter(function(q) { return !q.response_text; });
    var answered = (data || []).filter(function(q) { return q.response_text; });

    var html = '<div class="crm-page-header"><div class="crm-page-title fd">Questions (' + unanswered.length + ' unanswered)</div></div>';

    if (unanswered.length) {
      html += '<div class="crm-section-title fd">Unanswered</div>';
      unanswered.forEach(function(q) {
        var pd = q.property_data || {};
        html += '<div class="crm-card" style="margin-bottom:0.75rem;border-left:3px solid var(--crm-amber)"><div style="display:flex;justify-content:space-between;margin-bottom:0.4rem"><span style="font-weight:500">' + esc(pd.address || '') + '</span><span style="font-size:0.68rem;color:var(--crm-text-muted)">' + esc(q.user_name || '') + ' &middot; ' + timeAgo(q.created_at) + '</span></div><div style="font-size:0.78rem;margin-bottom:0.5rem">' + esc(q.question_text) + '</div><div class="crm-form-inline"><textarea class="crm-textarea" id="qReply_' + q.id + '" rows="2" placeholder="Type response..." style="min-height:40px"></textarea><button class="crm-btn crm-btn-primary crm-btn-sm" onclick="replyToQuestion(\'' + q.id + '\')">Reply</button></div></div>';
      });
    }

    if (answered.length) {
      html += '<div class="crm-section-title fd" style="margin-top:1.5rem">Answered</div>';
      answered.forEach(function(q) {
        var pd = q.property_data || {};
        html += '<div class="crm-card" style="margin-bottom:0.5rem;opacity:0.7"><div style="font-weight:500;font-size:0.78rem">' + esc(pd.address || '') + ' — ' + esc(q.user_name || '') + '</div><div style="font-size:0.75rem;margin:0.3rem 0">' + esc(q.question_text) + '</div><div style="font-size:0.75rem;color:var(--crm-green)"><strong>Reply:</strong> ' + esc(q.response_text) + '</div></div>';
      });
    }

    if (!data || !data.length) html += '<div class="crm-empty-state"><div class="crm-empty-state-title">No questions yet</div></div>';
    main.innerHTML = html;
  } catch(e) { console.error('[Questions]', e); }
}

async function replyToQuestion(id) {
  var ta = document.getElementById('qReply_' + id);
  if (!ta || !ta.value.trim()) return;
  await _sb.from('property_questions').update({ response_text: ta.value.trim(), responded_at: new Date().toISOString() }).eq('id', id);
  var { data: q } = await _sb.from('property_questions').select('user_id, property_key, property_data').eq('id', id).single();
  if (q && q.user_id) {
    await _sb.from('alert_notifications').insert({ user_id: q.user_id, alert_type: 'question_response', property_key: q.property_key, title: 'Cory answered your question', message: 'Your question about ' + ((q.property_data || {}).address || 'a property') + ' has been answered.' });
  }
  toast('Reply sent', 'success');
  loadQuestions();
}

// ══════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════
async function loadAnalytics() {
  var main = document.getElementById('crmMain');
  try {
    var weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    var monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    var [contactsResp, viewsResp, favsResp, usersResp, closedResp, reachedResp, leadsResp] = await Promise.all([
      _sb.from('contacts').select('id, source, stage, created_at', { count: 'exact' }).eq('is_archived', false),
      _sb.from('viewing_history').select('id', { count: 'exact' }),
      _sb.from('favorites').select('id', { count: 'exact' }),
      _sb.from('profiles').select('id, first_name, last_name, email, created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(20),
      _sb.from('transactions').select('id', { count: 'exact' }).eq('status', 'closed'),
      _sb.from('contacts').select('id', { count: 'exact' }).gte('last_contacted_at', weekAgo),
      _sb.from('contacts').select('id, source').gte('created_at', monthAgo)
    ]);

    var html = '<div class="crm-page-header"><div class="crm-page-title fd">Analytics</div></div>';

    // Stats
    html += '<div class="crm-stats-grid">';
    html += statCard(contactsResp.count || 0, 'Total Contacts', 'accent');
    html += statCard(usersResp.count || 0, 'Registered Users', 'blue');
    html += statCard(viewsResp.count || 0, 'Property Views', 'teal');
    html += statCard(favsResp.count || 0, 'Favorites', 'purple');
    html += statCard(closedResp.count || 0, 'Deals Closed', 'green');
    html += statCard(reachedResp.count || 0, 'Reached This Week', 'amber');
    html += '</div>';

    // Lead sources
    var sources = {};
    (leadsResp.data || []).forEach(function(l) { sources[l.source] = (sources[l.source] || 0) + 1; });
    html += '<div class="crm-card"><div class="crm-section-title fd">Lead Sources (Last 30 Days)</div>';
    Object.keys(sources).sort(function(a, b) { return sources[b] - sources[a]; }).forEach(function(s) {
      var pct = Math.round(sources[s] / (leadsResp.data || []).length * 100);
      html += '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem"><span style="width:120px;font-size:0.75rem;font-weight:500">' + s + '</span><div style="flex:1;height:8px;background:var(--crm-bg-surface);border-radius:4px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:var(--crm-accent);border-radius:4px;transition:width 0.3s"></div></div><span style="font-size:0.72rem;color:var(--crm-text-muted);min-width:40px;text-align:right">' + sources[s] + '</span></div>';
    });
    if (!Object.keys(sources).length) html += '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No lead data this month</div></div>';
    html += '</div>';

    // Pipeline breakdown
    var stageCount = {};
    (contactsResp.data || []).forEach(function(c) { stageCount[c.stage] = (stageCount[c.stage] || 0) + 1; });
    html += '<div class="crm-card"><div class="crm-section-title fd">Pipeline Breakdown</div>';
    ['new','contacted','showing','under_contract','closed','past_client'].forEach(function(s) {
      var count = stageCount[s] || 0;
      html += '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.4rem"><span style="width:120px;font-size:0.75rem">' + stageLabel(s) + '</span><div style="flex:1;height:8px;background:var(--crm-bg-surface);border-radius:4px;overflow:hidden"><div style="width:' + Math.round(count / Math.max(contactsResp.count || 1, 1) * 100) + '%;height:100%;background:var(--stage-' + s.replace('_','-') + ');border-radius:4px"></div></div><span style="font-size:0.72rem;color:var(--crm-text-muted)">' + count + '</span></div>';
    });
    html += '</div>';

    // Recent users
    if (usersResp.data && usersResp.data.length) {
      html += '<div class="crm-card"><div class="crm-section-title fd">Recent Signups</div>';
      html += '<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Name</th><th>Email</th><th>Joined</th></tr></thead><tbody>';
      usersResp.data.forEach(function(u) {
        html += '<tr><td>' + esc((u.first_name||'') + ' ' + (u.last_name||'')) + '</td><td>' + esc(u.email||'') + '</td><td class="crm-table-muted">' + new Date(u.created_at).toLocaleDateString() + '</td></tr>';
      });
      html += '</tbody></table></div></div>';
    }

    main.innerHTML = html;
  } catch(e) { console.error('[Analytics]', e); }
}

// ══════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════
function esc(str) { if (!str) return ''; var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

function timeAgo(dateStr) {
  if (!dateStr) return '';
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  var days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  var months = Math.floor(days / 30);
  return months + 'mo ago';
}

function staleDays(contact) {
  if (!contact.last_contacted_at) {
    return Math.floor((Date.now() - new Date(contact.created_at).getTime()) / 86400000);
  }
  return Math.floor((Date.now() - new Date(contact.last_contacted_at).getTime()) / 86400000);
}

function stageLabel(stage) {
  var labels = { new: 'New', contacted: 'Contacted', showing: 'Showing', under_contract: 'Under Contract', closed: 'Closed', past_client: 'Past Client' };
  return labels[stage] || stage;
}

function activityLabel(type) {
  var labels = { property_view: 'Viewed property', favorite_added: 'Favorited property', favorite_removed: 'Unfavorited property', showing_requested: 'Requested showing', question_asked: 'Asked question', search_saved: 'Saved search', account_created: 'Created account' };
  return labels[type] || type;
}

function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; }

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function renderActivityList(activities) {
  if (!activities || !activities.length) return '<div class="crm-empty-state" style="padding:1rem"><div class="crm-empty-state-text">No recent activity</div></div>';
  var html = '<div class="crm-timeline">';
  activities.forEach(function(a) {
    var dotClass = a.activity_type === 'stage_changed' ? 'stage-change' : a.activity_type === 'task_completed' ? 'task-event' : a.activity_type.includes('doc') ? 'doc-event' : 'crm-event';
    html += '<div class="crm-timeline-item"><div class="crm-timeline-dot ' + dotClass + '"></div><div class="crm-timeline-desc">' + esc(a.description || a.activity_type) + '</div><div class="crm-timeline-time">' + timeAgo(a.created_at) + '</div></div>';
  });
  html += '</div>';
  return html;
}

// ═══════════════════════════════════════════════════════════════
// LISTINGS TAB — Full MLS Research Tool
// ═══════════════════════════════════════════════════════════════

var _listingsCache = [];
var _listingsFilters = { search: '', status: '', type: '', city: '', feed: '', priceMin: '', priceMax: '' };
var _listingsSort = { col: 'list_price', asc: false };
var _listingsDetailOpen = null; // listing_key of expanded row

async function loadListings() {
  var main = document.getElementById('crmMain');
  if (!_listingsCache.length) {
    main.innerHTML = '<div class="crm-loading"><div class="crm-spinner"></div></div>';
    try {
      var data = [];
      var from = 0;
      var pageSize = 1000;
      while (true) {
        var resp = await _sb.from('mls_listings').select('*').range(from, from + pageSize - 1);
        if (resp.error) throw resp.error;
        if (!resp.data || !resp.data.length) break;
        data = data.concat(resp.data);
        if (resp.data.length < pageSize) break;
        from += pageSize;
      }
      _listingsCache = data;
    } catch(e) {
      console.error('[Listings]', e);
      main.innerHTML = '<div class="crm-empty-state"><div class="crm-empty-state-title">Error loading listings</div><div class="crm-empty-state-text">' + esc(e.message || 'Unknown error') + '</div></div>';
      return;
    }
  }
  renderListingsTab();
}

function renderListingsTab() {
  var main = document.getElementById('crmMain');
  var filtered = filterListings();

  // Unique cities for dropdown
  var cities = {};
  _listingsCache.forEach(function(l) { if (l.city) cities[l.city] = true; });
  var cityOptions = Object.keys(cities).sort();

  var html = '<div class="crm-page-header"><div><div class="crm-page-title fd">MLS Listings</div><div class="crm-page-subtitle">' + filtered.length + ' of ' + _listingsCache.length + ' listings</div></div></div>';

  // Filters
  html += '<div class="listings-filters">';
  html += '<input class="crm-input listings-search" placeholder="Search address, MLS#, agent..." value="' + esc(_listingsFilters.search) + '" oninput="filterListingsBy(\'search\',this.value)" />';
  html += '<select class="crm-select" onchange="filterListingsBy(\'status\',this.value)"><option value="">All Statuses</option>';
  ['Active', 'Under Contract', 'Closed', 'Expired', 'Withdrawn'].forEach(function(s) {
    html += '<option value="' + s + '"' + (_listingsFilters.status === s ? ' selected' : '') + '>' + s + '</option>';
  });
  html += '</select>';
  html += '<select class="crm-select" onchange="filterListingsBy(\'type\',this.value)"><option value="">All Types</option>';
  ['Single Family', 'Cabin', 'Land', 'Condo', 'Townhouse', 'Multi Family'].forEach(function(s) {
    html += '<option value="' + s + '"' + (_listingsFilters.type === s ? ' selected' : '') + '>' + s + '</option>';
  });
  html += '</select>';
  html += '<select class="crm-select" onchange="filterListingsBy(\'city\',this.value)"><option value="">All Cities</option>';
  cityOptions.forEach(function(c) {
    html += '<option value="' + c + '"' + (_listingsFilters.city === c ? ' selected' : '') + '>' + c + '</option>';
  });
  html += '</select>';
  html += '<select class="crm-select" onchange="filterListingsBy(\'feed\',this.value)"><option value="">All Feeds</option><option value="IDX"' + (_listingsFilters.feed === 'IDX' ? ' selected' : '') + '>IDX Only</option><option value="BBO"' + (_listingsFilters.feed === 'BBO' ? ' selected' : '') + '>BBO Only</option></select>';
  html += '<select class="crm-select" onchange="filterListingsBy(\'priceMax\',this.value)"><option value="">Any Price</option>';
  [200000,400000,700000,1000000,2000000].forEach(function(p) {
    html += '<option value="' + p + '"' + (_listingsFilters.priceMax == p ? ' selected' : '') + '>Under $' + (p >= 1000000 ? (p/1000000) + 'M' : (p/1000) + 'K') + '</option>';
  });
  html += '</select>';
  html += '</div>';

  // Table
  html += '<div class="crm-table-wrap listings-table-wrap"><table class="crm-table listings-table"><thead><tr>';
  var cols = [
    { key: 'standard_status', label: 'Status', w: '90px' },
    { key: 'listing_id', label: 'MLS#', w: '90px' },
    { key: 'full_address', label: 'Address', w: '' },
    { key: 'city', label: 'City', w: '110px' },
    { key: 'property_type', label: 'Type', w: '100px' },
    { key: 'list_price', label: 'Price', w: '100px' },
    { key: 'days_on_market', label: 'DOM', w: '55px' },
    { key: 'list_agent_full_name', label: 'List Agent', w: '130px' },
    { key: 'list_office_name', label: 'Office', w: '140px' },
    { key: 'feed_type', label: 'Feed', w: '55px' }
  ];
  cols.forEach(function(c) {
    var arrow = _listingsSort.col === c.key ? (_listingsSort.asc ? ' ↑' : ' ↓') : '';
    html += '<th style="' + (c.w ? 'width:' + c.w : '') + ';cursor:pointer" onclick="sortListings(\'' + c.key + '\')">' + c.label + arrow + '</th>';
  });
  html += '</tr></thead><tbody>';

  if (filtered.length) {
    filtered.slice(0, 200).forEach(function(l) {
      var statusClass = (l.standard_status || '').toLowerCase().replace(/\s+/g, '-');
      html += '<tr class="listings-row" onclick="toggleListingDetail(\'' + esc(l.listing_key) + '\')">';
      html += '<td><span class="listings-status-dot ' + statusClass + '">' + esc(l.standard_status || '—') + '</span></td>';
      html += '<td class="crm-table-muted">' + esc(l.listing_id || '') + '</td>';
      html += '<td>' + esc(l.full_address || '') + '</td>';
      html += '<td>' + esc(l.city || '') + '</td>';
      html += '<td>' + esc(l.property_type || '') + '</td>';
      html += '<td>$' + (l.list_price ? l.list_price.toLocaleString() : '—') + '</td>';
      html += '<td class="crm-table-muted">' + (l.days_on_market || '—') + '</td>';
      html += '<td class="crm-table-muted">' + esc(l.list_agent_full_name || '') + '</td>';
      html += '<td class="crm-table-muted">' + esc(l.list_office_name || '') + '</td>';
      html += '<td><span class="listings-feed-badge ' + (l.feed_type === 'IDX' ? 'idx' : 'bbo') + '">' + esc(l.feed_type || '—') + '</span></td>';
      html += '</tr>';
      // Inline detail row
      if (_listingsDetailOpen === l.listing_key) {
        html += '<tr class="listings-detail-row"><td colspan="10">' + renderListingDetail(l) + '</td></tr>';
      }
    });
    if (filtered.length > 200) {
      html += '<tr><td colspan="10" class="crm-table-muted" style="text-align:center;padding:1rem">Showing first 200 of ' + filtered.length + ' results. Use filters to narrow down.</td></tr>';
    }
  } else {
    html += '<tr><td colspan="10"><div class="crm-empty-state"><div class="crm-empty-state-text">No listings match your filters</div></div></td></tr>';
  }
  html += '</tbody></table></div>';
  main.innerHTML = html;
}

function filterListings() {
  var results = _listingsCache.slice();
  var f = _listingsFilters;
  if (f.status) results = results.filter(function(l) { return l.standard_status === f.status; });
  if (f.type) results = results.filter(function(l) { return l.property_type === f.type; });
  if (f.city) results = results.filter(function(l) { return l.city === f.city; });
  if (f.feed) results = results.filter(function(l) {
    if (f.feed === 'BBO') return !l.mlg_can_view;
    return l.mlg_can_view === true;
  });
  if (f.priceMax) results = results.filter(function(l) { return l.list_price && l.list_price <= parseInt(f.priceMax); });
  if (f.search) {
    var s = f.search.toLowerCase();
    results = results.filter(function(l) {
      return (l.full_address || '').toLowerCase().includes(s) ||
        (l.listing_id || '').toLowerCase().includes(s) ||
        (l.listing_key || '').toLowerCase().includes(s) ||
        (l.list_agent_full_name || '').toLowerCase().includes(s) ||
        (l.list_office_name || '').toLowerCase().includes(s) ||
        (l.city || '').toLowerCase().includes(s);
    });
  }
  // Sort
  var col = _listingsSort.col;
  var asc = _listingsSort.asc;
  results.sort(function(a, b) {
    var va = a[col], vb = b[col];
    if (va == null) va = '';
    if (vb == null) vb = '';
    if (typeof va === 'number' && typeof vb === 'number') return asc ? va - vb : vb - va;
    va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    return asc ? va.localeCompare(vb) : vb.localeCompare(va);
  });
  return results;
}

function filterListingsBy(key, val) {
  _listingsFilters[key] = val;
  renderListingsTab();
}

function sortListings(col) {
  if (_listingsSort.col === col) _listingsSort.asc = !_listingsSort.asc;
  else { _listingsSort.col = col; _listingsSort.asc = true; }
  renderListingsTab();
}

function toggleListingDetail(listingKey) {
  _listingsDetailOpen = (_listingsDetailOpen === listingKey) ? null : listingKey;
  renderListingsTab();
  // Scroll to detail row
  if (_listingsDetailOpen) {
    setTimeout(function() {
      var row = document.querySelector('.listings-detail-row');
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}

function renderListingDetail(l) {
  var html = '<div class="listings-detail">';

  // Two column layout
  html += '<div class="listings-detail-grid">';

  // Left: photos placeholder + map
  html += '<div class="listings-detail-left">';
  html += '<div class="listings-detail-photos" id="ldPhotos_' + esc(l.listing_key) + '"><div class="crm-loading" style="padding:2rem"><div class="crm-spinner"></div></div></div>';
  if (l.latitude && l.longitude) {
    html += '<div class="listings-detail-map" id="ldMap_' + esc(l.listing_key) + '"></div>';
  }
  html += '</div>';

  // Right: all fields
  html += '<div class="listings-detail-right">';

  // Section 1: Listing Info
  html += '<div class="ld-section"><div class="ld-section-title">Listing Info</div><div class="ld-grid">';
  html += ldField('Price', l.list_price ? '$' + l.list_price.toLocaleString() : '—');
  html += ldField('Status', l.standard_status);
  html += ldField('MLS#', l.listing_id);
  html += ldField('DOM', l.days_on_market);
  html += ldField('List Date', l.list_date);
  html += ldField('Feed Type', l.feed_type);
  html += ldField('Original Price', l.original_list_price ? '$' + l.original_list_price.toLocaleString() : '');
  html += ldField('Close Price', l.close_price ? '$' + l.close_price.toLocaleString() : '');
  html += ldField('Close Date', l.close_date);
  if (l.virtual_tour_url) html += '<div class="ld-field"><span class="ld-field-label">Virtual Tour</span><span class="ld-field-value"><a href="' + esc(l.virtual_tour_url) + '" target="_blank" style="color:var(--crm-accent)">Open Tour ↗</a></span></div>';
  if (l.video_url) html += '<div class="ld-field"><span class="ld-field-label">Video</span><span class="ld-field-value"><a href="' + esc(l.video_url) + '" target="_blank" style="color:var(--crm-accent)">Watch ↗</a></span></div>';
  html += '</div></div>';

  // Section 2: Property Details
  html += '<div class="ld-section"><div class="ld-section-title">Property Details</div><div class="ld-grid">';
  html += ldField('Type', l.property_type);
  html += ldField('Sub Type', l.property_sub_type);
  html += ldField('Beds', l.bedrooms_total);
  html += ldField('Baths', l.bathrooms_total_integer);
  html += ldField('Half Baths', l.bathrooms_half);
  html += ldField('Sqft', l.living_area ? parseFloat(l.living_area).toLocaleString() : '');
  html += ldField('Lot Acres', l.lot_size_acres);
  html += ldField('Year Built', l.year_built);
  html += ldField('Stories', l.stories);
  html += ldField('Garage', l.garage_spaces);
  html += ldField('Parking', l.parking_total);
  html += '</div></div>';

  // Section 3: Description
  if (l.public_remarks) {
    html += '<div class="ld-section"><div class="ld-section-title">Public Remarks</div><div class="ld-text">' + esc(l.public_remarks) + '</div></div>';
  }

  // Section 4: BBO / Agent Notes (gold border) — all broker-only fields
  html += '<div class="ld-section ld-bbo"><div class="ld-section-title">Agent Notes <span class="ld-bbo-badge">BBO</span></div>';

  if (l.private_remarks) html += '<div class="ld-bbo-field"><div class="ld-bbo-label">Private Remarks</div><div class="ld-text">' + esc(l.private_remarks) + '</div></div>';
  if (l.showing_instructions) html += '<div class="ld-bbo-field"><div class="ld-bbo-label">Showing Instructions</div><div class="ld-text">' + esc(l.showing_instructions) + '</div></div>';
  if (l.directions) html += '<div class="ld-bbo-field"><div class="ld-bbo-label">Directions</div><div class="ld-text">' + esc(l.directions) + '</div></div>';

  // Lock box
  if (l.lock_box_type || l.lock_box_serial_number || l.lock_box_location) {
    html += '<div class="ld-bbo-field"><div class="ld-bbo-label">Lock Box</div><div class="ld-grid">';
    html += ldField('Type', l.lock_box_type); html += ldField('Serial #', l.lock_box_serial_number); html += ldField('Location', l.lock_box_location);
    html += '</div></div>';
  }

  // Showing contact
  if (l.showing_contact_name || l.showing_contact_phone) {
    html += '<div class="ld-bbo-field"><div class="ld-bbo-label">Showing Contact</div><div class="ld-grid">';
    html += ldField('Name', l.showing_contact_name); html += ldField('Phone', l.showing_contact_phone); html += ldField('Type', l.showing_contact_type);
    html += '</div></div>';
  }

  // Commission
  if (l.buyer_agency_compensation || l.sub_agency_compensation || l.transaction_broker_compensation) {
    html += '<div class="ld-bbo-field"><div class="ld-bbo-label">Compensation</div><div class="ld-grid">';
    html += ldField('Buyer Agency', l.buyer_agency_compensation); html += ldField('Sub-Agency', l.sub_agency_compensation); html += ldField('Transaction Broker', l.transaction_broker_compensation);
    html += '</div></div>';
  }

  // Occupant
  if (l.occupant_name || l.occupant_phone || l.occupant_type) {
    html += '<div class="ld-bbo-field"><div class="ld-bbo-label">Occupant</div><div class="ld-grid">';
    html += ldField('Name', l.occupant_name); html += ldField('Phone', l.occupant_phone); html += ldField('Type', l.occupant_type);
    html += '</div></div>';
  }

  // Listing terms
  if (l.listing_agreement || l.special_listing_conditions) {
    html += '<div class="ld-bbo-field"><div class="ld-bbo-label">Listing Terms</div><div class="ld-grid">';
    html += ldField('Agreement', l.listing_agreement); html += ldField('Special Conditions', l.special_listing_conditions);
    html += '</div></div>';
  }

  // Seller concessions
  if (l.concessions_amount || l.concessions_comments) {
    html += '<div class="ld-bbo-field"><div class="ld-bbo-label">Seller Concessions</div><div class="ld-grid">';
    html += ldField('Amount', l.concessions_amount ? '$' + parseFloat(l.concessions_amount).toLocaleString() : ''); html += ldField('Comments', l.concessions_comments);
    html += '</div></div>';
  }

  html += '</div>';

  // Section 5: Agent & Office
  html += '<div class="ld-section"><div class="ld-section-title">Agent & Office</div><div class="ld-grid">';
  html += ldField('List Agent', l.list_agent_full_name);
  html += ldField('Agent Email', l.list_agent_email);
  html += ldField('Agent Phone', l.list_agent_phone);
  html += ldField('List Office', l.list_office_name);
  html += ldField('Office Phone', l.list_office_phone);
  html += ldField('Buyer Agent', l.buyer_agent_full_name);
  html += ldField('Buyer Office', l.buyer_office_name);
  html += '</div></div>';

  // Section 6: Features
  var featureArrays = [
    ['Interior', l.interior_features], ['Exterior', l.exterior_features],
    ['Appliances', l.appliances], ['Heating', l.heating], ['Cooling', l.cooling],
    ['Roof', l.roof], ['Flooring', l.flooring], ['Foundation', l.foundation_details],
    ['Construction', l.construction_materials], ['View', l.view],
    ['Waterfront', l.waterfront_features]
  ];
  var hasFeatures = featureArrays.some(function(f) { return f[1] && f[1].length; });
  if (hasFeatures) {
    html += '<div class="ld-section"><div class="ld-section-title">Features</div><div class="ld-grid">';
    featureArrays.forEach(function(f) {
      if (f[1] && f[1].length) {
        var val = Array.isArray(f[1]) ? f[1].join(', ') : f[1];
        html += ldField(f[0], val);
      }
    });
    html += '</div></div>';
  }

  // Section 7: Utilities
  var hasUtilities = l.water_source || l.sewer || l.electric || l.internet_whole_listing;
  if (hasUtilities) {
    html += '<div class="ld-section"><div class="ld-section-title">Utilities</div><div class="ld-grid">';
    html += ldField('Water', arrayOrStr(l.water_source));
    html += ldField('Sewer', arrayOrStr(l.sewer));
    html += ldField('Electric', arrayOrStr(l.electric));
    html += ldField('Internet', arrayOrStr(l.internet_whole_listing));
    html += '</div></div>';
  }

  // Section 8: Financial
  html += '<div class="ld-section"><div class="ld-section-title">Financial</div><div class="ld-grid">';
  html += ldField('HOA Fee', l.association_fee ? '$' + l.association_fee : '');
  html += ldField('HOA Frequency', l.association_fee_frequency);
  html += ldField('HOA Name', l.association_name);
  html += ldField('Tax Amount', l.tax_annual_amount ? '$' + parseFloat(l.tax_annual_amount).toLocaleString() : '');
  html += ldField('Tax Year', l.tax_year);
  html += ldField('Zoning', l.zoning);
  html += ldField('Restrictions', arrayOrStr(l.restrictions));
  html += '</div></div>';

  // Section 9: Location
  html += '<div class="ld-section"><div class="ld-section-title">Location</div><div class="ld-grid">';
  html += ldField('Address', l.full_address);
  html += ldField('City', l.city);
  html += ldField('County', l.county_or_parish);
  html += ldField('State', l.state_or_province);
  html += ldField('Zip', l.postal_code);
  html += ldField('Lat', l.latitude);
  html += ldField('Lng', l.longitude);
  html += '</div></div>';

  // Section 10: Raw Data (collapsible)
  if (l.raw_data) {
    html += '<div class="ld-section"><details class="ld-raw"><summary class="ld-section-title" style="cursor:pointer">Raw MLS Data ▸</summary><pre class="ld-raw-json">' + esc(JSON.stringify(l.raw_data, null, 2)) + '</pre></details></div>';
  }

  html += '</div>'; // end right
  html += '</div>'; // end grid
  html += '</div>'; // end detail

  // Load photos async
  setTimeout(function() { loadListingPhotos(l.listing_key); }, 100);
  // Init map async
  if (l.latitude && l.longitude) {
    setTimeout(function() { initListingDetailMap(l.listing_key, l.latitude, l.longitude, l.full_address, l.city); }, 200);
  }

  return html;
}

function ldField(label, value) {
  if (value == null || value === '' || value === undefined) return '';
  return '<div class="ld-field"><span class="ld-field-label">' + label + '</span><span class="ld-field-value">' + esc(String(value)) + '</span></div>';
}

function arrayOrStr(val) {
  if (!val) return '';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

async function loadListingPhotos(listingKey) {
  var container = document.getElementById('ldPhotos_' + listingKey);
  if (!container) return;
  try {
    var resp = await _sb.from('mls_media').select('local_url,media_url,order').eq('listing_key', listingKey).order('order', { ascending: true }).limit(20);
    if (!resp.data || !resp.data.length) {
      container.innerHTML = '<div class="ld-no-photos">No photos available</div>';
      return;
    }
    var html = '<div class="ld-photo-scroll">';
    resp.data.forEach(function(p, i) {
      var src = p.local_url || p.media_url;
      html += '<img class="ld-photo" src="' + esc(src) + '" alt="Photo ' + (i+1) + '" loading="lazy" onclick="window.open(\'' + esc(src) + '\',\'_blank\')" />';
    });
    html += '</div>';
    container.innerHTML = html;
  } catch(e) { container.innerHTML = '<div class="ld-no-photos">Error loading photos</div>'; }
}

var _ldMaps = {};
function initListingDetailMap(listingKey, lat, lng, address, city) {
  var container = document.getElementById('ldMap_' + listingKey);
  if (!container || typeof L === 'undefined') return;
  // Clean up previous map for this key
  if (_ldMaps[listingKey]) { try { _ldMaps[listingKey].remove(); } catch(e){} }
  var map = L.map(container, { zoomControl: true, scrollWheelZoom: false }).setView([parseFloat(lat), parseFloat(lng)], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>', maxZoom: 18
  }).addTo(map);
  L.marker([parseFloat(lat), parseFloat(lng)]).addTo(map).bindPopup('<strong>' + esc(address || '') + '</strong><br>' + esc(city || '') + ', NC');
  _ldMaps[listingKey] = map;
  setTimeout(function() { map.invalidateSize(); }, 300);
}

// ══════════════════════════════════════
// CMA (Comparative Market Analysis)
// Mountain-specific CMA with AI features
// ══════════════════════════════════════

var _cmaState = {
  step: 0,           // 0=dashboard, 1=select subject, 2=select comps, 3=adjust, 4=review
  subject: null,     // { listing, features }
  comps: [],         // [{ listing, features, similarity, distance, selected }]
  selectedComps: [], // Final selected comps for adjustment
  adjustments: [],   // Calculated adjustment results
  valuation: null,   // { suggested_low, suggested_high, suggested_price }
  aiAdvice: null,    // { considerations, summary, comp_reasoning }
  reportId: null,    // Saved report ID
  reports: [],       // List of saved reports
  charts: {}         // Chart.js instances
};

var CMA_FUNC_URL = SUPABASE_URL + '/functions/v1/cma-engine';
var CMA_EXTRACT_URL = SUPABASE_URL + '/functions/v1/cma-extract-features';

async function cmaFetch(action, data) {
  var body = Object.assign({ action: action }, data || {});
  try {
    var resp = await fetch(CMA_FUNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify(body)
    });
    return await resp.json();
  } catch(e) { console.error('[CMA] fetch error:', e); return { error: e.message }; }
}

async function cmaExtractFetch(action, data) {
  var body = Object.assign({ action: action }, data || {});
  try {
    var resp = await fetch(CMA_EXTRACT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify(body)
    });
    return await resp.json();
  } catch(e) { console.error('[CMA] extract error:', e); return { error: e.message }; }
}

// ── CMA Dashboard ──
async function loadCMA() {
  _cmaState.step = 0;
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="crm-loading"><div class="crm-spinner"></div></div>';

  var result = await cmaFetch('list-reports');
  _cmaState.reports = (result && result.reports) || [];

  var html = '<div class="cma-dashboard">';
  html += '<div class="cma-header"><h2 class="fd">Comparative Market Analysis</h2>';
  html += '<button class="crm-btn crm-btn-primary" onclick="cmaNewReport()"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New CMA</button></div>';

  if (_cmaState.reports.length === 0) {
    html += '<div class="cma-empty"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>';
    html += '<p>No CMA reports yet</p><p class="cma-empty-sub">Create your first mountain-specific Comparative Market Analysis</p></div>';
  } else {
    html += '<div class="cma-reports-grid">';
    _cmaState.reports.forEach(function(r) {
      var statusClass = r.status === 'final' ? 'cma-status-final' : r.status === 'archived' ? 'cma-status-archived' : 'cma-status-draft';
      html += '<div class="cma-report-card" onclick="cmaOpenReport(\'' + r.id + '\')">';
      html += '<div class="cma-report-card-top">';
      html += '<span class="cma-report-status ' + statusClass + '">' + r.status + '</span>';
      html += '<span class="cma-report-date">' + (r.report_date || '') + '</span></div>';
      html += '<div class="cma-report-address">' + esc(r.subject_address || 'Untitled') + '</div>';
      html += '<div class="cma-report-city">' + esc((r.subject_city || '') + (r.subject_county ? ', ' + r.subject_county : '')) + '</div>';
      if (r.suggested_price || r.agent_recommended_price) {
        html += '<div class="cma-report-price">$' + ((r.agent_recommended_price || r.suggested_price) || 0).toLocaleString() + '</div>';
      }
      html += '<div class="cma-report-meta">' + (r.report_name || '') + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  main.innerHTML = html;
}

function cmaNewReport() {
  _cmaState = { step: 1, subject: null, comps: [], selectedComps: [], adjustments: [], valuation: null, aiAdvice: null, reportId: null, reports: _cmaState.reports, charts: {} };
  cmaRenderStep1();
}

async function cmaOpenReport(reportId) {
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="crm-loading"><div class="crm-spinner"></div></div>';
  var result = await cmaFetch('get-report', { report_id: reportId });
  if (result.error) { toast('Failed to load report', 'error'); loadCMA(); return; }
  _cmaState.reportId = reportId;
  _cmaState.subject = { listing: result.report.subject_data || {}, features: result.report.subject_features || {} };
  _cmaState.aiAdvice = { considerations: result.report.ai_considerations || [], summary: result.report.ai_summary || '', comp_reasoning: {} };
  _cmaState.valuation = { suggested_low: result.report.suggested_low, suggested_high: result.report.suggested_high, suggested_price: result.report.suggested_price };
  // Rebuild comps from adjustments
  _cmaState.selectedComps = (result.adjustments || []).map(function(adj) {
    return { listing: adj.comp_data || {}, features: adj.comp_features || {} };
  });
  _cmaState.adjustments = (result.adjustments || []).map(function(adj) {
    return {
      comp_listing_key: adj.comp_listing_key, comp_order: adj.comp_order, sale_price: adj.comp_data ? adj.comp_data.close_price || 0 : 0,
      adjustments: {
        adj_living_area: adj.adj_living_area, adj_lot_size: adj.adj_lot_size, adj_bedrooms: adj.adj_bedrooms, adj_bathrooms: adj.adj_bathrooms,
        adj_garage: adj.adj_garage, adj_year_built: adj.adj_year_built, adj_condition: adj.adj_condition, adj_view: adj.adj_view,
        adj_water_features: adj.adj_water_features, adj_land_character: adj.adj_land_character, adj_road_noise: adj.adj_road_noise,
        adj_privacy: adj.adj_privacy, adj_elevation: adj.adj_elevation, adj_time: adj.adj_time, adj_concessions: adj.adj_concessions
      },
      total_adjustment: adj.total_adjustment, adjusted_price: adj.adjusted_price,
      gross_adjustment_pct: adj.gross_adjustment_pct, net_adjustment_pct: adj.net_adjustment_pct,
      warnings: [], ai_suggested: adj.ai_suggested_adjustments || {}
    };
  });
  _cmaState.step = 4;
  cmaRenderStep4();
}

// ── Step 1: Select Subject Property ──
function cmaRenderStep1() {
  var main = document.getElementById('crmMain');
  var html = '<div class="cma-wizard">';
  html += cmaStepIndicator(1);
  html += '<div class="cma-step-content">';
  html += '<h3 class="cma-step-title">Select Subject Property</h3>';
  html += '<p class="cma-step-desc">Search your MLS listings or enter property details manually</p>';
  html += '<div class="cma-search-wrap"><input class="crm-input cma-search-input" id="cmaSubjectSearch" placeholder="Search by address or MLS #..." autocomplete="off" />';
  html += '<div class="cma-search-results" id="cmaSubjectResults"></div></div>';
  html += '<div class="cma-manual-toggle"><button class="crm-btn crm-btn-secondary cma-manual-btn" onclick="cmaShowManualEntry()">Property not in MLS? Enter manually</button></div>';
  html += '<div class="cma-manual-form" id="cmaManualForm" style="display:none">';
  html += '<div class="cma-manual-grid">';
  html += '<div class="crm-form-group cma-manual-full"><label class="crm-form-label">Street Address *</label><input class="crm-input" id="cmaManAddr" placeholder="35 Coweeta Ridge Rd" /></div>';
  html += '<div class="crm-form-group"><label class="crm-form-label">City *</label><input class="crm-input" id="cmaManCity" placeholder="Franklin" /></div>';
  html += '<div class="crm-form-group"><label class="crm-form-label">County</label><input class="crm-input" id="cmaManCounty" placeholder="Macon" /></div>';
  html += '<div class="crm-form-group"><label class="crm-form-label">Property Type</label><select class="crm-select" id="cmaManType"><option value="Residential">Residential</option><option value="Land">Land</option><option value="Residential Income">Multi-Family</option><option value="Commercial">Commercial</option></select></div>';
  html += '<div class="crm-form-group"><label class="crm-form-label">Subtype</label><select class="crm-select" id="cmaManSubtype"><option value="Single Family Residence">Single Family</option><option value="Cabin">Cabin</option><option value="Manufactured Home">Manufactured</option><option value="Condo">Condo</option><option value="Townhouse">Townhouse</option><option value="">Other</option></select></div>';
  html += '<div class="crm-form-group"><label class="crm-form-label">Living Area (sqft)</label><input class="crm-input" id="cmaManSqft" type="number" placeholder="1800" /></div>';
  html += '<div class="crm-form-group"><label class="crm-form-label">Lot Size (acres)</label><input class="crm-input" id="cmaManLot" type="number" step="0.01" placeholder="1.5" /></div>';
  html += '<div class="crm-form-group"><label class="crm-form-label">Bedrooms</label><input class="crm-input" id="cmaManBeds" type="number" placeholder="3" /></div>';
  html += '<div class="crm-form-group"><label class="crm-form-label">Bathrooms</label><input class="crm-input" id="cmaManBaths" type="number" step="0.5" placeholder="2" /></div>';
  html += '<div class="crm-form-group"><label class="crm-form-label">Year Built</label><input class="crm-input" id="cmaManYear" type="number" placeholder="2005" /></div>';
  html += '<div class="crm-form-group"><label class="crm-form-label">Garage Spaces</label><input class="crm-input" id="cmaManGarage" type="number" placeholder="0" /></div>';
  html += '<div class="crm-form-group"><label class="crm-form-label">List/Ask Price</label><input class="crm-input" id="cmaManPrice" type="number" step="1000" placeholder="350000" /></div>';
  html += '</div>';
  html += '<div class="cma-step-actions"><button class="crm-btn crm-btn-secondary" onclick="cmaHideManualEntry()">Cancel</button><button class="crm-btn crm-btn-primary" onclick="cmaSubmitManual()">Use This Property</button></div>';
  html += '</div>';
  if (_cmaState.subject) {
    html += cmaSubjectCard(_cmaState.subject);
    html += '<div class="cma-step-actions"><button class="crm-btn crm-btn-primary" onclick="cmaGoStep2()">Continue to Comp Selection</button></div>';
  }
  html += '</div></div>';
  main.innerHTML = html;

  var searchInput = document.getElementById('cmaSubjectSearch');
  var debounce = null;
  searchInput.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(function() { cmaSearchSubject(searchInput.value.trim()); }, 300);
  });
  searchInput.focus();
}

function cmaShowManualEntry() {
  var form = document.getElementById('cmaManualForm');
  if (form) form.style.display = 'block';
  var toggle = document.querySelector('.cma-manual-toggle');
  if (toggle) toggle.style.display = 'none';
}

function cmaHideManualEntry() {
  var form = document.getElementById('cmaManualForm');
  if (form) form.style.display = 'none';
  var toggle = document.querySelector('.cma-manual-toggle');
  if (toggle) toggle.style.display = 'block';
}

function cmaSubmitManual() {
  var addr = (document.getElementById('cmaManAddr').value || '').trim();
  var city = (document.getElementById('cmaManCity').value || '').trim();
  if (!addr || !city) { toast('Address and city are required', 'error'); return; }
  var listing = {
    listing_key: 'manual_' + Date.now(),
    full_address: addr,
    city: city,
    county_or_parish: (document.getElementById('cmaManCounty').value || '').trim(),
    property_type: document.getElementById('cmaManType').value || 'Residential',
    property_sub_type: document.getElementById('cmaManSubtype').value || '',
    living_area: parseInt(document.getElementById('cmaManSqft').value) || null,
    lot_size_acres: parseFloat(document.getElementById('cmaManLot').value) || null,
    bedrooms_total: parseInt(document.getElementById('cmaManBeds').value) || null,
    bathrooms_total_integer: parseInt(document.getElementById('cmaManBaths').value) || null,
    year_built: parseInt(document.getElementById('cmaManYear').value) || null,
    garage_spaces: parseInt(document.getElementById('cmaManGarage').value) || 0,
    list_price: parseInt(document.getElementById('cmaManPrice').value) || null,
    standard_status: 'Off Market',
    latitude: null,
    longitude: null
  };
  _cmaState.subject = { listing: listing, features: {} };
  toast('Subject property set', 'success');
  cmaRenderStep1();
}

async function cmaSearchSubject(query) {
  var results = document.getElementById('cmaSubjectResults');
  if (!query || query.length < 2) { results.innerHTML = ''; return; }
  try {
    var resp = await _sb.from('mls_listings').select('listing_key, full_address, city, county_or_parish, property_type, living_area, lot_size_acres, bedrooms_total, bathrooms_total_integer, year_built, list_price, close_price, close_date, standard_status, latitude, longitude, garage_spaces, property_sub_type, stories, public_remarks').or('full_address.ilike.*' + query + '*,listing_id.ilike.*' + query + '*').order('modification_timestamp', { ascending: false }).limit(8);
    if (resp.error) { console.error('[CMA] Search error:', resp.error); results.innerHTML = '<div class="cma-search-empty">Search error: ' + esc(resp.error.message) + '</div>'; return; }
    var data = resp.data;
    if (!data || !data.length) { results.innerHTML = '<div class="cma-search-empty">No listings found</div>'; return; }
    var html = '';
    data.forEach(function(l) {
      var status = l.standard_status || '';
      html += '<div class="cma-search-item" onclick="cmaSelectSubject(\'' + l.listing_key + '\')">';
      html += '<div class="cma-search-item-main"><strong>' + esc(l.full_address || '') + '</strong>, ' + esc(l.city || '') + '</div>';
      html += '<div class="cma-search-item-meta">' + esc(l.property_type || '') + ' | ' + (l.living_area ? l.living_area + ' sqft' : '') + ' | ' + (l.bedrooms_total || '?') + 'bd/' + (l.bathrooms_total_integer || '?') + 'ba | <span class="cma-status-badge cma-status-' + status.toLowerCase() + '">' + status + '</span></div>';
      html += '</div>';
    });
    results.innerHTML = html;
  } catch(e) { results.innerHTML = '<div class="cma-search-empty">Search error</div>'; }
}

async function cmaSelectSubject(listingKey) {
  var main = document.getElementById('crmMain');
  toast('Loading subject property...', 'info');
  // Fetch full listing
  var { data: listing } = await _sb.from('mls_listings').select('*').eq('listing_key', listingKey).maybeSingle();
  if (!listing) { toast('Listing not found', 'error'); return; }
  // Fetch or extract feature tags
  var { data: tags } = await _sb.from('cma_feature_tags').select('*').eq('listing_key', listingKey).is('agent_id', null).maybeSingle();
  if (!tags) {
    toast('Extracting mountain features with AI...', 'info');
    var extractResult = await cmaExtractFetch('extract-single', { listing_key: listingKey });
    if (extractResult && extractResult.features) { tags = extractResult.features; }
  }
  _cmaState.subject = { listing: listing, features: tags || {} };
  cmaRenderStep1();
}

function cmaSubjectCard(subject) {
  var l = subject.listing;
  var f = subject.features;
  var html = '<div class="cma-subject-card">';
  html += '<div class="cma-subject-header"><h4>' + esc(l.full_address || '') + '</h4><span class="cma-subject-city">' + esc((l.city || '') + ', ' + (l.county_or_parish || '')) + '</span></div>';
  html += '<div class="cma-subject-details">';
  html += '<div class="cma-detail-row"><span>Type</span><span>' + esc(l.property_type || '') + '</span></div>';
  html += '<div class="cma-detail-row"><span>Sqft</span><span>' + (l.living_area ? l.living_area.toLocaleString() : '--') + '</span></div>';
  html += '<div class="cma-detail-row"><span>Lot</span><span>' + (l.lot_size_acres ? l.lot_size_acres + ' ac' : '--') + '</span></div>';
  html += '<div class="cma-detail-row"><span>Bed/Bath</span><span>' + (l.bedrooms_total || '?') + '/' + (l.bathrooms_total_integer || '?') + '</span></div>';
  html += '<div class="cma-detail-row"><span>Year Built</span><span>' + (l.year_built || '--') + '</span></div>';
  html += '<div class="cma-detail-row"><span>List Price</span><span>$' + (l.list_price ? l.list_price.toLocaleString() : '--') + '</span></div>';
  html += '</div>';
  if (f && f.view_quality) {
    html += '<div class="cma-subject-features"><div class="cma-features-title">Mountain Features</div>';
    html += '<div class="cma-feature-ratings">';
    html += cmaFeatureBar('View', f.view_quality);
    html += cmaFeatureBar('Water', f.water_quality);
    html += cmaFeatureBar('Land', f.land_usability);
    html += cmaFeatureBar('Quiet', f.road_noise);
    html += cmaFeatureBar('Privacy', f.privacy_rating);
    html += cmaFeatureBar('Condition', f.condition_rating);
    html += '</div>';
    if (f.elevation_ft) html += '<div class="cma-feature-elev">Elevation: ' + f.elevation_ft.toLocaleString() + ' ft</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function cmaFeatureBar(label, val) {
  if (!val) return '';
  var pct = (val / 5) * 100;
  var color = val >= 4 ? 'var(--crm-green)' : val >= 3 ? 'var(--crm-amber)' : 'var(--crm-red)';
  return '<div class="cma-feat-bar"><span class="cma-feat-label">' + label + '</span><div class="cma-feat-track"><div class="cma-feat-fill" style="width:' + pct + '%;background:' + color + '"></div></div><span class="cma-feat-val">' + val + '/5</span></div>';
}

// ── Step 2: Select Comparables ──
async function cmaGoStep2() {
  _cmaState.step = 2;
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="cma-wizard">' + cmaStepIndicator(2) + '<div class="cma-step-content"><div class="crm-loading"><div class="crm-spinner"></div><p>Finding comparable sales...</p></div></div></div>';

  var isManual = (_cmaState.subject.listing.listing_key || '').startsWith('manual_');
  var result;
  if (isManual) {
    // Manual entry: search by county/city/type since we have no listing_key in DB
    result = await cmaFetch('find-comps', {
      listing_key: null,
      manual_subject: _cmaState.subject.listing,
      filters: {
        county: _cmaState.subject.listing.county_or_parish || null,
        property_type: _cmaState.subject.listing.property_type || null,
        max_distance_miles: 15
      }
    });
  } else {
    result = await cmaFetch('find-comps', { listing_key: _cmaState.subject.listing.listing_key });
  }
  if (result.error) { toast('Error finding comps: ' + result.error, 'error'); return; }

  _cmaState.comps = (result.comps || []).map(function(c) {
    c.selected = true; // Pre-select top comps
    return c;
  });
  // Only select top 6 by default
  _cmaState.comps.forEach(function(c, i) { c.selected = i < 6; });
  cmaRenderStep2();
}

function cmaRenderStep2() {
  var main = document.getElementById('crmMain');
  var html = '<div class="cma-wizard">';
  html += cmaStepIndicator(2);
  html += '<div class="cma-step-content">';
  html += '<h3 class="cma-step-title">Select Comparables</h3>';
  html += '<p class="cma-step-desc">AI-ranked by similarity. Select up to 6 comps for your analysis.</p>';

  var selectedCount = _cmaState.comps.filter(function(c) { return c.selected; }).length;
  html += '<div class="cma-comp-count">' + selectedCount + ' of ' + _cmaState.comps.length + ' comps selected (max 6)</div>';

  html += '<div class="cma-comps-list">';
  _cmaState.comps.forEach(function(c, i) {
    var l = c.listing;
    var f = c.features;
    var score = c.similarity ? Math.round(c.similarity.total * 100) : 0;
    var scoreColor = score >= 70 ? 'var(--crm-green)' : score >= 50 ? 'var(--crm-amber)' : 'var(--crm-red)';
    html += '<div class="cma-comp-card' + (c.selected ? ' selected' : '') + '" onclick="cmaToggleComp(' + i + ')">';
    html += '<div class="cma-comp-check">' + (c.selected ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>' : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>') + '</div>';
    html += '<div class="cma-comp-info">';
    html += '<div class="cma-comp-addr">' + esc(l.full_address || '') + ', ' + esc(l.city || '') + '</div>';
    html += '<div class="cma-comp-meta">';
    html += '$' + (l.close_price ? l.close_price.toLocaleString() : '--') + ' | ' + (l.close_date || '--') + ' | ';
    html += (l.living_area ? l.living_area.toLocaleString() + ' sqft' : '--') + ' | ' + (l.lot_size_acres || '--') + ' ac | ';
    html += (l.bedrooms_total || '?') + 'bd/' + (l.bathrooms_total_integer || '?') + 'ba';
    if (c.distance != null) html += ' | ' + c.distance + ' mi';
    html += '</div>';
    if (f) {
      html += '<div class="cma-comp-features-mini">';
      if (f.view_quality) html += '<span class="cma-feat-chip">View ' + f.view_quality + '/5</span>';
      if (f.water_quality) html += '<span class="cma-feat-chip">Water ' + f.water_quality + '/5</span>';
      if (f.land_usability) html += '<span class="cma-feat-chip">Land ' + f.land_usability + '/5</span>';
      if (f.road_noise) html += '<span class="cma-feat-chip">Quiet ' + f.road_noise + '/5</span>';
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="cma-comp-score" style="color:' + scoreColor + '">' + score + '%<span class="cma-score-label">match</span></div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div class="cma-step-actions">';
  html += '<button class="crm-btn crm-btn-secondary" onclick="cmaRenderStep1()">Back</button>';
  html += '<button class="crm-btn crm-btn-primary" onclick="cmaGoStep3()"' + (selectedCount === 0 ? ' disabled' : '') + '>Calculate Adjustments (' + selectedCount + ' comps)</button>';
  html += '</div>';
  html += '</div></div>';
  main.innerHTML = html;
}

function cmaToggleComp(index) {
  var c = _cmaState.comps[index];
  var selectedCount = _cmaState.comps.filter(function(x) { return x.selected; }).length;
  if (!c.selected && selectedCount >= 6) { toast('Maximum 6 comps allowed', 'error'); return; }
  c.selected = !c.selected;
  cmaRenderStep2();
}

// ── Step 3: Adjustment Grid ──
async function cmaGoStep3() {
  _cmaState.step = 3;
  _cmaState.selectedComps = _cmaState.comps.filter(function(c) { return c.selected; });
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="cma-wizard">' + cmaStepIndicator(3) + '<div class="cma-step-content"><div class="crm-loading"><div class="crm-spinner"></div><p>Calculating adjustments...</p></div></div></div>';

  // Calculate adjustments via engine
  var calcResult = await cmaFetch('calculate-adjustments', {
    subject: _cmaState.subject,
    comps: _cmaState.selectedComps.map(function(c) { return { listing: c.listing, features: c.features }; })
  });

  if (calcResult.error) { toast('Adjustment calculation error: ' + calcResult.error, 'error'); return; }
  _cmaState.adjustments = calcResult.adjustments || [];
  _cmaState.valuation = calcResult.valuation || {};
  cmaRenderStep3();
}

function cmaRenderStep3() {
  var main = document.getElementById('crmMain');
  var s = _cmaState.subject.listing;
  var sf = _cmaState.subject.features || {};
  var adjs = _cmaState.adjustments;
  var comps = _cmaState.selectedComps;

  var html = '<div class="cma-wizard">';
  html += cmaStepIndicator(3);
  html += '<div class="cma-step-content">';
  html += '<h3 class="cma-step-title">Adjustment Grid</h3>';
  html += '<p class="cma-step-desc">Review and adjust values using sliders. AI-calculated defaults shown.</p>';

  // Adjustment grid table
  html += '<div class="cma-grid-scroll"><table class="cma-grid">';

  // Header row
  html += '<thead><tr><th class="cma-grid-label">Feature</th><th class="cma-grid-subject">Subject</th>';
  comps.forEach(function(c, i) {
    html += '<th class="cma-grid-comp">Comp ' + (i+1) + '<br><span class="cma-grid-comp-addr">' + esc((c.listing.full_address || '').split(' ').slice(0,3).join(' ')) + '</span></th>';
  });
  html += '</tr></thead><tbody>';

  // Sale Price row
  html += '<tr class="cma-grid-row-price"><td>Sale Price</td><td>' + (s.list_price ? '$' + s.list_price.toLocaleString() : '--') + '</td>';
  adjs.forEach(function(a) { html += '<td>$' + a.sale_price.toLocaleString() + '</td>'; });
  html += '</tr>';

  // Standard adjustment rows
  var stdRows = [
    { key: 'adj_living_area', label: 'Living Area', subVal: s.living_area ? s.living_area.toLocaleString() + ' sqft' : '--', compKey: 'living_area', unit: ' sqft' },
    { key: 'adj_lot_size', label: 'Lot Size', subVal: s.lot_size_acres ? s.lot_size_acres + ' ac' : '--', compKey: 'lot_size_acres', unit: ' ac' },
    { key: 'adj_bedrooms', label: 'Bedrooms', subVal: s.bedrooms_total || '--', compKey: 'bedrooms_total', unit: '' },
    { key: 'adj_bathrooms', label: 'Bathrooms', subVal: s.bathrooms_total_integer || '--', compKey: 'bathrooms_total_integer', unit: '' },
    { key: 'adj_garage', label: 'Garage', subVal: s.garage_spaces || '0', compKey: 'garage_spaces', unit: '' },
    { key: 'adj_year_built', label: 'Year Built', subVal: s.year_built || '--', compKey: 'year_built', unit: '' },
  ];

  html += '<tr class="cma-grid-section"><td colspan="' + (comps.length + 2) + '">Standard Adjustments</td></tr>';
  stdRows.forEach(function(row) {
    html += '<tr><td>' + row.label + '</td><td class="cma-grid-subject-val">' + row.subVal + '</td>';
    adjs.forEach(function(a, ci) {
      var compVal = comps[ci].listing[row.compKey];
      var adjVal = a.adjustments[row.key] || 0;
      html += '<td class="cma-grid-adj-cell">';
      html += '<div class="cma-grid-comp-val">' + (compVal != null ? compVal + row.unit : '--') + '</div>';
      html += cmaAdjInput(ci, row.key, adjVal);
      html += '</td>';
    });
    html += '</tr>';
  });

  // Mountain adjustment rows
  var mtnRows = [
    { key: 'adj_view', label: 'View Quality', subVal: sf.view_quality ? sf.view_quality + '/5' : '--', compFeatKey: 'view_quality' },
    { key: 'adj_water_features', label: 'Water Features', subVal: sf.water_quality ? sf.water_quality + '/5' : '--', compFeatKey: 'water_quality' },
    { key: 'adj_land_character', label: 'Land Character', subVal: sf.land_usability ? sf.land_usability + '/5' : '--', compFeatKey: 'land_usability' },
    { key: 'adj_road_noise', label: 'Road Noise', subVal: sf.road_noise ? sf.road_noise + '/5' : '--', compFeatKey: 'road_noise' },
    { key: 'adj_privacy', label: 'Privacy', subVal: sf.privacy_rating ? sf.privacy_rating + '/5' : '--', compFeatKey: 'privacy_rating' },
    { key: 'adj_condition', label: 'Condition', subVal: sf.condition_rating ? sf.condition_rating + '/5' : '--', compFeatKey: 'condition_rating' },
    { key: 'adj_elevation', label: 'Elevation', subVal: sf.elevation_ft ? sf.elevation_ft + ' ft' : '--', compFeatKey: 'elevation_ft' },
  ];

  html += '<tr class="cma-grid-section"><td colspan="' + (comps.length + 2) + '">Mountain Adjustments</td></tr>';
  mtnRows.forEach(function(row) {
    html += '<tr><td>' + row.label + '</td><td class="cma-grid-subject-val">' + row.subVal + '</td>';
    adjs.forEach(function(a, ci) {
      var cf = comps[ci].features || {};
      var compVal = cf[row.compFeatKey];
      var adjVal = a.adjustments[row.key] || 0;
      var displayVal = row.compFeatKey === 'elevation_ft' ? (compVal ? compVal + ' ft' : '--') : (compVal ? compVal + '/5' : '--');
      html += '<td class="cma-grid-adj-cell">';
      html += '<div class="cma-grid-comp-val">' + displayVal + '</div>';
      html += cmaSlider(ci, row.key, adjVal, row.compFeatKey, sf, cf);
      html += '</td>';
    });
    html += '</tr>';
  });

  // Market adjustments
  html += '<tr class="cma-grid-section"><td colspan="' + (comps.length + 2) + '">Market Adjustments</td></tr>';
  html += '<tr><td>Time (Appreciation)</td><td>--</td>';
  adjs.forEach(function(a, ci) {
    html += '<td class="cma-grid-adj-cell"><div class="cma-grid-comp-val">' + (comps[ci].listing.close_date || '--') + '</div>' + cmaAdjInput(ci, 'adj_time', a.adjustments.adj_time || 0) + '</td>';
  });
  html += '</tr>';
  html += '<tr><td>Concessions</td><td>--</td>';
  adjs.forEach(function(a, ci) {
    html += '<td class="cma-grid-adj-cell">' + cmaAdjInput(ci, 'adj_concessions', a.adjustments.adj_concessions || 0) + '</td>';
  });
  html += '</tr>';

  // Totals
  html += '<tr class="cma-grid-total"><td>Total Adjustment</td><td></td>';
  adjs.forEach(function(a) {
    var cls = a.total_adjustment >= 0 ? 'cma-adj-pos' : 'cma-adj-neg';
    html += '<td class="' + cls + '">$' + a.total_adjustment.toLocaleString() + '</td>';
  });
  html += '</tr>';

  html += '<tr class="cma-grid-total cma-grid-adjusted"><td>Adjusted Price</td><td></td>';
  adjs.forEach(function(a) {
    html += '<td>$' + a.adjusted_price.toLocaleString() + '</td>';
  });
  html += '</tr>';

  html += '<tr class="cma-grid-pct"><td>Gross Adj %</td><td></td>';
  adjs.forEach(function(a) {
    var cls = a.gross_adjustment_pct > 25 ? 'cma-warn' : '';
    html += '<td class="' + cls + '">' + a.gross_adjustment_pct + '%</td>';
  });
  html += '</tr>';

  html += '<tr class="cma-grid-pct"><td>Net Adj %</td><td></td>';
  adjs.forEach(function(a) {
    var cls = a.net_adjustment_pct > 15 ? 'cma-warn' : '';
    html += '<td class="' + cls + '">' + a.net_adjustment_pct + '%</td>';
  });
  html += '</tr>';

  html += '</tbody></table></div>';

  // Warnings
  var allWarnings = [];
  adjs.forEach(function(a, i) {
    a.warnings.forEach(function(w) { allWarnings.push({ comp: i + 1, msg: w }); });
  });
  if (allWarnings.length) {
    html += '<div class="cma-warnings">';
    allWarnings.forEach(function(w) {
      html += '<div class="cma-warning-item"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Comp ' + w.comp + ': ' + w.msg + '</div>';
    });
    html += '</div>';
  }

  // Valuation summary
  if (_cmaState.valuation && _cmaState.valuation.suggested_price) {
    var v = _cmaState.valuation;
    html += '<div class="cma-valuation-preview">';
    html += '<div class="cma-val-label">Suggested Range</div>';
    html += '<div class="cma-val-range">$' + (v.suggested_low || 0).toLocaleString() + ' - $' + (v.suggested_high || 0).toLocaleString() + '</div>';
    html += '<div class="cma-val-center">Center: $' + v.suggested_price.toLocaleString() + '</div>';
    html += '</div>';
  }

  // Actions
  html += '<div class="cma-step-actions">';
  html += '<button class="crm-btn crm-btn-secondary" onclick="cmaRenderStep2()">Back</button>';
  html += '<button class="crm-btn crm-btn-secondary" onclick="cmaRecalculate()">Recalculate</button>';
  html += '<button class="crm-btn crm-btn-primary" onclick="cmaGoStep4()">Get AI Advice & Review</button>';
  html += '</div>';
  html += '</div></div>';
  main.innerHTML = html;
}

function cmaAdjInput(compIdx, key, value) {
  var cls = value > 0 ? 'cma-adj-pos' : value < 0 ? 'cma-adj-neg' : '';
  return '<div class="cma-adj-input-wrap"><input type="number" class="cma-adj-input ' + cls + '" value="' + value + '" onchange="cmaUpdateAdj(' + compIdx + ',\'' + key + '\',this.value)" step="500" /></div>';
}

function cmaSlider(compIdx, adjKey, adjVal, featKey, subjectFeats, compFeats) {
  var sf = subjectFeats[featKey] || 0;
  var cf = compFeats[featKey] || 0;
  var diff = sf - cf;
  // Map diff to slider position: -2=much worse, -1=worse, 0=same, 1=better, 2=much better
  var sliderVal = Math.max(-2, Math.min(2, diff));
  var labels = ['MW', 'W', 'S', 'B', 'MB'];
  var cls = adjVal > 0 ? 'cma-adj-pos' : adjVal < 0 ? 'cma-adj-neg' : '';

  var html = '<div class="cma-slider-wrap">';
  html += '<input type="range" class="cma-slider" min="-2" max="2" step="1" value="' + sliderVal + '" oninput="cmaSliderChange(' + compIdx + ',\'' + adjKey + '\',this.value)" />';
  html += '<div class="cma-slider-labels">';
  for (var i = 0; i < labels.length; i++) {
    html += '<span class="cma-slider-tick' + (i - 2 === sliderVal ? ' active' : '') + '">' + labels[i] + '</span>';
  }
  html += '</div>';
  html += '<input type="number" class="cma-adj-input ' + cls + '" value="' + adjVal + '" onchange="cmaUpdateAdj(' + compIdx + ',\'' + adjKey + '\',this.value)" step="1000" />';
  html += '</div>';
  return html;
}

function cmaUpdateAdj(compIdx, key, value) {
  var adj = _cmaState.adjustments[compIdx];
  if (!adj) return;
  adj.adjustments[key] = parseInt(value) || 0;
  cmaRecalcTotals(compIdx);
}

function cmaSliderChange(compIdx, adjKey, sliderVal) {
  // Map slider position to dollar adjustment based on the key
  var multipliers = {
    adj_view: 15000, adj_water_features: 12000, adj_land_character: 8000,
    adj_road_noise: 7000, adj_privacy: 6000, adj_condition: 20000, adj_elevation: 2000
  };
  var mult = multipliers[adjKey] || 10000;
  var newVal = parseInt(sliderVal) * mult;
  var adj = _cmaState.adjustments[compIdx];
  if (!adj) return;
  adj.adjustments[adjKey] = newVal;
  cmaRecalcTotals(compIdx);
  // Update the adjacent input
  var inputs = document.querySelectorAll('.cma-adj-input');
  // Re-render to keep everything synced
  cmaRenderStep3();
}

function cmaRecalcTotals(compIdx) {
  var adj = _cmaState.adjustments[compIdx];
  var total = 0;
  var gross = 0;
  for (var key in adj.adjustments) {
    var v = adj.adjustments[key] || 0;
    total += v;
    gross += Math.abs(v);
  }
  adj.total_adjustment = total;
  adj.adjusted_price = adj.sale_price + total;
  adj.gross_adjustment_pct = adj.sale_price > 0 ? Math.round((gross / adj.sale_price) * 1000) / 10 : 0;
  adj.net_adjustment_pct = adj.sale_price > 0 ? Math.round((Math.abs(total) / adj.sale_price) * 1000) / 10 : 0;
  adj.warnings = [];
  if (adj.gross_adjustment_pct > 25) adj.warnings.push('Gross adjustments (' + adj.gross_adjustment_pct + '%) exceed 25%.');
  if (adj.net_adjustment_pct > 15) adj.warnings.push('Net adjustments (' + adj.net_adjustment_pct + '%) exceed 15%.');
  // Recalc valuation
  var prices = _cmaState.adjustments.map(function(a) { return a.adjusted_price; }).filter(function(p) { return p > 0; });
  prices.sort(function(a,b) { return a-b; });
  var trimmed = prices.length >= 4 ? prices.slice(1, -1) : prices;
  if (trimmed.length) {
    _cmaState.valuation = {
      suggested_low: trimmed[0],
      suggested_high: trimmed[trimmed.length - 1],
      suggested_price: Math.round(trimmed.reduce(function(s,v){return s+v;},0) / trimmed.length)
    };
  }
}

function cmaRecalculate() {
  // Recalc all totals
  for (var i = 0; i < _cmaState.adjustments.length; i++) {
    cmaRecalcTotals(i);
  }
  cmaRenderStep3();
  toast('Adjustments recalculated', 'success');
}

// ── Step 4: Review & Export ──
async function cmaGoStep4() {
  _cmaState.step = 4;
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="cma-wizard">' + cmaStepIndicator(4) + '<div class="cma-step-content"><div class="crm-loading"><div class="crm-spinner"></div><p>Getting AI analysis...</p></div></div></div>';

  // Get AI advice
  var adviceResult = await cmaFetch('ai-advise', {
    subject: _cmaState.subject,
    comps: _cmaState.selectedComps.map(function(c, i) {
      return { listing: c.listing, features: c.features, adjustments: _cmaState.adjustments[i] };
    })
  });

  _cmaState.aiAdvice = adviceResult.error ? { considerations: [], summary: 'AI analysis unavailable.', comp_reasoning: {} } : adviceResult;
  cmaRenderStep4();
}

function cmaRenderStep4() {
  var main = document.getElementById('crmMain');
  var s = _cmaState.subject.listing;
  var v = _cmaState.valuation || {};
  var ai = _cmaState.aiAdvice || {};

  var html = '<div class="cma-wizard">';
  html += cmaStepIndicator(4);
  html += '<div class="cma-step-content">';
  html += '<h3 class="cma-step-title">Review & Export</h3>';

  // Valuation Summary
  html += '<div class="cma-review-valuation">';
  html += '<div class="cma-val-subject">' + esc(s.full_address || '') + ', ' + esc(s.city || '') + '</div>';
  if (v.suggested_price) {
    html += '<div class="cma-val-big">$' + v.suggested_price.toLocaleString() + '</div>';
    html += '<div class="cma-val-range-label">Range: $' + (v.suggested_low || 0).toLocaleString() + ' - $' + (v.suggested_high || 0).toLocaleString() + '</div>';
  }
  html += '<div class="cma-rec-price-wrap">';
  html += '<label class="cma-rec-label">Your Recommended Price</label>';
  html += '<input type="number" class="crm-input cma-rec-input" id="cmaRecPrice" value="' + (v.suggested_price || '') + '" step="1000" placeholder="Enter your recommended list price" />';
  html += '</div>';
  html += '<div class="cma-rec-notes-wrap">';
  html += '<label class="cma-rec-label">Agent Notes</label>';
  html += '<textarea class="crm-textarea cma-rec-notes" id="cmaAgentNotes" rows="3" placeholder="Your notes for this CMA..."></textarea>';
  html += '</div>';
  html += '</div>';

  // Chart containers
  html += '<div class="cma-charts-row">';
  html += '<div class="cma-chart-wrap"><canvas id="cmaCompChart"></canvas></div>';
  html += '<div class="cma-chart-wrap"><canvas id="cmaRangeChart"></canvas></div>';
  html += '</div>';

  // AI Considerations
  if (ai.considerations && ai.considerations.length) {
    html += '<div class="cma-ai-section"><h4 class="cma-ai-title">AI Considerations</h4>';
    html += '<div class="cma-considerations">';
    ai.considerations.forEach(function(c) {
      var sevClass = c.severity === 'critical' ? 'cma-sev-critical' : c.severity === 'warning' ? 'cma-sev-warning' : 'cma-sev-info';
      html += '<div class="cma-consideration-card ' + sevClass + '">';
      html += '<div class="cma-consider-header"><span class="cma-consider-cat">' + esc(c.category || '') + '</span><span class="cma-consider-sev">' + esc(c.severity || '') + '</span></div>';
      html += '<div class="cma-consider-msg">' + esc(c.message || '') + '</div>';
      if (c.suggested_action) html += '<div class="cma-consider-action">' + esc(c.suggested_action) + '</div>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  // AI Summary
  if (ai.summary) {
    html += '<div class="cma-ai-section"><h4 class="cma-ai-title">AI Summary</h4>';
    html += '<div class="cma-ai-summary">' + esc(ai.summary) + '</div></div>';
  }

  // Per-comp AI Reasoning (admin only, NOT for PDF)
  if (ai.comp_reasoning && Object.keys(ai.comp_reasoning).length) {
    html += '<div class="cma-ai-section cma-admin-only"><h4 class="cma-ai-title">AI Comp Analysis <span class="cma-admin-badge">Admin Only</span></h4>';
    html += '<div class="cma-comp-reasoning">';
    _cmaState.selectedComps.forEach(function(c, i) {
      var key = c.listing.listing_key;
      var reasoning = ai.comp_reasoning[key] || '';
      if (!reasoning) return;
      html += '<div class="cma-reasoning-card">';
      html += '<div class="cma-reasoning-header">Comp ' + (i+1) + ': ' + esc((c.listing.full_address || '').split(',')[0]) + '</div>';
      html += '<div class="cma-reasoning-text">' + esc(reasoning) + '</div>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  // Actions
  html += '<div class="cma-step-actions">';
  html += '<button class="crm-btn crm-btn-secondary" onclick="cmaRenderStep3()">Back to Adjustments</button>';
  html += '<button class="crm-btn crm-btn-secondary" onclick="cmaSaveReport(\'draft\')">Save Draft</button>';
  html += '<button class="crm-btn crm-btn-primary" onclick="cmaSaveReport(\'final\')">Finalize & Export PDF</button>';
  html += '</div>';
  html += '</div></div>';
  main.innerHTML = html;

  // Render charts after DOM is ready
  setTimeout(cmaRenderCharts, 100);
}

function cmaRenderCharts() {
  // Destroy existing charts
  for (var k in _cmaState.charts) { if (_cmaState.charts[k]) _cmaState.charts[k].destroy(); }
  _cmaState.charts = {};

  if (typeof Chart === 'undefined') return;

  var adjs = _cmaState.adjustments;
  var comps = _cmaState.selectedComps;
  if (!adjs.length) return;

  // Comp price comparison chart (before/after)
  var compCtx = document.getElementById('cmaCompChart');
  if (compCtx) {
    var labels = comps.map(function(c, i) { return 'Comp ' + (i+1); });
    _cmaState.charts.comp = new Chart(compCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Sale Price', data: adjs.map(function(a) { return a.sale_price; }), backgroundColor: 'rgba(92,107,192,0.5)', borderColor: 'rgba(92,107,192,1)', borderWidth: 1 },
          { label: 'Adjusted Price', data: adjs.map(function(a) { return a.adjusted_price; }), backgroundColor: 'rgba(67,160,71,0.5)', borderColor: 'rgba(67,160,71,1)', borderWidth: 1 }
        ]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Sale vs Adjusted Price' }, legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: false, ticks: { callback: function(v) { return '$' + v.toLocaleString(); } } } }
      }
    });
  }

  // Price range indicator
  var rangeCtx = document.getElementById('cmaRangeChart');
  if (rangeCtx && _cmaState.valuation) {
    var v = _cmaState.valuation;
    var allPrices = adjs.map(function(a) { return a.adjusted_price; }).filter(function(p) { return p > 0; });
    _cmaState.charts.range = new Chart(rangeCtx, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Adjusted Prices', data: allPrices.map(function(p, i) { return {x: i+1, y: p}; }), backgroundColor: 'rgba(92,107,192,0.7)', pointRadius: 8 },
          { label: 'Suggested', data: [{x: (allPrices.length+1)/2, y: v.suggested_price}], backgroundColor: 'rgba(67,160,71,0.9)', pointRadius: 12, pointStyle: 'triangle' }
        ]
      },
      options: {
        responsive: true,
        plugins: { title: { display: true, text: 'Price Distribution' }, legend: { position: 'bottom' } },
        scales: {
          y: { ticks: { callback: function(v) { return '$' + v.toLocaleString(); } } },
          x: { display: false }
        }
      }
    });
  }
}

async function cmaSaveReport(status) {
  var s = _cmaState.subject.listing;
  var recPrice = parseInt(document.getElementById('cmaRecPrice')?.value) || null;
  var agentNotes = document.getElementById('cmaAgentNotes')?.value || '';

  var report = {
    id: _cmaState.reportId || undefined,
    subject_listing_key: s.listing_key,
    subject_address: s.full_address || '',
    subject_city: s.city || '',
    subject_county: s.county_or_parish || '',
    subject_data: s,
    subject_features: _cmaState.subject.features || {},
    report_name: 'CMA - ' + (s.full_address || '').split(',')[0],
    status: status,
    suggested_low: _cmaState.valuation ? _cmaState.valuation.suggested_low : null,
    suggested_high: _cmaState.valuation ? _cmaState.valuation.suggested_high : null,
    suggested_price: _cmaState.valuation ? _cmaState.valuation.suggested_price : null,
    agent_recommended_price: recPrice,
    agent_notes: agentNotes,
    ai_summary: _cmaState.aiAdvice ? _cmaState.aiAdvice.summary : '',
    ai_considerations: _cmaState.aiAdvice ? _cmaState.aiAdvice.considerations : [],
    adjustments: _cmaState.adjustments.map(function(a, i) {
      var comp = _cmaState.selectedComps[i];
      return {
        comp_listing_key: a.comp_listing_key,
        comp_order: i,
        comp_data: comp ? comp.listing : {},
        comp_features: comp ? comp.features : {},
        adj_living_area: a.adjustments.adj_living_area || 0,
        adj_lot_size: a.adjustments.adj_lot_size || 0,
        adj_bedrooms: a.adjustments.adj_bedrooms || 0,
        adj_bathrooms: a.adjustments.adj_bathrooms || 0,
        adj_garage: a.adjustments.adj_garage || 0,
        adj_year_built: a.adjustments.adj_year_built || 0,
        adj_condition: a.adjustments.adj_condition || 0,
        adj_view: a.adjustments.adj_view || 0,
        adj_water_features: a.adjustments.adj_water_features || 0,
        adj_land_character: a.adjustments.adj_land_character || 0,
        adj_road_noise: a.adjustments.adj_road_noise || 0,
        adj_privacy: a.adjustments.adj_privacy || 0,
        adj_elevation: a.adjustments.adj_elevation || 0,
        adj_time: a.adjustments.adj_time || 0,
        adj_concessions: a.adjustments.adj_concessions || 0,
        total_adjustment: a.total_adjustment,
        adjusted_price: a.adjusted_price,
        gross_adjustment_pct: a.gross_adjustment_pct,
        net_adjustment_pct: a.net_adjustment_pct,
        slider_states: {},
        ai_suggested_adjustments: a.ai_suggested || {},
        ai_reasoning: _cmaState.aiAdvice && _cmaState.aiAdvice.comp_reasoning ? _cmaState.aiAdvice.comp_reasoning[a.comp_listing_key] || {} : {}
      };
    })
  };

  toast('Saving report...', 'info');
  var result = await cmaFetch('save-report', { report: report });
  if (result.error) { toast('Save failed: ' + result.error, 'error'); return; }

  _cmaState.reportId = result.report.id;
  toast('Report saved!', 'success');

  if (status === 'final') {
    cmaGeneratePDF();
  }
}

// ── Step Indicator ──
function cmaStepIndicator(current) {
  var steps = [
    { num: 1, label: 'Subject' },
    { num: 2, label: 'Comps' },
    { num: 3, label: 'Adjust' },
    { num: 4, label: 'Review' }
  ];
  var html = '<div class="cma-steps">';
  steps.forEach(function(s) {
    var cls = s.num === current ? 'cma-step active' : s.num < current ? 'cma-step done' : 'cma-step';
    html += '<div class="' + cls + '"><div class="cma-step-num">' + s.num + '</div><div class="cma-step-label">' + s.label + '</div></div>';
    if (s.num < steps.length) html += '<div class="cma-step-line' + (s.num < current ? ' done' : '') + '"></div>';
  });
  html += '</div>';
  return html;
}

// ══════════════════════════════════════
// CMA PDF Generation (jsPDF + AutoTable)
// ══════════════════════════════════════

function cmaGeneratePDF() {
  if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined') {
    toast('PDF library not loaded. Please refresh the page.', 'error');
    return;
  }

  toast('Generating PDF...', 'info');
  setTimeout(function() { _cmaGeneratePDFImpl(); }, 100);
}

function _cmaGeneratePDFImpl() {
  var jsPDF = (window.jspdf && window.jspdf.jsPDF) || jspdf.jsPDF;
  var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  var s = _cmaState.subject.listing;
  var sf = _cmaState.subject.features || {};
  var v = _cmaState.valuation || {};
  var adjs = _cmaState.adjustments;
  var comps = _cmaState.selectedComps;
  var ai = _cmaState.aiAdvice || {};

  var pageW = 215.9;
  var pageH = 279.4;
  var margin = 15;
  var contentW = pageW - margin * 2;
  var y = margin;

  // Colors
  var gold = [196, 176, 140];
  var dark = [12, 11, 9];
  var cream = [245, 240, 232];

  // Helper
  function addPage() { doc.addPage(); y = margin; }
  function checkPage(needed) { if (y + needed > pageH - margin) addPage(); }

  // ── Page 1: Cover ──
  doc.setFillColor(dark[0], dark[1], dark[2]);
  doc.rect(0, 0, pageW, pageH, 'F');

  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('Comparative Market Analysis', pageW / 2, 60, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(cream[0], cream[1], cream[2]);
  doc.text(s.full_address || 'Subject Property', pageW / 2, 80, { align: 'center' });
  doc.text((s.city || '') + ', NC ' + (s.county_or_parish || ''), pageW / 2, 90, { align: 'center' });

  if (v.suggested_price) {
    doc.setFontSize(32);
    doc.setTextColor(gold[0], gold[1], gold[2]);
    doc.text('$' + v.suggested_price.toLocaleString(), pageW / 2, 120, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(cream[0], cream[1], cream[2]);
    doc.text('Suggested List Price', pageW / 2, 130, { align: 'center' });
    if (v.suggested_low && v.suggested_high) {
      doc.text('Range: $' + v.suggested_low.toLocaleString() + ' - $' + v.suggested_high.toLocaleString(), pageW / 2, 140, { align: 'center' });
    }
  }

  var recPrice = parseInt(document.getElementById('cmaRecPrice')?.value) || null;
  if (recPrice) {
    doc.setFontSize(18);
    doc.setTextColor(gold[0], gold[1], gold[2]);
    doc.text('Agent Recommended: $' + recPrice.toLocaleString(), pageW / 2, 160, { align: 'center' });
  }

  doc.setFontSize(10);
  doc.setTextColor(cream[0], cream[1], cream[2]);
  doc.text('Prepared by Cory Coleman', pageW / 2, 220, { align: 'center' });
  doc.text('Keller Williams Great Smokies', pageW / 2, 227, { align: 'center' });
  doc.text('(828) 506-6413 | coryhelpsyoumove@gmail.com', pageW / 2, 234, { align: 'center' });
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pageW / 2, 244, { align: 'center' });

  // ── Page 2: Subject Property Details ──
  addPage();
  doc.setTextColor(dark[0], dark[1], dark[2]);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Subject Property', margin, y + 5);
  y += 15;

  var subjectDetails = [
    ['Address', s.full_address || ''],
    ['City / County', (s.city || '') + ', ' + (s.county_or_parish || '')],
    ['Property Type', (s.property_type || '') + (s.property_sub_type ? ' / ' + s.property_sub_type : '')],
    ['Living Area', s.living_area ? s.living_area.toLocaleString() + ' sqft' : '--'],
    ['Lot Size', s.lot_size_acres ? s.lot_size_acres + ' acres' : '--'],
    ['Bedrooms / Bathrooms', (s.bedrooms_total || '?') + ' / ' + (s.bathrooms_total_integer || '?')],
    ['Year Built', s.year_built ? String(s.year_built) : '--'],
    ['Garage', s.garage_spaces ? String(s.garage_spaces) + ' spaces' : 'None'],
    ['List Price', s.list_price ? '$' + s.list_price.toLocaleString() : '--'],
  ];

  doc.autoTable({
    startY: y,
    head: [],
    body: subjectDetails,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    margin: { left: margin, right: margin }
  });

  y = doc.lastAutoTable.finalY + 10;

  // Mountain features
  if (sf.view_quality) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Mountain Features', margin, y);
    y += 8;

    var mtnFeatures = [
      ['View Quality', (sf.view_quality || '--') + '/5'],
      ['Water Features', (sf.water_quality || '--') + '/5'],
      ['Land Usability', (sf.land_usability || '--') + '/5'],
      ['Road Noise (Quiet)', (sf.road_noise || '--') + '/5'],
      ['Privacy', (sf.privacy_rating || '--') + '/5'],
      ['Condition', (sf.condition_rating || '--') + '/5'],
      ['Elevation', sf.elevation_ft ? sf.elevation_ft.toLocaleString() + ' ft' : '--'],
    ];

    doc.autoTable({
      startY: y,
      head: [],
      body: mtnFeatures,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
      margin: { left: margin, right: margin }
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ── Page 3: Comparable Sales Summary ──
  addPage();
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Comparable Sales', margin, y + 5);
  y += 15;

  var compHeaders = ['', 'Subject'];
  comps.forEach(function(c, i) { compHeaders.push('Comp ' + (i+1)); });

  var compRows = [
    ['Address', (s.full_address || '').split(',')[0]].concat(comps.map(function(c) { return (c.listing.full_address || '').split(',')[0]; })),
    ['Sale Price', s.list_price ? '$' + s.list_price.toLocaleString() : '--'].concat(adjs.map(function(a) { return '$' + a.sale_price.toLocaleString(); })),
    ['Sqft', s.living_area ? s.living_area.toLocaleString() : '--'].concat(comps.map(function(c) { return c.listing.living_area ? c.listing.living_area.toLocaleString() : '--'; })),
    ['Lot', s.lot_size_acres ? s.lot_size_acres + ' ac' : '--'].concat(comps.map(function(c) { return c.listing.lot_size_acres ? c.listing.lot_size_acres + ' ac' : '--'; })),
    ['Beds/Baths', (s.bedrooms_total || '?') + '/' + (s.bathrooms_total_integer || '?')].concat(comps.map(function(c) { return (c.listing.bedrooms_total || '?') + '/' + (c.listing.bathrooms_total_integer || '?'); })),
    ['Year Built', s.year_built || '--'].concat(comps.map(function(c) { return c.listing.year_built || '--'; })),
    ['Close Date', '--'].concat(comps.map(function(c) { return c.listing.close_date || '--'; })),
  ];

  doc.autoTable({
    startY: y,
    head: [compHeaders],
    body: compRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
    headStyles: { fillColor: [92, 107, 192], textColor: [255, 255, 255], fontSize: 9 },
    columnStyles: { 0: { fontStyle: 'bold', halign: 'left' } },
    margin: { left: margin, right: margin }
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── Page 4: Full Adjustment Grid ──
  addPage();
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Adjustment Grid', margin, y + 5);
  y += 15;

  var adjLabels = [
    'Living Area', 'Lot Size', 'Bedrooms', 'Bathrooms', 'Garage', 'Year Built',
    'View', 'Water Features', 'Land Character', 'Road Noise', 'Privacy', 'Condition', 'Elevation',
    'Time', 'Concessions',
    'TOTAL ADJUSTMENT', 'ADJUSTED PRICE'
  ];
  var adjKeys = [
    'adj_living_area', 'adj_lot_size', 'adj_bedrooms', 'adj_bathrooms', 'adj_garage', 'adj_year_built',
    'adj_view', 'adj_water_features', 'adj_land_character', 'adj_road_noise', 'adj_privacy', 'adj_condition', 'adj_elevation',
    'adj_time', 'adj_concessions'
  ];

  var adjHeaders = ['Adjustment'].concat(comps.map(function(c, i) { return 'Comp ' + (i+1); }));
  var adjRows = adjKeys.map(function(key, idx) {
    return [adjLabels[idx]].concat(adjs.map(function(a) {
      var val = a.adjustments[key] || 0;
      return val === 0 ? '--' : (val > 0 ? '+' : '') + '$' + val.toLocaleString();
    }));
  });
  // Total and adjusted rows
  adjRows.push(['TOTAL ADJUSTMENT'].concat(adjs.map(function(a) { return (a.total_adjustment >= 0 ? '+' : '') + '$' + a.total_adjustment.toLocaleString(); })));
  adjRows.push(['ADJUSTED PRICE'].concat(adjs.map(function(a) { return '$' + a.adjusted_price.toLocaleString(); })));

  doc.autoTable({
    startY: y,
    head: [adjHeaders],
    body: adjRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5, halign: 'center' },
    headStyles: { fillColor: [92, 107, 192], textColor: [255, 255, 255], fontSize: 8 },
    columnStyles: { 0: { fontStyle: 'bold', halign: 'left', cellWidth: 35 } },
    margin: { left: margin, right: margin },
    didParseCell: function(data) {
      // Bold total rows
      if (data.row.index >= adjKeys.length) {
        data.cell.styles.fontStyle = 'bold';
        if (data.row.index === adjKeys.length + 1) {
          data.cell.styles.fillColor = [245, 240, 232];
        }
      }
    }
  });
  y = doc.lastAutoTable.finalY + 10;

  // Gross/Net pct
  checkPage(20);
  var pctRow = ['Gross Adj %'].concat(adjs.map(function(a) { return a.gross_adjustment_pct + '%'; }));
  var netRow = ['Net Adj %'].concat(adjs.map(function(a) { return a.net_adjustment_pct + '%'; }));
  doc.autoTable({
    startY: y,
    head: [],
    body: [pctRow, netRow],
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.5, halign: 'center' },
    columnStyles: { 0: { fontStyle: 'bold', halign: 'left', cellWidth: 35 } },
    margin: { left: margin, right: margin }
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── AI Summary Page ──
  if (ai.summary) {
    checkPage(40);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Market Analysis Summary', margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    var lines = doc.splitTextToSize(ai.summary, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 10;
  }

  // AI Considerations
  if (ai.considerations && ai.considerations.length) {
    checkPage(30);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Key Considerations', margin, y);
    y += 8;

    ai.considerations.forEach(function(c) {
      checkPage(20);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text((c.severity === 'critical' ? '! ' : '') + (c.category || '').toUpperCase(), margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      var cLines = doc.splitTextToSize(c.message || '', contentW - 5);
      doc.text(cLines, margin + 2, y);
      y += cLines.length * 4 + 5;
    });
  }

  // ── Disclaimer Page ──
  addPage();
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Important Disclosures', margin, y + 5);
  y += 15;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  var disclaimers = [
    'This Comparative Market Analysis (CMA) is an estimate of market value based on an analysis of comparable properties. It is not an appraisal and should not be relied upon as such.',
    'The information contained herein is believed to be accurate but is not guaranteed. Prices, conditions, and other data may have changed since the comparable sales closed.',
    'Mountain properties in Western North Carolina have unique characteristics including views, water features, road access, elevation, and land usability that significantly affect value. This CMA accounts for these factors using paired sales analysis and market data.',
    'The final list price is a decision made by the seller in consultation with their real estate agent. This analysis is intended to inform that decision.',
    'Equal Housing Opportunity. This content is for informational purposes only and does not constitute legal, financial, or tax advice.',
  ];

  disclaimers.forEach(function(d) {
    checkPage(20);
    var dLines = doc.splitTextToSize(d, contentW - 10);
    doc.text(dLines, margin + 5, y);
    y += dLines.length * 4.5 + 5;
  });

  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Prepared by:', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text('Cory Coleman, REALTOR', margin, y); y += 5;
  doc.text('Keller Williams Great Smokies', margin, y); y += 5;
  doc.text('96 W Sylva Shopping Area, Sylva, NC 28779', margin, y); y += 5;
  doc.text('(828) 506-6413 | coryhelpsyoumove@gmail.com', margin, y); y += 5;
  doc.text('coryhelpsyoumove.com', margin, y);

  // Save
  var fileName = 'CMA-' + (s.full_address || 'Report').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40) + '.pdf';
  doc.save(fileName);
  toast('PDF generated: ' + fileName, 'success');
}
