const axios = require('axios');
const js2xmlparser = require('js2xmlparser');

// Function to send the purchase order XML to Tiny
async function enviarOrdemCompraReal(token) {
  // Load the sample order JSON
  const json = require('../mock/pedido_aprovado.json');
  // Convert JSON to Tiny's XML format
  const xml = js2xmlparser.parse("ordemCompra", json);
  // Build form data
  const form = new URLSearchParams();
  form.append('token', token);
  form.append('xml', xml);
  form.append('formato', 'json');
  // Send to Tiny
  const response = await axios.post(
    'https://api.tiny.com.br/api2/ordem.compra.incluir.php',
    form,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return response.data;
}

module.exports = { enviarOrdemCompraReal };
