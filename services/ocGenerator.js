const xml2js = require('xml2js');

/**
 * Gera o XML de ordem de compra para a Tiny API.
 * @param {Object} dados — Objeto com { nome, codigo, itens }
 * @returns {string} XML pronto para envio.
 */
function gerarOrdemCompra(dados = {}) {
  // valores padrão para evitar undefined
  const {
    nome = 'Cliente Padrão',
    codigo = '1',
    itens = []
  } = dados;

  const builder = new xml2js.Builder({ headless: true });
  const objetoXml = {
    pedido: {
      data_pedido: new Date().toISOString().split('T')[0],
      cliente: {
        nome,
        codigo
      },
      itens: {
        // garante que itens seja array antes de map
        item: itens.map(i => ({
          codigo:        i.codigo,
          descricao:     i.descricao,
          quantidade:    i.quantidade,
          valor_unitario: i.valor_unitario
        }))
      }
    }
  };

  return builder.buildObject(objetoXml);
}

module.exports = { gerarOrdemCompra };
