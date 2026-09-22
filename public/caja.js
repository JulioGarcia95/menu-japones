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
  var pagarPointBtn = document.getElementById('caja-pagar-point');
  var cancelarPointBtn = document.getElementById('caja-cancelar-point');
  var imprimirConsumoBtn = document.getElementById('caja-imprimir-consumo');
  var nuevaBtn = document.getElementById('caja-nueva');
  var readerEl = document.getElementById('caja-reader');

  if (!scanSection || !cuentaSection) return;

  var cuentaActual = null;
  var orderIdActual = null;
  var html5QrCode = null;
  var scanning = false;
  var pollTimer = null;

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

  function setCancelVisible(visible) {
    if (!cancelarPointBtn) return;
    cancelarPointBtn.hidden = !visible;
    cancelarPointBtn.disabled = !visible;
    if (visible) {
      cancelarPointBtn.textContent = 'Cancelar cobro en Point';
    }
  }

  function setImprimirVisible(visible) {
    if (!imprimirConsumoBtn) return;
    imprimirConsumoBtn.hidden = !visible;
    imprimirConsumoBtn.disabled = !visible;
    if (visible) {
      imprimirConsumoBtn.textContent = 'Imprimir ticket de consumo';
    }
  }

  function showCuenta(data) {
    cuentaActual = data;
    orderIdActual = null;
    setCancelVisible(false);
    setImprimirVisible(false);
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
    if (pagarPointBtn) {
      pagarPointBtn.disabled = false;
      pagarPointBtn.textContent = 'Cobrar con Point Smart';
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

  function stopPoll() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function showScan() {
    stopPoll();
    cuentaActual = null;
    orderIdActual = null;
    setCancelVisible(false);
    setImprimirVisible(false);
    cuentaSection.hidden = true;
    scanSection.hidden = false;
    if (statusEl) statusEl.textContent = '';
    if (tokenInput) tokenInput.value = '';
    if (pagarPointBtn) {
      pagarPointBtn.disabled = false;
      pagarPointBtn.textContent = 'Cobrar con Point Smart';
    }
    startScanner();
  }

  function marcarPagadoPoint() {
    stopPoll();
    orderIdActual = null;
    setCancelVisible(false);
    setImprimirVisible(true);
    if (statusEl) {
      statusEl.textContent =
        'Pago aprobado. En unos segundos se imprime el ticket de consumo. Si no sale, usa el botón.';
    }
    if (pagarPointBtn) {
      pagarPointBtn.disabled = true;
      pagarPointBtn.textContent = 'Pagado en Point';
    }
    if (totalEl) totalEl.textContent = formatMoney(0);
  }

  function pollPointOrder(orderId) {
    stopPoll();
    pollTimer = window.setInterval(function () {
      fetch('/api/cuenta/point/' + encodeURIComponent(orderId), {
        credentials: 'same-origin',
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok || !data.ok) throw new Error(data.error || 'Error');
            return data;
          });
        })
        .then(function (data) {
          if (statusEl) {
            statusEl.textContent =
              'Point: ' +
              (data.status || '…') +
              ' · Esperando pago en la terminal…';
          }
          if (data.paid) {
            marcarPagadoPoint();
          }
          if (
            data.status === 'canceled' ||
            data.status === 'cancelled' ||
            data.status === 'expired'
          ) {
            stopPoll();
            orderIdActual = null;
            setCancelVisible(false);
            if (pagarPointBtn) {
              pagarPointBtn.disabled = false;
              pagarPointBtn.textContent = 'Cobrar con Point Smart';
            }
            if (statusEl) {
              statusEl.textContent =
                'Cobro cancelado o expirado. Puedes enviar de nuevo al Point.';
            }
          }
        })
        .catch(function () {});
    }, 3000);
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

  if (pagarPointBtn) {
    pagarPointBtn.addEventListener('click', function () {
      if (!cuentaActual) return;
      pagarPointBtn.disabled = true;
      pagarPointBtn.textContent = 'Enviando al Point…';
      setCancelVisible(false);
      if (statusEl) statusEl.textContent = 'Enviando cobro al Point Smart…';

      fetch('/api/cuenta/point', {
        method: 'POST',
        credentials: 'same-origin',
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
          orderIdActual = data.orderId;
          pagarPointBtn.textContent = 'Esperando en Point…';
          setCancelVisible(true);
          if (statusEl) {
            statusEl.textContent =
              'Cobro $' +
              Number(data.total || 0) +
              ' enviado al Point. Pide al cliente que pague en la terminal.';
          }
          pollPointOrder(data.orderId);
        })
        .catch(function (err) {
          pagarPointBtn.disabled = false;
          pagarPointBtn.textContent = 'Cobrar con Point Smart';
          if (statusEl) statusEl.textContent = '';
          var msg = err.message || 'No se pudo enviar el cobro al Point';
          // Cobro previo atascado en la terminal → permitir cancelar
          if (/already_queued/i.test(msg)) {
            setCancelVisible(true);
            if (statusEl) {
              statusEl.textContent =
                'Ya hay un cobro en el Point. Cancélalo para enviar uno nuevo.';
            }
          } else {
            orderIdActual = null;
            setCancelVisible(false);
          }
          alert(msg);
        });
    });
  }

  if (cancelarPointBtn) {
    cancelarPointBtn.addEventListener('click', function () {
      if (!cuentaActual) return;
      cancelarPointBtn.disabled = true;
      cancelarPointBtn.textContent = 'Cancelando…';
      if (statusEl) statusEl.textContent = 'Cancelando cobro en Point…';

      fetch('/api/cuenta/point/cancel', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mesa: cuentaActual.mesa,
          orderId: orderIdActual || undefined,
        }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok || !data.ok) throw new Error(data.error || 'Error');
            return data;
          });
        })
        .then(function () {
          stopPoll();
          orderIdActual = null;
          setCancelVisible(false);
          if (pagarPointBtn) {
            pagarPointBtn.disabled = false;
            pagarPointBtn.textContent = 'Cobrar con Point Smart';
          }
          if (statusEl) {
            statusEl.textContent =
              'Cobro cancelado. Puedes enviar de nuevo al Point.';
          }
        })
        .catch(function (err) {
          cancelarPointBtn.disabled = false;
          cancelarPointBtn.textContent = 'Cancelar cobro en Point';
          if (statusEl) {
            statusEl.textContent =
              err.message || 'No se pudo cancelar. Intenta en el Point.';
          }
          alert(err.message || 'No se pudo cancelar el cobro');
        });
    });
  }

  if (imprimirConsumoBtn) {
    imprimirConsumoBtn.addEventListener('click', function () {
      if (!cuentaActual) return;
      imprimirConsumoBtn.disabled = true;
      imprimirConsumoBtn.textContent = 'Imprimiendo…';
      if (statusEl) statusEl.textContent = 'Enviando ticket de consumo al Point…';

      fetch('/api/cuenta/point/print-consumo', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesa: cuentaActual.mesa }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok || !data.ok) throw new Error(data.error || 'Error');
            return data;
          });
        })
        .then(function () {
          imprimirConsumoBtn.disabled = false;
          imprimirConsumoBtn.textContent = 'Imprimir ticket de consumo';
          if (statusEl) {
            statusEl.textContent =
              'Ticket de consumo enviado al Point. Revisa la impresora.';
          }
        })
        .catch(function (err) {
          imprimirConsumoBtn.disabled = false;
          imprimirConsumoBtn.textContent = 'Imprimir ticket de consumo';
          if (statusEl) {
            statusEl.textContent = err.message || 'No se pudo imprimir';
          }
          alert(err.message || 'No se pudo imprimir el ticket de consumo');
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
