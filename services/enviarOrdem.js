const axios = require('axios');

async function enviarOrdem(xml, token) {
  return axios.post(
    'https://api.tiny.com.br/api2/pedido.compra.xml',
    new URLSearchParams({ xml }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${token}`
      }
    }
  );
}

module.exports = enviarOrdem;
