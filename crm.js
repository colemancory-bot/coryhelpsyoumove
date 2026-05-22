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

// Handle browser back/forward within CRM
window.addEventListener('popstate', function(e) {
  if (e.state && e.state.crm) {
    var tab = e.state.tab || 'today';
    var sub = e.state.sub || null;
    // Navigate within CRM without pushing new history
    if (tab === 'cma' && (sub === 'dashboard' || sub === null)) {
      _currentTab = 'cma';
      renderSidebar();
      loadCMA(true);
    } else if (tab === 'cma' && sub === 'step1' && _cmaState.subject) {
      _currentTab = 'cma';
      renderSidebar();
      cmaRenderStep1();
    } else if (tab === 'cma') {
      // Any other CMA sub-state (report, etc.) - go to dashboard
      _currentTab = 'cma';
      renderSidebar();
      loadCMA(true);
    } else {
      switchTab(tab, true);
    }
  } else {
    // No CRM state — push a new CRM state to prevent leaving
    // This keeps the user in the CRM when they hit back at the first view
    history.pushState({ crm: true, tab: _currentTab }, '');
  }
});

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
  { id: 'cma', label: 'CMA', icon: '<svg viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/><rect x="1" y="1" width="22" height="22" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>' },
  { id: 'reviews', label: 'Reviews', icon: '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' }
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

// ── History Management (browser back/forward within CRM) ──
var _crmHistoryInitialized = false;
function crmPushState(state) {
  // Push a state to browser history so back button works within CRM
  if (!_crmHistoryInitialized) {
    // Replace the initial entry so going "back" from the first CRM view doesn't leave the CRM
    history.replaceState({ crm: true, tab: state.tab, sub: state.sub || null }, '');
    _crmHistoryInitialized = true;
  } else {
    history.pushState({ crm: true, tab: state.tab, sub: state.sub || null }, '');
  }
}

