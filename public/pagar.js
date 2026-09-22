(function () {
  var MESA_FIJA =
    (window.MatildaMesa && window.MatildaMesa.get()) || 'Mesa01';
  var CLOSE_KEY =
    (window.MatildaMesa && window.MatildaMesa.closeKey()) ||
    'matilda-mesa-cerrada';
  var EXPELLED_KEY =
    (window.MatildaMesa && window.MatildaMesa.expelledKey()) ||
    'matilda-expulsado-' + MESA_FIJA;
  var statusEl = document.getElementById('pagar-status');
  var sheet = document.getElementById('pagar-sheet');
  var body = document.getElementById('pagar-body');
  var totalEl = document.getElementById('pagar-total');
  var btnPagar = document.getElementById('btn-pagar');
  var hint = document.getElementById('pagar-hint');
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
    if (s === 'en_proceso') return 'En cocina';
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

  function getSessionId() {
    return (window.MatildaMesa && window.MatildaMesa.getSession()) || null;
  }

  function cuentaUrl() {
    var url = '/api/cuenta?mesa=' + encodeURIComponent(MESA_FIJA);
    var ses = getSessionId();
    if (ses) url += '&sessionId=' + encodeURIComponent(ses);
    if (window.MatildaMesa && window.MatildaMesa.needsJoin()) {
      url += '&join=1';
    }
    return url;
  }

  function loadCuenta() {
    statusEl.hidden = false;
    statusEl.textContent = 'Cargando cuenta…';
    sheet.hidden = true;
    resultado.hidden = true;
    hint.textContent = '';
    body.innerHTML = '';

    fetch(cuentaUrl())
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error(data.error || 'Error');
          return data;
        });
      })
      .then(function (data) {
        if (data.sessionId && window.MatildaMesa && !data.expulsado) {
          window.MatildaMesa.setSession(data.sessionId);
        }
        if (window.MatildaMesa && window.MatildaMesa.consumeJoin) {
          window.MatildaMesa.consumeJoin();
        }

        if (data.expulsado) {
          localStorage.setItem(EXPELLED_KEY, '1');
          localStorage.setItem(CLOSE_KEY, '1');
          statusEl.textContent =
            'Esta visita ya terminó (cuenta pagada). Escanea de nuevo el QR de la mesa si quieres ordenar.';
          btnPagar.disabled = true;
          return;
        }

        var pedidos = data.pedidos || [];

        if (data.orderingClosed && pedidos.length) {
          showResultado(data);
          return;
        }

        if (data.orderingClosed && !pedidos.length) {
          localStorage.setItem(CLOSE_KEY, '1');
          statusEl.textContent =
            'La cuenta de ' +
            MESA_FIJA +
            ' ya fue solicitada. Pase a caja o espere en la mesa.';
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
          ' por pagar. En caja te cobrarán con Point Smart.';
      })
      .catch(function () {
        statusEl.hidden = false;
        statusEl.textContent =
          'No se pudo cargar la cuenta. Revisa que el servidor esté corriendo.';
        sheet.hidden = true;
      });
  }

  btnPagar.addEventListener('click', openWarn);

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

  loadCuenta();
})();
