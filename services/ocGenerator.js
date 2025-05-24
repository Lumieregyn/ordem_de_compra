module.exports = { gerarOrdemCompra };

// services/ocGenerator.js
exports.generateOrder = (pedido) => {
  // monte o XML ou JSON que o Tiny espera
  // ex.: `<order><id>${pedido.id}</id>...</order>`
  // ou retorne JSON puro, se a API aceitar.
  return `<order><id>${pedido.id}</id>...</order>`;
};
