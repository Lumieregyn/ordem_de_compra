function gerarOrdemCompra() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<pedido>
  <id_fornecedor>12345</id_fornecedor>
  <data>${new Date().toISOString().split('T')[0]}</data>
  <itens>
    <item>
      <codigo_produto>ITEM1</codigo_produto>
      <quantidade>2</quantidade>
      <valor_unitario>100</valor_unitario>
    </item>
    <item>
      <codigo_produto>ITEM2</codigo_produto>
      <quantidade>1</quantidade>
      <valor_unitario>200</valor_unitario>
    </item>
  </itens>
  <total>400</total>
</pedido>`;
}

module.exports = gerarOrdemCompra;
