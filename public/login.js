(function () {
  var AREAS = {
    cocina: {
      title: 'Cocina',
      sub: 'PIN de cocina para ver y gestionar pedidos.',
      next: '/cocina.html',
    },
    caja: {
      title: 'Caja / Clientes',
      sub: 'PIN de caja para mesas, QR y cobros.',
      next: '/caja.html',
    },
    admin: {
      title: 'Admin',
      sub: 'PIN de administración del negocio.',
      next: '/admin.html',
    },
  };

  var params = new URLSearchParams(window.location.search);
  var area = String(params.get('area') || 'caja').toLowerCase();
  if (!AREAS[area]) area = 'caja';
  var next =
    params.get('next') ||
    AREAS[area].next;

  var titleEl = document.getElementById('login-title');
  var subEl = document.getElementById('login-sub');
  var form = document.getElementById('login-form');
  var pinInput = document.getElementById('login-pin');
  var errorEl = document.getElementById('login-error');
  var submitBtn = document.getElementById('login-submit');

  if (titleEl) titleEl.textContent = AREAS[area].title;
  if (subEl) subEl.textContent = AREAS[area].sub;

  // Si ya hay sesión válida para esa área, entra directo
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (data && data.ok && data.areas && data.areas.indexOf(area) !== -1) {
        window.location.replace(next);
      }
    })
    .catch(function () {});

  if (!form || !pinInput) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var pin = String(pinInput.value || '').trim();
    if (!pin) return;

    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Entrando…';
    }

    fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area: area, pin: pin }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'PIN incorrecto');
          }
          return data;
        });
      })
      .then(function () {
        window.location.replace(next);
      })
      .catch(function (err) {
        if (errorEl) {
          errorEl.textContent = err.message || 'PIN incorrecto';
          errorEl.hidden = false;
        }
        pinInput.value = '';
        pinInput.focus();
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Entrar';
        }
      });
  });
})();
