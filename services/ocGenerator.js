const xml2js = require('xml2js');

function gerarOrdemCompra(dados) {
  const builder = new xml2js.Builder({ headless: true });
  const objetoXml = {
    pedido: {
      data_pedido: new Date().toISOString().split('T')[0],
      cliente: {
        nome: dados.nome || 'Cliente Padrão',
        codigo: dados.codigo || '1',
      },
      itens: {
        item: dados.itens.map(i => ({
          codigo: i.codigo,
          descricao: i.descricao,
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario
        }))
      }
    }
  };
  return builder.buildObject(objetoXml);
}

module.exports = { gerarOrdemCompra };
