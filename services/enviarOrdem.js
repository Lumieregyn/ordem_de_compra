const axios = require('axios');
const { gerarOrdemCompra } = require('./ocGenerator');
const pedidoAprovado = require('../pedido_aprovado.json'); // Exemplo de JSON de pedido

/**
 * Envia a ordem de compra gerada em XML para o Tiny via API v3.
 * @param {string} accessToken - Bearer token obtido no /callback
 */
async function enviarOrdemCompraReal(accessToken) {
  // Gera o XML
  const xml = gerarOrdemCompra(pedidoAprovado);

  // Chamada POST à API Tiny (ajuste a URL se necessário)
  const response = await axios.post(
    'https://api.tiny.com.br/api2/pedido.compra.incluir.php',
    new URLSearchParams({
      token: accessToken,
      xml,
      formato: 'JSON',
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return response.data;
}

module.exports = { enviarOrdemCompraReal };
