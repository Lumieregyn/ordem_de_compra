function generateOC(pedido) {
  // Exemplo simples de geração de ordem de compra
  return {
    orderId: `OC-\${pedido.id}`,
    date: new Date().toISOString(),
    items: pedido.items,
    total: pedido.items.reduce((sum, i) => sum + (i.price * i.quantity), 0)
  };
}

module.exports = { generateOC };