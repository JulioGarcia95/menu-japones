(function () {
  var MESA_KEY = 'matilda-mesa';
  var MESAS_VALIDAS = { Mesa01: true, Mesa02: true };

  function normalizarMesa(valor) {
    var texto = String(valor || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
    if (!texto) return null;

    var match = texto.match(/^(?:MESA)?0*([0-9]{1,3})$/);
    if (!match) return null;

    var mesa = 'Mesa' + match[1].padStart(2, '0');
    return MESAS_VALIDAS[mesa] ? mesa : null;
  }

  function leerDeUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      return normalizarMesa(params.get('mesa') || params.get('m'));
    } catch (e) {
      return null;
    }
  }

  function leerGuardada() {
    try {
      return normalizarMesa(localStorage.getItem(MESA_KEY));
    } catch (e) {
      return null;
    }
  }

  function guardar(mesa) {
    try {
      localStorage.setItem(MESA_KEY, mesa);
    } catch (e) {}
  }

  var mesaActual = leerDeUrl() || leerGuardada() || 'Mesa01';
  guardar(mesaActual);

  function conMesaEnHref(href) {
    try {
      var url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return href;
      url.searchParams.set('mesa', mesaActual);
      return url.pathname + url.search + url.hash;
    } catch (e) {
      return href;
    }
  }

  function enlazarNavegacion() {
    document.querySelectorAll('a.site-nav-btn[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      if (href.indexOf('cocina') !== -1 || href.indexOf('clientes') !== -1) return;
      a.setAttribute('href', conMesaEnHref(href));
    });
  }

  // Si llegaron con ?mesa=, limpia la URL manteniendo la mesa en storage
  if (leerDeUrl()) {
    try {
      var limpia = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', limpia);
    } catch (e) {}
  }

  enlazarNavegacion();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enlazarNavegacion);
  }

  window.MatildaMesa = {
    get: function () {
      return mesaActual;
    },
    closeKey: function () {
      return 'matilda-mesa-cerrada-' + mesaActual;
    },
    cartKey: function () {
      return 'matilda-cart-' + mesaActual;
    },
    menuPath: function (mesa) {
      return '/?mesa=' + encodeURIComponent(mesa || mesaActual);
    },
  };
})();
