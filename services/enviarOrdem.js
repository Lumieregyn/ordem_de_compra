const axios = require('axios');

async function enviarOrdemCompra(xml, token) {
  return axios.post(
    'https://erp.tiny.com.br/public-api/v3/purchase-order',
    xml,
    {
      headers: {
        'Content-Type': 'application/xml',
        'Authorization': `Bearer ${token}`
      }
    }
  );
}

module.exports = { enviarOrdemCompra };
