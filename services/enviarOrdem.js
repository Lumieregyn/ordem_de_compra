const axios = require('axios');
const qs = require('qs');

const TINY_API_TOKEN = process.env.TINY_API_TOKEN;

/**
 * Envia uma ordem de compra para a Tiny via XML
 */
async function enviarOrdemCompra({ produtoId, quantidade, valorUnitario, idFornecedor }) {
  const xmlContent = `
<pedido>
  <tipo>Ordem de Compra</tipo>
  <fornecedor>
    <id>${idFornecedor}</id>
  </fornecedor>
  <itens>
    <item>
      <id>${produtoId}</id>
      <quantidade>${quantidade}</quantidade>
      <valor_unitario>${valorUnitario}</valor_unitario>
    </item>
  </itens>
</pedido>`.trim();

  const payload = qs.stringify({
    token: TINY_API_TOKEN,
    formato: 'json',
    xml: xmlContent
  }, { encode: false }); // <-- chave para evitar dupla codificação

  try {
    const response = await axios.post(
      'https://api.tiny.com.br/api2/pedido.incluir.php',
      payload,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log('✅ Ordem de compra enviada com sucesso!');
    console.log('📥 Resposta da Tiny:', response.data);
    return response.data;
  } catch (err) {
    console.error('❌ Erro ao enviar OC:', JSON.stringify(err.response?.data || err.message, null, 2));
    return { erro: true, detalhe: err.response?.data || err.message };
  }
}

module.exports = { enviarOrdemCompra };