function switchTab(tab, skipHistory) {
  _currentTab = tab;
  _selectedContacts.clear();
  renderSidebar();
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="crm-loading"><div class="crm-spinner"></div></div>';
  // Update topbar title
  var titleEl = document.querySelector('.crm-title');
  var tabObj = SIDEBAR_TABS.find(function(t) { return t.id === tab; });
  if (titleEl && tabObj) titleEl.textContent = tabObj.label;

  // Push to history (unless triggered by popstate)
  if (!skipHistory) crmPushState({ tab: tab });

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
  else if (tab === 'cma') loadCMA(true);
  else if (tab === 'reviews') loadReviews();
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
  crmPushState({ tab: 'contacts', sub: 'detail' });
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
        // photo_urls is not a column on mls_listings — photos live in the
        // separate mls_media table. Nothing in the listings tab actually
        // consumed it; the bad SELECT was just throwing 400 and breaking
        // the entire CMA tab.
        var resp = await _sb.from('mls_listings').select('listing_key,listing_id,full_address,city,county_or_parish,property_type,property_sub_type,standard_status,list_price,close_price,close_date,living_area,living_area_range,lot_size_acres,bedrooms_total,bathrooms_total_integer,year_built,garage_spaces,stories,days_on_market,list_agent_full_name,list_agent_email,list_office_name,feed_type,mlg_can_view,latitude,longitude,public_remarks,private_remarks,showing_instructions,directions,modification_timestamp').range(from, from + pageSize - 1);
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

  // Action row — start a CMA on this property with the subject pre-filled.
  // Saves the click-through-CMA-tab-then-search-the-address dance.
  html += '<div class="listings-detail-actions" style="display:flex;gap:0.5rem;margin-bottom:0.8rem">';
  html += '<button class="crm-btn crm-btn-primary" onclick="event.stopPropagation();cmaStartFromListing(\'' + esc(l.listing_key) + '\')">';
  html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:0.4rem;vertical-align:middle"><path d="M18 20V10M12 20V4M6 20v-6"/><rect x="1" y="1" width="22" height="22" rx="3"/></svg>';
  html += 'Start CMA on this property</button>';
  html += '</div>';

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

  // Section 10: Raw Data (collapsible, loaded on demand)
  html += '<div class="ld-section"><details class="ld-raw" ontoggle="if(this.open)loadListingRawData(\'' + esc(l.listing_key) + '\',this)"><summary class="ld-section-title" style="cursor:pointer">Raw MLS Data ▸</summary><pre class="ld-raw-json" id="ldRaw_' + esc(l.listing_key) + '">Loading...</pre></details></div>';

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

async function loadListingRawData(listingKey, detailsEl) {
  var pre = document.getElementById('ldRaw_' + listingKey);
  if (!pre || pre.dataset.loaded) return;
  pre.dataset.loaded = '1';
  try {
    var resp = await _sb.from('mls_listings').select('raw_data').eq('listing_key', listingKey).single();
    if (resp.error) throw resp.error;
    pre.textContent = JSON.stringify(resp.data.raw_data, null, 2);
  } catch(e) {
    pre.textContent = 'Failed to load: ' + (e.message || 'Unknown error');
  }
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
  charts: {},        // Chart.js instances
  filters: {}        // Comp search filters { city, county, exclude_cities, max_distance_miles, min_close_date }
};

var CMA_FUNC_URL = SUPABASE_URL + '/functions/v1/cma-engine';
var CMA_EXTRACT_URL = SUPABASE_URL + '/functions/v1/cma-extract-features';
var CMA_PDF_URL = SUPABASE_URL + '/functions/v1/cma-pdf';

// WNC CMA Adjustment Rates (synced with cma-engine WNC_DEFAULTS)
// Last calibrated: 2026-Q1. Review quarterly using paired sales analysis.
var CMA_RATES = {
  version: '2026-Q1',
  price_per_sqft: 175,
  per_bedroom: 12000,
  per_bathroom: 10000,
  per_garage_space: 8000,
  per_year_age: 500,
  view_per_point: 25000,
  water_per_point: 20000,
  land_per_point: 8000,
  road_noise_per_point: 7000,
  privacy_per_point: 6000,
  elevation_per_100ft: 2000,
  condition_per_point: 20000,
  lot_tiers: [
    { upTo: 2, perAcre: 25000 },
    { upTo: 5, perAcre: 15000 },
    { upTo: 10, perAcre: 8000 },
    { upTo: 25, perAcre: 4000 },
    { upTo: 50, perAcre: 2500 },
    { upTo: Infinity, perAcre: 1500 }
  ],
  unrestricted_premium_pct: 0.10,
  pool_inground: 0,
  pool_above_ground: -3000,
  basement_finished_per_sqft: 60,
  basement_partial: 20000,
  basement_unfinished: 10000,
  fireplace_value: 8000,
  fireplace_stone_premium: 5000,
  covered_outdoor_per_sqft: 30,
  outbuilding_tier_values: [0, 5000, 15000, 30000],
  // Construction type: % of improvement value (sale price minus estimated lot value)
  // Positive = premium over site-built, negative = discount
  construction_pct: { site_built: 0, manufactured: -0.25, modular: -0.10, log: 0.10, mobile_home: -0.35, unknown: 0 }
};

function cmaCalcLotValue(acres) {
  var tiers = CMA_RATES.lot_tiers;
  var total = 0, remaining = acres, prevCap = 0;
  for (var i = 0; i < tiers.length && remaining > 0; i++) {
    var tierAcres = Math.min(remaining, tiers[i].upTo - prevCap);
    total += tierAcres * tiers[i].perAcre;
    remaining -= tierAcres;
    prevCap = tiers[i].upTo;
  }
  return Math.round(total);
}

function cmaGetCompVal(ci, field) {
  if (_cmaState.compOverrides && _cmaState.compOverrides[ci] && _cmaState.compOverrides[ci][field] != null) {
    return _cmaState.compOverrides[ci][field];
  }
  var c = _cmaState.selectedComps[ci];
  if (!c) return null;
  // Check listing fields first, then features
  if (c.listing && c.listing[field] != null) return c.listing[field];
  if (c.features && c.features[field] != null) return c.features[field];
  return null;
}

function cmaRecalcAdjFromValue(ci, adjKey) {
  var s = _cmaState.subject.listing;
  var sf = _cmaState.subject.features || {};
  var r = CMA_RATES;
  switch (adjKey) {
    case 'adj_living_area': return Math.round(((s.living_area || 0) - (cmaGetCompVal(ci, 'living_area') || 0)) * r.price_per_sqft);
    case 'adj_bedrooms': return Math.round(((s.bedrooms_total || 0) - (cmaGetCompVal(ci, 'bedrooms_total') || 0)) * r.per_bedroom);
    case 'adj_bathrooms': return Math.round(((s.bathrooms_total_integer || 0) - (cmaGetCompVal(ci, 'bathrooms_total_integer') || 0)) * r.per_bathroom);
    case 'adj_garage': return Math.round(((s.garage_spaces || 0) - (cmaGetCompVal(ci, 'garage_spaces') || 0)) * r.per_garage_space);
    case 'adj_year_built': {
      var sy = s.year_built || 0, cy = cmaGetCompVal(ci, 'year_built') || 0;
      return (sy > 0 && cy > 0) ? Math.round((sy - cy) * r.per_year_age) : 0;
    }
    case 'adj_lot_size': return cmaCalcLotValue(s.lot_size_acres || 0) - cmaCalcLotValue(cmaGetCompVal(ci, 'lot_size_acres') || 0);
    case 'adj_restrictions': {
      var subR = sf.restriction_status || 'unknown';
      var compR = cmaGetCompVal(ci, 'restriction_status') || 'unknown';
      if (subR !== 'unknown' && compR !== 'unknown' && subR !== compR) {
        var avgLot = ((s.lot_size_acres || 0) + (cmaGetCompVal(ci, 'lot_size_acres') || 0)) / 2 || 1;
        var premium = Math.round(cmaCalcLotValue(avgLot) * r.unrestricted_premium_pct);
        return subR === 'unrestricted' ? premium : -premium;
      }
      return 0;
    }
    case 'adj_construction_type': {
      var subCT = sf.construction_type || 'site_built';
      var compCT = cmaGetCompVal(ci, 'construction_type') || 'site_built';
      if (subCT === compCT) return 0;
      // % of improvement value (sale price minus estimated lot value)
      var c = _cmaState.selectedComps[ci];
      var compPrice = c.listing.close_price || c.listing.list_price || 0;
      var compLot = cmaGetCompVal(ci, 'lot_size_acres') || c.listing.lot_size_acres || 0;
      var lotVal = cmaCalcLotValue(compLot);
      var improvementVal = Math.max(compPrice - lotVal, compPrice * 0.3); // floor at 30% of price
      var subPct = r.construction_pct[subCT] || 0;
      var compPct = r.construction_pct[compCT] || 0;
      return Math.round(improvementVal * (subPct - compPct));
    }
    case 'adj_view': {
      var sv = sf.view_quality || 0, cv = cmaGetCompVal(ci, 'view_quality') || 0;
      return (sv > 0 && cv > 0) ? Math.round((sv - cv) * r.view_per_point) : 0;
    }
    case 'adj_water_features': {
      var sv = sf.water_quality || 0, cv = cmaGetCompVal(ci, 'water_quality') || 0;
      return (sv > 0 && cv > 0) ? Math.round((sv - cv) * r.water_per_point) : 0;
    }
    case 'adj_land_character': {
      var sv = sf.land_usability || 0, cv = cmaGetCompVal(ci, 'land_usability') || 0;
      return (sv > 0 && cv > 0) ? Math.round((sv - cv) * r.land_per_point) : 0;
    }
    case 'adj_road_noise': {
      var sv = sf.road_noise || 0, cv = cmaGetCompVal(ci, 'road_noise') || 0;
      return (sv > 0 && cv > 0) ? Math.round((sv - cv) * r.road_noise_per_point) : 0;
    }
    case 'adj_privacy': {
      var sv = sf.privacy_rating || 0, cv = cmaGetCompVal(ci, 'privacy_rating') || 0;
      return (sv > 0 && cv > 0) ? Math.round((sv - cv) * r.privacy_per_point) : 0;
    }
    case 'adj_elevation': {
      var sv = sf.elevation_ft || 0, cv = cmaGetCompVal(ci, 'elevation_ft') || 0;
      return Math.round(((sv - cv) / 100) * r.elevation_per_100ft);
    }
    case 'adj_fireplace': {
      var subFP = sf.has_fireplace ? (sf.fireplace_count || 1) : 0;
      var compFP = cmaGetCompVal(ci, 'fireplace_count') || 0;
      return (subFP - compFP) * r.fireplace_value;
    }
    case 'adj_covered_outdoor': {
      var subOD = sf.covered_outdoor_sqft || 0;
      var compOD = cmaGetCompVal(ci, 'covered_outdoor_sqft') || 0;
      return Math.round((subOD - compOD) * r.covered_outdoor_per_sqft);
    }
    default: return 0;
  }
}

function cmaRecalcStructuralAdj(ci, adjKey) {
  var sf = _cmaState.subject.features || {};
  var s = _cmaState.subject.listing;
  var r = CMA_RATES;
  switch (adjKey) {
    case 'adj_restrictions': return cmaRecalcAdjFromValue(ci, 'adj_restrictions');
    case 'adj_construction_type': return cmaRecalcAdjFromValue(ci, 'adj_construction_type');
    case 'adj_pool': {
      var poolVal = function(type) {
        if (type === 'in_ground' || type === 'indoor') return r.pool_inground;
        if (type === 'above_ground') return r.pool_above_ground;
        return 0;
      };
      var subPool = sf.has_pool ? (sf.pool_type || 'in_ground') : 'none';
      var compPool = cmaGetCompVal(ci, 'pool_type') || 'none';
      return poolVal(subPool) - poolVal(compPool);
    }
    case 'adj_basement': {
      var bsmtVal = function(type) {
        if (type === 'finished') return 800 * r.basement_finished_per_sqft;
        if (type === 'partial') return r.basement_partial;
        if (type === 'unfinished') return r.basement_unfinished;
        return 0;
      };
      var subBsmt = sf.basement_type || 'none';
      var compBsmt = cmaGetCompVal(ci, 'basement_type') || 'none';
      return Math.round(bsmtVal(subBsmt) - bsmtVal(compBsmt));
    }
    case 'adj_fireplace': {
      var subFP = sf.has_fireplace ? (sf.fireplace_count || 1) : 0;
      var compFP = cmaGetCompVal(ci, 'fireplace_count') || 0;
      return (subFP - compFP) * r.fireplace_value;
    }
    case 'adj_covered_outdoor': {
      var subOD = sf.covered_outdoor_sqft || 0;
      var compOD = cmaGetCompVal(ci, 'covered_outdoor_sqft') || 0;
      return Math.round((subOD - compOD) * r.covered_outdoor_per_sqft);
    }
    case 'adj_outbuildings': {
      var subTier = sf.outbuilding_value_tier || 0;
      var compTier = cmaGetCompVal(ci, 'outbuilding_value_tier') || 0;
      return (r.outbuilding_tier_values[subTier] || 0) - (r.outbuilding_tier_values[compTier] || 0);
    }
    default: return 0;
  }
}

function cmaCompValInput(ci, field, adjKey, value, step, unit, attrs) {
  return '<div class="cma-grid-comp-val">' +
    '<input type="number" class="cma-comp-val-edit" value="' + (value != null ? value : '') + '" data-comp="' + ci + '" data-field="' + field + '" data-adj="' + adjKey + '" step="' + (step || 1) + '"' + (attrs || '') + ' />' +
    (unit ? '<span class="cma-comp-val-unit">' + unit + '</span>' : '') +
    '</div>';
}

function cmaCompValSelect(ci, field, adjKey, currentVal, options) {
  var html = '<div class="cma-grid-comp-val">';
  html += '<select class="cma-comp-val-select" data-comp="' + ci + '" data-field="' + field + '" data-adj="' + adjKey + '">';
  options.forEach(function(opt) {
    html += '<option value="' + opt.value + '"' + (opt.value === currentVal ? ' selected' : '') + '>' + opt.label + '</option>';
  });
  html += '</select></div>';
  return html;
}

// Calculate construction type adjustments (engine doesn't include this)
// Called on every Step 3 render to ensure it's always populated
function cmaInitConstructionAdj() {
  if (!_cmaState.subject || !_cmaState.adjustments.length) return;
  var sf = _cmaState.subject.features || {};
  var s = _cmaState.subject.listing;
  var subCT = sf.construction_type || 'unknown';
  if (subCT === 'unknown') {
    var pst = ((s.property_sub_type || '') + '').toLowerCase();
    if (pst.includes('manufactured') || pst.includes('mobile')) subCT = 'manufactured';
    else if (pst.includes('modular')) subCT = 'modular';
    else subCT = 'site_built';
  }
  var cp = CMA_RATES.construction_pct;
  var changed = false;
  _cmaState.adjustments.forEach(function(a, i) {
    var c = _cmaState.selectedComps[i];
    if (!c) return;
    var cf = c.features || {};
    // Check overrides first, then features, then infer from property_sub_type
    var compCT = ((_cmaState.compOverrides || {})[i] || {}).construction_type || cf.construction_type || 'unknown';
    if (compCT === 'unknown') {
      var cpst = ((c.listing.property_sub_type || '') + '').toLowerCase();
      if (cpst.includes('manufactured') || cpst.includes('mobile')) compCT = 'manufactured';
      else if (cpst.includes('modular')) compCT = 'modular';
      else compCT = 'site_built';
    }
    var adj = 0;
    if (subCT !== compCT) {
      var compPrice = c.listing.close_price || c.listing.list_price || 0;
      var compLot = c.listing.lot_size_acres || 0;
      var lotVal = cmaCalcLotValue(compLot);
      var improvementVal = Math.max(compPrice - lotVal, compPrice * 0.3);
      adj = Math.round(improvementVal * ((cp[subCT] || 0) - (cp[compCT] || 0)));
    }
    if (a.adjustments.adj_construction_type !== adj) {
      a.adjustments.adj_construction_type = adj;
      changed = true;
    }
  });
  if (changed) {
    _cmaState.adjustments.forEach(function(a, i) { cmaRecalcTotals(i); });
  }
}

function cmaInitConditionAdj() {
  if (!_cmaState.subject || !_cmaState.adjustments.length) return;
  var sf = _cmaState.subject.features || {};
  var subCond = sf.condition_rating || 0;
  if (!subCond) return;
  var r = CMA_RATES;
  var changed = false;
  _cmaState.adjustments.forEach(function(a, i) {
    var compCond = (_cmaState.compConditions && _cmaState.compConditions[i] != null) ? _cmaState.compConditions[i] : 0;
    if (!compCond) return;
    var adj = (subCond - compCond) * r.condition_per_point;
    if (a.adjustments.adj_condition !== adj) {
      a.adjustments.adj_condition = adj;
      changed = true;
    }
  });
  if (changed) {
    _cmaState.adjustments.forEach(function(a, i) { cmaRecalcTotals(i); });
  }
}

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
async function loadCMA(skipHistory) {
  _cmaState.step = 0;
  if (!skipHistory) crmPushState({ tab: 'cma', sub: 'dashboard' });
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
      html += '<button class="cma-report-delete" onclick="event.stopPropagation(); cmaDeleteReport(\'' + r.id + '\', \'' + esc(r.subject_address || 'Untitled').replace(/'/g, "\\'") + '\')" title="Delete CMA"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  main.innerHTML = html;
}

async function cmaDeleteReport(reportId, address) {
  if (!confirm('Delete the CMA for "' + address + '"? This cannot be undone.')) return;
  toast('Deleting report...', 'info');
  try {
    var result = await cmaFetch('delete-report', { report_id: reportId });
    if (result.error) { toast('Delete failed: ' + result.error, 'error'); return; }
    toast('CMA deleted', 'success');
    loadCMA();
  } catch(e) { toast('Delete failed: ' + e.message, 'error'); }
}

function cmaNewReport() {
  _cmaState = { step: 1, subject: null, comps: [], selectedComps: [], adjustments: [], valuation: null, aiAdvice: null, aiSelection: null, reportId: null, reports: _cmaState.reports, charts: {}, filters: {} };
  crmPushState({ tab: 'cma', sub: 'step1' });
  cmaRenderStep1();
}

// Entry point from the Listings tab's "Start CMA on this property" button.
// Resets CMA state, jumps to the CMA tab, then calls cmaSelectSubject which
// pulls the full row + tags and lands the user on the editable subject form.
function cmaStartFromListing(listingKey) {
  _cmaState = { step: 1, subject: null, comps: [], selectedComps: [], adjustments: [], valuation: null, aiAdvice: null, aiSelection: null, reportId: null, reports: (_cmaState && _cmaState.reports) || [], charts: {}, filters: {} };
  switchTab('cma');
  // Let switchTab → loadCMA finish painting before we override the dashboard
  // with the subject form. cmaSelectSubject will render the editable form.
  setTimeout(function(){ cmaSelectSubject(listingKey); }, 80);
}

// ── Quick CMA: auto-runs all steps after subject is confirmed ──
async function cmaQuickCMA() {
  if (!_cmaState.subject) { toast('Select a subject property first', 'error'); return; }
  crmPushState({ tab: 'cma', sub: 'quickcma' });
  var sub = _cmaState.subject.listing;
  var main = document.getElementById('crmMain');

  // Show progress UI
  var steps = [
    { id: 'qc-find', label: 'Finding and ranking comparables' },
    { id: 'qc-adjust', label: 'Calculating adjustments' },
    { id: 'qc-ai', label: 'Getting AI market analysis' }
  ];
  function renderProgress(activeIdx, error) {
    var html = '<div class="cma-wizard"><div class="cma-auto-progress">';
    html += '<h2 class="fd" style="margin-bottom:0.3rem;">Quick CMA</h2>';
    html += '<p style="color:var(--crm-text-muted);margin-bottom:1.5rem;">' + esc(sub.full_address || '') + '</p>';
    steps.forEach(function(s, i) {
      var icon, cls;
      if (error && i === activeIdx) { icon = '\u2717'; cls = 'qc-error'; }
      else if (i < activeIdx) { icon = '\u2713'; cls = 'qc-done'; }
      else if (i === activeIdx) { icon = ''; cls = 'qc-active'; }
      else { icon = ''; cls = 'qc-pending'; }
      html += '<div class="qc-step ' + cls + '">';
      if (i === activeIdx && !error) html += '<div class="crm-spinner" style="width:18px;height:18px;border-width:2px;margin-right:0.5rem;"></div>';
      else html += '<span class="qc-icon">' + icon + '</span>';
      html += '<span>' + s.label + '</span></div>';
    });
    if (error) {
      html += '<div style="margin-top:1rem;color:var(--crm-red);font-size:0.85rem;">' + esc(error) + '</div>';
      html += '<button class="crm-btn crm-btn-secondary" onclick="cmaRenderStep1()" style="margin-top:0.8rem;">Back to Subject</button>';
    }
    html += '</div></div>';
    main.innerHTML = html;
  }

  // Step 1: Auto-select comps
  renderProgress(0);
  var isManual = (sub.listing_key || '').startsWith('manual_');
  var compPayload = {
    filters: Object.assign({
      county: sub.county_or_parish || null,
      property_type: sub.property_type || null,
      max_distance_miles: 15
    }, _cmaState.filters),
    target_count: 4
  };
  if (isManual) { compPayload.listing_key = null; compPayload.manual_subject = sub; }
  else {
    compPayload.listing_key = sub.listing_key;
    // Send user-edited subject values so engine uses them instead of stale DB data
    compPayload.subject_overrides = {
      living_area: sub.living_area, bedrooms_total: sub.bedrooms_total,
      bathrooms_total_integer: sub.bathrooms_total_integer, year_built: sub.year_built,
      garage_spaces: sub.garage_spaces, lot_size_acres: sub.lot_size_acres,
      property_type: sub.property_type, property_sub_type: sub.property_sub_type,
      list_price: sub.list_price
    };
  }
  // Pass any user feature overrides (e.g. construction_type)
  if (_cmaState.subject.features && Object.keys(_cmaState.subject.features).length > 0) {
    compPayload.feature_overrides = _cmaState.subject.features;
  }

  var compResult = await cmaFetch('auto-select-comps', compPayload);
  if (compResult.error) { renderProgress(0, 'Comp selection failed: ' + compResult.error); return; }

  var selected = compResult.selected || [];
  if (selected.length === 0) { renderProgress(0, 'No comparable sales found. Try adjusting filters or adding a manual subject.'); return; }

  // Map to match expected format
  _cmaState.comps = selected.map(function(c) { c.selected = true; return c; });
  if (compResult.remaining) {
    compResult.remaining.forEach(function(c) { c.selected = false; _cmaState.comps.push(c); });
  }
  _cmaState.selectedComps = selected;
  _cmaState.aiSelection = compResult.ai_selection || null;

  // Step 2: Calculate adjustments
  renderProgress(1);
  var calcResult = await cmaFetch('calculate-adjustments', {
    subject: _cmaState.subject,
    comps: _cmaState.selectedComps.map(function(c) { return { listing: c.listing, features: c.features }; })
  });
  if (calcResult.error) { renderProgress(1, 'Adjustment calculation failed: ' + calcResult.error); return; }
  _cmaState.adjustments = calcResult.adjustments || [];
  _cmaState.valuation = calcResult.valuation || {};

  // Step 3: AI advice
  renderProgress(2);
  var adviceResult = await cmaFetch('ai-advise', {
    subject: _cmaState.subject,
    valuation: _cmaState.valuation || {},
    comps: _cmaState.selectedComps.map(function(c, i) {
      return { listing: c.listing, features: c.features, adjustments: _cmaState.adjustments[i] };
    })
  });
  _cmaState.aiAdvice = adviceResult.error
    ? { considerations: [], summary: 'AI analysis unavailable.', comp_reasoning: {} }
    : adviceResult;

  // Done! Jump to step 4 review
  _cmaState.step = 4;
  toast('Quick CMA complete!', 'success');
  cmaRenderStep4();
}

async function cmaOpenReport(reportId) {
  crmPushState({ tab: 'cma', sub: 'report' });
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
  // Also populate comps list so Step 2 has data when navigating back
  _cmaState.comps = _cmaState.selectedComps.map(function(c) { return Object.assign({}, c, { selected: true }); });
  _cmaState.adjustments = (result.adjustments || []).map(function(adj) {
    return {
      comp_listing_key: adj.comp_listing_key, comp_order: adj.comp_order, sale_price: adj.comp_data ? adj.comp_data.close_price || 0 : 0,
      adjustments: {
        adj_living_area: adj.adj_living_area, adj_lot_size: adj.adj_lot_size, adj_restrictions: adj.adj_restrictions,
        adj_bedrooms: adj.adj_bedrooms, adj_bathrooms: adj.adj_bathrooms,
        adj_garage: adj.adj_garage, adj_year_built: adj.adj_year_built, adj_condition: adj.adj_condition, adj_view: adj.adj_view,
        adj_water_features: adj.adj_water_features, adj_land_character: adj.adj_land_character, adj_road_noise: adj.adj_road_noise,
        adj_privacy: adj.adj_privacy, adj_elevation: adj.adj_elevation,
        adj_pool: adj.adj_pool || 0, adj_basement: adj.adj_basement || 0, adj_fireplace: adj.adj_fireplace || 0,
        adj_covered_outdoor: adj.adj_covered_outdoor || 0, adj_outbuildings: adj.adj_outbuildings || 0,
        adj_construction_type: adj.adj_construction_type || 0,
        adj_time: adj.adj_time, adj_concessions: adj.adj_concessions
      },
      total_adjustment: adj.total_adjustment, adjusted_price: adj.adjusted_price,
      gross_adjustment_pct: adj.gross_adjustment_pct, net_adjustment_pct: adj.net_adjustment_pct,
      warnings: [], ai_suggested: adj.ai_suggested_adjustments || {}
    };
  });
  // Restore comp condition ratings and value overrides from saved report
  _cmaState.compConditions = {};
  _cmaState.compOverrides = {};
  (result.adjustments || []).forEach(function(adj, i) {
    if (adj.comp_condition_rating != null) _cmaState.compConditions[i] = adj.comp_condition_rating;
    _cmaState.compOverrides[i] = adj.comp_overrides || {};
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
  // Search bar + manual entry button side by side
  html += '<div class="cma-search-row">';
  html += '<div class="cma-search-wrap"><input class="crm-input cma-search-input" id="cmaSubjectSearch" placeholder="Search by address or MLS #..." autocomplete="off" />';
  html += '<div class="cma-search-results" id="cmaSubjectResults"></div></div>';
  html += '<button class="crm-btn crm-btn-secondary cma-manual-btn" onclick="cmaShowManualEntry()">Not in MLS</button>';
  html += '</div>';

  // Property facts form (hidden until search select or manual click)
  html += '<div class="cma-facts-form" id="cmaFactsForm" style="display:none">';
  // Header with address and source badge
  html += '<div class="cma-facts-header">';
  html += '<div class="cma-facts-title" id="cmaFactsTitle">Confirm Home Facts</div>';
  html += '<div class="cma-facts-subtitle">Confirm or update the property facts. Starred fields are used to find comps.</div>';
  html += '<div class="cma-man-source-wrap" id="cmaManSourceWrap" style="display:none"><span class="cma-man-source" id="cmaManSource"></span></div>';
  html += '</div>';

  // County lookup row
  html += '<div class="cma-county-lookup" id="cmaCountyLookupRow">';
  html += '<input class="crm-input" id="cmaLookupAddr" placeholder="Look up by address..." style="flex:1" />';
  html += '<input class="crm-input" id="cmaLookupCounty" placeholder="County" style="width:120px" />';
  html += '<button class="crm-btn crm-btn-secondary" onclick="cmaCountyLookup()">Look Up</button>';
  html += '</div>';

  // RPR-style facts table
  html += '<div class="cma-facts-table-wrap"><table class="cma-facts-table">';
  html += '<thead><tr><th class="cma-facts-label-col"></th><th class="cma-facts-record-col">Record Data</th><th class="cma-facts-change-col">Your Changes</th></tr></thead>';
  html += '<tbody>';
  html += cmaFactsRow('Street Address *', 'cmaManAddr', 'text', '35 Coweeta Ridge Rd', true);
  html += cmaFactsRow('City *', 'cmaManCity', 'text', 'Franklin', true);
  html += cmaFactsRow('County', 'cmaManCounty', 'text', 'Macon', false);
  html += cmaFactsSelectRow('Property Type', 'cmaManType', [['Residential','Residential'],['Land','Land'],['Residential Income','Multi-Family'],['Commercial','Commercial']], true);
  html += cmaFactsSelectRow('Subtype', 'cmaManSubtype', [['Single Family Residence','Single Family'],['Cabin','Cabin'],['Manufactured Home','Manufactured'],['Condo','Condo'],['Townhouse','Townhouse'],['','Other']], false);
  html += cmaFactsSelectRow('Construction', 'cmaManConstruction', [['auto','Auto-detect'],['site_built','Site-Built'],['manufactured','Manufactured (post-1976)'],['modular','Modular'],['mobile_home','Mobile Home (pre-1976)'],['log','Log']], false);
  html += '<tr class="cma-facts-divider"><td colspan="3"></td></tr>';
  html += cmaFactsRow('Bedrooms *', 'cmaManBeds', 'number', '3', true);
  html += cmaFactsRow('Bathrooms *', 'cmaManBaths', 'number', '2', true, '0.5');
  html += cmaFactsRow('Living Area (sqft) *', 'cmaManSqft', 'number', '1800', true);
  html += cmaFactsRow('Lot Size (acres)', 'cmaManLot', 'number', '1.5', false, '0.01');
  html += cmaFactsRow('Garage Spaces', 'cmaManGarage', 'number', '0', false);
  html += cmaFactsRow('Year Built', 'cmaManYear', 'number', '2005', false);
  html += cmaFactsSelectRow('Condition', 'cmaManCondition', [['0','Unknown'],['1','1 - Tear Down / Major Reno'],['2','2 - Below Average'],['3','3 - Fair for Age'],['4','4 - Above Average'],['5','5 - Pristine']], false);
  html += cmaFactsRow('List/Ask Price', 'cmaManPrice', 'number', '350000', false, '1000');
  html += '</tbody></table></div>';

  // Improvement notes
  html += '<div class="cma-facts-notes"><label class="cma-facts-notes-label">Improvement Notes</label>';
  html += '<textarea class="crm-input cma-notes-input" id="cmaManNotes" rows="2" placeholder="e.g. Owner added 3rd bedroom, finished basement (+600 sqft), combined adjacent lot (now 12.78 acres)"></textarea></div>';
  html += '<div class="cma-step-actions"><button class="crm-btn crm-btn-secondary" onclick="cmaHideManualEntry()">Cancel</button><button class="crm-btn crm-btn-primary" onclick="cmaSubmitManual()">Use This Property</button></div>';
  html += '</div>';
  if (_cmaState.subject) {
    html += cmaSubjectCard(_cmaState.subject);
    html += '<div class="cma-step-actions"><button class="crm-btn crm-btn-secondary" onclick="cmaGoStep2()">Manual Comp Selection</button><button class="crm-btn crm-btn-primary" onclick="cmaQuickCMA()"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10"/></svg> Quick CMA</button></div>';
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

  // Bind slider + inline-edit events after DOM is ready
  cmaBindCardEvents();
}

// RPR-style facts table row builders
function cmaFactsRow(label, id, type, placeholder, starred, step) {
  var starCls = starred ? ' cma-facts-starred' : '';
  return '<tr class="cma-facts-row' + starCls + '">' +
    '<td class="cma-facts-label">' + (starred ? '<span class="cma-facts-star">*</span> ' : '') + label.replace(' *', '') + '</td>' +
    '<td class="cma-facts-record" id="' + id + '_record">&ndash;</td>' +
    '<td class="cma-facts-change"><input class="cma-facts-input" id="' + id + '" type="' + type + '"' +
    (placeholder ? ' placeholder="' + placeholder + '"' : '') +
    (step ? ' step="' + step + '"' : '') + ' /></td></tr>';
}
function cmaFactsSelectRow(label, id, options, starred) {
  var starCls = starred ? ' cma-facts-starred' : '';
  var optHtml = options.map(function(o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
  return '<tr class="cma-facts-row' + starCls + '">' +
    '<td class="cma-facts-label">' + (starred ? '<span class="cma-facts-star">*</span> ' : '') + label + '</td>' +
    '<td class="cma-facts-record" id="' + id + '_record">&ndash;</td>' +
    '<td class="cma-facts-change"><select class="cma-facts-select" id="' + id + '">' + optHtml + '</select></td></tr>';
}

// Use county GIS record as subject - pre-fills the manual entry form with county data
function cmaUseCountyRecord() {
  var cr = window._cmaCountyRecord;
  if (!cr) { toast('No county record available', 'error'); return; }
  // Map county record fields to the format cmaShowEditableSubject expects
  var data = {
    full_address: cr.full_address || '',
    city: '', // County records often don't have city, extract from address
    county_or_parish: cr.county_or_parish || '',
    living_area: cr.living_area || null,
    bedrooms_total: cr.bedrooms_total || null,
    bathrooms_total_integer: cr.bathrooms_total_integer || null,
    lot_size_acres: cr.lot_size_acres || null,
    year_built: cr.year_built || null,
    garage_spaces: null,
    list_price: cr.last_sale_price || null,
    close_price: cr.last_sale_price || null,
    property_type: 'Residential',
  };
  var source = window._cmaCountySource || 'County Records';
  cmaShowEditableSubject(data, null, source);
  toast('Property loaded from ' + source + '. Review and fill in any missing details.', 'info');
}

function cmaShowManualEntry(prefillAddress) {
  var form = document.getElementById('cmaFactsForm');
  if (form) form.style.display = 'block';
  // Clear search results dropdown
  var results = document.getElementById('cmaSubjectResults');
  if (results) results.innerHTML = '';
  // Update title for manual entry
  var title = document.getElementById('cmaFactsTitle');
  if (title) title.textContent = 'Enter Property Details';
  // Pre-fill address if provided (from failed MLS search)
  if (prefillAddress) {
    var addrField = document.getElementById('cmaManAddr');
    if (addrField && !addrField.value) addrField.value = prefillAddress;
    // Also fill the county lookup field so they can try that
    var lookupField = document.getElementById('cmaLookupAddr');
    if (lookupField && !lookupField.value) lookupField.value = prefillAddress;
  }
}

function cmaHideManualEntry() {
  var form = document.getElementById('cmaFactsForm');
  if (form) form.style.display = 'none';
}

async function cmaCountyLookup() {
  var addr = (document.getElementById('cmaLookupAddr').value || '').trim();
  var county = (document.getElementById('cmaLookupCounty').value || '').trim();
  if (!addr || addr.length < 3) { toast('Enter an address to look up (at least 3 characters)', 'error'); return; }
  toast('Looking up property records...', 'info');
  try {
    var result = await cmaFetch('property-lookup', { address: addr, county: county });
    if (result.error) { toast('Lookup error: ' + result.error, 'error'); return; }

    // Check MLS matches first (best data)
    if (result.mls_matches && result.mls_matches.length > 0) {
      var mls = result.mls_matches[0];
      cmaShowEditableSubject(mls, null, 'Previous MLS Listing (' + (mls.standard_status || 'Unknown') + ')');
      return;
    }

    // Fall back to county records
    if (result.county_record) {
      var cr = result.county_record;
      cr.full_address = cr.full_address || addr;
      cr.county_or_parish = cr.county_or_parish || county;
      var countySource = (result.county_source || 'County Records') + (cr.owner ? ' | Owner: ' + cr.owner : '') + (cr.assessed_value ? ' | Assessed: $' + Number(cr.assessed_value).toLocaleString() : '');
      cmaShowEditableSubject(cr, null, countySource);
      toast('Found in ' + (result.county_source || 'county records') + '. Review and edit as needed.', 'success');
      return;
    }

    toast('No records found. Enter the details manually.', 'warning');
  } catch(e) { toast('Lookup failed: ' + e.message, 'error'); }
}

function cmaSubmitManual() {
  var addr = (document.getElementById('cmaManAddr').value || '').trim();
  var city = (document.getElementById('cmaManCity').value || '').trim();
  if (!addr || !city) { toast('Address and city are required', 'error'); return; }
  var notes = (document.getElementById('cmaManNotes') ? document.getElementById('cmaManNotes').value : '') || '';
  var listing = {
    listing_key: window._cmaPrefilledKey || ('manual_' + Date.now()),
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
    longitude: null,
    improvement_notes: notes
  };
  var features = window._cmaPrefilledTags || {};
  var constructionVal = document.getElementById('cmaManConstruction').value;
  if (constructionVal && constructionVal !== 'auto') {
    features.construction_type = constructionVal;
  }
  var conditionVal = parseInt(document.getElementById('cmaManCondition').value) || 0;
  if (conditionVal > 0) {
    features.condition_rating = conditionVal;
  }
  _cmaState.subject = { listing: listing, features: features };
  window._cmaPrefilledKey = null;
  window._cmaPrefilledTags = null;
  toast('Subject property set', 'success');
  cmaRenderStep1();
}

async function cmaSearchSubject(query) {
  var results = document.getElementById('cmaSubjectResults');
  if (!query || query.length < 2) { results.innerHTML = ''; return; }
  try {
    // Build fuzzy search: join words with wildcards so all must appear in order
    var words = query.trim().split(/\s+/).filter(function(w) { return w.length > 0; });
    var pattern = '*' + words.join('*') + '*';
    var resp = await _sb.from('mls_listings')
      .select('listing_key, full_address, city, county_or_parish, property_type, living_area, lot_size_acres, bedrooms_total, bathrooms_total_integer, year_built, list_price, close_price, close_date, standard_status, latitude, longitude, garage_spaces, property_sub_type, stories, public_remarks')
      .or('full_address.ilike.' + pattern + ',listing_id.ilike.*' + query.trim() + '*')
      .order('modification_timestamp', { ascending: false })
      .limit(10);
    if (resp.error) { console.error('[CMA] Search error:', resp.error); results.innerHTML = '<div class="cma-search-empty">Search error: ' + esc(resp.error.message) + '</div>'; return; }
    var data = resp.data || [];
    var html = '';
    if (data.length) {
      data.forEach(function(l) {
        var status = l.standard_status || '';
        var statusLower = status.toLowerCase();
        var priceStr = statusLower === 'closed' ? (l.close_price ? '$' + l.close_price.toLocaleString() : '') : (l.list_price ? '$' + l.list_price.toLocaleString() : '');
        var priceLabel = statusLower === 'closed' ? 'Sold' : 'List';
        html += '<div class="cma-search-item" onclick="cmaSelectSubject(\'' + l.listing_key + '\')">';
        html += '<div class="cma-search-item-main"><strong>' + esc(l.full_address || '') + '</strong>, ' + esc(l.city || '') + '</div>';
        html += '<div class="cma-search-item-meta">';
        html += '<span class="cma-status-badge cma-status-' + statusLower + '">' + status + '</span>';
        html += ' ' + esc(l.property_type || '') + ' | ' + (l.living_area ? l.living_area.toLocaleString() + ' sqft' : '') + ' | ' + (l.bedrooms_total || '?') + 'bd/' + (l.bathrooms_total_integer || '?') + 'ba';
        if (priceStr) html += ' | ' + priceLabel + ': ' + priceStr;
        if (statusLower === 'closed' && l.close_date) html += ' | ' + l.close_date;
        html += '</div></div>';
      });
      // Always show MLS API search option below local results
      html += '<div class="cma-search-footer">';
      html += '<button class="crm-btn crm-btn-sm cma-mls-lookup-btn" onclick="cmaMLSLookup(\'' + esc(query).replace(/'/g, "\\'") + '\')">Not seeing it? Search MLS API</button>';
      html += '</div>';
    } else {
      html += '<div class="cma-search-empty">No listings found locally for "' + esc(query) + '"';
      html += '<br><button class="crm-btn crm-btn-sm cma-mls-lookup-btn" onclick="cmaMLSLookup(\'' + esc(query).replace(/'/g, "\\'") + '\')">Search MLS API' + (cmaIsAddress(query) ? ' by Address' : '') + '</button>';
      html += '</div>';
    }
    results.innerHTML = html;
  } catch(e) { results.innerHTML = '<div class="cma-search-empty">Search error</div>'; }
}

// Detect if a query is an address (has a number followed by words) vs a listing ID
function cmaIsAddress(query) {
  // Listing IDs are typically numeric or alphanumeric codes (e.g. "4128593", "MLS12345")
  // Addresses start with a number followed by a street name (e.g. "123 Main St")
  return /^\d+\s+[a-zA-Z]/.test(query.trim()) && query.trim().split(/\s+/).length >= 2;
}

async function cmaMLSLookup(query) {
  // Always read current input value so we search what the user actually typed
  var searchInput = document.getElementById('cmaSubjectSearch');
  if (searchInput && searchInput.value.trim().length > 1) {
    query = searchInput.value.trim();
  }
  var results = document.getElementById('cmaSubjectResults');
  results.innerHTML = '<div class="cma-search-empty">Searching MLS API...</div>';
  try {
    // Detect address vs listing ID and send the right parameter
    var payload = {};
    if (cmaIsAddress(query)) {
      payload.address = query.trim();
    } else {
      payload.listing_id = query.trim();
    }
    var resp = await cmaFetch('lookup-listing', payload);
    if (!resp || resp.error) {
      results.innerHTML = '<div class="cma-search-empty">MLS API error: ' + esc(resp ? resp.error : 'Unknown') + '</div>';
      return;
    }
    if (resp.found === 0) {
      // Check if county records found the property
      if (resp.county_record) {
        var cr = resp.county_record;
        var countyHtml = '<div class="cma-search-empty">';
        countyHtml += 'Not found in MLS, but found in <strong>' + esc(resp.county_source || 'county records') + '</strong>:';
        countyHtml += '<div class="cma-search-item" style="margin:8px 0;cursor:pointer;" onclick="cmaUseCountyRecord()">';
        countyHtml += '<div class="cma-search-item-main"><strong>' + esc(cr.full_address || query) + '</strong>';
        if (cr.county_or_parish) countyHtml += ', ' + esc(cr.county_or_parish) + ' County';
        countyHtml += '</div>';
        countyHtml += '<div class="cma-search-item-meta">';
        var details = [];
        if (cr.living_area) details.push(Number(cr.living_area).toLocaleString() + ' sqft');
        if (cr.bedrooms_total) details.push(cr.bedrooms_total + 'bd');
        if (cr.bathrooms_total_integer) details.push(cr.bathrooms_total_integer + 'ba');
        if (cr.year_built) details.push('Built ' + cr.year_built);
        if (cr.lot_size_acres) details.push(parseFloat(cr.lot_size_acres).toFixed(2) + ' acres');
        if (details.length) countyHtml += details.join(' | ');
        if (cr.last_sale_price) countyHtml += ' | Last Sale: $' + Number(cr.last_sale_price).toLocaleString();
        if (cr.assessed_value) countyHtml += ' | Assessed: $' + Number(cr.assessed_value).toLocaleString();
        countyHtml += '</div></div>';
        countyHtml += '<button class="crm-btn crm-btn-sm" style="margin-top:4px;" onclick="cmaUseCountyRecord()">Use County Data as Subject</button>';
        countyHtml += ' <button class="crm-btn crm-btn-sm crm-btn-outline" style="margin-top:4px;" onclick="cmaShowManualEntry(\'' + esc(query).replace(/'/g, "\\'") + '\')">Enter Manually Instead</button>';
        countyHtml += '<br><span class="cma-search-hint" style="margin-top:8px;display:inline-block;">Tip: If you have the MLS #, search that instead for full listing data</span>';
        countyHtml += '</div>';
        // Store county record for use by cmaUseCountyRecord
        window._cmaCountyRecord = cr;
        window._cmaCountySource = resp.county_source;
        results.innerHTML = countyHtml;
        return;
      }

      var noResultHtml = '<div class="cma-search-empty">No listings found for "' + esc(query) + '"';
      // Show API diagnostics so we can see what happened
      if (resp.errors && resp.errors.length) {
        noResultHtml += '<br><span class="cma-search-hint" style="color:var(--danger,#e53935);">API errors: ' + resp.errors.map(esc).join(', ') + '</span>';
      }
      if (resp.apis_queried) {
        var skipped = Object.entries(resp.apis_queried)
          .filter(function(e) { return e[1] !== 'queried'; })
          .map(function(e) { return e[0] + ': ' + e[1]; });
        if (skipped.length) {
          noResultHtml += '<br><span class="cma-search-hint">APIs not queried: ' + skipped.map(esc).join(', ') + '</span>';
        }
      }
      // Tips for improving the search
      if (cmaIsAddress(query)) {
        noResultHtml += '<br><span class="cma-search-hint">Tip: Try the MLS # instead (e.g. "R26030605C") or add the city (e.g. "' + esc(query.trim()) + ', Sylva")</span>';
      } else {
        noResultHtml += '<br><span class="cma-search-hint">Tip: Try searching by address (e.g. "123 Main St, Franklin") or by MLS # (e.g. "R26030605C")</span>';
      }
      // Manual entry button
      noResultHtml += '<br><button class="crm-btn crm-btn-sm" style="margin-top:8px;" onclick="cmaShowManualEntry(\'' + esc(query).replace(/'/g, "\\'") + '\')">Enter Property Details Manually</button>';
      noResultHtml += '</div>';
      results.innerHTML = noResultHtml;
      return;
    }
    // Show results from API
    var html = '';
    (resp.results || []).forEach(function(l) {
      var statusLower = (l.standard_status || '').toLowerCase();
      var priceStr = l.close_price ? '$' + l.close_price.toLocaleString() : (l.list_price ? '$' + l.list_price.toLocaleString() : '');
      var priceLabel = statusLower === 'closed' ? 'Sold' : 'List';
      html += '<div class="cma-search-item" onclick="cmaSelectSubject(\'' + l.listing_key + '\')">';
      html += '<div class="cma-search-item-main"><strong>' + esc(l.full_address || '') + '</strong>, ' + esc(l.city || '') + ' <span class="cma-mls-source">(' + esc(l.source || 'MLS') + ')</span></div>';
      html += '<div class="cma-search-item-meta">';
      html += '<span class="cma-status-badge cma-status-' + statusLower + '">' + (l.standard_status || '') + '</span>';
      html += ' ' + (l.living_area ? l.living_area.toLocaleString() + ' sqft' : '') + ' | ' + (l.bedrooms_total || '?') + 'bd/' + (l.bathrooms_total_integer || '?') + 'ba';
      if (priceStr) html += ' | ' + priceLabel + ': ' + priceStr;
      if (l.close_date) html += ' | ' + l.close_date;
      html += '</div></div>';
    });
    results.innerHTML = html;
    toast('Found ' + resp.found + ' listing(s) from MLS API and saved to database', 'success');
  } catch(e) {
    results.innerHTML = '<div class="cma-search-empty">MLS API lookup failed</div>';
    console.error('[CMA] MLS lookup error:', e);
  }
}

// Detect construction type from raw MLS data (CAR_ConstructionType, BodyType, etc.)
function cmaDetectConstructionType(listing) {
  var raw = listing.raw_data || {};
  var yearBuilt = listing.year_built || 0;
  var subtype = (listing.property_sub_type || '').toLowerCase();

  // Check Canopy MLS fields
  var carConstruction = ((raw.CAR_ConstructionType || '') + '').toLowerCase();
  // Check CSAR/Navica fields
  var bodyType = (Array.isArray(raw.BodyType) ? raw.BodyType.join(' ') : (raw.BodyType || '')).toLowerCase();
  var structureType = (Array.isArray(raw.StructureType) ? raw.StructureType.join(' ') : (raw.StructureType || '')).toLowerCase();
  var archStyle = (Array.isArray(raw.ArchitecturalStyle) ? raw.ArchitecturalStyle.join(' ') : (raw.ArchitecturalStyle || '')).toLowerCase();
  var remarks = ((listing.public_remarks || '') + ' ' + (raw.PrivateRemarks || '')).toLowerCase();

  // Check for modular first (built to same codes as site-built)
  if (carConstruction.indexOf('modular') >= 0 || bodyType.indexOf('modular') >= 0 ||
      structureType.indexOf('modular') >= 0 || subtype.indexOf('modular') >= 0) {
    return 'modular';
  }
  // Check for manufactured/mobile/double-wide/single-wide
  if (carConstruction.indexOf('manufactured') >= 0 || carConstruction.indexOf('mobile') >= 0 ||
      bodyType.indexOf('double wide') >= 0 || bodyType.indexOf('single wide') >= 0 ||
      bodyType.indexOf('manufactured') >= 0 || bodyType.indexOf('mobile') >= 0 ||
      structureType.indexOf('manufactured') >= 0 || subtype.indexOf('manufactured') >= 0 ||
      subtype.indexOf('mobile') >= 0) {
    // Pre-1976 = mobile_home, post-1976 = manufactured
    return (yearBuilt > 0 && yearBuilt < 1976) ? 'mobile_home' : 'manufactured';
  }
  // Check remarks as last resort
  if (remarks.indexOf('double wide') >= 0 || remarks.indexOf('doublewide') >= 0 ||
      remarks.indexOf('single wide') >= 0 || remarks.indexOf('singlewide') >= 0 ||
      remarks.indexOf('manufactured home') >= 0) {
    return (yearBuilt > 0 && yearBuilt < 1976) ? 'mobile_home' : 'manufactured';
  }
  // Check for log construction
  // ConstructionMaterials (Canopy "Exterior Covering") and construction_materials column
  // IMPORTANT: "Log Siding" is NOT log construction (just veneer on stick-frame)
  var constMats = Array.isArray(raw.ConstructionMaterials) ? raw.ConstructionMaterials : [];
  var colMats = Array.isArray(listing.construction_materials) ? listing.construction_materials : [];
  var hasLogMaterial = constMats.concat(colMats).some(function(m) {
    return ((m || '') + '').toLowerCase().trim() === 'log';
  });
  if (hasLogMaterial || carConstruction.indexOf('log') >= 0 || archStyle.indexOf('log') >= 0 ||
      structureType.indexOf('log') >= 0) {
    return 'log';
  }
  return null; // Could not detect, leave for AI
}

async function cmaSelectSubject(listingKey) {
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
  // Auto-detect construction type from raw MLS data if tags don't have it
  if (!tags || !tags.construction_type || tags.construction_type === 'unknown') {
    var detected = cmaDetectConstructionType(listing);
    if (detected) {
      if (!tags) tags = {};
      tags.construction_type = detected;
      toast('Detected construction type: ' + detected.replace('_', ' '), 'info');
    }
  }
  // Pre-fill the editable form with MLS data instead of locking it in
  cmaShowEditableSubject(listing, tags, 'MLS Listing');
}

// Pre-fill the editable subject form from any source (MLS, county, manual)
function cmaShowEditableSubject(data, tags, source) {
  // Show the facts form
  var form = document.getElementById('cmaFactsForm');
  if (form) form.style.display = 'block';
  var searchResults = document.getElementById('cmaSubjectResults');
  if (searchResults) searchResults.innerHTML = '';

  // Update header
  var title = document.getElementById('cmaFactsTitle');
  var addr = data.full_address || data.address || '';
  if (title) title.innerHTML = 'Confirm Home Facts' + (addr ? ' for <strong>' + esc(addr) + '</strong>' : '');

  // Fill "Record Data" column (read-only reference) and input fields
  var setRecord = function(id, val) {
    var el = document.getElementById(id + '_record');
    if (el) el.textContent = (val != null && val !== '' && val !== 0) ? val : '\u2013';
  };
  var setVal = function(id, val) {
    var el = document.getElementById(id);
    if (el && val != null && val !== '') el.value = val;
  };

  // Populate record column
  setRecord('cmaManAddr', data.full_address || data.address);
  setRecord('cmaManCity', data.city);
  setRecord('cmaManCounty', data.county_or_parish);
  setRecord('cmaManType', data.property_type);
  setRecord('cmaManSubtype', data.property_sub_type);
  setRecord('cmaManBeds', data.bedrooms_total);
  setRecord('cmaManBaths', data.bathrooms_total_integer);
  setRecord('cmaManSqft', data.living_area ? data.living_area.toLocaleString() : '');
  setRecord('cmaManLot', data.lot_size_acres ? data.lot_size_acres + ' acres' : '');
  setRecord('cmaManGarage', data.garage_spaces);
  setRecord('cmaManYear', data.year_built);
  var priceVal = data.list_price || data.close_price || data.last_sale_price;
  setRecord('cmaManPrice', priceVal ? '$' + Number(priceVal).toLocaleString() : '');

  // Populate input fields
  setVal('cmaManAddr', data.full_address || data.address || '');
  setVal('cmaManCity', data.city || '');
  setVal('cmaManCounty', data.county_or_parish || '');
  setVal('cmaManSqft', data.living_area || '');
  setVal('cmaManLot', data.lot_size_acres || '');
  setVal('cmaManBeds', data.bedrooms_total || '');
  setVal('cmaManBaths', data.bathrooms_total_integer || '');
  setVal('cmaManYear', data.year_built || '');
  setVal('cmaManGarage', data.garage_spaces || '0');
  setVal('cmaManPrice', data.list_price || data.close_price || data.last_sale_price || '');
  if (data.property_type) setVal('cmaManType', data.property_type);
  if (data.property_sub_type) setVal('cmaManSubtype', data.property_sub_type);

  // Construction type from feature tags
  var constructionType = (tags && tags.construction_type) ? tags.construction_type : 'auto';
  setRecord('cmaManConstruction', constructionType === 'auto' || constructionType === 'unknown' ? 'Auto-detect' :
    constructionType === 'site_built' ? 'Site-Built' :
    constructionType === 'manufactured' ? 'Manufactured' :
    constructionType === 'modular' ? 'Modular' :
    constructionType === 'mobile_home' ? 'Mobile Home' :
    constructionType === 'log' ? 'Log' : constructionType);
  setVal('cmaManConstruction', constructionType === 'unknown' ? 'auto' : constructionType);

  // Condition rating from feature tags
  var conditionRating = (tags && tags.condition_rating) ? tags.condition_rating : 0;
  var condLabels = { 1: '1 - Tear Down', 2: '2 - Below Average', 3: '3 - Fair', 4: '4 - Above Average', 5: '5 - Pristine' };
  setRecord('cmaManCondition', conditionRating > 0 ? condLabels[conditionRating] || conditionRating + '/5' : 'Unknown');
  setVal('cmaManCondition', String(conditionRating || 0));

  // Show source badge
  var sourceEl = document.getElementById('cmaManSource');
  if (sourceEl) sourceEl.textContent = source + (data.listing_key ? ' (' + data.listing_key + ')' : '');
  var sourceDiv = document.getElementById('cmaManSourceWrap');
  if (sourceDiv) sourceDiv.style.display = source ? 'block' : 'none';

  // Highlight changed cells: listen for input changes
  form.querySelectorAll('.cma-facts-input, .cma-facts-select').forEach(function(input) {
    input.addEventListener('change', function() {
      var row = input.closest('tr');
      if (row) row.classList.add('cma-facts-changed');
    });
  });

  // Store the original listing key and tags
  window._cmaPrefilledKey = data.listing_key || null;
  window._cmaPrefilledTags = tags || null;

  toast('Loaded from ' + source + '. Review the facts and make any changes.', 'info');
}

function cmaSubjectCard(subject, opts) {
  opts = opts || {};
  var l = subject.listing;
  var f = subject.features || {};
  var editable = !opts.readonly;
  var html = '<div class="cma-subject-card" id="cmaSubjectCardEl">';

  // Header: address + edit button
  html += '<div class="cma-subject-header"><div><h4>' + esc(l.full_address || '') + '</h4><span class="cma-subject-city">' + esc((l.city || '') + ', ' + (l.county_or_parish || '')) + '</span></div>';
  if (editable) html += '<button class="cma-subject-edit-btn" onclick="cmaEditSubject()" title="Edit address, type, and construction details"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit All</button>';
  html += '</div>';

  // Type row (static display, use Edit All for changes)
  var ctLabel = f.construction_type && f.construction_type !== 'site_built' && f.construction_type !== 'unknown' ?
    ({ manufactured: ' (Manufactured)', modular: ' (Modular)', mobile_home: ' (Mobile Home)', log: ' (Log)' }[f.construction_type] || '') : '';
  html += '<div class="cma-subject-details">';
  html += '<div class="cma-detail-row"><span>Type</span><span>' + esc(l.property_type || '') + ctLabel + '</span></div>';

  // Editable detail rows
  if (editable) {
    html += cmaInlineDetail('Sqft', l.living_area, 'living_area', 'number', '', function(v) { return v ? Number(v).toLocaleString() : '--'; });
    html += cmaInlineDetail('Lot (acres)', l.lot_size_acres, 'lot_size_acres', 'number', '0.01', function(v) { return v ? v + ' ac' : '--'; });
    html += cmaInlineDetail('Beds', l.bedrooms_total, 'bedrooms_total', 'number', '1', function(v) { return v || '--'; });
    html += cmaInlineDetail('Baths', l.bathrooms_total_integer, 'bathrooms_total_integer', 'number', '0.5', function(v) { return v || '--'; });
    html += cmaInlineDetail('Year Built', l.year_built, 'year_built', 'number', '1', function(v) { return v || '--'; });
    html += cmaInlineDetail('List Price', l.list_price, 'list_price', 'number', '1000', function(v) { return v ? '$' + Number(v).toLocaleString() : '--'; });
  } else {
    html += '<div class="cma-detail-row"><span>Sqft</span><span>' + (l.living_area ? l.living_area.toLocaleString() : '--') + '</span></div>';
    html += '<div class="cma-detail-row"><span>Lot</span><span>' + (l.lot_size_acres ? l.lot_size_acres + ' ac' : '--') + '</span></div>';
    html += '<div class="cma-detail-row"><span>Bed/Bath</span><span>' + (l.bedrooms_total || '?') + '/' + (l.bathrooms_total_integer || '?') + '</span></div>';
    html += '<div class="cma-detail-row"><span>Year Built</span><span>' + (l.year_built || '--') + '</span></div>';
    html += '<div class="cma-detail-row"><span>List Price</span><span>$' + (l.list_price ? l.list_price.toLocaleString() : '--') + '</span></div>';
  }
  html += '</div>';

  // Mountain features: sliders if editable, static bars if readonly
  var hasFeatures = f.view_quality || f.water_quality || f.land_usability || f.road_noise || f.privacy_rating || f.condition_rating;
  if (editable || hasFeatures) {
    html += '<div class="cma-subject-features"><div class="cma-features-title">Mountain Features</div>';
    html += '<div class="cma-feature-ratings">';
    if (editable) {
      html += cmaFeatureSlider('View', 'view_quality', f.view_quality || 0);
      html += cmaFeatureSlider('Water', 'water_quality', f.water_quality || 0);
      html += cmaFeatureSlider('Land', 'land_usability', f.land_usability || 0);
      html += cmaFeatureSlider('Quiet', 'road_noise', f.road_noise || 0);
      html += cmaFeatureSlider('Privacy', 'privacy_rating', f.privacy_rating || 0);
      html += cmaFeatureSlider('Condition', 'condition_rating', f.condition_rating || 0);
    } else {
      html += cmaFeatureBar('View', f.view_quality);
      html += cmaFeatureBar('Water', f.water_quality);
      html += cmaFeatureBar('Land', f.land_usability);
      html += cmaFeatureBar('Quiet', f.road_noise);
      html += cmaFeatureBar('Privacy', f.privacy_rating);
      html += cmaFeatureBar('Condition', f.condition_rating);
    }
    html += '</div>';
    if (f.elevation_ft) html += '<div class="cma-feature-elev">Elevation: ' + f.elevation_ft.toLocaleString() + ' ft</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// Inline-editable detail row: shows formatted value, click to edit
function cmaInlineDetail(label, value, field, type, step, formatFn) {
  var raw = (value != null && value !== '') ? value : '';
  var display = formatFn ? formatFn(raw) : (raw || '--');
  return '<div class="cma-detail-row cma-detail-editable" data-field="' + field + '">' +
    '<span>' + label + '</span>' +
    '<span class="cma-inline-display" onclick="cmaInlineClick(this)"' +
    ' data-field="' + field + '" data-type="' + (type || 'text') + '"' +
    ' data-step="' + (step || '') + '" data-raw="' + esc(String(raw)) + '">' + display + '</span>' +
    '</div>';
}

function cmaInlineClick(el) {
  if (el.querySelector('input')) return;
  var field = el.dataset.field;
  var type = el.dataset.type;
  var step = el.dataset.step;
  var raw = el.dataset.raw;
  var origText = el.textContent;

  var input = document.createElement('input');
  input.className = 'cma-inline-input';
  input.type = type;
  input.value = raw;
  if (step) input.step = step;
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();

  var save = function() {
    var newVal = type === 'number' ? (parseFloat(input.value) || null) : (input.value || null);
    if (_cmaState.subject && _cmaState.subject.listing) {
      _cmaState.subject.listing[field] = newVal;
    }
    el.dataset.raw = newVal != null ? String(newVal) : '';
    // Re-format display
    var formatFns = {
      living_area: function(v) { return v ? Number(v).toLocaleString() : '--'; },
      lot_size_acres: function(v) { return v ? v + ' ac' : '--'; },
      list_price: function(v) { return v ? '$' + Number(v).toLocaleString() : '--'; },
      bedrooms_total: function(v) { return v || '--'; },
      bathrooms_total_integer: function(v) { return v || '--'; },
      year_built: function(v) { return v || '--'; }
    };
    var fn = formatFns[field];
    el.textContent = fn ? fn(newVal) : (newVal || '--');
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { el.textContent = origText; }
  });
}

// Feature slider for editable mountain features
// Hardcoded hex colors for slider gradients (CSS vars don't reliably work in inline backgrounds)
function _getSliderColors() {
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark ?
    { green: '#66BB6A', amber: '#FFD54F', red: '#EF5350', track: 'rgba(230,237,243,0.1)' } :
    { green: '#43A047', amber: '#F9A825', red: '#E53935', track: '#E2E6EC' };
}

function _cmaSliderHex(val) {
  var c = _getSliderColors();
  return val >= 4 ? c.green : val >= 3 ? c.amber : val >= 1 ? c.red : c.track;
}

function _cmaSliderBgStyle(val) {
  var pct = (val / 5) * 100;
  var color = _cmaSliderHex(val);
  var c = _getSliderColors();
  return 'background:linear-gradient(to right,' + color + ' ' + pct + '%,' + c.track + ' ' + pct + '%);--sl-color:' + color;
}

function cmaFeatureSlider(label, field, val) {
  val = parseInt(val) || 0;
  return '<div class="cma-feat-bar">' +
    '<span class="cma-feat-label">' + label + '</span>' +
    '<input type="range" class="cma-feat-slider" min="0" max="5" step="1" value="' + val + '"' +
    ' data-field="' + field + '"' +
    ' style="' + _cmaSliderBgStyle(val) + '" />' +
    '<span class="cma-feat-val" id="cmaFeatVal_' + field + '">' + (val > 0 ? val + '/5' : '--') + '</span>' +
    '</div>';
}

// Bind slider and inline-edit events via addEventListener (more reliable than inline handlers)
function cmaBindCardEvents() {
  var card = document.getElementById('cmaSubjectCardEl');
  if (!card) return;
  card.querySelectorAll('.cma-feat-slider').forEach(function(slider) {
    slider.addEventListener('input', function() {
      var field = slider.dataset.field;
      var val = parseInt(slider.value) || 0;
      var pct = (val / 5) * 100;
      var color = _cmaSliderHex(val);
      var c = _getSliderColors();
      slider.style.background = 'linear-gradient(to right,' + color + ' ' + pct + '%,' + c.track + ' ' + pct + '%)';
      slider.style.setProperty('--sl-color', color);
      var valEl = document.getElementById('cmaFeatVal_' + field);
      if (valEl) valEl.textContent = val > 0 ? val + '/5' : '--';
      if (_cmaState.subject) {
        if (!_cmaState.subject.features) _cmaState.subject.features = {};
        _cmaState.subject.features[field] = val > 0 ? val : null;
      }
    });
  });
}

// Open full facts form for complex edits (address, type, construction)
function cmaEditSubject() {
  if (!_cmaState.subject) return;
  var l = _cmaState.subject.listing;
  var f = _cmaState.subject.features || {};
  cmaShowEditableSubject(l, f, 'Editing');
  // Hide the card and its action buttons while editing
  var card = document.getElementById('cmaSubjectCardEl');
  if (card) {
    card.style.display = 'none';
    var next = card.nextElementSibling;
    if (next && next.classList.contains('cma-step-actions')) next.style.display = 'none';
  }
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

  var sub = _cmaState.subject.listing;
  var isManual = (sub.listing_key || '').startsWith('manual_');

  // Build filters from state (user can modify via filter bar)
  var filters = Object.assign({
    county: sub.county_or_parish || null,
    property_type: sub.property_type || null,
    max_distance_miles: 15
  }, _cmaState.filters);

  var payload = { filters: filters };
  if (isManual) {
    payload.listing_key = null;
    payload.manual_subject = sub;
  } else {
    payload.listing_key = sub.listing_key;
    // Send user-edited subject values so engine uses them instead of stale DB data
    payload.subject_overrides = {
      living_area: sub.living_area,
      bedrooms_total: sub.bedrooms_total,
      bathrooms_total_integer: sub.bathrooms_total_integer,
      year_built: sub.year_built,
      garage_spaces: sub.garage_spaces,
      lot_size_acres: sub.lot_size_acres,
      property_type: sub.property_type,
      property_sub_type: sub.property_sub_type,
      list_price: sub.list_price
    };
  }
  // Pass any user feature overrides (e.g. construction_type)
  if (_cmaState.subject.features && Object.keys(_cmaState.subject.features).length > 0) {
    payload.feature_overrides = _cmaState.subject.features;
  }

  var result = await cmaFetch('find-comps', payload);
  if (result.error) { toast('Error finding comps: ' + result.error, 'error'); return; }

  _cmaState.comps = (result.comps || []).map(function(c) {
    // Deselect price outliers by default
    c.selected = !c.is_price_outlier;
    return c;
  });
  // Limit to first 6 non-outlier comps selected
  var selCount = 0;
  _cmaState.comps.forEach(function(c) {
    if (c.selected) {
      if (selCount >= 6) c.selected = false;
      else selCount++;
    }
  });
  if (result.outliers_detected) {
    toast(result.outliers_detected + ' price outlier(s) detected and deselected', 'info');
  }
  cmaRenderStep2();
}

function cmaRenderStep2() {
  var main = document.getElementById('crmMain');
  var sub = _cmaState.subject.listing;
  var html = '<div class="cma-wizard">';
  html += cmaStepIndicator(2);
  html += '<div class="cma-step-content">';
  html += '<h3 class="cma-step-title">Select Comparables</h3>';
  html += '<p class="cma-step-desc">AI-ranked by similarity. Select up to 6 comps for your analysis.</p>';

  // ── Filter bar ──
  var curCity = _cmaState.filters.city || '';
  var curExclude = (_cmaState.filters.exclude_cities || []).join(', ');
  var curDist = _cmaState.filters.max_distance_miles || 15;
  var curMonths = 12;
  if (_cmaState.filters.min_close_date) {
    var daysBack = Math.round((Date.now() - new Date(_cmaState.filters.min_close_date).getTime()) / 86400000);
    curMonths = Math.round(daysBack / 30);
  }
  html += '<div class="cma-filter-bar">';
  html += '<div class="cma-filter-group"><label class="crm-form-label">City (match)</label><input class="crm-input cma-filter-input" id="cmaFilterCity" value="' + esc(curCity) + '" placeholder="e.g. Franklin" /></div>';
  html += '<div class="cma-filter-group"><label class="crm-form-label">Exclude cities</label><input class="crm-input cma-filter-input" id="cmaFilterExclude" value="' + esc(curExclude) + '" placeholder="e.g. Highlands, Cashiers" /></div>';
  html += '<div class="cma-filter-group"><label class="crm-form-label">Max distance (mi)</label><input class="crm-input cma-filter-input" id="cmaFilterDist" type="number" value="' + curDist + '" min="1" max="50" /></div>';
  html += '<div class="cma-filter-group"><label class="crm-form-label">Sold within</label><select class="crm-select cma-filter-input" id="cmaFilterMonths"><option value="6"' + (curMonths <= 6 ? ' selected' : '') + '>6 months</option><option value="12"' + (curMonths > 6 && curMonths <= 12 ? ' selected' : '') + '>12 months</option><option value="18"' + (curMonths > 12 && curMonths <= 18 ? ' selected' : '') + '>18 months</option><option value="24"' + (curMonths > 18 ? ' selected' : '') + '>24 months</option></select></div>';
  html += '<div class="cma-filter-group cma-filter-action"><button class="crm-btn crm-btn-secondary" onclick="cmaApplyFilters()">Re-search</button></div>';
  html += '</div>';

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
    html += '<div class="cma-comp-thumb" id="cmaCompThumb_' + i + '" onclick="event.stopPropagation()"><div class="cma-comp-thumb-empty">Loading...</div></div>';
    html += '<div class="cma-comp-info">';
    // Row 1: Address + price
    html += '<div class="cma-comp-addr">' + esc(l.full_address || '') + ', ' + esc(l.city || '');
    if (c.is_price_outlier) html += ' <span class="cma-outlier-badge" title="Sale price is significantly different from other comps in this group">&#9888; Price Outlier</span>';
    html += '</div>';
    // Row 2: Key listing facts
    html += '<div class="cma-comp-meta">';
    html += '<span class="cma-meta-price">$' + (l.close_price ? l.close_price.toLocaleString() : '--') + '</span>';
    html += '<span>' + (l.close_date || '--') + '</span>';
    html += '<span>' + (l.living_area ? l.living_area.toLocaleString() + ' sqft' : '--') + '</span>';
    html += '<span>' + (l.lot_size_acres || '--') + ' ac</span>';
    html += '<span>' + (l.bedrooms_total || '?') + 'bd/' + (l.bathrooms_total_integer || '?') + 'ba</span>';
    html += '<span>Built ' + (l.year_built || '--') + '</span>';
    html += '<span>' + (l.garage_spaces || 0) + ' gar</span>';
    if (c.distance != null) html += '<span>' + c.distance + ' mi</span>';
    html += '</div>';
    // Row 3: Mountain features + structural
    html += '<div class="cma-comp-features-mini">';
    if (f) {
      if (f.view_quality) html += '<span class="cma-feat-chip">View ' + f.view_quality + '/5</span>';
      if (f.water_quality) html += '<span class="cma-feat-chip">Water ' + f.water_quality + '/5</span>';
      if (f.land_usability) html += '<span class="cma-feat-chip">Land ' + f.land_usability + '/5</span>';
      if (f.road_noise) html += '<span class="cma-feat-chip">Quiet ' + f.road_noise + '/5</span>';
      if (f.privacy_rating) html += '<span class="cma-feat-chip">Privacy ' + f.privacy_rating + '/5</span>';
      if (f.condition_rating) html += '<span class="cma-feat-chip">Cond ' + f.condition_rating + '/5</span>';
      if (f.elevation_ft) html += '<span class="cma-feat-chip">' + f.elevation_ft + ' ft</span>';
      if (f.restriction_status === 'unrestricted') html += '<span class="cma-feat-chip cma-chip-good">Unrestricted</span>';
      else if (f.restriction_status === 'restricted') html += '<span class="cma-feat-chip cma-chip-neutral">Restricted</span>';
      if (f.has_pool) html += '<span class="cma-feat-chip">Pool</span>';
      if (f.basement_type && f.basement_type !== 'none') html += '<span class="cma-feat-chip">Basement</span>';
      if (f.has_fireplace) html += '<span class="cma-feat-chip">Fireplace</span>';
      if (f.outbuilding_value_tier && f.outbuilding_value_tier > 0) html += '<span class="cma-feat-chip">Outbuildings</span>';
    }
    // Construction type - always show, infer from features or listing property_sub_type
    var compCT = (f && f.construction_type && f.construction_type !== 'unknown') ? f.construction_type : null;
    if (!compCT) {
      var pst = ((l.property_sub_type || '') + '').toLowerCase();
      if (pst.includes('manufactured') || pst.includes('mobile')) compCT = 'manufactured';
      else if (pst.includes('modular')) compCT = 'modular';
      else compCT = 'site_built';
    }
    var ctAllLabels = { site_built: 'Site-Built', manufactured: 'Manufactured', modular: 'Modular', mobile_home: 'Mobile Home', log: 'Log' };
    var ctClass = (compCT === 'site_built') ? '' : ' cma-chip-neutral';
    html += '<span class="cma-feat-chip' + ctClass + '">' + (ctAllLabels[compCT] || compCT) + '</span>';
    html += '</div>';
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
  cmaLoadStep2Thumbs();
}

// Load thumbnails for Step 2 comp cards
async function cmaLoadStep2Thumbs() {
  var comps = _cmaState.comps || [];
  comps.forEach(function(c, i) {
    if (c.listing && c.listing.listing_key) {
      cmaLoadCompThumb(c.listing.listing_key, i, c.listing);
    }
  });
}

async function cmaLoadCompThumb(listingKey, compIdx, listing) {
  var el = document.getElementById('cmaCompThumb_' + compIdx);
  if (!el) return;
  try {
    var resp = await _sb.from('mls_media').select('local_url,media_url').eq('listing_key', listingKey).order('order', { ascending: true }).limit(30);
    var photos = (resp.data || []).map(function(p) { return p.local_url || p.media_url; }).filter(Boolean);
    if (photos.length) {
      el.innerHTML = '<img src="' + esc(photos[0]) + '" alt="Property photo" class="cma-comp-thumb-img" onerror="this.onerror=null;this.style.display=\'none\';this.parentElement.innerHTML=\'<div class=cma-comp-thumb-empty>Photo expired</div>\'" />';
      el.dataset.photos = JSON.stringify(photos);
      el.dataset.listingKey = listingKey;
      el.dataset.compIdx = compIdx;
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        cmaOpenCompDetail(listingKey, JSON.parse(el.dataset.photos), listing);
      });
    } else {
      el.innerHTML = '<div class="cma-comp-thumb-empty">No photo</div>';
    }
  } catch(e) {
    el.innerHTML = '<div class="cma-comp-thumb-empty">No photo</div>';
  }
}

// Property detail overlay with gallery + description
function cmaOpenCompDetail(listingKey, photos, listing) {
  var idx = 0;
  var overlay = document.createElement('div');
  overlay.className = 'crm-modal-overlay cma-detail-overlay';
  overlay.style.zIndex = '500';

  // Fetch public remarks if not on listing object (might be truncated)
  var remarks = listing.public_remarks || '';

  function render() {
    var l = listing;
    var html = '<div class="cma-detail-modal">';
    html += '<button class="cma-detail-close" onclick="this.closest(\'.cma-detail-overlay\').remove()">&times;</button>';

    // Photo gallery section
    if (photos.length) {
      html += '<div class="cma-detail-gallery">';
      html += '<div class="cma-detail-stage">';
      if (photos.length > 1) html += '<button class="cma-photo-nav cma-photo-prev">&lsaquo;</button>';
      html += '<img src="' + esc(photos[idx]) + '" class="cma-detail-main-img" onerror="this.onerror=null;this.src=\'\';this.alt=\'Photo unavailable\';this.style.background=\'#333\';this.style.minHeight=\'200px\'" />';
      if (photos.length > 1) html += '<button class="cma-photo-nav cma-photo-next">&rsaquo;</button>';
      html += '</div>';
      html += '<div class="cma-detail-counter">' + (idx + 1) + ' / ' + photos.length + '</div>';
      if (photos.length > 1) {
        html += '<div class="cma-photo-strip">';
        photos.forEach(function(p, i) {
          html += '<img src="' + esc(p) + '" class="cma-photo-thumb' + (i === idx ? ' active' : '') + '" data-idx="' + i + '" onerror="this.onerror=null;this.style.background=\'#555\';this.alt=\'N/A\'" />';
        });
        html += '</div>';
      }
      html += '</div>';
    }

    // Property info section
    html += '<div class="cma-detail-info">';
    html += '<h3 class="cma-detail-addr">' + esc(l.full_address || 'Unknown') + ', ' + esc(l.city || '') + '</h3>';
    html += '<div class="cma-detail-facts">';
    html += '<span class="cma-detail-price">$' + (l.close_price ? l.close_price.toLocaleString() : '--') + '</span>';
    html += '<span>Sold ' + (l.close_date || '--') + '</span>';
    html += '<span>' + (l.living_area ? l.living_area.toLocaleString() + ' sqft' : '--') + '</span>';
    html += '<span>' + (l.lot_size_acres || '--') + ' ac</span>';
    html += '<span>' + (l.bedrooms_total || '?') + 'bd / ' + (l.bathrooms_total_integer || '?') + 'ba</span>';
    html += '<span>Built ' + (l.year_built || '--') + '</span>';
    if (l.garage_spaces) html += '<span>' + l.garage_spaces + ' garage</span>';
    html += '</div>';

    // Description
    if (remarks) {
      html += '<div class="cma-detail-remarks">';
      html += '<h4>Property Description</h4>';
      html += '<p>' + esc(remarks) + '</p>';
      html += '</div>';
    }

    html += '</div></div>';
    overlay.innerHTML = html;

    // Bind nav
    var prev = overlay.querySelector('.cma-photo-prev');
    var next = overlay.querySelector('.cma-photo-next');
    if (prev) prev.addEventListener('click', function(e) { e.stopPropagation(); idx = (idx - 1 + photos.length) % photos.length; render(); });
    if (next) next.addEventListener('click', function(e) { e.stopPropagation(); idx = (idx + 1) % photos.length; render(); });
    overlay.querySelectorAll('.cma-photo-thumb').forEach(function(t) {
      t.addEventListener('click', function(e) { e.stopPropagation(); idx = parseInt(t.dataset.idx); render(); });
    });
  }

  render();

  // If no remarks on listing object, try fetching from DB
  if (!remarks && listingKey) {
    _sb.from('mls_listings').select('public_remarks').eq('listing_key', listingKey).maybeSingle().then(function(resp) {
      if (resp.data && resp.data.public_remarks) {
        remarks = resp.data.public_remarks;
        listing.public_remarks = remarks; // cache it
        render();
      }
    });
  }

  // Close on backdrop click
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  // Close on Escape
  var escHandler = function(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
  var keyHandler = function(e) {
    if (!document.body.contains(overlay)) { document.removeEventListener('keydown', keyHandler); return; }
    if (e.key === 'ArrowLeft') { idx = (idx - 1 + photos.length) % photos.length; render(); }
    if (e.key === 'ArrowRight') { idx = (idx + 1) % photos.length; render(); }
  };
  document.addEventListener('keydown', escHandler);
  document.addEventListener('keydown', keyHandler);
  document.body.appendChild(overlay);
}

function cmaApplyFilters() {
  var city = (document.getElementById('cmaFilterCity').value || '').trim();
  var excludeRaw = (document.getElementById('cmaFilterExclude').value || '').trim();
  var dist = parseInt(document.getElementById('cmaFilterDist').value) || 15;
  var months = parseInt(document.getElementById('cmaFilterMonths').value) || 12;
  var excludeCities = excludeRaw ? excludeRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  var dateFloor = new Date(Date.now() - months * 30 * 86400000).toISOString().split('T')[0];

  _cmaState.filters = {};
  if (city) _cmaState.filters.city = city;
  if (excludeCities.length) _cmaState.filters.exclude_cities = excludeCities;
  if (dist !== 15) _cmaState.filters.max_distance_miles = dist;
  if (months !== 12) _cmaState.filters.min_close_date = dateFloor;

  cmaGoStep2();
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
  // Initialize comp condition ratings and value overrides from AI-extracted features
  _cmaState.compConditions = {};
  _cmaState.compOverrides = {};
  _cmaState.selectedComps.forEach(function(c, i) {
    var cf = c.features || {};
    _cmaState.compConditions[i] = cf.condition_rating || 3; // Default to 3 (Fair for Age)
    _cmaState.compOverrides[i] = {};
  });
  // Calculate construction type adjustment (not in engine, client-side only)
  cmaInitConstructionAdj();
  cmaRenderStep3();
}

function cmaRenderStep3() {
  // Ensure client-side adjustments are calculated (engine may not have features data)
  cmaInitConstructionAdj();
  cmaInitConditionAdj();
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
  html += '<div class="cma-grid-scroll" id="cmaAdjGrid"><table class="cma-grid">';

  // Header row with photo thumbnails
  html += '<thead><tr><th class="cma-grid-label">Feature</th><th class="cma-grid-subject"><div class="cma-grid-comp-photo" id="cmaSubjectPhoto"></div>Subject</th>';
  comps.forEach(function(c, i) {
    html += '<th class="cma-grid-comp"><div class="cma-grid-comp-photo" id="cmaCompPhoto_' + i + '"></div>Comp ' + (i+1) + '<br><span class="cma-grid-comp-addr">' + esc((c.listing.full_address || '').split(',')[0]) + '</span>';
    html += '<button class="cma-replace-comp-btn" onclick="cmaOpenCompSearch(' + i + ')" title="Replace this comp">&#8635; Replace</button>';
    html += '</th>';
  });
  html += '</tr></thead><tbody>';

  // Sale Price row
  html += '<tr class="cma-grid-row-price"><td>Sale Price</td><td>' + (s.list_price ? '$' + s.list_price.toLocaleString() : '--') + '</td>';
  adjs.forEach(function(a) { html += '<td>$' + a.sale_price.toLocaleString() + '</td>'; });
  html += '</tr>';

  // Standard adjustment rows with editable comp values
  var subRestrictionStatus = (sf.restriction_status || 'unknown');
  var subRestrictionLabel = subRestrictionStatus === 'unrestricted' ? 'Unrestricted' : subRestrictionStatus === 'restricted' ? 'Restricted' : '--';
  var restrictionOpts = [
    { value: 'unknown', label: 'Unknown' },
    { value: 'unrestricted', label: 'Unrestricted' },
    { value: 'restricted', label: 'Restricted' }
  ];

  // Infer subject construction type
  var subCT = sf.construction_type || 'unknown';
  if (subCT === 'unknown') {
    var pst = ((s.property_sub_type || '') + '').toLowerCase();
    if (pst.includes('manufactured') || pst.includes('mobile')) subCT = 'manufactured';
    else if (pst.includes('modular')) subCT = 'modular';
    else subCT = 'site_built';
  }
  var ctLabels = { site_built: 'Site-Built', manufactured: 'Manufactured', modular: 'Modular', log: 'Log', mobile_home: 'Mobile Home', unknown: 'Unknown' };
  var ctOpts = [
    { value: 'site_built', label: 'Site-Built' },
    { value: 'manufactured', label: 'Manufactured' },
    { value: 'modular', label: 'Modular' },
    { value: 'log', label: 'Log' },
    { value: 'mobile_home', label: 'Mobile Home' }
  ];

  var stdRows = [
    { key: 'adj_living_area', label: 'Living Area', subVal: s.living_area ? s.living_area.toLocaleString() + ' sqft' : '--', field: 'living_area', unit: 'sqft', step: 10 },
    { key: 'adj_lot_size', label: 'Lot Size', subVal: s.lot_size_acres ? s.lot_size_acres + ' ac' : '--', field: 'lot_size_acres', unit: 'ac', step: 0.1 },
    { key: 'adj_bedrooms', label: 'Bedrooms', subVal: s.bedrooms_total || '--', field: 'bedrooms_total', unit: '', step: 1 },
    { key: 'adj_bathrooms', label: 'Bathrooms', subVal: s.bathrooms_total_integer || '--', field: 'bathrooms_total_integer', unit: '', step: 1 },
    { key: 'adj_garage', label: 'Garage', subVal: s.garage_spaces || '0', field: 'garage_spaces', unit: '', step: 1 },
    { key: 'adj_year_built', label: 'Year Built', subVal: s.year_built || '--', field: 'year_built', unit: '', step: 1 },
  ];

  html += '<tr class="cma-grid-section"><td colspan="' + (comps.length + 2) + '">Standard Adjustments</td></tr>';
  stdRows.forEach(function(row) {
    html += '<tr><td>' + row.label + '</td><td class="cma-grid-subject-val">' + row.subVal + '</td>';
    adjs.forEach(function(a, ci) {
      var rawVal = cmaGetCompVal(ci, row.field);
      var adjVal = a.adjustments[row.key] || 0;
      html += '<td class="cma-grid-adj-cell">';
      html += cmaCompValInput(ci, row.field, row.key, rawVal != null ? rawVal : '', row.step, row.unit);
      html += cmaAdjInput(ci, row.key, adjVal);
      html += '</td>';
    });
    html += '</tr>';
  });

  // Restriction row (dropdown)
  html += '<tr><td>Restrictions</td><td class="cma-grid-subject-val">' + subRestrictionLabel + '</td>';
  adjs.forEach(function(a, ci) {
    var cf = comps[ci].features || {};
    var compR = cmaGetCompVal(ci, 'restriction_status') || cf.restriction_status || 'unknown';
    var adjVal = a.adjustments.adj_restrictions || 0;
    html += '<td class="cma-grid-adj-cell">';
    html += cmaCompValSelect(ci, 'restriction_status', 'adj_restrictions', compR, restrictionOpts);
    html += cmaAdjInput(ci, 'adj_restrictions', adjVal);
    html += '</td>';
  });
  html += '</tr>';

  // Construction type row (dropdown)
  html += '<tr><td>Construction</td><td class="cma-grid-subject-val">' + (ctLabels[subCT] || subCT) + '</td>';
  adjs.forEach(function(a, ci) {
    var cf = comps[ci].features || {};
    var compCT = cmaGetCompVal(ci, 'construction_type') || cf.construction_type || 'unknown';
    if (compCT === 'unknown') {
      var cpst = ((comps[ci].listing.property_sub_type || '') + '').toLowerCase();
      if (cpst.includes('manufactured') || cpst.includes('mobile')) compCT = 'manufactured';
      else if (cpst.includes('modular')) compCT = 'modular';
      else compCT = 'site_built';
    }
    var adjVal = a.adjustments.adj_construction_type || 0;
    html += '<td class="cma-grid-adj-cell">';
    html += cmaCompValSelect(ci, 'construction_type', 'adj_construction_type', compCT, ctOpts);
    html += cmaAdjInput(ci, 'adj_construction_type', adjVal);
    html += '</td>';
  });
  html += '</tr>';

  // Structural feature rows with editable inputs
  var basementOpts = [
    { value: 'none', label: 'None' },
    { value: 'crawl_space', label: 'Crawl Space' },
    { value: 'unfinished', label: 'Unfinished' },
    { value: 'partial', label: 'Partial' },
    { value: 'finished', label: 'Finished' }
  ];
  var poolOpts = [
    { value: 'none', label: 'None' },
    { value: 'in_ground', label: 'In-Ground' },
    { value: 'above_ground', label: 'Above-Ground' }
  ];
  var outbldgOpts = [
    { value: '0', label: 'None' },
    { value: '1', label: 'Tier 1 (small)' },
    { value: '2', label: 'Tier 2 (med)' },
    { value: '3', label: 'Tier 3 (large)' }
  ];

  html += '<tr class="cma-grid-section"><td colspan="' + (comps.length + 2) + '">Structural Features</td></tr>';

  // Pool row
  html += '<tr><td>Pool</td><td class="cma-grid-subject-val">' + (sf.has_pool ? (sf.pool_type || 'Yes').replace(/_/g, ' ') : 'None') + '</td>';
  adjs.forEach(function(a, ci) {
    var cf = comps[ci].features || {};
    var compPool = cmaGetCompVal(ci, 'pool_type') || (cf.has_pool ? (cf.pool_type || 'in_ground') : 'none');
    html += '<td class="cma-grid-adj-cell">';
    html += cmaCompValSelect(ci, 'pool_type', 'adj_pool', compPool, poolOpts);
    html += cmaAdjInput(ci, 'adj_pool', a.adjustments.adj_pool || 0);
    html += '</td>';
  });
  html += '</tr>';

  // Basement row
  html += '<tr><td>Basement</td><td class="cma-grid-subject-val">' + (sf.basement_type && sf.basement_type !== 'none' ? sf.basement_type.replace(/_/g, ' ') : 'None') + '</td>';
  adjs.forEach(function(a, ci) {
    var cf = comps[ci].features || {};
    var compBsmt = cmaGetCompVal(ci, 'basement_type') || cf.basement_type || 'none';
    html += '<td class="cma-grid-adj-cell">';
    html += cmaCompValSelect(ci, 'basement_type', 'adj_basement', compBsmt, basementOpts);
    html += cmaAdjInput(ci, 'adj_basement', a.adjustments.adj_basement || 0);
    html += '</td>';
  });
  html += '</tr>';

  // Fireplace row
  html += '<tr><td>Fireplace</td><td class="cma-grid-subject-val">' + (sf.has_fireplace ? (sf.fireplace_count || 1) + 'x' : 'None') + '</td>';
  adjs.forEach(function(a, ci) {
    var cf = comps[ci].features || {};
    var compFP = cmaGetCompVal(ci, 'fireplace_count');
    if (compFP == null) compFP = cf.has_fireplace ? (cf.fireplace_count || 1) : 0;
    html += '<td class="cma-grid-adj-cell">';
    html += cmaCompValInput(ci, 'fireplace_count', 'adj_fireplace', compFP, 1, 'x', ' min="0" max="5"');
    html += cmaAdjInput(ci, 'adj_fireplace', a.adjustments.adj_fireplace || 0);
    html += '</td>';
  });
  html += '</tr>';

  // Covered outdoor row
  html += '<tr><td>Covered Outdoor</td><td class="cma-grid-subject-val">' + (sf.covered_outdoor_sqft ? sf.covered_outdoor_sqft + ' sqft' : '--') + '</td>';
  adjs.forEach(function(a, ci) {
    var cf = comps[ci].features || {};
    var compOD = cmaGetCompVal(ci, 'covered_outdoor_sqft');
    if (compOD == null) compOD = cf.covered_outdoor_sqft || 0;
    html += '<td class="cma-grid-adj-cell">';
    html += cmaCompValInput(ci, 'covered_outdoor_sqft', 'adj_covered_outdoor', compOD, 50, 'sqft', ' min="0"');
    html += cmaAdjInput(ci, 'adj_covered_outdoor', a.adjustments.adj_covered_outdoor || 0);
    html += '</td>';
  });
  html += '</tr>';

  // Outbuildings row
  html += '<tr><td>Outbuildings</td><td class="cma-grid-subject-val">' + (sf.outbuilding_value_tier ? 'Tier ' + sf.outbuilding_value_tier : 'None') + '</td>';
  adjs.forEach(function(a, ci) {
    var cf = comps[ci].features || {};
    var compOB = cmaGetCompVal(ci, 'outbuilding_value_tier');
    if (compOB == null) compOB = cf.outbuilding_value_tier || 0;
    html += '<td class="cma-grid-adj-cell">';
    html += cmaCompValSelect(ci, 'outbuilding_value_tier', 'adj_outbuildings', '' + compOB, outbldgOpts);
    html += cmaAdjInput(ci, 'adj_outbuildings', a.adjustments.adj_outbuildings || 0);
    html += '</td>';
  });
  html += '</tr>';

  // Mountain adjustment rows with editable comp ratings + sliders
  var mtnRows = [
    { key: 'adj_view', label: 'View Quality', subVal: sf.view_quality ? sf.view_quality + '/5' : '--', field: 'view_quality', isRating: true },
    { key: 'adj_water_features', label: 'Water Features', subVal: sf.water_quality ? sf.water_quality + '/5' : '--', field: 'water_quality', isRating: true },
    { key: 'adj_land_character', label: 'Land Character', subVal: sf.land_usability ? sf.land_usability + '/5' : '--', field: 'land_usability', isRating: true },
    { key: 'adj_road_noise', label: 'Road Noise', subVal: sf.road_noise ? sf.road_noise + '/5' : '--', field: 'road_noise', isRating: true },
    { key: 'adj_privacy', label: 'Privacy', subVal: sf.privacy_rating ? sf.privacy_rating + '/5' : '--', field: 'privacy_rating', isRating: true },
    { key: 'adj_elevation', label: 'Elevation', subVal: sf.elevation_ft ? sf.elevation_ft + ' ft' : '--', field: 'elevation_ft', isRating: false },
  ];

  html += '<tr class="cma-grid-section"><td colspan="' + (comps.length + 2) + '">Mountain Adjustments</td></tr>';
  mtnRows.forEach(function(row) {
    html += '<tr><td>' + row.label + '</td><td class="cma-grid-subject-val">' + row.subVal + '</td>';
    adjs.forEach(function(a, ci) {
      var cf = comps[ci].features || {};
      var compVal = cmaGetCompVal(ci, row.field);
      if (compVal == null) compVal = cf[row.field] || 0;
      var adjVal = a.adjustments[row.key] || 0;
      html += '<td class="cma-grid-adj-cell">';
      if (row.isRating) {
        html += cmaCompValInput(ci, row.field, row.key, compVal, 1, '/5', ' min="0" max="5"');
      } else {
        html += cmaCompValInput(ci, row.field, row.key, compVal, 100, 'ft', ' min="0"');
      }
      html += cmaSlider(ci, row.key, adjVal, row.field, sf, cf);
      html += '</td>';
    });
    html += '</tr>';
  });

  // Condition row with explicit 1-5 dropdown per comp
  var subCond = sf.condition_rating || 0;
  var condLabels = { 0: 'Unknown', 1: '1 - Tear Down', 2: '2 - Below Avg', 3: '3 - Fair', 4: '4 - Above Avg', 5: '5 - Pristine' };
  html += '<tr><td>Condition</td><td class="cma-grid-subject-val">' + (subCond > 0 ? condLabels[subCond] || subCond + '/5' : '--') + '</td>';
  adjs.forEach(function(a, ci) {
    var cf = comps[ci].features || {};
    var compCond = (_cmaState.compConditions && _cmaState.compConditions[ci] != null) ? _cmaState.compConditions[ci] : (cf.condition_rating || 3);
    if (!_cmaState.compConditions) _cmaState.compConditions = {};
    if (_cmaState.compConditions[ci] == null) _cmaState.compConditions[ci] = compCond;
    var adjVal = a.adjustments.adj_condition || 0;
    html += '<td class="cma-grid-adj-cell">';
    html += '<div class="cma-condition-row">';
    html += '<select class="cma-condition-select" data-comp="' + ci + '">';
    for (var cv = 0; cv <= 5; cv++) {
      html += '<option value="' + cv + '"' + (cv === compCond ? ' selected' : '') + '>' + condLabels[cv] + '</option>';
    }
    html += '</select>';
    html += cmaAdjInput(ci, 'adj_condition', adjVal);
    html += '</div>';
    html += '</td>';
  });
  html += '</tr>';

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
  adjs.forEach(function(a, i) {
    var cls = a.total_adjustment >= 0 ? 'cma-adj-pos' : 'cma-adj-neg';
    html += '<td class="' + cls + '" id="cmaCompNet_' + i + '">' + (a.total_adjustment >= 0 ? '+' : '') + '$' + a.total_adjustment.toLocaleString() + ' (' + a.net_adjustment_pct + '% net)</td>';
  });
  html += '</tr>';

  html += '<tr class="cma-grid-total cma-grid-adjusted"><td>Adjusted Price</td><td></td>';
  adjs.forEach(function(a, i) {
    var cls = a.total_adjustment > 0 ? ' cma-adj-pos' : a.total_adjustment < 0 ? ' cma-adj-neg' : '';
    html += '<td id="cmaCompTotal_' + i + '" class="cma-comp-adjusted-val' + cls + '">$' + a.adjusted_price.toLocaleString() + '</td>';
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
    html += '<div class="cma-val-range" id="cmaValuationRange">$' + (v.suggested_low || 0).toLocaleString() + ' - $' + (v.suggested_high || 0).toLocaleString() + '</div>';
    html += '<div class="cma-val-center">Center: <span id="cmaValuationSuggested">$' + v.suggested_price.toLocaleString() + '</span></div>';
    html += '</div>';
  }

  // Actions
  html += '<div class="cma-step-actions">';
  html += '<button class="crm-btn crm-btn-secondary" onclick="cmaGoToStep(2)">Back</button>';
  html += '<button class="crm-btn crm-btn-secondary" onclick="cmaRecalculate()">Recalculate</button>';
  html += '<button class="crm-btn crm-btn-primary" onclick="cmaGoStep4()">Get AI Advice & Review</button>';
  html += '</div>';
  html += '</div></div>';
  main.innerHTML = html;
  cmaBindAdjustmentEvents();
  cmaLoadGridPhotos();
  cmaCheckReplacementSuggestions();
}

// Check for threshold violations and suggest replacements (async, non-blocking)
async function cmaCheckReplacementSuggestions() {
  if (!_cmaState.adjustments || !_cmaState.adjustments.length) return;
  if (!_cmaState.replacementDismissed) _cmaState.replacementDismissed = {};
  if (!_cmaState.replacementSuggestions) _cmaState.replacementSuggestions = {};

  // Find flagged comps (gross > 25% or net > 15%)
  var flagged = [];
  _cmaState.adjustments.forEach(function(adj, i) {
    if (_cmaState.replacementDismissed[i]) return;
    if (adj.gross_adjustment_pct > 25 || adj.net_adjustment_pct > 15) {
      flagged.push(i);
    }
  });

  if (flagged.length === 0) return;

  // Fetch available comps if not cached
  if (!_cmaSearchCache) {
    var sub = _cmaState.subject.listing;
    var isManual = (sub.listing_key || '').startsWith('manual_');
    var payload = {
      filters: Object.assign({
        county: sub.county_or_parish || null,
        property_type: sub.property_type || null,
        max_distance_miles: 15,
        limit: 20
      }, _cmaState.filters || {})
    };
    if (isManual) { payload.listing_key = null; payload.manual_subject = sub; }
    else { payload.listing_key = sub.listing_key; }
    if (_cmaState.subject.features && Object.keys(_cmaState.subject.features).length > 0) {
      payload.feature_overrides = _cmaState.subject.features;
    }
    var result = await cmaFetch('find-comps', payload);
    if (result.error) return;
    _cmaSearchCache = result.comps || [];
  }

  // For each flagged comp, find a unique best alternative
  var selectedKeys = _cmaState.selectedComps.map(function(c) { return c.listing.listing_key; });
  var available = _cmaSearchCache.filter(function(c) {
    return selectedKeys.indexOf(c.listing.listing_key) === -1;
  });

  if (available.length === 0) return;

  // Track which alternatives have been assigned so each flagged comp gets a different one
  var usedKeys = {};

  // Remove any existing alert banner
  var oldBanner = document.getElementById('cmaReplacementBanner');
  if (oldBanner) oldBanner.remove();

  // Build a banner that sits above the grid
  var bannerHtml = '<div id="cmaReplacementBanner" class="cma-replacement-banner">';

  flagged.forEach(function(compIdx) {
    // Pick best available that hasn't been assigned to another flagged comp
    var bestAlt = null;
    for (var a = 0; a < available.length; a++) {
      if (!usedKeys[available[a].listing.listing_key]) {
        bestAlt = available[a];
        break;
      }
    }
    if (!bestAlt) return;
    usedKeys[bestAlt.listing.listing_key] = true;
    _cmaState.replacementSuggestions[compIdx] = bestAlt;

    var adj = _cmaState.adjustments[compIdx];
    var pctVal = adj.gross_adjustment_pct > 25 ? adj.gross_adjustment_pct.toFixed(1) : adj.net_adjustment_pct.toFixed(1);
    var pctType = adj.gross_adjustment_pct > 25 ? 'gross' : 'net';
    var alt = bestAlt.listing;
    var scoreStr = bestAlt.similarity && bestAlt.similarity.total ? Math.round(bestAlt.similarity.total * 100) + '%' : '';
    var compName = (_cmaState.selectedComps[compIdx].listing.full_address || '').split(',')[0];
    var altName = (alt.full_address || '').split(',')[0];

    bannerHtml += '<div class="cma-replacement-card">';
    bannerHtml += '<div class="cma-replacement-card-header">';
    bannerHtml += '<span class="cma-replacement-warn">&#9888;</span>';
    bannerHtml += '<strong>Comp ' + (compIdx + 1) + '</strong> (' + esc(compName) + ') has <strong>' + pctVal + '% ' + pctType + '</strong> adjustments';
    bannerHtml += '</div>';
    bannerHtml += '<div class="cma-replacement-card-suggestion">';
    bannerHtml += 'Try: <strong>' + esc(altName) + '</strong>';
    if (scoreStr) bannerHtml += ' <span class="cma-replacement-score">' + scoreStr + ' match</span>';
    bannerHtml += ' &middot; $' + (alt.close_price || 0).toLocaleString();
    if (alt.living_area) bannerHtml += ' &middot; ' + alt.living_area.toLocaleString() + ' sqft';
    if (alt.lot_size_acres) bannerHtml += ' &middot; ' + alt.lot_size_acres + ' ac';
    bannerHtml += '</div>';
    bannerHtml += '<div class="cma-replacement-card-actions">';
    bannerHtml += '<button class="cma-btn-accept" onclick="cmaAcceptSuggestion(' + compIdx + ')">Use This</button>';
    bannerHtml += '<button class="cma-btn-secondary" onclick="cmaOpenCompSearch(' + compIdx + ')">Pick My Own</button>';
    bannerHtml += '<button class="cma-btn-dismiss" onclick="cmaDismissSuggestion(' + compIdx + ')">Keep Current</button>';
    bannerHtml += '</div>';
    bannerHtml += '</div>';
  });

  bannerHtml += '</div>';

  // Insert banner above the grid scroll container
  var gridScroll = document.getElementById('cmaAdjGrid');
  if (gridScroll) {
    gridScroll.insertAdjacentHTML('beforebegin', bannerHtml);
  }
}

function cmaAcceptSuggestion(compIdx) {
  var suggestion = _cmaState.replacementSuggestions ? _cmaState.replacementSuggestions[compIdx] : null;
  if (!suggestion) { toast('No suggestion found', 'error'); return; }
  cmaReplaceComp(compIdx, suggestion.listing.listing_key);
}

function cmaDismissSuggestion(compIdx) {
  if (!_cmaState.replacementDismissed) _cmaState.replacementDismissed = {};
  _cmaState.replacementDismissed[compIdx] = true;
  // Remove just this card from the banner, or the whole banner if no more cards
  var banner = document.getElementById('cmaReplacementBanner');
  if (banner) {
    var cards = banner.querySelectorAll('.cma-replacement-card');
    // Find the card for this comp by checking button onclick
    cards.forEach(function(card) {
      var btn = card.querySelector('.cma-btn-dismiss');
      if (btn && btn.getAttribute('onclick').indexOf('(' + compIdx + ')') !== -1) {
        card.remove();
      }
    });
    // If no cards left, remove the whole banner
    if (!banner.querySelector('.cma-replacement-card')) banner.remove();
  }
}

// Load comp and subject photos into the grid header
async function cmaLoadGridPhotos() {
  var comps = _cmaState.selectedComps || [];
  var sub = _cmaState.subject ? _cmaState.subject.listing : null;
  // Load subject photo
  if (sub && sub.listing_key) {
    cmaLoadOnePhoto(sub.listing_key, 'cmaSubjectPhoto');
  }
  // Load comp photos (pass listing info for description display)
  comps.forEach(function(c, i) {
    if (c.listing && c.listing.listing_key) {
      cmaLoadOnePhoto(c.listing.listing_key, 'cmaCompPhoto_' + i, c.listing);
    }
  });
}

async function cmaLoadOnePhoto(listingKey, containerId, listingInfo) {
  var el = document.getElementById(containerId);
  if (!el) return;
  try {
    var resp = await _sb.from('mls_media').select('local_url,media_url').eq('listing_key', listingKey).order('order', { ascending: true }).limit(30);
    var photos = (resp.data || []).map(function(p) { return p.local_url || p.media_url; }).filter(Boolean);
    if (photos.length) {
      el.innerHTML = '<img src="' + esc(photos[0]) + '" alt="Property photo" class="cma-grid-photo-img" style="cursor:pointer" onerror="this.onerror=null;this.style.display=\'none\';this.parentElement.innerHTML=\'<div class=cma-grid-photo-empty>Photo unavailable</div>\'" />';
      el.dataset.photos = JSON.stringify(photos);
      el.dataset.listingKey = listingKey;
      if (listingInfo) el.dataset.listingInfo = JSON.stringify(listingInfo);
      el.addEventListener('click', function() {
        var info = el.dataset.listingInfo ? JSON.parse(el.dataset.listingInfo) : null;
        cmaOpenPhotoGallery(JSON.parse(el.dataset.photos), el.dataset.listingKey, info);
      });
    } else {
      el.innerHTML = '<div class="cma-grid-photo-empty">No photo</div>';
    }
  } catch(e) {
    el.innerHTML = '<div class="cma-grid-photo-empty">No photo</div>';
  }
}

// Photo gallery lightbox (with optional property description)
function cmaOpenPhotoGallery(photos, listingKey, listingInfo) {
  if (!photos || !photos.length) return;
  var idx = 0;
  var overlay = document.createElement('div');
  overlay.className = 'crm-modal-overlay cma-photo-overlay';
  overlay.style.zIndex = '500';

  // Build property info bar if we have listing data
  var infoBar = '';
  if (listingInfo) {
    var addr = (listingInfo.full_address || '').split(',')[0];
    var facts = [];
    if (listingInfo.bedrooms_total) facts.push(listingInfo.bedrooms_total + ' bed');
    if (listingInfo.bathrooms_total_integer) facts.push(listingInfo.bathrooms_total_integer + ' bath');
    if (listingInfo.living_area) facts.push(listingInfo.living_area.toLocaleString() + ' sqft');
    if (listingInfo.lot_size_acres) facts.push(listingInfo.lot_size_acres + ' ac');
    if (listingInfo.year_built) facts.push('Built ' + listingInfo.year_built);
    var price = listingInfo.close_price || listingInfo.list_price;
    infoBar = '<div class="cma-photo-info">';
    if (addr) infoBar += '<div class="cma-photo-info-addr">' + esc(addr) + (price ? ' &mdash; $' + price.toLocaleString() : '') + '</div>';
    if (facts.length) infoBar += '<div class="cma-photo-info-facts">' + facts.join(' &middot; ') + '</div>';
    if (listingInfo.public_remarks) {
      infoBar += '<div class="cma-photo-info-desc">' + esc(listingInfo.public_remarks) + '</div>';
    }
    infoBar += '</div>';
  }

  function render() {
    overlay.innerHTML = '<div class="cma-photo-gallery">' +
      '<button class="cma-photo-close" onclick="this.closest(\'.cma-photo-overlay\').remove()">&times;</button>' +
      '<div class="cma-photo-counter">' + (idx + 1) + ' / ' + photos.length + '</div>' +
      '<div class="cma-photo-stage">' +
        (photos.length > 1 ? '<button class="cma-photo-nav cma-photo-prev">&lsaquo;</button>' : '') +
        '<img src="' + esc(photos[idx]) + '" class="cma-photo-main" onerror="this.onerror=null;this.alt=\'Photo unavailable\';this.style.background=\'#333\';this.style.minHeight=\'300px\'" />' +
        (photos.length > 1 ? '<button class="cma-photo-nav cma-photo-next">&rsaquo;</button>' : '') +
      '</div>' +
      (photos.length > 1 ? '<div class="cma-photo-strip">' + photos.map(function(p, i) {
        return '<img src="' + esc(p) + '" class="cma-photo-thumb' + (i === idx ? ' active' : '') + '" data-idx="' + i + '" />';
      }).join('') + '</div>' : '') +
      infoBar +
    '</div>';

    // Bind nav
    var prev = overlay.querySelector('.cma-photo-prev');
    var next = overlay.querySelector('.cma-photo-next');
    if (prev) prev.addEventListener('click', function(e) { e.stopPropagation(); idx = (idx - 1 + photos.length) % photos.length; render(); });
    if (next) next.addEventListener('click', function(e) { e.stopPropagation(); idx = (idx + 1) % photos.length; render(); });
    overlay.querySelectorAll('.cma-photo-thumb').forEach(function(t) {
      t.addEventListener('click', function(e) { e.stopPropagation(); idx = parseInt(t.dataset.idx); render(); });
    });
  }

  render();
  // Close on backdrop click
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  // Close on Escape
  var escHandler = function(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
  // Arrow key nav
  var keyHandler = function(e) {
    if (!document.body.contains(overlay)) { document.removeEventListener('keydown', keyHandler); return; }
    if (e.key === 'ArrowLeft') { idx = (idx - 1 + photos.length) % photos.length; render(); }
    if (e.key === 'ArrowRight') { idx = (idx + 1) % photos.length; render(); }
  };
  document.addEventListener('keydown', escHandler);
  document.addEventListener('keydown', keyHandler);
  document.body.appendChild(overlay);
}

function cmaAdjInput(compIdx, key, value) {
  var cls = value > 0 ? 'cma-adj-pos' : value < 0 ? 'cma-adj-neg' : '';
  return '<div class="cma-adj-input-wrap"><input type="number" class="cma-adj-input ' + cls + '" value="' + value + '" data-comp="' + compIdx + '" data-key="' + key + '" step="500" /></div>';
}

function cmaSlider(compIdx, adjKey, adjVal, featKey, subjectFeats, compFeats) {
  // Derive slider position from current dollar value, not raw feature diff
  var multipliers = {
    adj_view: 25000, adj_water_features: 20000, adj_land_character: 8000,
    adj_road_noise: 7000, adj_privacy: 6000, adj_condition: 20000, adj_elevation: 2000
  };
  var mult = multipliers[adjKey] || 10000;
  var sliderVal = mult > 0 ? Math.round(adjVal / mult) : 0;
  sliderVal = Math.max(-2, Math.min(2, sliderVal));
  var labels = ['MW', 'W', 'S', 'B', 'MB'];
  var cls = adjVal > 0 ? 'cma-adj-pos' : adjVal < 0 ? 'cma-adj-neg' : '';

  var html = '<div class="cma-slider-wrap">';
  html += '<input type="range" class="cma-slider" min="-2" max="2" step="1" value="' + sliderVal + '" data-comp="' + compIdx + '" data-key="' + adjKey + '" />';
  html += '<div class="cma-slider-labels">';
  for (var i = 0; i < labels.length; i++) {
    html += '<span class="cma-slider-tick' + (i - 2 === sliderVal ? ' active' : '') + '">' + labels[i] + '</span>';
  }
  html += '</div>';
  html += '<input type="number" class="cma-adj-input ' + cls + '" value="' + adjVal + '" data-comp="' + compIdx + '" data-key="' + adjKey + '" step="1000" />';
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
  var multipliers = {
    adj_view: 25000, adj_water_features: 20000, adj_land_character: 8000,
    adj_road_noise: 7000, adj_privacy: 6000, adj_condition: 20000, adj_elevation: 2000
  };
  var mult = multipliers[adjKey] || 10000;
  var newVal = parseInt(sliderVal) * mult;
  var adj = _cmaState.adjustments[compIdx];
  if (!adj) return;
  adj.adjustments[adjKey] = newVal;
  cmaRecalcTotals(compIdx);
}

// Bind slider and input events via delegation after Step 3 renders
function cmaBindAdjustmentEvents() {
  var grid = document.getElementById('cmaAdjGrid');
  if (!grid) return;
  // Slider drag
  grid.addEventListener('input', function(e) {
    var el = e.target;
    if (el.classList.contains('cma-slider')) {
      var compIdx = parseInt(el.dataset.comp);
      var adjKey = el.dataset.key;
      cmaSliderChange(compIdx, adjKey, el.value);
      // Sync the adjacent number input without re-rendering
      var wrap = el.closest('.cma-slider-wrap');
      if (wrap) {
        var numInput = wrap.querySelector('.cma-adj-input');
        var adj = _cmaState.adjustments[compIdx];
        if (numInput && adj) {
          var val = adj.adjustments[adjKey] || 0;
          numInput.value = val;
          numInput.className = 'cma-adj-input' + (val > 0 ? ' cma-adj-pos' : val < 0 ? ' cma-adj-neg' : '');
        }
        // Update tick labels
        var ticks = wrap.querySelectorAll('.cma-slider-tick');
        var sv = parseInt(el.value);
        ticks.forEach(function(t, i) { t.classList.toggle('active', i - 2 === sv); });
      }
      cmaUpdateTotalsDisplay();
    }
  });
  // Change events: comp value edits, dropdowns, condition dropdown, number inputs
  grid.addEventListener('change', function(e) {
    var el = e.target;

    // Editable comp value input (number fields like beds, baths, sqft, garage, etc.)
    if (el.classList.contains('cma-comp-val-edit')) {
      var compIdx = parseInt(el.dataset.comp);
      var field = el.dataset.field;
      var adjKey = el.dataset.adj;
      var newVal = parseFloat(el.value);
      if (isNaN(newVal)) newVal = 0;
      // Store override
      if (!_cmaState.compOverrides) _cmaState.compOverrides = {};
      if (!_cmaState.compOverrides[compIdx]) _cmaState.compOverrides[compIdx] = {};
      _cmaState.compOverrides[compIdx][field] = newVal;
      // Recalculate adjustment from formula
      var newAdj = cmaRecalcAdjFromValue(compIdx, adjKey);
      cmaUpdateAdj(compIdx, adjKey, newAdj);
      // Sync the adjustment input
      var cell = el.closest('.cma-grid-adj-cell');
      if (cell) {
        var numInput = cell.querySelector('.cma-adj-input[data-key="' + adjKey + '"]');
        if (numInput) {
          numInput.value = newAdj;
          numInput.className = 'cma-adj-input' + (newAdj > 0 ? ' cma-adj-pos' : newAdj < 0 ? ' cma-adj-neg' : '');
        }
        // If there's a slider, sync it too
        var slider = cell.querySelector('.cma-slider[data-key="' + adjKey + '"]');
        if (slider) {
          var multipliers = { adj_view: 25000, adj_water_features: 20000, adj_land_character: 8000, adj_road_noise: 7000, adj_privacy: 6000, adj_condition: 20000, adj_elevation: 2000 };
          var mult = multipliers[adjKey] || 10000;
          var sv = Math.max(-2, Math.min(2, Math.round(newAdj / mult)));
          slider.value = sv;
          var ticks = cell.querySelectorAll('.cma-slider-tick');
          ticks.forEach(function(t, i) { t.classList.toggle('active', i - 2 === sv); });
        }
      }
      cmaUpdateTotalsDisplay();
      return;
    }

    // Editable comp value select (dropdowns: restriction, construction, pool, basement, outbuildings)
    if (el.classList.contains('cma-comp-val-select')) {
      var compIdx = parseInt(el.dataset.comp);
      var field = el.dataset.field;
      var adjKey = el.dataset.adj;
      var newVal = el.value;
      // For outbuilding_value_tier, convert to number
      if (field === 'outbuilding_value_tier') newVal = parseInt(newVal) || 0;
      // Store override
      if (!_cmaState.compOverrides) _cmaState.compOverrides = {};
      if (!_cmaState.compOverrides[compIdx]) _cmaState.compOverrides[compIdx] = {};
      _cmaState.compOverrides[compIdx][field] = newVal;
      // Recalculate adjustment from formula
      var newAdj = cmaRecalcStructuralAdj(compIdx, adjKey);
      cmaUpdateAdj(compIdx, adjKey, newAdj);
      // Sync the adjustment input
      var cell = el.closest('.cma-grid-adj-cell');
      if (cell) {
        var numInput = cell.querySelector('.cma-adj-input[data-key="' + adjKey + '"]');
        if (numInput) {
          numInput.value = newAdj;
          numInput.className = 'cma-adj-input' + (newAdj > 0 ? ' cma-adj-pos' : newAdj < 0 ? ' cma-adj-neg' : '');
        }
      }
      cmaUpdateTotalsDisplay();
      return;
    }

    // Condition dropdown
    if (el.classList.contains('cma-condition-select')) {
      var compIdx = parseInt(el.dataset.comp);
      var compCond = parseInt(el.value) || 0;
      if (!_cmaState.compConditions) _cmaState.compConditions = {};
      _cmaState.compConditions[compIdx] = compCond;
      var subCond = (_cmaState.subject.features || {}).condition_rating || 0;
      var newAdj = (subCond > 0 && compCond > 0) ? (subCond - compCond) * CMA_RATES.condition_per_point : 0;
      cmaUpdateAdj(compIdx, 'adj_condition', newAdj);
      // Sync the number input
      var cell = el.closest('.cma-grid-adj-cell');
      if (cell) {
        var numInput = cell.querySelector('.cma-adj-input[data-key="adj_condition"]');
        if (numInput) {
          numInput.value = newAdj;
          numInput.className = 'cma-adj-input' + (newAdj > 0 ? ' cma-adj-pos' : newAdj < 0 ? ' cma-adj-neg' : '');
        }
      }
      cmaUpdateTotalsDisplay();
      return;
    }
    // Number input change (manual adjustment override)
    if (el.classList.contains('cma-adj-input')) {
      var compIdx = parseInt(el.dataset.comp);
      var adjKey = el.dataset.key;
      cmaUpdateAdj(compIdx, adjKey, el.value);
      var val = parseInt(el.value) || 0;
      el.className = 'cma-adj-input' + (val > 0 ? ' cma-adj-pos' : val < 0 ? ' cma-adj-neg' : '');
      // Sync slider position
      var wrap = el.closest('.cma-slider-wrap');
      if (wrap) {
        var slider = wrap.querySelector('.cma-slider');
        if (slider) {
          var multipliers = { adj_view: 25000, adj_water_features: 20000, adj_land_character: 8000, adj_road_noise: 7000, adj_privacy: 6000, adj_condition: 20000, adj_elevation: 2000 };
          var mult = multipliers[adjKey] || 10000;
          var sv = Math.max(-2, Math.min(2, Math.round(val / mult)));
          slider.value = sv;
          var ticks = wrap.querySelectorAll('.cma-slider-tick');
          ticks.forEach(function(t, i) { t.classList.toggle('active', i - 2 === sv); });
        }
      }
      cmaUpdateTotalsDisplay();
    }
  });
}

// Update totals/valuation display without full re-render
function cmaUpdateTotalsDisplay() {
  _cmaState.adjustments.forEach(function(adj, i) {
    var totalEl = document.getElementById('cmaCompTotal_' + i);
    if (totalEl) {
      totalEl.textContent = '$' + adj.adjusted_price.toLocaleString();
      totalEl.className = 'cma-comp-adjusted-val' + (adj.total_adjustment > 0 ? ' cma-adj-pos' : adj.total_adjustment < 0 ? ' cma-adj-neg' : '');
    }
    var netEl = document.getElementById('cmaCompNet_' + i);
    if (netEl) netEl.textContent = (adj.total_adjustment >= 0 ? '+' : '') + '$' + adj.total_adjustment.toLocaleString() + ' (' + adj.net_adjustment_pct + '% net)';
  });
  // Update valuation display
  var valEl = document.getElementById('cmaValuationRange');
  if (valEl && _cmaState.valuation) {
    valEl.textContent = '$' + (_cmaState.valuation.suggested_low || 0).toLocaleString() + ' - $' + (_cmaState.valuation.suggested_high || 0).toLocaleString();
  }
  var sugEl = document.getElementById('cmaValuationSuggested');
  if (sugEl && _cmaState.valuation) {
    sugEl.textContent = '$' + (_cmaState.valuation.suggested_price || 0).toLocaleString();
  }
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
  // Recalc valuation using inverse-gross-adjustment weighting
  // Comps with fewer adjustments are more reliable indicators of value
  var validAdjs = _cmaState.adjustments.filter(function(a) { return a.adjusted_price > 0; });
  if (validAdjs.length) {
    var allPrices = validAdjs.map(function(a) { return a.adjusted_price; }).sort(function(a,b) { return a-b; });
    // Weighted mean: weight = 1 / (1 + gross_adj_pct/100)
    var totalWeight = 0, weightedSum = 0;
    validAdjs.forEach(function(a) {
      var w = 1 / (1 + (a.gross_adjustment_pct || 0) / 100);
      totalWeight += w;
      weightedSum += a.adjusted_price * w;
    });
    var weightedPrice = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : allPrices[Math.floor(allPrices.length / 2)];
    // Range: use lowest and highest adjusted prices (trimmed if 4+)
    var rangeSet = allPrices.length >= 4 ? allPrices.slice(1, -1) : allPrices;
    // Preserve a manually edited range so going back to Step 3 doesn't clobber
    // the agent's override. The center (suggested_price) always recomputes.
    var prev = _cmaState.valuation || {};
    var keepRange = prev.range_user_edited === true;
    _cmaState.valuation = {
      suggested_low: keepRange ? prev.suggested_low : rangeSet[0],
      suggested_high: keepRange ? prev.suggested_high : rangeSet[rangeSet.length - 1],
      suggested_price: weightedPrice,
      range_user_edited: keepRange
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

// ── Comp Search/Replace Modal ──
var _cmaSearchCache = null; // Cache find-comps results for the session

async function cmaOpenCompSearch(compIdx, preloadedComps) {
  // Create modal overlay
  var overlay = document.createElement('div');
  overlay.className = 'cma-comp-search-overlay';
  overlay.innerHTML = '<div class="cma-comp-search-modal">' +
    '<div class="cma-comp-search-header">' +
    '<h3>Replace Comp ' + (compIdx + 1) + '</h3>' +
    '<button class="cma-comp-search-close" onclick="this.closest(\'.cma-comp-search-overlay\').remove()">&times;</button>' +
    '</div>' +
    '<div class="cma-comp-search-body">' +
    '<div class="cma-comp-search-bar">' +
    '<input type="text" class="crm-input cma-comp-search-input" id="cmaCompSearchInput" placeholder="Filter by address or listing ID..." />' +
    '</div>' +
    '<div class="cma-comp-search-results" id="cmaCompSearchResults">' +
    '<div class="crm-loading"><div class="crm-spinner"></div><p>Loading comparable sales...</p></div>' +
    '</div>' +
    '</div></div>';

  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  // Close on Escape
  var escHandler = function(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);

  // Get comps (use preloaded or fetch)
  var allComps = preloadedComps || _cmaSearchCache;
  if (!allComps) {
    var sub = _cmaState.subject.listing;
    var isManual = (sub.listing_key || '').startsWith('manual_');
    var payload = {
      filters: Object.assign({
        county: sub.county_or_parish || null,
        property_type: sub.property_type || null,
        max_distance_miles: 15,
        limit: 20
      }, _cmaState.filters || {})
    };
    if (isManual) {
      payload.listing_key = null;
      payload.manual_subject = sub;
    } else {
      payload.listing_key = sub.listing_key;
      payload.subject_overrides = {
        living_area: sub.living_area, bedrooms_total: sub.bedrooms_total,
        bathrooms_total_integer: sub.bathrooms_total_integer, year_built: sub.year_built,
        garage_spaces: sub.garage_spaces, lot_size_acres: sub.lot_size_acres,
        property_type: sub.property_type, property_sub_type: sub.property_sub_type,
        list_price: sub.list_price
      };
    }
    if (_cmaState.subject.features && Object.keys(_cmaState.subject.features).length > 0) {
      payload.feature_overrides = _cmaState.subject.features;
    }
    var result = await cmaFetch('find-comps', payload);
    if (result.error) {
      var resultsEl = document.getElementById('cmaCompSearchResults');
      if (resultsEl) resultsEl.innerHTML = '<p class="cma-comp-search-error">Error loading comps: ' + esc(result.error) + '</p>';
      return;
    }
    allComps = result.comps || [];
    _cmaSearchCache = allComps;
  }

  // Filter out already-selected comps
  var selectedKeys = _cmaState.selectedComps.map(function(c) { return c.listing.listing_key; });
  var availableComps = allComps.filter(function(c) {
    return selectedKeys.indexOf(c.listing.listing_key) === -1;
  });

  function renderResults(filter) {
    var resultsEl = document.getElementById('cmaCompSearchResults');
    if (!resultsEl) return;
    var filtered = filter
      ? availableComps.filter(function(c) {
          var addr = (c.listing.full_address || '').toLowerCase();
          var id = (c.listing.listing_key || '').toLowerCase();
          var q = filter.toLowerCase();
          return addr.indexOf(q) !== -1 || id.indexOf(q) !== -1;
        })
      : availableComps;

    if (filtered.length === 0) {
      resultsEl.innerHTML = '<p class="cma-comp-search-empty">No matching comps found.</p>';
      return;
    }

    var html = '';
    filtered.forEach(function(c) {
      var l = c.listing;
      var scoreStr = c.score ? Math.round(c.score * 100) + '%' : '--';
      var distStr = c.distance_miles ? c.distance_miles.toFixed(1) + ' mi' : '--';
      html += '<div class="cma-comp-search-card" data-key="' + esc(l.listing_key) + '">';
      html += '<div class="cma-comp-search-card-top">';
      html += '<div class="cma-comp-search-addr">' + esc(l.full_address || 'Unknown') + '</div>';
      html += '<div class="cma-comp-search-score">' + scoreStr + ' match</div>';
      html += '</div>';
      html += '<div class="cma-comp-search-meta">';
      html += '<span>$' + (l.close_price || 0).toLocaleString() + '</span>';
      html += '<span>' + (l.close_date || '--') + '</span>';
      html += '<span>' + (l.living_area ? l.living_area.toLocaleString() + ' sqft' : '--') + '</span>';
      html += '<span>' + (l.lot_size_acres || '--') + ' ac</span>';
      html += '<span>' + (l.bedrooms_total || '--') + 'bd/' + (l.bathrooms_total_integer || '--') + 'ba</span>';
      html += '<span>' + distStr + '</span>';
      html += '</div>';
      html += '<button class="crm-btn crm-btn-primary cma-comp-search-select" onclick="cmaReplaceComp(' + compIdx + ', \'' + esc(l.listing_key) + '\')">Select</button>';
      html += '</div>';
    });
    resultsEl.innerHTML = html;
  }

  renderResults('');

  // Wire up search filter
  var searchInput = document.getElementById('cmaCompSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function() { renderResults(this.value); });
    searchInput.focus();
  }
}

async function cmaReplaceComp(compIdx, newCompKey) {
  // Find the comp in the search cache
  var allComps = _cmaSearchCache || [];
  var newComp = null;
  for (var i = 0; i < allComps.length; i++) {
    if (allComps[i].listing.listing_key === newCompKey) {
      newComp = allComps[i];
      break;
    }
  }
  if (!newComp) { toast('Comp not found', 'error'); return; }

  // Close the modal
  var overlay = document.querySelector('.cma-comp-search-overlay');
  if (overlay) overlay.remove();

  toast('Recalculating adjustments...', 'info');

  // Save current slider overrides for other comps
  var savedOverrides = {};
  _cmaState.adjustments.forEach(function(adj, idx) {
    if (idx !== compIdx) savedOverrides[idx] = Object.assign({}, adj.adjustments);
  });

  // Replace the comp in selectedComps
  _cmaState.selectedComps[compIdx] = { listing: newComp.listing, features: newComp.features || {} };

  // Also update the comps list
  var compInList = _cmaState.comps.find(function(c) { return c.listing.listing_key === newCompKey; });
  if (compInList) compInList.selected = true;
  // Mark old comp as deselected
  var oldKey = _cmaState.adjustments[compIdx] ? _cmaState.adjustments[compIdx].comp_listing_key : null;
  if (oldKey) {
    var oldInList = _cmaState.comps.find(function(c) { return c.listing.listing_key === oldKey; });
    if (oldInList) oldInList.selected = false;
  }

  // Calculate adjustments for all comps (engine calculates fresh)
  var calcResult = await cmaFetch('calculate-adjustments', {
    subject: _cmaState.subject,
    comps: _cmaState.selectedComps.map(function(c) { return { listing: c.listing, features: c.features }; })
  });

  if (calcResult.error) { toast('Recalculation error: ' + calcResult.error, 'error'); return; }

  // Merge: use new adjustments for replaced comp, restore overrides for others
  _cmaState.adjustments = (calcResult.adjustments || []).map(function(newAdj, idx) {
    if (idx !== compIdx && savedOverrides[idx]) {
      // Restore the user's slider overrides for unchanged comps
      newAdj.adjustments = savedOverrides[idx];
      // Recalculate totals with restored overrides
      var total = 0, gross = 0;
      for (var key in newAdj.adjustments) {
        var v = newAdj.adjustments[key] || 0;
        total += v;
        gross += Math.abs(v);
      }
      newAdj.total_adjustment = total;
      newAdj.adjusted_price = newAdj.sale_price + total;
      newAdj.gross_adjustment_pct = newAdj.sale_price > 0 ? Math.round((gross / newAdj.sale_price) * 1000) / 10 : 0;
      newAdj.net_adjustment_pct = newAdj.sale_price > 0 ? Math.round((Math.abs(total) / newAdj.sale_price) * 1000) / 10 : 0;
    }
    return newAdj;
  });
  _cmaState.valuation = calcResult.valuation || {};

  // Update comp condition and clear overrides for the replaced comp
  if (_cmaState.compConditions) {
    var cf = newComp.features || {};
    _cmaState.compConditions[compIdx] = cf.condition_rating || 3;
  }
  if (_cmaState.compOverrides) {
    _cmaState.compOverrides[compIdx] = {};
  }

  // Clear AI advice cache (needs recalculation with new comp)
  _cmaState.aiAdvice = null;

  // Clear replacement state for this comp
  if (_cmaState.replacementSuggestions) delete _cmaState.replacementSuggestions[compIdx];
  if (_cmaState.replacementDismissed) delete _cmaState.replacementDismissed[compIdx];

  toast('Comp ' + (compIdx + 1) + ' replaced!', 'success');
  cmaRenderStep3();
}

// ── Step 4: Review & Export ──
async function cmaGoStep4() {
  _cmaState.step = 4;
  var main = document.getElementById('crmMain');
  main.innerHTML = '<div class="cma-wizard">' + cmaStepIndicator(4) + '<div class="cma-step-content"><div class="crm-loading"><div class="crm-spinner"></div><p>Getting AI analysis...</p></div></div></div>';

  // Get AI advice
  var adviceResult = await cmaFetch('ai-advise', {
    subject: _cmaState.subject,
    valuation: _cmaState.valuation || {},
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
    html += '<div class="cma-val-range-label">Estimated Market Value</div>';
  }

  // Editable price range
  html += '<div class="cma-range-edit">';
  html += '<div class="cma-range-edit-grid">';
  html += '<div class="cma-range-field">';
  html += '<label class="cma-rec-label" for="cmaRangeLow">Low</label>';
  html += '<input type="number" class="crm-input cma-rec-input" id="cmaRangeLow" value="' + (v.suggested_low || '') + '" step="1000" oninput="cmaUpdateRange()" />';
  html += '</div>';
  html += '<div class="cma-range-sep">to</div>';
  html += '<div class="cma-range-field">';
  html += '<label class="cma-rec-label" for="cmaRangeHigh">High</label>';
  html += '<input type="number" class="crm-input cma-rec-input" id="cmaRangeHigh" value="' + (v.suggested_high || '') + '" step="1000" oninput="cmaUpdateRange()" />';
  html += '</div>';
  html += '</div>';
  html += '<button type="button" class="cma-range-explain-toggle" onclick="cmaToggleRangeExplain()" aria-expanded="false">';
  html += '<span class="cma-range-explain-icon">?</span> What does this range mean?';
  html += '</button>';
  html += '<div class="cma-range-explain" id="cmaRangeExplain" hidden>';
  html += '<p>The price range shows a realistic spread for where this property could sell, given current market conditions and the comparable sales we used.</p>';
  html += '<ul>';
  html += '<li><strong>Low end:</strong> what the home is likely to bring if it needs to sell quickly, the market softens, or showings reveal condition issues that the comps did not have.</li>';
  html += '<li><strong>Estimated market value (center):</strong> the most likely sale price under typical conditions, weighted toward the comps that needed the fewest adjustments.</li>';
  html += '<li><strong>High end:</strong> the upper edge if listing timing, demand, and presentation all line up, or if a buyer specifically values this home\'s features over the comps.</li>';
  html += '</ul>';
  html += '<p class="cma-range-explain-note">A CMA is not a formal appraisal. Final sale price is determined by the market, the buyer, and how the home shows. Adjust the low and high here if you want to widen or narrow the range you discuss with the homeowner.</p>';
  html += '</div>';
  html += '</div>';

  html += '<div class="cma-rec-price-wrap">';
  html += '<label class="cma-rec-label">Your Recommended List Price</label>';
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

  // AI Comp Selection reasoning (from Quick CMA auto-select)
  if (_cmaState.aiSelection) {
    var sel = _cmaState.aiSelection;
    html += '<div class="cma-ai-section"><h4 class="cma-ai-title">AI Comp Selection</h4>';
    // Selected reasons
    if (sel.reasoning && typeof sel.reasoning === 'object') {
      html += '<div class="cma-comp-reasoning">';
      _cmaState.selectedComps.forEach(function(c) {
        var key = c.listing.listing_key;
        var reason = sel.reasoning[key] || '';
        if (!reason) return;
        html += '<div class="cma-reasoning-card"><div class="cma-reasoning-header">' + esc((c.listing.full_address || '').split(',')[0]) + '</div>';
        html += '<div class="cma-reasoning-text">' + esc(reason) + '</div></div>';
      });
      html += '</div>';
    } else if (typeof sel.reasoning === 'string') {
      html += '<div class="cma-ai-summary">' + esc(sel.reasoning) + '</div>';
    }
    // Excluded reasons
    if (sel.excluded && typeof sel.excluded === 'object') {
      var exKeys = Object.keys(sel.excluded);
      if (exKeys.length) {
        html += '<div style="margin-top:0.5rem;font-size:0.82rem;color:var(--crm-text-muted);">';
        html += '<strong>Excluded:</strong> ';
        exKeys.forEach(function(ek, i) {
          if (i > 0) html += ' | ';
          html += esc(ek.substring(0, 12)) + ': ' + esc(sel.excluded[ek] || '');
        });
        html += '</div>';
      }
    }
    html += '</div>';
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

// Reads the editable Low/High inputs in Step 4 and writes them back into
// _cmaState.valuation so saveReport and the PDF generator pick up the edits.
// Marks the range as user-overridden so cmaRecalcTotals won't clobber the
// edits if the agent jumps back to Step 3 and tweaks adjustments.
function cmaUpdateRange() {
  if (!_cmaState.valuation) _cmaState.valuation = {};
  var lowEl = document.getElementById('cmaRangeLow');
  var highEl = document.getElementById('cmaRangeHigh');
  if (lowEl) {
    var lowVal = parseInt(lowEl.value, 10);
    if (!isNaN(lowVal)) _cmaState.valuation.suggested_low = lowVal;
  }
  if (highEl) {
    var highVal = parseInt(highEl.value, 10);
    if (!isNaN(highVal)) _cmaState.valuation.suggested_high = highVal;
  }
  _cmaState.valuation.range_user_edited = true;
}

function cmaToggleRangeExplain() {
  var box = document.getElementById('cmaRangeExplain');
  var btn = box && box.previousElementSibling;
  if (!box) return;
  var isHidden = box.hasAttribute('hidden');
  if (isHidden) {
    box.removeAttribute('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  } else {
    box.setAttribute('hidden', '');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

async function cmaSaveReport(status) {
  var s = _cmaState.subject.listing;
  var recPrice = parseInt(document.getElementById('cmaRecPrice')?.value) || null;
  var agentNotes = document.getElementById('cmaAgentNotes')?.value || '';
  // Pull any pending Low/High edits from the DOM in case oninput hasn't fired yet
  cmaUpdateRange();

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
        adj_restrictions: a.adjustments.adj_restrictions || 0,
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
        adj_pool: a.adjustments.adj_pool || 0,
        adj_basement: a.adjustments.adj_basement || 0,
        adj_fireplace: a.adjustments.adj_fireplace || 0,
        adj_covered_outdoor: a.adjustments.adj_covered_outdoor || 0,
        adj_outbuildings: a.adjustments.adj_outbuildings || 0,
        adj_construction_type: a.adjustments.adj_construction_type || 0,
        adj_time: a.adjustments.adj_time || 0,
        adj_concessions: a.adjustments.adj_concessions || 0,
        total_adjustment: a.total_adjustment,
        adjusted_price: a.adjusted_price,
        gross_adjustment_pct: a.gross_adjustment_pct,
        net_adjustment_pct: a.net_adjustment_pct,
        comp_condition_rating: (_cmaState.compConditions && _cmaState.compConditions[i] != null) ? _cmaState.compConditions[i] : null,
        comp_overrides: (_cmaState.compOverrides && _cmaState.compOverrides[i]) ? _cmaState.compOverrides[i] : {},
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

// ── Step Indicator (clickable) ──
function cmaStepIndicator(current) {
  var steps = [
    { num: 1, label: 'Subject', fn: 'cmaRenderStep1' },
    { num: 2, label: 'Comps', fn: 'cmaRenderStep2' },
    { num: 3, label: 'Adjust', fn: 'cmaRenderStep3' },
    { num: 4, label: 'Review', fn: 'cmaRenderStep4' }
  ];
  var html = '<div class="cma-steps">';
  steps.forEach(function(s) {
    var isDone = s.num < current;
    var isActive = s.num === current;
    var cls = isActive ? 'cma-step active' : isDone ? 'cma-step done' : 'cma-step';
    // Clickable if this step has been reached (done or active), or if we have data for it
    var canClick = isDone || (s.num === 1) ||
      (s.num === 2 && _cmaState.subject) ||
      (s.num === 3 && _cmaState.adjustments && _cmaState.adjustments.length) ||
      (s.num === 4 && _cmaState.aiAdvice);
    if (canClick) cls += ' clickable';
    var onclick = canClick ? ' onclick="cmaGoToStep(' + s.num + ')"' : '';
    html += '<div class="' + cls + '"' + onclick + '><div class="cma-step-num">' + s.num + '</div><div class="cma-step-label">' + s.label + '</div></div>';
    if (s.num < steps.length) html += '<div class="cma-step-line' + (isDone ? ' done' : '') + '"></div>';
  });
  html += '</div>';
  return html;
}

function cmaGoToStep(step) {
  if (step === 1) { cmaRenderStep1(); }
  else if (step === 2) {
    if (!_cmaState.subject) { toast('Select a subject property first', 'error'); }
    else if (_cmaState.comps.length > 0) { _cmaState.step = 2; cmaRenderStep2(); }
    else { cmaGoStep2(); }
  }
  else if (step === 3) {
    if (_cmaState.adjustments && _cmaState.adjustments.length) { _cmaState.step = 3; cmaRenderStep3(); }
    else { toast('Calculate adjustments first', 'error'); }
  }
  else if (step === 4) {
    if (_cmaState.aiAdvice) { _cmaState.step = 4; cmaRenderStep4(); }
    else { toast('Complete the adjustment step first', 'error'); }
  }
}

// ══════════════════════════════════════
// CMA PDF Generation (HTML-based via cma-pdf edge function)
// ══════════════════════════════════════

async function cmaGeneratePDF() {
  toast('Generating CMA report...', 'info');

  // Flush any pending Low/High range edits into state before reading
  if (typeof cmaUpdateRange === 'function') cmaUpdateRange();

  var s = _cmaState.subject.listing;
  var adjs = _cmaState.adjustments;
  var comps = _cmaState.selectedComps;
  var v = _cmaState.valuation || {};
  var ai = _cmaState.aiAdvice || {};

  // If we have a saved report_id, use that; otherwise build report_data
  var payload = { action: 'generate-html', format: 'html' };
  if (_cmaState.reportId) {
    payload.report_id = _cmaState.reportId;
  } else {
    // Fetch subject photos from mls_media for the PDF
    var subjectWithPhotos = Object.assign({}, _cmaState.subject);
    if (s.listing_key && (!subjectWithPhotos.listing || !subjectWithPhotos.listing.photos || !subjectWithPhotos.listing.photos.length)) {
      try {
        var photoResp = await _sb.from('mls_media').select('media_url, local_url')
          .eq('listing_key', s.listing_key).order('order', { ascending: true }).limit(13);
        if (photoResp.data && photoResp.data.length) {
          subjectWithPhotos = Object.assign({}, subjectWithPhotos, {
            listing: Object.assign({}, subjectWithPhotos.listing, {
              photos: photoResp.data.map(function(p) { return p.local_url || p.media_url; }).filter(Boolean)
            })
          });
        }
      } catch(photoErr) { console.warn('[CMA PDF] photo fetch failed:', photoErr); }
    }
    // Get agent recommended price and notes from Step 4 form
    var recPrice = parseInt(document.getElementById('cmaRecPrice') ? document.getElementById('cmaRecPrice').value : '') || null;
    var agentNotes = document.getElementById('cmaAgentNotes') ? document.getElementById('cmaAgentNotes').value : '';
    payload.report_data = {
      subject: subjectWithPhotos,
      comps: comps.map(function(c, i) {
        var adj = adjs[i] || {};
        return {
          listing: c.listing,
          features: c.features || null,
          adjustments: adj.adjustments || adj
        };
      }),
      valuation: { suggested_low: v.suggested_low || 0, suggested_high: v.suggested_high || 0, suggested_price: v.suggested_price || 0 },
      ai_summary: ai.summary || '',
      ai_considerations: ai.considerations || [],
      comp_reasoning: ai.comp_reasoning || {},
      agent_recommended_price: recPrice || undefined,
      agent_notes: agentNotes || undefined
    };
  }

  try {
    var resp = await fetch(CMA_PDF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify(payload)
    });
    var html = await resp.text();
    // Open HTML in new tab for print-to-PDF
    var win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      // Inject download toolbar (hidden in @media print)
      var toolbar = win.document.createElement('div');
      toolbar.id = 'cma-toolbar';
      toolbar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#1a1815;color:#f5f0e8;display:flex;align-items:center;justify-content:space-between;padding:8px 20px;font-family:system-ui,sans-serif;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      var fileName = 'CMA-' + (s.full_address || 'Report').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40);
      toolbar.innerHTML = '<span style="font-weight:600;">CMA Report Preview</span>'
        + '<div style="display:flex;gap:10px;">'
        + '<button onclick="window.print()" style="background:#C4B08C;color:#1a1815;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-weight:600;font-size:13px;">Download PDF</button>'
        + '<button id="cma-dl-html" style="background:transparent;color:#C4B08C;border:1px solid #C4B08C;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:13px;">Download HTML</button>'
        + '</div>';
      win.document.body.prepend(toolbar);
      // Add print CSS to hide toolbar
      var printStyle = win.document.createElement('style');
      printStyle.textContent = '@media print { #cma-toolbar { display: none !important; } body { padding-top: 0 !important; } }';
      win.document.head.appendChild(printStyle);
      // Add body padding so content isn't hidden behind fixed toolbar
      win.document.body.style.paddingTop = '50px';
      // Wire up HTML download button
      var dlBtn = win.document.getElementById('cma-dl-html');
      if (dlBtn) {
        dlBtn.onclick = function() {
          var b = new Blob([html], { type: 'text/html' });
          var u = URL.createObjectURL(b);
          var a = win.document.createElement('a');
          a.href = u; a.download = fileName + '.html'; a.click();
          URL.revokeObjectURL(u);
        };
      }
      toast('CMA report opened with download toolbar.', 'success');
    } else {
      // Fallback: download as HTML file
      var blob = new Blob([html], { type: 'text/html' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'CMA-' + (s.full_address || 'Report').replace(/[^a-zA-Z0-9]/g, '-').slice(0, 40) + '.html';
      a.click();
      URL.revokeObjectURL(url);
      toast('CMA report downloaded as HTML. Open in browser and print to PDF.', 'success');
    }
  } catch(e) {
    console.error('[CMA PDF] error:', e);
    toast('PDF generation failed: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════
// REVIEWS TAB
// ═══════════════════════════════════════════════════════

async function _rvFetch(body) {
  var sess = (await _sb.auth.getSession()).data.session;
  var token = sess ? sess.access_token : SUPABASE_KEY;
  var resp = await fetch(SUPABASE_URL + '/functions/v1/review-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_KEY },
    body: JSON.stringify(body)
  });
  return resp.json();
}

async function loadReviews() {
  var main = document.getElementById('crmMain');
  main.innerHTML =
    '<div class="crm-section">' +
      '<div class="crm-section-header"><h2>Send Review Request</h2></div>' +
      '<div class="crm-card" style="padding:1.25rem">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">' +
          '<div><label class="crm-field-label">Client Name</label><input class="crm-input" id="rvClientName" placeholder="John Smith"></div>' +
          '<div><label class="crm-field-label">Client Email</label><input class="crm-input" id="rvClientEmail" placeholder="john@example.com" type="email"></div>' +
          '<div><label class="crm-field-label">Property Address</label><input class="crm-input" id="rvPropAddr" placeholder="123 Mountain View Dr"></div>' +
          '<div><label class="crm-field-label">Town</label><select class="crm-input" id="rvTown"><option value="">Select town</option><option>Waynesville</option><option>Sylva</option><option>Bryson City</option><option>Maggie Valley</option><option>Franklin</option><option>Cashiers</option><option>Highlands</option><option>Dillsboro</option><option>Cullowhee</option></select></div>' +
        '</div>' +
        '<button class="crm-btn crm-btn-primary" style="margin-top:1rem" onclick="sendReviewRequest()">Send Review Request Email</button>' +
      '</div>' +
    '</div>' +
    '<div class="crm-section" style="margin-top:2rem">' +
      '<div class="crm-section-header"><h2>Review Requests</h2></div>' +
      '<div id="rvRequestsList"><div class="crm-loading"><div class="crm-spinner"></div></div></div>' +
    '</div>';
  try {
    var data = await _rvFetch({ action: 'list' });
    if (data.ok) renderReviewRequests(data.requests || []);
    else document.getElementById('rvRequestsList').innerHTML = '<p style="color:var(--text-muted);padding:1rem">Unable to load reviews.</p>';
  } catch(e) {
    document.getElementById('rvRequestsList').innerHTML = '<p style="color:var(--text-muted);padding:1rem">Error loading reviews.</p>';
  }
}

function renderReviewRequests(requests) {
  var el = document.getElementById('rvRequestsList');
  if (!requests.length) { el.innerHTML = '<p style="color:var(--text-muted);padding:1rem">No review requests sent yet.</p>'; return; }
  var html = '<table class="crm-table"><thead><tr><th>Client</th><th>Property</th><th>Status</th><th>Rating</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
  requests.forEach(function(r) {
    var statusLabel = r.status.charAt(0).toUpperCase() + r.status.slice(1);
    if (r.status === 'submitted' && r.review_rating === 5) statusLabel = 'Published';
    var statusClass = (statusLabel === 'Published' || r.status === 'approved') ? 'success' : r.status === 'rejected' ? 'error' : 'pending';
    var stars = r.review_rating ? String.fromCharCode(9733).repeat(r.review_rating) + String.fromCharCode(9734).repeat(5 - r.review_rating) : '-';
    var date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '-';
    var actions = '';
    if (r.status === 'submitted' && r.review_rating < 5 && r.review_id) {
      actions = '<button class="crm-btn-sm crm-btn-success" onclick="approveReview(\x27' + r.review_id + '\x27)">Approve</button> <button class="crm-btn-sm crm-btn-danger" onclick="rejectReview(\x27' + r.review_id + '\x27)">Reject</button>';
    } else if (r.status === 'pending') {
      actions = '<span style="color:var(--text-muted);font-size:0.75rem">Awaiting response</span>';
    } else if (statusLabel === 'Published') {
      actions = '<span style="color:var(--green);font-size:0.75rem">Auto-published</span>';
    }
    html += '<tr><td><strong>' + (r.client_name||'') + '</strong><br><span style="font-size:0.7rem;color:var(--text-muted)">' + (r.client_email||'') + '</span></td>';
    html += '<td>' + (r.property_address||'-') + '<br><span style="font-size:0.7rem;color:var(--text-muted)">' + (r.town||'') + '</span></td>';
    html += '<td><span class="crm-badge crm-badge-' + statusClass + '">' + statusLabel + '</span></td>';
    html += '<td style="color:#C4B08C">' + stars + '</td>';
    html += '<td style="font-size:0.75rem">' + date + '</td>';
    html += '<td>' + actions + '</td></tr>';
    if (r.review_text) {
      html += '<tr><td colspan="6" style="padding:0.5rem 1rem;background:var(--surface);font-size:0.8rem;color:var(--text-body);border-top:none;font-style:italic">' + r.review_text.substring(0,300) + (r.review_text.length>300?'...':'') + '</td></tr>';
    }
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

async function sendReviewRequest() {
  var name = document.getElementById('rvClientName').value.trim();
  var email = document.getElementById('rvClientEmail').value.trim();
  var addr = document.getElementById('rvPropAddr').value.trim();
  var town = document.getElementById('rvTown').value;
  if (!name || !email) { toast('Please enter client name and email.', 'error'); return; }
  if (!email.includes('@')) { toast('Please enter a valid email.', 'error'); return; }
  try {
    var data = await _rvFetch({ action: 'send', clientName: name, clientEmail: email, propertyAddress: addr, town: town });
    if (data.ok) {
      toast('Review request sent to ' + name + '!', 'success');
      document.getElementById('rvClientName').value = '';
      document.getElementById('rvClientEmail').value = '';
      document.getElementById('rvPropAddr').value = '';
      document.getElementById('rvTown').value = '';
      loadReviews();
    } else { toast(data.error || 'Failed to send.', 'error'); }
  } catch(e) { toast('Error sending request.', 'error'); }
}

async function approveReview(reviewId) {
  try {
    var data = await _rvFetch({ action: 'approve', reviewId: reviewId });
    if (data.ok) { toast('Review approved and published!', 'success'); loadReviews(); }
    else toast(data.error || 'Error.', 'error');
  } catch(e) { toast('Error approving.', 'error'); }
}

async function rejectReview(reviewId) {
  try {
    var data = await _rvFetch({ action: 'reject', reviewId: reviewId });
    if (data.ok) { toast('Review rejected.', 'success'); loadReviews(); }
    else toast(data.error || 'Error.', 'error');
  } catch(e) { toast('Error rejecting.', 'error'); }
}
