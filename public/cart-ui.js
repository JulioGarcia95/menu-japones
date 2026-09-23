(function () {
  var root = document.getElementById('cart-root');
  if (!root) return;

  root.innerHTML =
    '<aside class="cart-dock" id="cart-dock" aria-label="Carrito">' +
    '<button type="button" class="cart-tab" id="cart-toggle" aria-label="Abrir carrito" aria-expanded="false">' +
    '<span class="cart-tab-arrow" id="cart-tab-arrow" aria-hidden="true">‹</span>' +
    '<span class="cart-tab-meta">' +
    '<span class="cart-bar-count" id="cart-bar-count">0</span>' +
    '<span class="cart-tab-total" id="cart-bar-total">$0</span>' +
    '</span>' +
    '</button>' +
    '<div class="cart-backdrop" id="cart-backdrop" hidden></div>' +
    '<div class="cart-drawer" id="cart-sheet" role="dialog" aria-modal="true" aria-labelledby="cart-title" hidden>' +
    '<div class="cart-drawer-inner">' +
    '<header class="cart-sheet-head">' +
    '<h2 id="cart-title">Tu pedido</h2>' +
    '</header>' +
    '<div class="cart-body" id="cart-body">' +
    '<p class="cart-empty" id="cart-empty">Aún no hay platillos en el carrito.</p>' +
    '<ul class="cart-lines" id="cart-lines"></ul>' +
    '</div>' +
    '<div class="cart-footer" id="cart-footer" hidden>' +
    '<div class="mesa-field">' +
    '<span>Mesa / cliente</span>' +
    '<p class="mesa-fija" id="mesa-fija">Mesa01</p>' +
    '</div>' +
    '<p class="cart-total-row"><span>Total</span><strong id="cart-total">$0</strong></p>' +
    '<button type="button" class="btn-confirm" id="cart-confirm">Confirmar pedido</button>' +
    '<p class="cart-hint">Tu mesa está asignada. Puedes pedir varias veces.</p>' +
    '<p class="cart-status" id="cart-status" role="status" aria-live="polite"></p>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</aside>' +
    '<div class="order-success" id="order-success" hidden>' +
    '<div class="order-success-backdrop" id="order-success-backdrop"></div>' +
    '<div class="order-success-card" role="alertdialog" aria-modal="true" aria-labelledby="order-success-title" aria-describedby="order-success-text">' +
    '<div class="order-success-mark" aria-hidden="true">✓</div>' +
    '<p class="order-success-brand">Matilda Kitchen</p>' +
    '<h2 id="order-success-title">Pedido confirmado</h2>' +
    '<p id="order-success-text" class="order-success-text">En un momento le entregamos su pedido.</p>' +
    '<p class="order-success-mesa" id="order-success-mesa"></p>' +
    '<button type="button" class="order-success-btn" id="order-success-close">Listo</button>' +
    '</div>' +
    '</div>' +
    '<div class="dish-options" id="dish-options" hidden>' +
    '<div class="dish-options-backdrop" id="dish-options-backdrop"></div>' +
    '<div class="dish-options-card" role="dialog" aria-modal="true" aria-labelledby="dish-options-title">' +
    '<p class="dish-options-kicker">Personaliza</p>' +
    '<h2 id="dish-options-title">Ramen</h2>' +
    '<p class="dish-options-text">Elige cómo lo quieres.</p>' +
    '<div class="dish-options-groups" id="dish-options-groups"></div>' +
    '<div class="dish-options-actions">' +
    '<button type="button" class="dish-options-cancel" id="dish-options-cancel">Cancelar</button>' +
    '<button type="button" class="dish-options-add" id="dish-options-add">Agregar</button>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="alcohol-warn" id="alcohol-warn" hidden>' +
    '<div class="alcohol-warn-backdrop" id="alcohol-warn-backdrop"></div>' +
    '<div class="alcohol-warn-card" role="alertdialog" aria-modal="true" aria-labelledby="alcohol-warn-title" aria-describedby="alcohol-warn-text">' +
    '<p class="alcohol-warn-kicker">Aviso de bebida alcohólica</p>' +
    '<h2 id="alcohol-warn-title">Confirmación requerida</h2>' +
    '<p id="alcohol-warn-text" class="alcohol-warn-text">' +
    'La venta de alcohol es solo para personas mayores de 18 años. ' +
    'Está prohibido beber y conducir. Si va a manejar, no consuma alcohol.' +
    '</p>' +
    '<ul class="alcohol-warn-list">' +
    '<li>Confirmo que soy mayor de 18 años.</li>' +
    '<li>No conduciré después de beber.</li>' +
    '</ul>' +
    '<p class="alcohol-warn-dish" id="alcohol-warn-dish"></p>' +
    '<div class="alcohol-warn-actions">' +
    '<button type="button" class="alcohol-warn-cancel" id="alcohol-warn-cancel">Cancelar</button>' +
    '<button type="button" class="alcohol-warn-confirm" id="alcohol-warn-confirm">Acepto y agregar</button>' +
    '</div>' +
    '</div>' +
    '</div>';
})();
