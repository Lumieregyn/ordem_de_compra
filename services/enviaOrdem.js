const fs = require('fs');
const js2xmlparser = require("js2xmlparser");
const axios = require('axios');

async function enviarOrdemCompraReal(token) {
  const json = require('../pedido_aprovado.json');
  const xml = js2xmlparser.parse("ordemCompra", json);

  const form = new URLSearchParams();
  form.append('token', token);
  form.append('xml', xml);
  form.append('formato', 'json');

  const response = await axios.post(
    'https://api.tiny.com.br/api2/ordem.compra.incluir.php',
    form,
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  );

  return response.data;
}

module.exports = { enviarOrdemCompraReal };
