const axios = require('axios');

async function enviarOrdemCompra(token, xml) {
  const url = 'https://api.tiny.com.br/api2/pedido.compra.incluir.php';

  const response = await axios.post(url, new URLSearchParams({
    xml: xml,
    token: token,
    formato: 'json'
  }), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  return response.data;
}

module.exports = { enviarOrdemCompra };
