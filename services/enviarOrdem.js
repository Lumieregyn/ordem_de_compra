const { gerarOrdemCompra } = require('./ocGenerator');
const axios = require('axios');

async function enviarOrdemCompraReal(accessToken) {
  const xml = gerarOrdemCompra();
  const response = await axios.post(
    'https://api.tiny.com.br/api2/ordem.compra.incluir.php',
    new URLSearchParams({
      token: accessToken,
      xml,
      formato: 'xml'
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
  return response.data;
}

module.exports = { enviarOrdemCompraReal };
