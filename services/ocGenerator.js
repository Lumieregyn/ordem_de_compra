// services/ocGenerator.js
module.exports = {
  generateOC: (pedido) => {
    return {
      ordem: {
        id: `OC-${Date.now()}`,
        items: pedido.items,
        total: pedido.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
      }
    };
  }
};