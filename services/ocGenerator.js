function gerarOrdemCompra() {
  const xml = `
<pedido>
  <dados>
    <pedido>
      <id_fornecedor>12345</id_fornecedor>
      <data>2025-05-24</data>
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
    </pedido>
  </dados>
</pedido>
  `.trim();

  return xml;
}

module.exports = { gerarOrdemCompra };