const axios = require('axios');
const qs = require('qs');

const TINY_API_TOKEN = process.env.TINY_API_TOKEN;

/**
 * Envia uma ordem de compra para a Tiny via XML
 */
async function enviarOrdemCompra({ produtoId, quantidade, valorUnitario, idFornecedor }) {
  const xml = `
<pedido>
  <tipo>Ordem de Compra</tipo>
  <fornecedor>
    <id>${idFornecedor}</id>
  </fornecedor>
  <itens>
    <item>
      <id>${produtoId}</id>
      <quantidade>${quantidade}</quantidade>
      <valor_unitario>${valorUnitario.toFixed(2)}</valor_unitario>
    </item>
  </itens>
</pedido>`.trim();

  const data = {
    token: TINY_API_TOKEN,
    formato: 'json',
    xml
  };

  try {
    const response = await axios({
      method: 'post',
      url: 'https://api.tiny.com.br/api2/pedido.incluir.php',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: qs.stringify(data, { encode: true })  // Encoding mantido para segurança
    });

    console.log('✅ Ordem de compra enviada com sucesso!');
    console.log('📥 Resposta da Tiny:', response.data);
    return response.data;

  } catch (err) {
    const detalhes = err.response?.data || err.message;
    console.error('❌ Erro ao enviar OC:', JSON.stringify(detalhes, null, 2));
    return { erro: true, detalhe: detalhes };
  }
}

module.exports = { enviarOrdemCompra };
