const axios = require('axios');
const { gerarOrdemCompra } = require('./ocGenerator');

async function enviarOrdemCompraReal(accessToken) {
  const xml = gerarOrdemCompra();
  const response = await axios.post(
    'https://api.tiny.com.br/api2/ordem.compra.incluir.php',
    new URLSearchParams({
      token: accessToken,
      xml,
      formato: 'json'
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  return response.data;
}

module.exports = { enviarOrdemCompraReal };