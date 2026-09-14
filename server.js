const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const PUERTO = Number(process.env.PORT) || 3000;
const PUBLIC_URL = String(process.env.PUBLIC_URL || '')
  .trim()
  .replace(/\/$/, '');
const PEDIDOS_PATH = path.join(__dirname, 'pedidos.json');
const MESAS_PATH = path.join(__dirname, 'mesas.json');
const CUENTAS_PATH = path.join(__dirname, 'cuentas.json');

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
};

function normalizarMetodoPago(valor) {
  var key = String(valor || '')
    .trim()
    .toLowerCase();
  return METODOS_PAGO[key] ? key : null;
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
  var pedidos = leerPedidos()
    .map(function (p) {
      return Object.assign({}, p, { status: normalizarEstado(p.status) });
    })
    .slice()
    .reverse();

  var estado = String(req.query.estado || '').toLowerCase();
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

  var pedido = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    mesa: mesa,
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

app.patch('/api/pedidos/:id', function (req, res) {
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
    orderingClosed: mesaCerrada(mesa),
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

  var mesas = leerMesas();
  mesas[mesa] = {
    orderingClosed: true,
    closedAt: new Date().toISOString(),
    total: total,
  };
  guardarMesas(mesas);

  console.log('--- Cuenta solicitada ---');
  console.log('Mesa:', mesa);
  console.log('Pedidos:', pedidos.length);
  console.log('Total: $' + total);
  console.log('--------------------');

  res.json({
    ok: true,
    mesa: mesa,
    pedidos: pedidos,
    total: total,
    orderingClosed: true,
  });
});

app.post('/api/cuenta/pagar', function (req, res) {
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

app.get('/api/mesas', function (req, res) {
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

app.get('/api/local-url', function (req, res) {
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

app.get('/api/mesas/:mesa/qr.png', function (req, res) {
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

app.post('/api/mesas/:mesa/reabrir', function (req, res) {
  var mesa = normalizarMesa(req.params.mesa);
  if (!mesa) {
    return res.status(400).json({ ok: false, error: 'Mesa inválida' });
  }

  var metodoPago = normalizarMetodoPago(req.body && req.body.metodoPago);
  if (!metodoPago) {
    return res.status(400).json({
      ok: false,
      error: 'Indica el método de pago (efectivo, tarjeta o transferencia)',
    });
  }

  var pedidos = leerPedidos();
  var ahora = new Date().toISOString();
  var deMesa = pedidos.filter(function (p) {
    return p.mesa === mesa && !p.paid;
  });

  if (deMesa.length) {
    var total = deMesa.reduce(function (sum, p) {
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

  var mesas = leerMesas();
  mesas[mesa] = {
    orderingClosed: false,
    reopenedAt: ahora,
  };
  guardarMesas(mesas);

  console.log('--- Mesa reabierta ---');
  console.log('Mesa:', mesa);
  console.log('Método:', METODOS_PAGO[metodoPago]);
  console.log('Pedidos archivados:', deMesa.length);
  console.log('--------------------');

  res.json({
    ok: true,
    mesa: mesa,
    metodoPago: metodoPago,
    pedidosCerrados: deMesa.length,
    pedidosEliminados: deMesa.length,
    orderingClosed: false,
  });
});

app.get('/api/admin/cuentas', function (req, res) {
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
});
