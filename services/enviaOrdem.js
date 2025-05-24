const fs = require('fs');
const axios = require('axios');
const { gerarOrdemCompra } = require('./ocGenerator');

async function enviarOrdemCompraReal(token) {
  const xml = gerarOrdemCompra();

  const response = await axios.post(
    'https://api.tiny.com.br/api/v3/purchase-order',
    xml,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/xml'
      }
    }
  );

  return response.data;
}

module.exports = { enviarOrdemCompraReal };