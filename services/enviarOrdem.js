const axios = require('axios');
const qs    = require('qs');

/**
 * Envia uma ordem de compra (XML) para a Tiny API v2.
 * @param {string} token — Bearer token ou token v2 da Tiny
 * @param {string} xml   — XML gerado pelo ocGenerator
 */
async function enviarOrdemCompra(token, xml) {
  try {
    const body = qs.stringify({
      xml,
      token,
      formato: 'json'
    });

    const resp = await axios.post(
      'https://api.tiny.com.br/api2/pedido.incluir.php',
      body,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log('✅ Ordem de compra enviada com sucesso!');
    console.log(resp.data);
    return { success: true, data: resp.data };
  } catch (err) {
    console.error('❌ Erro ao enviar OC:', err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}

module.exports = { enviarOrdemCompra };
