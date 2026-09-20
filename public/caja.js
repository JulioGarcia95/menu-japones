(function () {
  var scanSection = document.getElementById('caja-scan');
  var cuentaSection = document.getElementById('caja-cuenta');
  var scanStatus = document.getElementById('caja-scan-status');
  var tokenInput = document.getElementById('caja-token-input');
  var cargarBtn = document.getElementById('caja-cargar-btn');
  var mesaLabel = document.getElementById('caja-mesa-label');
  var totalEl = document.getElementById('caja-total');
  var statusEl = document.getElementById('caja-status');
  var body = document.getElementById('caja-body');
  var pagarMpBtn = document.getElementById('caja-pagar-mp');
  var nuevaBtn = document.getElementById('caja-nueva');
  var readerEl = document.getElementById('caja-reader');

  if (!scanSection || !cuentaSection) return;

  var cuentaActual = null;
  var html5QrCode = null;
  var scanning = false;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMoney(n) {
    return '$' + Number(n || 0);
  }

  function parseCajaUrl(text) {
    try {
      var url = new URL(text, window.location.origin);
      var mesa = url.searchParams.get('mesa');
      var t = url.searchParams.get('t');
      if (mesa) return { mesa: mesa, t: t || '' };
    } catch (e) {}

    // Formato corto: Mesa01|pay-xxx
    var parts = String(text || '').split('|');
    if (parts.length >= 1 && /^Mesa/i.test(parts[0].trim())) {
      return { mesa: parts[0].trim(), t: (parts[1] || '').trim() };
    }
    return null;
  }

  function showCuenta(data) {
    cuentaActual = data;
    scanSection.hidden = true;
    cuentaSection.hidden = false;
    stopScanner();

    if (mesaLabel) mesaLabel.textContent = data.mesa;
    if (totalEl) totalEl.textContent = formatMoney(data.total);
    if (statusEl) {
      statusEl.textContent =
        (data.pedidos || []).length +
        ' pedido(s) · Listo para cobrar';
    }

    if (body) {
      body.innerHTML = '';
      (data.pedidos || []).forEach(function (pedido, index) {
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
          '<td class="col-pedido">' +
          escapeHtml(itemsText) +
          '</td>' +
          '<td class="col-num">' +
          formatMoney(pedido.total) +
          '</td>';
        body.appendChild(tr);
      });
    }
  }

  function showScan() {
    cuentaActual = null;
    cuentaSection.hidden = true;
    scanSection.hidden = false;
    if (statusEl) statusEl.textContent = '';
    if (tokenInput) tokenInput.value = '';
    startScanner();
  }

  function cargarCuenta(mesa, token) {
    if (scanStatus) scanStatus.textContent = 'Cargando cuenta…';
    fetch(
      '/api/caja?mesa=' +
        encodeURIComponent(mesa) +
        '&t=' +
        encodeURIComponent(token || '')
    )
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo cargar');
          return data;
        });
      })
      .then(showCuenta)
      .catch(function (err) {
        if (scanStatus) {
          scanStatus.textContent = err.message || 'Error al cargar la cuenta';
        }
        alert(err.message || 'Error al cargar la cuenta');
      });
  }

  function onScanSuccess(decodedText) {
    if (!scanning) return;
    var parsed = parseCajaUrl(decodedText);
    if (!parsed) {
      if (scanStatus) scanStatus.textContent = 'QR no válido. Intenta de nuevo.';
      return;
    }
    scanning = false;
    if (scanStatus) scanStatus.textContent = 'QR leído: ' + parsed.mesa;
    cargarCuenta(parsed.mesa, parsed.t);
  }

  function startScanner() {
    if (!readerEl || typeof Html5Qrcode === 'undefined') {
      if (scanStatus) {
        scanStatus.textContent =
          'Cámara no disponible. Pega el enlace del QR abajo.';
      }
      return;
    }
    if (html5QrCode) return;

    html5QrCode = new Html5Qrcode('caja-reader');
    scanning = true;
    Html5Qrcode.getCameras()
      .then(function (cameras) {
        if (!cameras || !cameras.length) {
          throw new Error('No hay cámara');
        }
        var back = cameras.find(function (c) {
          return /back|rear|environment/i.test(c.label || '');
        });
        var id = (back || cameras[0]).id;
        return html5QrCode.start(
          id,
          { fps: 8, qrbox: { width: 240, height: 240 } },
          onScanSuccess,
          function () {}
        );
      })
      .then(function () {
        if (scanStatus) scanStatus.textContent = 'Apunta la cámara al QR del cliente…';
      })
      .catch(function () {
        if (scanStatus) {
          scanStatus.textContent =
            'No se pudo abrir la cámara. Pega el enlace del QR abajo.';
        }
        html5QrCode = null;
        scanning = false;
      });
  }

  function stopScanner() {
    scanning = false;
    if (!html5QrCode) return;
    html5QrCode
      .stop()
      .then(function () {
        html5QrCode.clear();
        html5QrCode = null;
      })
      .catch(function () {
        html5QrCode = null;
      });
  }

  if (cargarBtn) {
    cargarBtn.addEventListener('click', function () {
      var parsed = parseCajaUrl((tokenInput && tokenInput.value) || '');
      if (!parsed || !parsed.mesa) {
        if (scanStatus) {
          scanStatus.textContent =
            'Pega el enlace completo del QR (o el código Mesa01|token).';
        }
        return;
      }
      cargarCuenta(parsed.mesa, parsed.t);
    });
  }

  if (nuevaBtn) {
    nuevaBtn.addEventListener('click', showScan);
  }

  if (pagarMpBtn) {
    pagarMpBtn.addEventListener('click', function () {
      if (!cuentaActual) return;
      pagarMpBtn.disabled = true;
      pagarMpBtn.textContent = 'Abriendo Mercado Pago…';
      fetch('/api/cuenta/mercadopago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesa: cuentaActual.mesa }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok || !data.ok) throw new Error(data.error || 'Error');
            return data;
          });
        })
        .then(function (data) {
          window.location.href = data.checkoutUrl;
        })
        .catch(function (err) {
          pagarMpBtn.disabled = false;
          pagarMpBtn.textContent = 'Cobrar con Mercado Pago';
          alert(err.message || 'No se pudo iniciar el cobro');
        });
    });
  }

  // Si llegan con ?mesa=&t= (escaneo externo / lector que abre URL)
  try {
    var params = new URLSearchParams(window.location.search);
    var mesaQ = params.get('mesa');
    var tQ = params.get('t');
    if (mesaQ && tQ) {
      cargarCuenta(mesaQ, tQ);
      return;
    }
  } catch (e) {}

  showScan();
})();
