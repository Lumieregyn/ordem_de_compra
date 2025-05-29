const axios = require('axios');
const qs = require('qs');

const TINY_API_TOKEN = process.env.TINY_API_TOKEN;

/**
 * Envia uma ordem de compra para a Tiny via XML
 * @param {Object} params
 * @param {number} params.produtoId
 * @param {number} params.quantidade
 * @param {number} params.valorUnitario
 * @param {number} params.idFornecedor
 */
async function enviarOrdemCompra({ produtoId, quantidade, valorUnitario, idFornecedor }) {
  if (!produtoId || !quantidade || !valorUnitario || !idFornecedor) {
    console.error('❌ Dados insuficientes para gerar OC');
    return { erro: true, detalhe: 'Parâmetros obrigatórios ausentes' };
  }

  const xml = `
  <pedido>
    <tipo>Ordem de Compra</tipo>
    <fornecedor>
      <id>${idFornecedor}</id>
    </fornecedor>
    <itens>
      <item>
        <produto>
          <id>${produtoId}</id>
        </produto>
        <quantidade>${quantidade}</quantidade>
        <valor_unitario>${valorUnitario.toFixed(2)}</valor_unitario>
      </item>
    </itens>
  </pedido>`.trim();

  const body = qs.stringify({
    token: TINY_API_TOKEN,
    xml,
    formato: 'json'
  });

  try {
    const response = await axios.post(
      'https://api.tiny.com.br/api2/pedido.incluir.php',
      body,
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
    console.error('❌ Erro ao enviar OC:', err.response?.data || err.message);
    return { erro: true, detalhe: err.response?.data || err.message };
  }
}

module.exports = { enviarOrdemCompra };
