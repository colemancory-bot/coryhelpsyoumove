// ═══ Social Image Generator ═══
// Renders branded listing images using HTML Canvas
// Templates: dark-overlay, banner-bar, full-frame

var SocialImage = (function() {
  var WIDTH = 1080;
  var HEIGHT = 1080; // Square for Instagram
  var _canvas = null;
  var _ctx = null;
  var _img = null;
  var _imgLoaded = false;
  var _offsetY = 0;
  var _dragging = false;
  var _dragStartX = 0;
  var _dragStartY = 0;
  var _dragStartOffsetX = 0;
  var _dragStartOffset = 0;
  var _offsetX = 0;
  var _zoom = 1;
  var _currentTemplate = 'dark-overlay';
  var _listing = null;
  var _onUpdate = null;
  var _photos = [];
  var _photoIndex = 0;

  function init(canvasEl, listing, onUpdate) {
    _canvas = canvasEl;
    _canvas.width = WIDTH;
    _canvas.height = HEIGHT;
    _ctx = _canvas.getContext('2d');
    _listing = listing;
    _onUpdate = onUpdate;
    _offsetY = 0;
    _offsetX = 0;
    _zoom = 1;

    // Build photo list
    _photos = [];
    if (listing.photos && listing.photos.length) {
      _photos = listing.photos.slice();
    } else if (listing.photo) {
      _photos = [listing.photo];
    }
    _photoIndex = 0;

    // Load image
    _img = new Image();
    _img.onload = function() {
      _imgLoaded = true;
      var scale = WIDTH / _img.width;
      var scaledH = _img.height * scale;
      _offsetY = -(scaledH - HEIGHT) / 2;
      render();
    };
    _img.onerror = function() {
      _imgLoaded = false;
      _ctx.fillStyle = '#1A1815';
      _ctx.fillRect(0, 0, WIDTH, HEIGHT);
      _ctx.fillStyle = '#8A8578';
      _ctx.font = '24px sans-serif';
      _ctx.textAlign = 'center';
      _ctx.fillText('Photo not available', WIDTH/2, HEIGHT/2);
    };

    if (_photos.length > 0) _img.src = _photos[0];

    // Drag to reposition
    _canvas.onmousedown = function(e) { startDrag(e.clientX, e.clientY); };
    _canvas.onmousemove = function(e) { if(_dragging) doDrag(e.clientX, e.clientY); };
    _canvas.onmouseup = function() { endDrag(); };
    _canvas.onmouseleave = function() { endDrag(); };
    _canvas.ontouchstart = function(e) { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); };
    _canvas.ontouchmove = function(e) { e.preventDefault(); if(_dragging) doDrag(e.touches[0].clientX, e.touches[0].clientY); };
    _canvas.ontouchend = function() { endDrag(); };
    // Scroll to zoom
    _canvas.onwheel = function(e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? -0.05 : 0.05;
      _zoom = Math.max(0.5, Math.min(3, _zoom + delta));
      render();
    };
  }

  function startDrag(clientX, clientY) {
    _dragging = true;
    _dragStartX = clientX;
    _dragStartY = clientY;
    _dragStartOffsetX = _offsetX;
    _dragStartOffset = _offsetY;
    _canvas.style.cursor = 'grabbing';
  }

  function doDrag(clientX, clientY) {
    var canvasRect = _canvas.getBoundingClientRect();
    var scaleRatio = WIDTH / canvasRect.width;
    var deltaX = (clientX - _dragStartX) * scaleRatio;
    var deltaY = (clientY - _dragStartY) * scaleRatio;
    _offsetX = _dragStartOffsetX + deltaX;
    _offsetY = _dragStartOffset + deltaY;
    render();
  }

  function endDrag() {
    _dragging = false;
    if (_canvas) _canvas.style.cursor = 'grab';
  }

  function setTemplate(name) {
    _currentTemplate = name;
    render();
  }

  function setPhoto(index) {
    if (index < 0 || index >= _photos.length) return;
    _photoIndex = index;
    _imgLoaded = false;
    _offsetX = 0;
    _zoom = 1;
    _img.src = _photos[index];
  }

  function nextPhoto() {
    setPhoto((_photoIndex + 1) % _photos.length);
  }

  function prevPhoto() {
    setPhoto((_photoIndex - 1 + _photos.length) % _photos.length);
  }

  function getPhotoIndex() { return _photoIndex; }
  function getPhotoCount() { return _photos.length; }

  function render() {
    if (!_ctx || !_imgLoaded) return;
    var ctx = _ctx;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Draw photo scaled to fill width with zoom and pan
    var scale = (WIDTH / _img.width) * _zoom;
    var scaledW = _img.width * scale;
    var scaledH = _img.height * scale;
    var drawX = _offsetX + (WIDTH - scaledW) / 2;
    var drawY = _offsetY;
    ctx.drawImage(_img, drawX, drawY, scaledW, scaledH);

    if (_currentTemplate === 'dark-overlay') renderDarkOverlay(ctx);
    else if (_currentTemplate === 'banner-bar') renderBannerBar(ctx);
    else if (_currentTemplate === 'full-frame') renderFullFrame(ctx);

    if (_onUpdate) _onUpdate();
  }

  function renderDarkOverlay(ctx) {
    var l = _listing;
    // Solid dark overlay on bottom half
    ctx.fillStyle = '#0C0B09';
    ctx.fillRect(0, HEIGHT - 340, WIDTH, 340);

    // Gradient transition from photo to solid
    var grad = ctx.createLinearGradient(0, HEIGHT - 420, 0, HEIGHT - 340);
    grad.addColorStop(0, 'rgba(12,11,9,0)');
    grad.addColorStop(1, '#0C0B09');
    ctx.fillStyle = grad;
    ctx.fillRect(0, HEIGHT - 420, WIDTH, 80);

    // Top badge: NEW LISTING
    ctx.fillStyle = '#C4B08C';
    roundRect(ctx, 40, 40, 200, 42, 6);
    ctx.fill();
    ctx.font = '600 16px Outfit, sans-serif';
    ctx.fillStyle = '#0C0B09';
    ctx.textAlign = 'center';
    ctx.fillText('NEW LISTING', 140, 67);

    // Price
    ctx.textAlign = 'left';
    ctx.font = '700 64px Georgia, serif';
    ctx.fillStyle = '#C4B08C';
    ctx.fillText('$' + (l.price || 0).toLocaleString(), 50, HEIGHT - 240);

    // Address
    ctx.font = '400 30px Outfit, sans-serif';
    ctx.fillStyle = '#F5F0E8';
    ctx.fillText(l.address || '', 50, HEIGHT - 190);

    // City, State
    ctx.font = '300 24px Outfit, sans-serif';
    ctx.fillStyle = '#F5F0E8';
    ctx.fillText((l.city || '') + ', North Carolina', 50, HEIGHT - 155);

    // Stats bar
    var statsY = HEIGHT - 110;
    ctx.font = '500 22px Outfit, sans-serif';
    ctx.fillStyle = '#C4B08C';
    var stats = [];
    if (l.type !== 'Land') {
      if (l.beds) stats.push(l.beds + ' Bed');
      if (l.baths) stats.push(l.baths + ' Bath');
      if (l.sqft) stats.push(l.sqft.toLocaleString() + ' SF');
    }
    if (l.lot) stats.push(l.lot);
    ctx.fillText(stats.join('  |  '), 50, statsY);

    // Branding bar at bottom
    ctx.fillStyle = '#0C0B09';
    ctx.fillRect(0, HEIGHT - 70, WIDTH, 70);
    ctx.strokeStyle = '#C4B08C';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(50, HEIGHT - 70); ctx.lineTo(WIDTH - 50, HEIGHT - 70); ctx.stroke();
    ctx.font = '400 18px Outfit, sans-serif';
    ctx.fillStyle = '#C4B08C';
    ctx.textAlign = 'left';
    ctx.fillText('Cory Coleman, Broker  |  Keller Williams Great Smokies', 50, HEIGHT - 38);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#F5F0E8';
    ctx.font = '300 16px Outfit, sans-serif';
    ctx.fillText('coryhelpsyoumove.com', WIDTH - 50, HEIGHT - 38);
    ctx.textAlign = 'left';
  }

  function renderBannerBar(ctx) {
    var l = _listing;

    // Solid banner bar at bottom
    var barH = 200;
    var barY = HEIGHT - barH;
    ctx.fillStyle = '#0C0B09';
    ctx.fillRect(0, barY, WIDTH, barH);

    // Gold accent line
    ctx.fillStyle = '#C4B08C';
    ctx.fillRect(0, barY, WIDTH, 3);

    // Price
    ctx.textAlign = 'left';
    ctx.font = '700 52px Georgia, serif';
    ctx.fillStyle = '#F5F0E8';
    ctx.fillText('$' + (l.price || 0).toLocaleString(), 50, barY + 55);

    // Address + City
    ctx.font = '400 26px Outfit, sans-serif';
    ctx.fillStyle = '#F5F0E8';
    ctx.fillText(l.address || '', 50, barY + 95);
    ctx.font = '300 20px Outfit, sans-serif';
    ctx.fillStyle = '#F5F0E8';
    ctx.fillText((l.city || '') + ', NC', 50, barY + 125);

    // Stats on the right
    ctx.textAlign = 'right';
    ctx.font = '500 22px Outfit, sans-serif';
    ctx.fillStyle = '#C4B08C';
    var stats = [];
    if (l.type !== 'Land') {
      if (l.beds) stats.push(l.beds + ' Bed');
      if (l.baths) stats.push(l.baths + ' Bath');
      if (l.sqft) stats.push(l.sqft.toLocaleString() + ' SF');
    }
    if (l.lot) stats.push(l.lot);
    ctx.fillText(stats.join('  |  '), WIDTH - 50, barY + 55);

    // Branding
    ctx.font = '400 16px Outfit, sans-serif';
    ctx.fillStyle = '#C4B08C';
    ctx.fillText('Cory Coleman, Broker  |  Keller Williams Great Smokies', WIDTH - 50, barY + 170);
    ctx.font = '300 14px Outfit, sans-serif';
    ctx.fillStyle = '#F5F0E8';
    ctx.fillText('coryhelpsyoumove.com', WIDTH - 50, barY + 192);
    ctx.textAlign = 'left';

    // NEW LISTING badge top-left
    ctx.fillStyle = '#C4B08C';
    roundRect(ctx, 40, 40, 200, 42, 6);
    ctx.fill();
    ctx.font = '600 16px Outfit, sans-serif';
    ctx.fillStyle = '#0C0B09';
    ctx.textAlign = 'center';
    ctx.fillText('NEW LISTING', 140, 67);
    ctx.textAlign = 'left';
  }

  function renderFullFrame(ctx) {
    var l = _listing;
    var border = 60;
    var innerW = WIDTH - border * 2;
    var innerH = HEIGHT - 280; // Leave room for info below

    // Dark background
    ctx.fillStyle = '#0C0B09';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Gold border
    ctx.strokeStyle = '#C4B08C';
    ctx.lineWidth = 2;
    ctx.strokeRect(border - 1, border - 1, innerW + 2, innerH + 2);

    // Draw photo inside frame with zoom and pan
    if (_imgLoaded) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(border, border, innerW, innerH);
      ctx.clip();
      var scale = (innerW / _img.width) * _zoom;
      var scaledW = _img.width * scale;
      var scaledH = _img.height * scale;
      var drawX = border + _offsetX * (innerW / WIDTH) + (innerW - scaledW) / 2;
      var drawY = border + _offsetY * (innerH / HEIGHT);
      ctx.drawImage(_img, drawX, drawY, scaledW, scaledH);
      ctx.restore();
    }

    // Info area below frame
    var infoY = border + innerH + 35;

    // Price
    ctx.textAlign = 'left';
    ctx.font = '700 52px Georgia, serif';
    ctx.fillStyle = '#C4B08C';
    ctx.fillText('$' + (l.price || 0).toLocaleString(), border, infoY + 10);

    // Stats on the right of price
    ctx.textAlign = 'right';
    ctx.font = '400 22px Outfit, sans-serif';
    ctx.fillStyle = '#F5F0E8';
    var stats = [];
    if (l.type !== 'Land') {
      if (l.beds) stats.push(l.beds + ' Bed');
      if (l.baths) stats.push(l.baths + ' Bath');
      if (l.sqft) stats.push(l.sqft.toLocaleString() + ' SF');
    }
    if (l.lot) stats.push(l.lot);
    ctx.fillText(stats.join('  |  '), WIDTH - border, infoY - 5);
    ctx.textAlign = 'left';

    // Address
    ctx.font = '400 26px Outfit, sans-serif';
    ctx.fillStyle = '#F5F0E8';
    ctx.fillText(l.address || '', border, infoY + 50);

    // City
    ctx.font = '300 20px Outfit, sans-serif';
    ctx.fillStyle = 'rgba(245,240,232,0.5)';
    ctx.fillText((l.city || '') + ', North Carolina', border, infoY + 80);

    // Branding
    ctx.font = '400 16px Outfit, sans-serif';
    ctx.fillStyle = '#C4B08C';
    ctx.fillText('Cory Coleman, Broker  |  Keller Williams Great Smokies', border, infoY + 120);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(245,240,232,0.4)';
    ctx.font = '300 14px Outfit, sans-serif';
    ctx.fillText('coryhelpsyoumove.com', WIDTH - border, infoY + 120);
    ctx.textAlign = 'left';

    // NEW LISTING badge top-left inside frame
    ctx.fillStyle = 'rgba(196,176,140,0.9)';
    roundRect(ctx, border + 15, border + 15, 180, 38, 5);
    ctx.fill();
    ctx.font = '600 14px Outfit, sans-serif';
    ctx.fillStyle = '#0C0B09';
    ctx.textAlign = 'center';
    ctx.fillText('NEW LISTING', border + 105, border + 39);
    ctx.textAlign = 'left';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function toBlob(callback) {
    if (!_canvas) return;
    _canvas.toBlob(callback, 'image/jpeg', 0.92);
  }

  function toDataURL() {
    if (!_canvas) return '';
    return _canvas.toDataURL('image/jpeg', 0.92);
  }

  return {
    init: init,
    setTemplate: setTemplate,
    setPhoto: setPhoto,
    nextPhoto: nextPhoto,
    prevPhoto: prevPhoto,
    getPhotoIndex: getPhotoIndex,
    getPhotoCount: getPhotoCount,
    render: render,
    toBlob: toBlob,
    toDataURL: toDataURL,
    templates: ['dark-overlay', 'banner-bar', 'full-frame'],
    templateLabels: { 'dark-overlay': 'Dark Overlay', 'banner-bar': 'Banner Bar', 'full-frame': 'Framed' }
  };
})();
