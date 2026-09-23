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

  function sessionStorageKey(mesa) {
    return 'matilda-session-' + mesa;
  }

  function leerSesion(mesa) {
    try {
      return String(localStorage.getItem(sessionStorageKey(mesa)) || '').trim() || null;
    } catch (e) {
      return null;
    }
  }

  function guardarSesion(mesa, sessionId) {
    try {
      if (sessionId) localStorage.setItem(sessionStorageKey(mesa), sessionId);
      else localStorage.removeItem(sessionStorageKey(mesa));
    } catch (e) {}
  }

  function limpiaSesion(mesa) {
    guardarSesion(mesa, null);
    try {
      localStorage.removeItem('matilda-mesa-cerrada-' + mesa);
      localStorage.removeItem('matilda-cart-' + mesa);
      localStorage.removeItem('matilda-expulsado-' + mesa);
    } catch (e) {}
  }

  var mesaDesdeUrl = leerDeUrl();
  var mesaActual = mesaDesdeUrl || leerGuardada() || 'Mesa01';
  guardar(mesaActual);

  var staffMode = false;
  try {
    var paramsStaff = new URLSearchParams(window.location.search);
    staffMode = paramsStaff.get('staff') === '1';
  } catch (e) {}

  // Escaneó el QR de la mesa: nueva visita → limpia sesión vieja
  // En modo staff no limpiamos (ordenamos sobre la mesa actual).
  var forzarJoin = Boolean(mesaDesdeUrl) && !staffMode;
  if (forzarJoin) {
    limpiaSesion(mesaActual);
  }

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

  if (mesaDesdeUrl) {
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
    sessionKey: function () {
      return sessionStorageKey(mesaActual);
    },
    expelledKey: function () {
      return 'matilda-expulsado-' + mesaActual;
    },
    getSession: function () {
      return leerSesion(mesaActual);
    },
    setSession: function (sessionId) {
      guardarSesion(mesaActual, sessionId);
    },
    clearSession: function () {
      limpiaSesion(mesaActual);
    },
    needsJoin: function () {
      return forzarJoin;
    },
    consumeJoin: function () {
      forzarJoin = false;
    },
    isStaff: function () {
      return staffMode;
    },
    menuPath: function (mesa) {
      return '/?mesa=' + encodeURIComponent(mesa || mesaActual);
    },
  };
})();
