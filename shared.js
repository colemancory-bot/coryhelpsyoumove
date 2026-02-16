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

// ═══ PRICE RANGE SLIDER (shared for town pages) ═══
var PS_MAX=2000000,PS_STEP=25000;
function fmtP(v){if(v<=0)return'$0';if(v>=PS_MAX)return'$2M+';if(v>=1000000)return'$'+(v/1000000).toFixed(v%1000000?1:0)+'M';return'$'+(v/1000)+'K'}

function initSlider(id){
  var wrap=document.getElementById('ps-'+id);
  if(!wrap||wrap._init)return;wrap._init=true;
  var track=document.getElementById('pst-'+id);
  var fill=document.getElementById('psf-'+id);
  var tA=document.getElementById('psa-'+id);
  var tB=document.getElementById('psb-'+id);
  var disp=document.getElementById('psd-'+id);
  var hidden=document.getElementById((id==='hero'||id==='hero-m')?'hsPrice':'tps-price-'+id);
  if(!track||!tA||!tB)return;
  var vals=[0,0],moved=[false,false];

  function pctOf(v){return(v/PS_MAX)*100}
  function valAt(pct){return Math.round((pct*PS_MAX)/PS_STEP)*PS_STEP}

  function render(){
    var a=vals[0],b=vals[1],lo=Math.min(a,b),hi=Math.max(a,b);
    tA.style.left=pctOf(a)+'%';
    tB.style.left=pctOf(b)+'%';
    fill.style.left=pctOf(lo)+'%';
    fill.style.width=(pctOf(hi)-pctOf(lo))+'%';
    tA.classList.toggle('idle',!moved[0]);
    tB.classList.toggle('idle',!moved[1]);
    var anyMoved=moved[0]||moved[1];
    if(!anyMoved){disp.textContent='';if(hidden)hidden.value='';return}
    if(lo===0&&hi===0){disp.textContent='';if(hidden)hidden.value='';return}
    if(lo===0&&hi>0){disp.textContent='Up to '+fmtP(hi);if(hidden)hidden.value='0-'+hi}
    else if(lo>0&&lo===hi){disp.textContent=fmtP(lo)+'+';if(hidden)hidden.value=lo+'-'+PS_MAX}
    else if(lo>0){disp.textContent=fmtP(lo)+' — '+fmtP(hi);if(hidden)hidden.value=lo+'-'+hi}
  }

  function startDrag(idx,e){
    e.preventDefault();e.stopPropagation();
    var thumb=idx===0?tA:tB;
    thumb.classList.add('active');moved[idx]=true;
    function onMove(ev){
      ev.preventDefault();
      var rect=track.getBoundingClientRect();
      var cx=ev.touches?ev.touches[0].clientX:ev.clientX;
      var pct=Math.max(0,Math.min(1,(cx-rect.left)/rect.width));
      vals[idx]=valAt(pct);
      render();
    }
    function onUp(){
      thumb.classList.remove('active');
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
      document.removeEventListener('touchmove',onMove);
      document.removeEventListener('touchend',onUp);
    }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
    document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('touchend',onUp);
  }

  tA.addEventListener('mousedown',function(e){startDrag(0,e)});
  tA.addEventListener('touchstart',function(e){startDrag(0,e)},{passive:false});
  tB.addEventListener('mousedown',function(e){startDrag(1,e)});
  tB.addEventListener('touchstart',function(e){startDrag(1,e)},{passive:false});

  track.addEventListener('mousedown',function(e){
    if(e.target.classList.contains('ps-thumb'))return;
    var rect=track.getBoundingClientRect();
    var pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
    var v=valAt(pct);
    if(!moved[0]){vals[0]=v;moved[0]=true;startDrag(0,e)}
    else if(!moved[1]){vals[1]=v;moved[1]=true;startDrag(1,e)}
    else{var d0=Math.abs(vals[0]-v),d1=Math.abs(vals[1]-v);if(d0<=d1){vals[0]=v;startDrag(0,e)}else{vals[1]=v;startDrag(1,e)}}
    render();
  });

  wrap._reset=function(){vals=[0,0];moved=[false,false];render()};
  render();
}

// Auto-init any sliders found on the page
document.addEventListener('DOMContentLoaded', function(){
  var wraps = document.querySelectorAll('.ps-wrap[id]');
  wraps.forEach(function(el){
    var id = el.id.replace('ps-','');
    if(id) initSlider(id);
  });
});

// ═══ TOWN PAGE CARD WIRING ═══
// Makes static property cards clickable on standalone town pages (not index.html)
(function(){
  // Only run on town pages (not the main site which has app.js)
  if(document.getElementById('featuredGrid')) return; // main site has this

  document.addEventListener('DOMContentLoaded', function(){
    var cards = document.querySelectorAll('.f-card');
    if(!cards.length) return;

    cards.forEach(function(card){
      var priceEl = card.querySelector('.f-card-price');
      var addrEl = card.querySelector('.f-card-addr');
      var cityEl = card.querySelector('.f-card-city');
      if(!priceEl || !addrEl) return;

      var price = priceEl.textContent.trim();
      var addr = addrEl.textContent.trim();
      var city = cityEl ? cityEl.textContent.replace(/,\s*NC$/i,'').trim() : '';

      // Make card clickable — navigate to main site and open property
      card.style.cursor = 'pointer';
      card.onclick = function(){
        var base = window.location.pathname.indexOf('/towns/') > -1 ? '../index.html' : '/index.html';
        var url = base + '?prop=' + encodeURIComponent(addr) + '&city=' + encodeURIComponent(city);
        window.location.href = url;
      };
    });
  });
})();
