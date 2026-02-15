// ═══ THEME TOGGLE (shared across all pages) ═══
(function(){
  // Restore saved theme
  var saved = localStorage.getItem('theme');
  if(saved) document.documentElement.setAttribute('data-theme', saved);
})();

function toggleTheme(){
  var html = document.documentElement;
  var current = html.getAttribute('data-theme');
  var next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

// ═══ NAV SCROLL ═══
window.addEventListener('scroll', function(){
  var nav = document.getElementById('nav');
  if(nav) nav.classList.toggle('scrolled', window.scrollY > 40);
});

// ═══ MOBILE MENU ═══
document.addEventListener('DOMContentLoaded', function(){
  var toggle = document.getElementById('navToggle');
  var menu = document.getElementById('mobileMenu');
  if(toggle && menu){
    toggle.addEventListener('click', function(){
      menu.classList.toggle('open');
      toggle.classList.toggle('active');
    });
  }
});

function closeMobile(){
  var menu = document.getElementById('mobileMenu');
  var toggle = document.getElementById('navToggle');
  if(menu) menu.classList.remove('open');
  if(toggle) toggle.classList.remove('active');
}
