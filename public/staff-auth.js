(function () {
  var areasAttr =
    document.body.getAttribute('data-staff-areas') ||
    document.body.getAttribute('data-staff-area');
  if (!areasAttr) return;

  var needed = String(areasAttr)
    .split(',')
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  if (!needed.length) return;

  var loginArea = needed[0];

  function goLogin() {
    var next = window.location.pathname + window.location.search;
    window.location.replace(
      '/login.html?area=' +
        encodeURIComponent(loginArea) +
        '&next=' +
        encodeURIComponent(next)
    );
  }

  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      var areas = (data && data.areas) || [];
      var ok =
        data &&
        data.ok &&
        needed.some(function (a) {
          return areas.indexOf(a) !== -1;
        });
      if (!ok) {
        goLogin();
        return;
      }
      document.body.classList.add('staff-ready');
      var label = document.getElementById('staff-area-label');
      if (label) {
        label.textContent =
          data.area === 'admin'
            ? 'Admin'
            : data.area === 'caja'
              ? 'Caja'
              : 'Cocina';
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
