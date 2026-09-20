(function () {
  var area = document.body.getAttribute('data-staff-area');
  if (!area) return;

  function goLogin() {
    var next = window.location.pathname + window.location.search;
    window.location.replace(
      '/login.html?area=' +
        encodeURIComponent(area) +
        '&next=' +
        encodeURIComponent(next)
    );
  }

  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!data || !data.ok || !data.areas || data.areas.indexOf(area) === -1) {
        goLogin();
        return;
      }
      document.body.classList.add('staff-ready');
      var label = document.getElementById('staff-area-label');
      if (label) {
        label.textContent =
          data.area === 'admin' ? 'Admin' : data.area === 'caja' ? 'Caja' : 'Cocina';
      }
    })
    .catch(function () {
      goLogin();
    });

  document.querySelectorAll('[data-staff-logout]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      }).finally(function () {
        goLogin();
      });
    });
  });

  // Si una API responde 401, manda a login
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    return origFetch.apply(this, arguments).then(function (res) {
      if (res.status === 401) {
        var url =
          typeof input === 'string'
            ? input
            : (input && input.url) || '';
        if (url.indexOf('/api/auth/') === -1) {
          goLogin();
        }
      }
      return res;
    });
  };
})();
