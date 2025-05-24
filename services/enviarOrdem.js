const axios = require('axios');
const { gerarOrdemCompra } = require('./ocGenerator');

async function enviarOrdemCompraReal(accessToken) {
  const xml = gerarOrdemCompra();
  const form = new URLSearchParams();
  form.append('xml', xml);
  return await axios.post(
    'https://api.tiny.com.br/api2/ordem.compra.incluir.php',
    form,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  ).then(res => res.data);
}

module.exports = { enviarOrdemCompraReal };