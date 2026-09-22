const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');

const app = express();
const PUERTO = Number(process.env.PORT) || 3000;
const PUBLIC_URL = String(process.env.PUBLIC_URL || '')
  .trim()
  .replace(/\/$/, '');
const PEDIDOS_PATH = path.join(__dirname, 'pedidos.json');
const MESAS_PATH = path.join(__dirname, 'mesas.json');
const CUENTAS_PATH = path.join(__dirname, 'cuentas.json');
const AUTH_COOKIE = 'matilda_staff';
const AUTH_TTL_MS = 12 * 60 * 60 * 1000;
const AUTH_SECRET =
  String(process.env.AUTH_SECRET || '').trim() ||
  crypto.randomBytes(24).toString('hex');

var PINES = {
  cocina: String(process.env.COCINA_PIN || '1234').trim(),
  caja: String(process.env.CAJA_PIN || '1234').trim(),
  admin: String(process.env.ADMIN_PIN || '9999').trim(),
};

var PAGE_AREAS = {
  '/cocina.html': 'cocina',
  '/clientes.html': 'caja',
  '/caja.html': 'caja',
  '/admin.html': 'admin',
};

app.set('trust proxy', 1);
app.use(express.json());

function parseCookies(req) {
  var out = {};
  String(req.headers.cookie || '')
    .split(';')
    .forEach(function (part) {
      var i = part.indexOf('=');
      if (i === -1) return;
      var k = part.slice(0, i).trim();
      var v = part.slice(i + 1).trim();
      try {
        out[k] = decodeURIComponent(v);
      } catch (e) {
        out[k] = v;
      }
    });
  return out;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(str) {
  var s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

function firmarToken(payload) {
  var body = b64url(JSON.stringify(payload));
  var sig = b64url(
    crypto.createHmac('sha256', AUTH_SECRET).update(body).digest()
  );
  return body + '.' + sig;
}

function verificarToken(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  var body = parts[0];
  var sig = parts[1];
  var expected = b64url(
    crypto.createHmac('sha256', AUTH_SECRET).update(body).digest()
  );
  var a = Buffer.from(sig);
  var b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    var payload = JSON.parse(fromB64url(body));
    if (!payload || !payload.area || !payload.exp) return null;
    if (Date.now() > Number(payload.exp)) return null;
    if (!PINES[payload.area]) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function leerAuth(req) {
  var cookies = parseCookies(req);
  var token = cookies[AUTH_COOKIE] || '';
  var header = String(req.headers.authorization || '');
  if (!token && header.toLowerCase().indexOf('bearer ') === 0) {
    token = header.slice(7).trim();
  }
  return verificarToken(token);
}

function areasDeAuth(auth) {
  if (!auth) return [];
  if (auth.area === 'admin') return ['cocina', 'caja', 'admin'];
  return [auth.area];
}

function authPuede(auth, area) {
  return areasDeAuth(auth).indexOf(area) !== -1;
}

function cookieSegura(req) {
  if (String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true') {
    return true;
  }
  var proto = String(req.headers['x-forwarded-proto'] || req.protocol || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return proto === 'https';
}

function setAuthCookie(req, res, token) {
  var parts = [
    AUTH_COOKIE + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + Math.floor(AUTH_TTL_MS / 1000),
  ];
  if (cookieSegura(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAuthCookie(req, res) {
  var parts = [
    AUTH_COOKIE + '=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (cookieSegura(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function requireAreas(areas) {
  var allowed = Array.isArray(areas) ? areas : [areas];
  return function (req, res, next) {
    var auth = leerAuth(req);
    for (var i = 0; i < allowed.length; i++) {
      if (authPuede(auth, allowed[i])) {
        req.staff = auth;
        return next();
      }
    }
    return res.status(401).json({
      ok: false,
      error: 'Necesitas iniciar sesión con PIN',
      login: '/login.html',
    });
  };
}

// Bloquea páginas de staff antes de servir estáticos
app.use(function (req, res, next) {
  var area = PAGE_AREAS[req.path];
  if (!area) return next();
  if (authPuede(leerAuth(req), area)) return next();
  var nextUrl = req.path + (req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?')) : '');
  return res.redirect(
    '/login.html?area=' +
      encodeURIComponent(area) +
      '&next=' +
      encodeURIComponent(nextUrl)
  );
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/auth/me', function (req, res) {
  var auth = leerAuth(req);
  if (!auth) {
    return res.json({ ok: false, authenticated: false });
  }
  res.json({
    ok: true,
    authenticated: true,
    area: auth.area,
    areas: areasDeAuth(auth),
  });
});

app.post('/api/auth/login', function (req, res) {
  var area = String((req.body && req.body.area) || '')
    .trim()
    .toLowerCase();
  var pin = String((req.body && req.body.pin) || '').trim();

  if (!PINES[area]) {
    return res.status(400).json({ ok: false, error: 'Área inválida' });
  }
  if (!pin || pin !== PINES[area]) {
    return res.status(401).json({ ok: false, error: 'PIN incorrecto' });
  }

  var token = firmarToken({
    area: area,
    iat: Date.now(),
    exp: Date.now() + AUTH_TTL_MS,
  });
  setAuthCookie(req, res, token);
  res.json({
    ok: true,
    area: area,
    areas: areasDeAuth({ area: area }),
  });
});

app.post('/api/auth/logout', function (req, res) {
  clearAuthCookie(req, res);
  res.json({ ok: true });
});

function urlPublica(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  if (req) {
    var proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
      .split(',')[0]
      .trim();
    var host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim();
    if (host) return proto + '://' + host;
  }
  var ip = obtenerIpLocal();
  return ip ? 'http://' + ip + ':' + PUERTO : 'http://localhost:' + PUERTO;
}

function leerPedidos() {
  try {
    const raw = fs.readFileSync(PEDIDOS_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map(function (pedido) {
      return Object.assign({}, pedido, {
        status: pedido.status || 'pendiente',
      });
    });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function guardarPedidos(pedidos) {
  fs.writeFileSync(PEDIDOS_PATH, JSON.stringify(pedidos, null, 2), 'utf8');
}

function leerMesas() {
  try {
    var raw = fs.readFileSync(MESAS_PATH, 'utf8');
    var data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function guardarMesas(mesas) {
  fs.writeFileSync(MESAS_PATH, JSON.stringify(mesas, null, 2), 'utf8');
}

function leerCuentas() {
  try {
    var raw = fs.readFileSync(CUENTAS_PATH, 'utf8');
    var data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function guardarCuentas(cuentas) {
  fs.writeFileSync(CUENTAS_PATH, JSON.stringify(cuentas, null, 2), 'utf8');
}

var METODOS_PAGO = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
  point: 'Point Smart',
};

function normalizarMetodoPago(valor) {
  var key = String(valor || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (key === 'mercado_pago' || key === 'mp') key = 'mercadopago';
  if (key === 'pointsmart' || key === 'points') key = 'point';
  return METODOS_PAGO[key] ? key : null;
}

function mpAccessToken() {
  return String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
}

function pointTerminalId() {
  return String(process.env.POINT_TERMINAL_ID || '').trim();
}

function mpEsModoPrueba() {
  var token = mpAccessToken();
  if (!token) return false;
  if (String(process.env.MERCADOPAGO_TEST_MODE || '').toLowerCase() === 'true') {
    return true;
  }
  return token.indexOf('TEST') === 0;
}

function formatoMontoPoint(total) {
  return Number(total || 0).toFixed(2);
}

function nuevoIdempotencyKey() {
  return crypto.randomBytes(16).toString('hex');
}

function finalizarCuentaMesa(mesa, metodoPago) {
  var pedidos = leerPedidos();
  var ahora = new Date().toISOString();
  var deMesa = pedidos.filter(function (p) {
    return p.mesa === mesa && !p.paid;
  });

  var total = 0;
  if (deMesa.length) {
    total = deMesa.reduce(function (sum, p) {
      return sum + (Number(p.total) || 0);
    }, 0);

    var cuenta = {
      id: 'cuenta-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      mesa: mesa,
      cliente: mesa,
      createdAt: ahora,
      closedAt: ahora,
      metodoPago: metodoPago,
      metodoPagoLabel: METODOS_PAGO[metodoPago],
      total: total,
      pedidos: deMesa.map(function (p) {
        return {
          id: p.id,
          createdAt: p.createdAt,
          status: normalizarEstado(p.status),
          items: p.items || [],
          total: Number(p.total) || 0,
        };
      }),
    };

    var cuentas = leerCuentas();
    cuentas.push(cuenta);
    guardarCuentas(cuentas);
  }

  pedidos = pedidos.filter(function (p) {
    return p.mesa !== mesa;
  });
  guardarPedidos(pedidos);

  // Nueva sesión; la anterior queda baneada (no puede seguir ordenando)
  var mesas = leerMesas();
  var prev = mesas[mesa] || {};
  var banned = Array.isArray(prev.bannedSessions)
    ? prev.bannedSessions.slice()
    : [];
  if (prev.sessionId) banned.push(prev.sessionId);
  if (banned.length > 20) banned = banned.slice(-20);

  mesas[mesa] = {
    orderingClosed: false,
    reopenedAt: ahora,
    paidWith: metodoPago,
    paidAt: ahora,
    sessionId: nuevoSessionId(),
    bannedSessions: banned,
    payToken: null,
  };
  guardarMesas(mesas);

  return {
    mesa: mesa,
    metodoPago: metodoPago,
    pedidosCerrados: deMesa.length,
    total: total,
    orderingClosed: false,
    sessionId: mesas[mesa].sessionId,
  };
}

function nuevoSessionId() {
  return (
    'ses-' +
    Date.now().toString(36) +
    '-' +
    Math.floor(Math.random() * 1e6).toString(36)
  );
}

function asegurarSesionMesa(mesa) {
  var mesas = leerMesas();
  var info = mesas[mesa] || {};
  if (!info.sessionId) {
    info.sessionId = nuevoSessionId();
    mesas[mesa] = info;
    guardarMesas(mesas);
  }
  return info.sessionId;
}

function tienePedidosAbiertos(mesa) {
  return leerPedidos().some(function (p) {
    return p.mesa === mesa && !p.paid;
  });
}

function sesionesBaneadas(mesa) {
  var info = leerMesas()[mesa] || {};
  return Array.isArray(info.bannedSessions) ? info.bannedSessions : [];
}

function evaluarSesionCliente(mesa, clientSession, opts) {
  opts = opts || {};
  var forzarNueva = Boolean(opts.forzarNueva);
  var serverSes = asegurarSesionMesa(mesa);
  var banned = sesionesBaneadas(mesa);

  if (forzarNueva) {
    // Escaneó QR de mesa otra vez: adopta la sesión actual
    return {
      sessionId: serverSes,
      sessionValid: true,
      expulsado: false,
    };
  }

  if (!clientSession) {
    return {
      sessionId: serverSes,
      sessionValid: true,
      expulsado: false,
    };
  }

  if (clientSession === serverSes) {
    return {
      sessionId: serverSes,
      sessionValid: true,
      expulsado: false,
    };
  }

  // Solo expulsamos sesiones que pagaron / cerraron cuenta
  if (banned.indexOf(clientSession) !== -1) {
    return {
      sessionId: serverSes,
      sessionValid: false,
      expulsado: true,
    };
  }

  // Sesión vieja (p. ej. tras reinicio del servidor) y mesa libre → reenganche
  if (!mesaCerrada(mesa) && !tienePedidosAbiertos(mesa)) {
    return {
      sessionId: serverSes,
      sessionValid: true,
      expulsado: false,
    };
  }

  return {
    sessionId: serverSes,
    sessionValid: false,
    expulsado: true,
  };
}

function fechaLocalISO(iso) {
  try {
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  } catch (e) {
    return null;
  }
}

function mesaCerrada(mesa) {
  var info = leerMesas()[mesa];
  return Boolean(info && info.orderingClosed);
}

var MESAS_BASE = ['Mesa01', 'Mesa02'];

function normalizarMesa(valor) {
  var texto = String(valor || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!texto) return null;

  var match = texto.match(/^(?:MESA)?0*([0-9]{1,3})$/);
  if (!match) return null;

  var num = match[1];
  return 'Mesa' + num.padStart(2, '0');
}

function normalizarEstado(status) {
  var s = String(status || 'pendiente').toLowerCase();
  if (s === 'listo') return 'entregado';
  if (s === 'en_proceso' || s === 'entregado' || s === 'pendiente') return s;
  return 'pendiente';
}

function etiquetaEstado(status) {
  var s = normalizarEstado(status);
  if (s === 'en_proceso') return 'En proceso';
  if (s === 'entregado') return 'Entregado';
  return 'Pendiente';
}

app.get('/api/pedidos', function (req, res) {
  var estado = String(req.query.estado || '').toLowerCase();
  if (estado === 'activos') {
    var auth = leerAuth(req);
    if (!authPuede(auth, 'cocina') && !authPuede(auth, 'admin')) {
      return res.status(401).json({
        ok: false,
        error: 'Necesitas iniciar sesión con PIN',
        login: '/login.html?area=cocina',
      });
    }
  }

  var pedidos = leerPedidos()
    .map(function (p) {
      return Object.assign({}, p, { status: normalizarEstado(p.status) });
    })
    .slice()
    .reverse();

  if (estado === 'activos') {
    pedidos = pedidos.filter(function (p) {
      return p.status === 'pendiente' || p.status === 'en_proceso';
    });
  } else if (
    estado === 'pendiente' ||
    estado === 'en_proceso' ||
    estado === 'entregado'
  ) {
    pedidos = pedidos.filter(function (p) {
      return p.status === estado;
    });
  }
  res.json({ ok: true, pedidos: pedidos });
});

app.post('/api/pedidos', function (req, res) {
  var items = req.body && req.body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: 'El pedido no tiene ítems' });
  }

  var mesa = normalizarMesa(req.body.mesa);
  if (!mesa) {
    return res
      .status(400)
      .json({ ok: false, error: 'Indica la mesa (ejemplo: Mesa01)' });
  }

  if (mesaCerrada(mesa)) {
    return res.status(403).json({
      ok: false,
      error: 'La cuenta ya fue solicitada. Ya no se pueden ordenar más platillos.',
    });
  }

  var clientSession = String((req.body && req.body.sessionId) || '').trim();
  var ses = evaluarSesionCliente(mesa, clientSession);
  if (ses.expulsado) {
    return res.status(403).json({
      ok: false,
      error:
        'Esta visita ya terminó (cuenta pagada). Escanea de nuevo el QR de la mesa para ordenar.',
      expulsado: true,
      sessionId: ses.sessionId,
    });
  }

  var pedido = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    mesa: mesa,
    sessionId: ses.sessionId,
    status: 'pendiente',
    paid: false,
    createdAt: new Date().toISOString(),
    items: items.map(function (item) {
      return {
        id: String(item.id || ''),
        name: String(item.name || ''),
        price: Number(item.price) || 0,
        qty: Math.max(1, Number(item.qty) || 1),
      };
    }),
    total: Number(req.body.total) || 0,
  };

  var pedidos = leerPedidos();
  pedidos.push(pedido);
  guardarPedidos(pedidos);

  console.log('--- Nuevo pedido ---');
  console.log('Mesa:', pedido.mesa);
  console.log('ID:', pedido.id);
  console.log('Hora:', pedido.createdAt);
  pedido.items.forEach(function (item) {
    console.log('- ' + item.qty + ' x ' + item.name + ' ($' + item.price + ')');
  });
  console.log('Total: $' + pedido.total);
  console.log('--------------------');

  res.json({ ok: true, id: pedido.id, mesa: pedido.mesa });
});

app.patch('/api/pedidos/:id', requireAreas(['cocina', 'admin']), function (req, res) {
  var id = String(req.params.id || '');
  var status = normalizarEstado(req.body && req.body.status);
  if (
    status !== 'pendiente' &&
    status !== 'en_proceso' &&
    status !== 'entregado'
  ) {
    return res.status(400).json({ ok: false, error: 'Estado inválido' });
  }

  var pedidos = leerPedidos();
  var index = -1;
  for (var i = 0; i < pedidos.length; i++) {
    if (pedidos[i].id === id) {
      index = i;
      break;
    }
  }

  if (index === -1) {
    return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
  }

  pedidos[index].status = status;
  if (status === 'en_proceso') {
    pedidos[index].startedAt = new Date().toISOString();
  }
  if (status === 'entregado') {
    pedidos[index].deliveredAt = new Date().toISOString();
  }
  guardarPedidos(pedidos);

  console.log('Pedido', id, '→', etiquetaEstado(status));
  res.json({ ok: true, pedido: pedidos[index] });
});

app.get('/api/cuenta', function (req, res) {
  var mesa = normalizarMesa(req.query.mesa || 'Mesa01');
  if (!mesa) {
    return res.status(400).json({ ok: false, error: 'Mesa inválida' });
  }

  var clientSession = String(req.query.sessionId || '').trim();
  var forzarNueva =
    String(req.query.join || '') === '1' ||
    String(req.query.join || '').toLowerCase() === 'true';
  var ses = evaluarSesionCliente(mesa, clientSession, { forzarNueva: forzarNueva });

  var pedidos = leerPedidos()
    .map(function (p) {
      return Object.assign({}, p, {
        status: normalizarEstado(p.status),
        paid: Boolean(p.paid),
      });
    })
    .filter(function (p) {
      return p.mesa === mesa && !p.paid;
    });

  // Si está expulsado, no le mostramos la cuenta activa de los nuevos comensales
  if (ses.expulsado) {
    return res.json({
      ok: true,
      mesa: mesa,
      pedidos: [],
      total: 0,
      orderingClosed: true,
      expulsado: true,
      sessionValid: false,
      sessionId: ses.sessionId,
      payToken: null,
      cajaUrl: null,
      qrUrl: null,
    });
  }

  var total = pedidos.reduce(function (sum, p) {
    return sum + (Number(p.total) || 0);
  }, 0);

  var info = leerMesas()[mesa] || {};
  var closed = mesaCerrada(mesa);
  var payToken = info.payToken || null;

  if (closed && !payToken && pedidos.length) {
    payToken =
      'pay-' +
      Date.now().toString(36) +
      '-' +
      Math.floor(Math.random() * 1e6).toString(36);
    info.payToken = payToken;
    var mesasFix = leerMesas();
    mesasFix[mesa] = Object.assign({}, info, { payToken: payToken });
    guardarMesas(mesasFix);
  }

  var base = urlPublica(req);
  var cajaUrl = null;
  var qrUrl = null;
  if (closed && payToken) {
    cajaUrl =
      base +
      '/caja.html?mesa=' +
      encodeURIComponent(mesa) +
      '&t=' +
      encodeURIComponent(payToken);
    qrUrl =
      '/api/cuenta/qr.png?mesa=' +
      encodeURIComponent(mesa) +
      '&t=' +
      encodeURIComponent(payToken);
  }

  res.json({
    ok: true,
    mesa: mesa,
    pedidos: pedidos,
    total: total,
    orderingClosed: closed,
    expulsado: false,
    sessionValid: true,
    sessionId: ses.sessionId,
    payToken: payToken,
    cajaUrl: cajaUrl,
    qrUrl: qrUrl,
  });
});

app.post('/api/cuenta/cerrar', function (req, res) {
  var mesa = normalizarMesa((req.body && req.body.mesa) || 'Mesa01');
  if (!mesa) {
    return res.status(400).json({ ok: false, error: 'Mesa inválida' });
  }

  var pedidos = leerPedidos()
    .map(function (p) {
      return Object.assign({}, p, {
        status: normalizarEstado(p.status),
        paid: Boolean(p.paid),
      });
    })
    .filter(function (p) {
      return p.mesa === mesa && !p.paid;
    });

  if (!pedidos.length) {
    return res.status(400).json({
      ok: false,
      error: 'No hay pedidos pendientes de pago en esta mesa',
    });
  }

  var total = pedidos.reduce(function (sum, p) {
    return sum + (Number(p.total) || 0);
  }, 0);

  var payToken =
    'pay-' +
    Date.now().toString(36) +
    '-' +
    Math.floor(Math.random() * 1e6).toString(36);

  var mesas = leerMesas();
  var prev = mesas[mesa] || {};
  mesas[mesa] = {
    orderingClosed: true,
    closedAt: new Date().toISOString(),
    total: total,
    payToken: payToken,
    sessionId: prev.sessionId || nuevoSessionId(),
    bannedSessions: Array.isArray(prev.bannedSessions)
      ? prev.bannedSessions
      : [],
  };
  guardarMesas(mesas);

  var base = urlPublica(req);
  var cajaUrl =
    base +
    '/caja.html?mesa=' +
    encodeURIComponent(mesa) +
    '&t=' +
    encodeURIComponent(payToken);

  console.log('--- Cuenta solicitada ---');
  console.log('Mesa:', mesa);
  console.log('Pedidos:', pedidos.length);
  console.log('Total: $' + total);
  console.log('Caja QR:', cajaUrl);
  console.log('--------------------');

  res.json({
    ok: true,
    mesa: mesa,
    pedidos: pedidos,
    total: total,
    orderingClosed: true,
    payToken: payToken,
    cajaUrl: cajaUrl,
    qrUrl:
      '/api/cuenta/qr.png?mesa=' +
      encodeURIComponent(mesa) +
      '&t=' +
      encodeURIComponent(payToken),
  });
});

app.get('/api/cuenta/qr.png', function (req, res) {
  var mesa = normalizarMesa(req.query.mesa);
  var token = String(req.query.t || '').trim();
  if (!mesa) {
    return res.status(400).send('Mesa inválida');
  }

  var info = leerMesas()[mesa] || {};
  if (info.payToken && token && info.payToken !== token) {
    return res.status(403).send('Token inválido');
  }

  var payToken = token || info.payToken;
  if (!payToken) {
    return res.status(400).send('No hay QR de pago para esta mesa');
  }

  var base = urlPublica(req);
  var cajaUrl =
    base +
    '/caja.html?mesa=' +
    encodeURIComponent(mesa) +
    '&t=' +
    encodeURIComponent(payToken);

  QRCode.toBuffer(cajaUrl, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
    .then(function (buf) {
      res.setHeader('Cache-Control', 'no-store');
      res.type('png').send(buf);
    })
    .catch(function () {
      res.status(500).send('No se pudo generar el QR');
    });
});

app.get('/api/caja', requireAreas(['caja', 'admin']), function (req, res) {
  var mesa = normalizarMesa(req.query.mesa);
  var token = String(req.query.t || '').trim();
  if (!mesa) {
    return res.status(400).json({ ok: false, error: 'Mesa inválida' });
  }

  var info = leerMesas()[mesa] || {};
  if (!info.orderingClosed) {
    return res.status(400).json({
      ok: false,
      error: 'Esta mesa aún no ha solicitado la cuenta',
    });
  }
  if (!info.payToken || info.payToken !== token) {
    return res.status(403).json({
      ok: false,
      error: 'Código QR inválido o vencido. Pide al cliente generar uno nuevo.',
    });
  }

  var pedidos = leerPedidos()
    .map(function (p) {
      return Object.assign({}, p, {
        status: normalizarEstado(p.status),
        paid: Boolean(p.paid),
      });
    })
    .filter(function (p) {
      return p.mesa === mesa && !p.paid;
    });

  var total = pedidos.reduce(function (sum, p) {
    return sum + (Number(p.total) || 0);
  }, 0);

  res.json({
    ok: true,
    mesa: mesa,
    pedidos: pedidos,
    total: total,
    closedAt: info.closedAt || null,
    payToken: token,
  });
});

app.post('/api/cuenta/pagar', requireAreas(['caja', 'admin']), function (req, res) {
  var mesa = normalizarMesa((req.body && req.body.mesa) || 'Mesa01');
  if (!mesa) {
    return res.status(400).json({ ok: false, error: 'Mesa inválida' });
  }

  var pedidos = leerPedidos();
  var pagados = 0;
  var total = 0;
  var ahora = new Date().toISOString();

  for (var i = 0; i < pedidos.length; i++) {
    if (pedidos[i].mesa === mesa && !pedidos[i].paid) {
      pedidos[i].paid = true;
      pedidos[i].paidAt = ahora;
      pagados += 1;
      total += Number(pedidos[i].total) || 0;
    }
  }

  if (pagados === 0) {
    return res.status(400).json({
      ok: false,
      error: 'No hay pedidos pendientes de pago en esta mesa',
    });
  }

  guardarPedidos(pedidos);
  console.log('--- Cuenta pagada ---');
  console.log('Mesa:', mesa);
  console.log('Pedidos:', pagados);
  console.log('Total: $' + total);
  console.log('--------------------');

  res.json({ ok: true, mesa: mesa, pagados: pagados, total: total });
});

app.get('/api/mesas', requireAreas(['caja', 'admin']), function (req, res) {
  var mesasState = leerMesas();
  var pedidos = leerPedidos().map(function (p) {
    return Object.assign({}, p, {
      status: normalizarEstado(p.status),
      paid: Boolean(p.paid),
    });
  });

  var nombres = MESAS_BASE.slice();
  Object.keys(mesasState).forEach(function (nombre) {
    if (nombres.indexOf(nombre) === -1) nombres.push(nombre);
  });
  pedidos.forEach(function (p) {
    if (p.mesa && nombres.indexOf(p.mesa) === -1) nombres.push(p.mesa);
  });
  nombres.sort();

  var lista = nombres.map(function (nombre) {
    var info = mesasState[nombre] || {};
    var abiertos = pedidos.filter(function (p) {
      return p.mesa === nombre && !p.paid;
    });
    var total = abiertos.reduce(function (sum, p) {
      return sum + (Number(p.total) || 0);
    }, 0);
    var closed = Boolean(info.orderingClosed);
    var estado = 'libre';
    if (closed) estado = 'cuenta_solicitada';
    else if (abiertos.length > 0) estado = 'ocupada';

    return {
      mesa: nombre,
      estado: estado,
      orderingClosed: closed,
      pedidosAbiertos: abiertos.length,
      total: total,
      closedAt: info.closedAt || null,
    };
  });

  res.json({ ok: true, mesas: lista });
});

app.get('/api/local-url', requireAreas(['caja', 'admin']), function (req, res) {
  var base = urlPublica(req);
  var ip = obtenerIpLocal();
  res.json({
    ok: true,
    baseUrl: base,
    ip: ip,
    puerto: PUERTO,
    mesas: MESAS_BASE.map(function (mesa) {
      return {
        mesa: mesa,
        menuUrl: base + '/?mesa=' + encodeURIComponent(mesa),
        qrUrl: '/api/mesas/' + encodeURIComponent(mesa) + '/qr.png',
      };
    }),
  });
});

app.get('/api/mesas/:mesa/qr.png', requireAreas(['caja', 'admin']), function (req, res) {
  var mesa = normalizarMesa(req.params.mesa);
  if (!mesa || MESAS_BASE.indexOf(mesa) === -1) {
    return res.status(400).send('Mesa no válida');
  }

  var base =
    (req.query.host && String(req.query.host).trim()) || urlPublica(req);
  base = base.replace(/\/$/, '');
  var menuUrl = base + '/?mesa=' + encodeURIComponent(mesa);

  QRCode.toBuffer(menuUrl, {
    type: 'png',
    width: 480,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
    .then(function (buf) {
      res.setHeader('Cache-Control', 'no-store');
      res.type('png').send(buf);
    })
    .catch(function () {
      res.status(500).send('No se pudo generar el QR');
    });
});

app.post('/api/mesas/:mesa/reabrir', requireAreas(['caja', 'admin']), function (req, res) {
  var mesa = normalizarMesa(req.params.mesa);
  if (!mesa) {
    return res.status(400).json({ ok: false, error: 'Mesa inválida' });
  }

  var metodoPago = normalizarMetodoPago(req.body && req.body.metodoPago);
  if (!metodoPago) {
    return res.status(400).json({
      ok: false,
      error: 'Indica el método de pago (efectivo, tarjeta, transferencia o mercadopago)',
    });
  }

  var resultado = finalizarCuentaMesa(mesa, metodoPago);

  console.log('--- Mesa reabierta ---');
  console.log('Mesa:', resultado.mesa);
  console.log('Método:', METODOS_PAGO[resultado.metodoPago]);
  console.log('Pedidos archivados:', resultado.pedidosCerrados);
  console.log('--------------------');

  res.json({
    ok: true,
    mesa: resultado.mesa,
    metodoPago: resultado.metodoPago,
    pedidosCerrados: resultado.pedidosCerrados,
    pedidosEliminados: resultado.pedidosCerrados,
    orderingClosed: false,
  });
});

app.get('/api/mercadopago/status', function (req, res) {
  var token = mpAccessToken();
  res.json({
    ok: true,
    configured: Boolean(token),
    testMode: mpEsModoPrueba(),
    pointConfigured: Boolean(token && pointTerminalId()),
    pointTerminalId: pointTerminalId() ? '***' + pointTerminalId().slice(-6) : null,
  });
});

app.post('/api/cuenta/point', requireAreas(['caja', 'admin']), function (req, res) {
  var token = mpAccessToken();
  var terminalId = pointTerminalId();

  if (!token) {
    return res.status(503).json({
      ok: false,
      error:
        'Falta MERCADOPAGO_ACCESS_TOKEN. Agrégalo en Render → Environment.',
    });
  }
  if (!terminalId) {
    return res.status(503).json({
      ok: false,
      error:
        'Falta POINT_TERMINAL_ID. Ej: NEWLAND_N950__N950NCD300083446',
    });
  }

  var mesa = normalizarMesa((req.body && req.body.mesa) || '');
  if (!mesa) {
    return res.status(400).json({ ok: false, error: 'Mesa inválida' });
  }

  var pedidos = leerPedidos()
    .map(function (p) {
      return Object.assign({}, p, {
        status: normalizarEstado(p.status),
        paid: Boolean(p.paid),
      });
    })
    .filter(function (p) {
      return p.mesa === mesa && !p.paid;
    });

  if (!pedidos.length) {
    return res.status(400).json({
      ok: false,
      error: 'No hay pedidos pendientes de pago en esta mesa',
    });
  }

  var total = pedidos.reduce(function (sum, p) {
    return sum + (Number(p.total) || 0);
  }, 0);

  if (total <= 0) {
    return res.status(400).json({ ok: false, error: 'El total debe ser mayor a 0' });
  }

  var amount = formatoMontoPoint(total);
  var mesas = leerMesas();
  var prev = mesas[mesa] || {};
  mesas[mesa] = Object.assign({}, prev, {
    orderingClosed: true,
    closedAt: new Date().toISOString(),
    total: total,
    pointPending: true,
  });
  guardarMesas(mesas);

  var body = {
    type: 'point',
    external_reference: mesa,
    expiration_time: 'PT16M',
    description: 'Cuenta ' + mesa + ' — Matilda Kitchen',
    transactions: {
      payments: [{ amount: amount }],
    },
    config: {
      point: {
        terminal_id: terminalId,
        print_on_terminal: 'seller_ticket',
      },
    },
  };

  fetch('https://api.mercadopago.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': nuevoIdempotencyKey(),
    },
    body: JSON.stringify(body),
  })
    .then(function (mpRes) {
      return mpRes.json().then(function (data) {
        if (!mpRes.ok) {
          var msg =
            (data && data.message) ||
            (data && data.error) ||
            (Array.isArray(data) && JSON.stringify(data)) ||
            (data && data.errors && JSON.stringify(data.errors)) ||
            'No se pudo enviar el cobro al Point';
          throw new Error(msg);
        }
        return data;
      });
    })
    .then(function (data) {
      var orderId = data.id;
      var mesas2 = leerMesas();
      var info = mesas2[mesa] || {};
      info.pointOrderId = orderId;
      info.pointPending = true;
      mesas2[mesa] = info;
      guardarMesas(mesas2);

      console.log('--- Point order ---');
      console.log('Mesa:', mesa);
      console.log('Total: $' + amount);
      console.log('Order:', orderId);
      console.log('Terminal:', terminalId);
      console.log('--------------------');

      res.json({
        ok: true,
        mesa: mesa,
        total: total,
        orderId: orderId,
        status: data.status || 'created',
      });
    })
    .catch(function (err) {
      var msg = err.message || 'Error al contactar Point / Mercado Pago';
      // Si no quedó order creada, quitar bandera pending (salvo cobro previo atascado)
      if (!/already_queued/i.test(msg)) {
        try {
          var mesasErr = leerMesas();
          var infoErr = mesasErr[mesa] || {};
          if (!infoErr.pointOrderId) {
            infoErr.pointPending = false;
            mesasErr[mesa] = infoErr;
            guardarMesas(mesasErr);
          }
        } catch (e) {}
      }
      res.status(502).json({
        ok: false,
        error: msg,
      });
    });
});

app.get(
  '/api/cuenta/point/:orderId',
  requireAreas(['caja', 'admin']),
  function (req, res) {
    var token = mpAccessToken();
    var orderId = String(req.params.orderId || '').trim();
    if (!token) {
      return res.status(503).json({ ok: false, error: 'Falta token MP' });
    }
    if (!orderId) {
      return res.status(400).json({ ok: false, error: 'Order inválida' });
    }

    fetch('https://api.mercadopago.com/v1/orders/' + encodeURIComponent(orderId), {
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (mpRes) {
        return mpRes.json().then(function (data) {
          if (!mpRes.ok) {
            throw new Error(
              (data && data.message) || 'No se pudo consultar la order'
            );
          }
          return data;
        });
      })
      .then(function (order) {
        var status = String(order.status || '').toLowerCase();
        var mesa = normalizarMesa(order.external_reference);
        var paid =
          status === 'processed' ||
          status === 'finished' ||
          status === 'closed';

        if (paid && mesa) {
          var info = leerMesas()[mesa] || {};
          if (info.pointPending || info.orderingClosed) {
            finalizarCuentaMesa(mesa, 'point');
          }
        }

        res.json({
          ok: true,
          orderId: order.id,
          status: order.status,
          statusDetail: order.status_detail,
          mesa: mesa,
          paid: paid,
        });
      })
      .catch(function (err) {
        res.status(502).json({
          ok: false,
          error: err.message || 'Error al consultar Point',
        });
      });
  }
);

app.post('/api/cuenta/point/cancel', requireAreas(['caja', 'admin']), function (req, res) {
  var token = mpAccessToken();
  if (!token) {
    return res.status(503).json({ ok: false, error: 'Falta token MP' });
  }

  var mesa = normalizarMesa((req.body && req.body.mesa) || '');
  var orderId = String((req.body && req.body.orderId) || '').trim();
  var mesas = leerMesas();
  var info = (mesa && mesas[mesa]) || {};

  if (!orderId && mesa) {
    orderId = String(info.pointOrderId || '').trim();
  }
  if (!orderId) {
    return res.status(400).json({
      ok: false,
      error: 'No hay cobro pendiente en Point para cancelar',
    });
  }

  fetch(
    'https://api.mercadopago.com/v1/orders/' +
      encodeURIComponent(orderId) +
      '/cancel',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': nuevoIdempotencyKey(),
        'x-allow-cancelable-status': 'at_terminal',
      },
    }
  )
    .then(function (mpRes) {
      return mpRes.json().then(function (data) {
        // 200 = cancelada; 202 = aceptada (at_terminal, confirma por webhook)
        if (mpRes.ok || mpRes.status === 202) {
          return data || {};
        }
        // Ya cancelada / expirada: limpiamos igual
        var msgText = '';
        if (Array.isArray(data)) {
          msgText = JSON.stringify(data);
        } else if (data) {
          msgText = String(
            data.message ||
              data.error ||
              (data.errors && JSON.stringify(data.errors)) ||
              ''
          );
        }
        var alreadyGone =
          mpRes.status === 404 ||
          /cancel|expir|not found|already/i.test(msgText);
        if (alreadyGone) {
          return data || {};
        }
        throw new Error(
          msgText || 'No se pudo cancelar el cobro en Point'
        );
      });
    })
    .then(function (data) {
      if (mesa) {
        var mesas2 = leerMesas();
        var info2 = mesas2[mesa] || {};
        info2.pointPending = false;
        info2.pointOrderId = null;
        mesas2[mesa] = info2;
        guardarMesas(mesas2);
      }

      console.log('--- Point order cancelada ---');
      console.log('Mesa:', mesa || '(sin mesa)');
      console.log('Order:', orderId);
      console.log('-----------------------------');

      res.json({
        ok: true,
        mesa: mesa || null,
        orderId: orderId,
        status: (data && data.status) || 'canceled',
      });
    })
    .catch(function (err) {
      res.status(502).json({
        ok: false,
        error: err.message || 'Error al cancelar cobro Point',
      });
    });
});

app.post('/api/cuenta/mercadopago', requireAreas(['caja', 'admin']), function (req, res) {
  var token = mpAccessToken();
  if (!token) {
    return res.status(503).json({
      ok: false,
      error:
        'Falta MERCADOPAGO_ACCESS_TOKEN. Agrégalo en Render → Environment (token de prueba).',
    });
  }

  var mesa = normalizarMesa((req.body && req.body.mesa) || 'Mesa01');
  if (!mesa) {
    return res.status(400).json({ ok: false, error: 'Mesa inválida' });
  }

  var pedidos = leerPedidos()
    .map(function (p) {
      return Object.assign({}, p, {
        status: normalizarEstado(p.status),
        paid: Boolean(p.paid),
      });
    })
    .filter(function (p) {
      return p.mesa === mesa && !p.paid;
    });

  if (!pedidos.length) {
    return res.status(400).json({
      ok: false,
      error: 'No hay pedidos pendientes de pago en esta mesa',
    });
  }

  var total = pedidos.reduce(function (sum, p) {
    return sum + (Number(p.total) || 0);
  }, 0);

  if (total <= 0) {
    return res.status(400).json({ ok: false, error: 'El total debe ser mayor a 0' });
  }

  // Cierra pedidos nuevos mientras paga
  var mesas = leerMesas();
  mesas[mesa] = {
    orderingClosed: true,
    closedAt: new Date().toISOString(),
    total: total,
    mpPending: true,
  };
  guardarMesas(mesas);

  var base = urlPublica(req);
  var preference = {
    items: [
      {
        id: 'cuenta-' + mesa,
        title: 'Cuenta ' + mesa + ' — Matilda Kitchen',
        description: pedidos.length + ' pedido(s)',
        quantity: 1,
        currency_id: 'MXN',
        unit_price: Number(total),
      },
    ],
    external_reference: mesa,
    metadata: { mesa: mesa },
    notification_url: base + '/api/webhooks/mercadopago',
    back_urls: {
      success: base + '/pagar.html?mp=success&mesa=' + encodeURIComponent(mesa),
      failure: base + '/pagar.html?mp=failure&mesa=' + encodeURIComponent(mesa),
      pending: base + '/pagar.html?mp=pending&mesa=' + encodeURIComponent(mesa),
    },
    auto_return: 'approved',
    statement_descriptor: 'MATILDA',
  };

  fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(preference),
  })
    .then(function (mpRes) {
      return mpRes.json().then(function (data) {
        if (!mpRes.ok) {
          var msg =
            (data && data.message) ||
            (data && data.error) ||
            'No se pudo crear el pago en Mercado Pago';
          throw new Error(msg);
        }
        return data;
      });
    })
    .then(function (data) {
      // Credenciales nuevas (APP_USR de prueba) → init_point
      // Credenciales viejas (TEST-...) → sandbox_init_point
      var checkoutUrl;
      if (String(token).indexOf('TEST') === 0) {
        checkoutUrl = data.sandbox_init_point || data.init_point;
      } else {
        // APP_USR de "Credenciales de prueba": NO usar sandbox_init_point
        // (provoca "una de las partes es de prueba")
        checkoutUrl = data.init_point || data.sandbox_init_point;
      }

      console.log('--- MP preferencia ---');
      console.log('Mesa:', mesa);
      console.log('Total: $' + total);
      console.log('Preference:', data.id);
      console.log('Test mode:', mpEsModoPrueba());
      console.log('Checkout:', checkoutUrl ? checkoutUrl.slice(0, 60) + '...' : 'none');
      console.log('--------------------');

      res.json({
        ok: true,
        mesa: mesa,
        total: total,
        preferenceId: data.id,
        checkoutUrl: checkoutUrl,
        testMode: mpEsModoPrueba(),
      });
    })
    .catch(function (err) {
      res.status(502).json({
        ok: false,
        error: err.message || 'Error al contactar Mercado Pago',
      });
    });
});

function procesarOrderPoint(orderId) {
  var token = mpAccessToken();
  if (!token || !orderId) {
    return Promise.resolve({ ok: false, reason: 'sin token o id' });
  }

  return fetch(
    'https://api.mercadopago.com/v1/orders/' + encodeURIComponent(orderId),
    { headers: { Authorization: 'Bearer ' + token } }
  )
    .then(function (mpRes) {
      return mpRes.json().then(function (data) {
        if (!mpRes.ok) throw new Error('No se pudo leer la order Point');
        return data;
      });
    })
    .then(function (order) {
      var status = String(order.status || '').toLowerCase();
      var paid =
        status === 'processed' ||
        status === 'finished' ||
        status === 'closed';
      if (!paid) {
        return { ok: false, reason: 'status ' + order.status };
      }

      var mesa = normalizarMesa(order.external_reference);
      if (!mesa) {
        return { ok: false, reason: 'sin mesa en external_reference' };
      }

      var resultado = finalizarCuentaMesa(mesa, 'point');
      console.log('--- Point pago aprobado ---');
      console.log('Order:', orderId);
      console.log('Mesa:', mesa);
      console.log('Status:', order.status);
      console.log('--------------------');
      return { ok: true, mesa: mesa, resultado: resultado };
    });
}

function procesarPagoMercadoPago(paymentId) {
  var token = mpAccessToken();
  if (!token || !paymentId) {
    return Promise.resolve({ ok: false, reason: 'sin token o id' });
  }

  return fetch('https://api.mercadopago.com/v1/payments/' + paymentId, {
    headers: { Authorization: 'Bearer ' + token },
  })
    .then(function (mpRes) {
      return mpRes.json().then(function (data) {
        if (!mpRes.ok) throw new Error('No se pudo leer el pago');
        return data;
      });
    })
    .then(function (pago) {
      if (pago.status !== 'approved') {
        return { ok: false, reason: 'status ' + pago.status };
      }

      var mesa = normalizarMesa(
        pago.external_reference ||
          (pago.metadata && (pago.metadata.mesa || pago.metadata.Mesa))
      );
      if (!mesa) {
        return { ok: false, reason: 'sin mesa en external_reference' };
      }

      var resultado = finalizarCuentaMesa(mesa, 'mercadopago');
      console.log('--- MP pago aprobado ---');
      console.log('Payment:', paymentId);
      console.log('Mesa:', mesa);
      console.log('Total MP:', pago.transaction_amount);
      console.log('--------------------');
      return { ok: true, mesa: mesa, resultado: resultado };
    });
}

app.post('/api/webhooks/mercadopago', function (req, res) {
  var dataId =
    (req.body && req.body.data && req.body.data.id) ||
    req.query.id ||
    (req.body && req.body.id);

  var topic = String(
    (req.body && req.body.type) ||
      (req.body && req.body.topic) ||
      req.query.type ||
      req.query.topic ||
      ''
  ).toLowerCase();

  var action = String((req.body && req.body.action) || '').toLowerCase();

  // Responder rápido a MP; procesar después
  res.status(200).json({ ok: true });

  if (!dataId) return;

  if (
    topic === 'order' ||
    topic.indexOf('order') !== -1 ||
    action.indexOf('order') !== -1
  ) {
    procesarOrderPoint(dataId).catch(function (err) {
      console.error('Webhook Point error:', err.message || err);
    });
    return;
  }

  if (topic && topic.indexOf('payment') === -1) return;

  procesarPagoMercadoPago(dataId).catch(function (err) {
    console.error('Webhook MP error:', err.message || err);
  });
});

app.get('/api/webhooks/mercadopago', function (req, res) {
  var paymentId = req.query.id;
  var topic = String(req.query.topic || req.query.type || '').toLowerCase();
  res.status(200).send('ok');

  if (!paymentId) return;

  if (topic.indexOf('order') !== -1) {
    procesarOrderPoint(paymentId).catch(function (err) {
      console.error('Webhook Point GET error:', err.message || err);
    });
    return;
  }

  if (topic.indexOf('payment') === -1) return;
  procesarPagoMercadoPago(paymentId).catch(function (err) {
    console.error('Webhook MP GET error:', err.message || err);
  });
});

app.get('/api/admin/cuentas', requireAreas(['admin']), function (req, res) {
  var fecha = String(req.query.fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    fecha = fechaLocalISO(new Date().toISOString());
  }

  var cuentas = leerCuentas()
    .filter(function (c) {
      var dia = fechaLocalISO(c.closedAt || c.createdAt);
      return dia === fecha;
    })
    .slice()
    .sort(function (a, b) {
      return String(b.closedAt || '').localeCompare(String(a.closedAt || ''));
    })
    .map(function (c) {
      return Object.assign({}, c, {
        metodoPagoLabel:
          c.metodoPagoLabel || METODOS_PAGO[c.metodoPago] || c.metodoPago,
      });
    });

  var totalDia = cuentas.reduce(function (sum, c) {
    return sum + (Number(c.total) || 0);
  }, 0);

  res.json({
    ok: true,
    fecha: fecha,
    cuentas: cuentas,
    totalDia: totalDia,
    metodos: METODOS_PAGO,
  });
});

function obtenerIpLocal() {
  var interfaces = os.networkInterfaces();
  for (var nombre of Object.keys(interfaces)) {
    for (var iface of interfaces[nombre] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

app.listen(PUERTO, '0.0.0.0', function () {
  var base = PUBLIC_URL || urlPublica();
  console.log('Servidor corriendo en el puerto ' + PUERTO);
  console.log('URL:     ' + base);
  console.log('Cocina:  ' + base + '/cocina.html');
  console.log('Admin:   ' + base + '/admin.html');
  console.log('QR mesas:' + base + '/clientes.html');
  console.log('QR Mesa01 → ' + base + '/?mesa=Mesa01');
  console.log('QR Mesa02 → ' + base + '/?mesa=Mesa02');
  console.log('PINs staff → cocina / caja / admin (vars COCINA_PIN, CAJA_PIN, ADMIN_PIN)');
});
