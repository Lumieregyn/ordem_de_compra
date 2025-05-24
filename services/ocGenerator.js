function gerarOrdemCompra(pedido) {
  // Build XML payload for Tiny ERP v2
  let xml = '<?xml version="1.0" encoding="UTF-8"?><pedido>';
  xml += `<numero>${pedido.numero || ''}</numero>`;
  xml += '<itens>';
  (pedido.itens || []).forEach(item => {
    if (item.sku.toUpperCase().includes('PEDIDO')) {
      xml += '<item>';
      xml += `<codigo>${item.sku}</codigo>`;
      xml += `<quantidade>${item.quantidade}</quantidade>`;
      xml += `<valor_unitario>${item.valor_unitario || item.preco || 0}</valor_unitario>`;
      xml += '</item>';
    }
  });
  xml += '</itens></pedido>';
  return xml;
}

module.exports = { gerarOrdemCompra };