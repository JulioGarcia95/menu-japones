(function () {
  var MESA_FIJA =
    (window.MatildaMesa && window.MatildaMesa.get()) || 'Mesa01';
  var CLOSE_KEY =
    (window.MatildaMesa && window.MatildaMesa.closeKey()) ||
    'matilda-mesa-cerrada';
  var statusEl = document.getElementById('pagar-status');
  var sheet = document.getElementById('pagar-sheet');
  var body = document.getElementById('pagar-body');
  var totalEl = document.getElementById('pagar-total');
  var btnPagar = document.getElementById('btn-pagar');
  var btnPagarMp = document.getElementById('btn-pagar-mp');
  var btnPagarMpResultado = document.getElementById('btn-pagar-mp-resultado');
  var hint = document.getElementById('pagar-hint');
  var mpNote = document.getElementById('pagar-mp-note');
  var mesaEl = document.getElementById('pagar-mesa');
  var warn = document.getElementById('pagar-warn');
  var warnBackdrop = document.getElementById('pagar-warn-backdrop');
  var warnReject = document.getElementById('pagar-warn-reject');
  var warnAccept = document.getElementById('pagar-warn-accept');
  var resultado = document.getElementById('pagar-resultado');
  var resultadoBody = document.getElementById('pagar-resultado-body');
  var resultadoTotal = document.getElementById('pagar-resultado-total');
  var qrWrap = document.getElementById('pagar-qr-wrap');
  var qrImg = document.getElementById('pagar-qr');
  var qrMesa = document.getElementById('pagar-qr-mesa');
  var qrTotal = document.getElementById('pagar-qr-total');

  if (!statusEl || !body || !btnPagar) return;
  if (mesaEl) mesaEl.textContent = MESA_FIJA;

  function formatMoney(n) {
    return '$' + Number(n || 0);
  }

  function showQr(data) {
    if (!qrWrap || !qrImg) return;
    if (!data || !data.qrUrl) {
      qrWrap.hidden = true;
      return;
    }
    qrImg.src = data.qrUrl + '&_=' + Date.now();
    if (qrMesa) qrMesa.textContent = data.mesa || MESA_FIJA;
    if (qrTotal) qrTotal.textContent = 'Total ' + formatMoney(data.total);
    qrWrap.hidden = false;
  }

  function mpQuery() {
    try {
      return new URLSearchParams(window.location.search).get('mp');
    } catch (e) {
      return null;
    }
  }

  function pagarConMercadoPago(btn) {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Conectando con Mercado Pago…';
    }
    if (hint) hint.textContent = '';

    fetch('/api/cuenta/mercadopago', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesa: MESA_FIJA }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo iniciar el pago');
          return data;
        });
      })
      .then(function (data) {
        if (!data.checkoutUrl) throw new Error('Mercado Pago no devolvió URL de pago');
        window.location.href = data.checkoutUrl;
      })
      .catch(function (err) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Pagar con Mercado Pago';
        }
        if (hint) hint.textContent = err.message || 'Error con Mercado Pago';
        if (mpNote) {
          mpNote.hidden = false;
          mpNote.textContent =
            'Si aún no configuraste el token, agrega MERCADOPAGO_ACCESS_TOKEN en Render.';
        }
      });
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString('es-MX', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch (e) {
      return iso;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function etiquetaEstado(status) {
    var s = String(status || 'pendiente').toLowerCase();
    if (s === 'listo' || s === 'entregado') return 'Entregado';
    if (s === 'en_proceso') return 'En proceso';
    return 'Pendiente';
  }

  function claseEstado(status) {
    var s = String(status || 'pendiente').toLowerCase();
    if (s === 'listo' || s === 'entregado') return 'entregado';
    if (s === 'en_proceso') return 'en_proceso';
    return 'pendiente';
  }

  function fillTable(targetBody, pedidos) {
    targetBody.innerHTML = '';
    pedidos.forEach(function (pedido, index) {
      var status = claseEstado(pedido.status);
      var itemsText = (pedido.items || [])
        .map(function (item) {
          return item.qty + '× ' + item.name;
        })
        .join(', ');

      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="col-num">' +
        (index + 1) +
        '</td>' +
        '<td>' +
        escapeHtml(formatTime(pedido.createdAt)) +
        '</td>' +
        '<td class="col-pedido">' +
        escapeHtml(itemsText) +
        '</td>' +
        '<td><span class="estado-badge estado-' +
        status +
        '">' +
        etiquetaEstado(pedido.status) +
        '</span></td>' +
        '<td class="col-num">' +
        formatMoney(pedido.total) +
        '</td>';
      targetBody.appendChild(tr);
    });
  }

  function showResultado(data) {
    localStorage.setItem(CLOSE_KEY, '1');
    sheet.hidden = true;
    statusEl.hidden = true;
    resultado.hidden = false;
    fillTable(resultadoBody, data.pedidos || []);
    resultadoTotal.textContent = formatMoney(data.total);
    showQr(data);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openWarn() {
    warn.hidden = false;
    document.body.classList.add('pagar-warn-open');
    window.requestAnimationFrame(function () {
      warn.classList.add('is-visible');
    });
  }

  function closeWarn() {
    warn.classList.remove('is-visible');
    document.body.classList.remove('pagar-warn-open');
    window.setTimeout(function () {
      if (!document.body.classList.contains('pagar-warn-open')) {
        warn.hidden = true;
      }
    }, 250);
  }

  function loadCuenta() {
    statusEl.hidden = false;
    statusEl.textContent = 'Cargando cuenta…';
    sheet.hidden = true;
    resultado.hidden = true;
    hint.textContent = '';
    body.innerHTML = '';

    fetch('/api/cuenta?mesa=' + encodeURIComponent(MESA_FIJA))
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error(data.error || 'Error');
          return data;
        });
      })
      .then(function (data) {
        var pedidos = data.pedidos || [];

        if (data.orderingClosed && pedidos.length) {
          showResultado(data);
          return;
        }

        if (data.orderingClosed && !pedidos.length) {
          localStorage.setItem(CLOSE_KEY, '1');
          statusEl.textContent =
            'La cuenta de ' + MESA_FIJA + ' ya fue solicitada. Pase a caja o espere en la mesa.';
          return;
        }

        if (!pedidos.length) {
          statusEl.textContent =
            'No hay pedidos pendientes de pago en ' + MESA_FIJA + '.';
          btnPagar.disabled = true;
          return;
        }

        statusEl.hidden = true;
        sheet.hidden = false;
        btnPagar.disabled = false;
        fillTable(body, pedidos);
        totalEl.textContent = formatMoney(data.total);
        hint.textContent =
          pedidos.length +
          (pedidos.length === 1 ? ' pedido' : ' pedidos') +
          ' por pagar.';
      })
      .catch(function () {
        statusEl.hidden = false;
        statusEl.textContent =
          'No se pudo cargar la cuenta. Revisa que el servidor esté corriendo.';
        sheet.hidden = true;
      });
  }

  btnPagar.addEventListener('click', openWarn);
  if (btnPagarMp) {
    btnPagarMp.addEventListener('click', function () {
      pagarConMercadoPago(btnPagarMp);
    });
  }
  if (btnPagarMpResultado) {
    btnPagarMpResultado.addEventListener('click', function () {
      pagarConMercadoPago(btnPagarMpResultado);
    });
  }

  warnReject.addEventListener('click', closeWarn);
  warnBackdrop.addEventListener('click', closeWarn);

  warnAccept.addEventListener('click', function () {
    warnAccept.disabled = true;
    warnAccept.textContent = 'Procesando…';

    fetch('/api/cuenta/cerrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesa: MESA_FIJA }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo confirmar');
          return data;
        });
      })
      .then(function (data) {
        warnAccept.disabled = false;
        warnAccept.textContent = 'Aceptar';
        closeWarn();
        showResultado(data);
      })
      .catch(function (err) {
        warnAccept.disabled = false;
        warnAccept.textContent = 'Aceptar';
        hint.textContent = err.message || 'Error al confirmar la cuenta.';
        closeWarn();
        sheet.hidden = false;
      });
  });

  var mpState = mpQuery();
  if (mpState === 'success') {
    statusEl.hidden = false;
    statusEl.textContent =
      'Pago enviado. Si Mercado Pago lo aprobó, la mesa se liberará en unos segundos. Recarga si no ves el cambio.';
    localStorage.removeItem(CLOSE_KEY);
  } else if (mpState === 'failure') {
    statusEl.hidden = false;
    statusEl.textContent = 'El pago no se completó. Puedes intentar de nuevo.';
  } else if (mpState === 'pending') {
    statusEl.hidden = false;
    statusEl.textContent = 'Pago pendiente. Cuando se acredite, la mesa se liberará.';
  }

  fetch('/api/mercadopago/status')
    .then(function (res) {
      return res.json();
    })
    .then(function (data) {
      if (!mpNote) return;
      if (!data.configured) {
        mpNote.hidden = false;
        mpNote.textContent =
          'Mercado Pago aún no está configurado (falta MERCADOPAGO_ACCESS_TOKEN).';
      } else if (data.testMode) {
        mpNote.hidden = false;
        mpNote.textContent =
          'Modo prueba de Mercado Pago activo. Usa las tarjetas de prueba de MP.';
      }
    })
    .catch(function () {});

  loadCuenta();
})();
