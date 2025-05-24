// services/enviarOrdem.js

require('dotenv').config();
const axios = require('axios');
const { gerarOrdemCompra } = require('./ocGenerator');

async function enviarOrdemCompraReal(accessToken) {
  const xml = gerarOrdemCompra();

  const payload = new URLSearchParams({
    xml: xml,
    access_token: accessToken,
  });

  const response = await axios.post(
    'https://api.tiny.com.br/api2/pedidoCompra.gerar',
    payload.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // caso precise, adicione aqui outras headers
      }
    }
  );

  return response.data;
}

module.exports = { enviarOrdemCompraReal };
