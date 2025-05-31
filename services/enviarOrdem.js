const axios = require('axios');
const qs = require('qs');

const TINY_API_TOKEN = process.env.TINY_API_TOKEN;

/**
 * Envia uma ordem de compra para a Tiny (API v2) via XML
 * e interpreta corretamente o retorno, mesmo com status 400.
 * @param {Object} params
 * @param {number} params.produtoId
 * @param {number} params.quantidade
 * @param {number} params.valorUnitario
 * @param {number} params.idFornecedor
 * @returns {Object} resultado padronizado com sucesso ou erro
 */
async function enviarOrdemCompra({ produtoId, quantidade, valorUnitario, idFornecedor }) {
  // 🔎 Validação local mínima antes do envio
  if (!produtoId || produtoId <= 0 || !quantidade || quantidade <= 0 || !valorUnitario || valorUnitario <= 0 || !idFornecedor || idFornecedor <= 0) {
    return {
      sucesso: false,
      erro: 'validação',
      mensagem: 'Parâmetros obrigatórios ausentes ou inválidos'
    };
  }

  // 📦 Montagem do XML
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
        },
        validateStatus: () => true // permite tratar manualmente códigos 400+
      }
    );

    const data = response.data?.retorno;

    // ✅ Se houver ID no retorno, considerar sucesso mesmo com erro 400
    const pedido = data?.pedidos?.[0]?.pedido;
    if (pedido?.id) {
      return {
        sucesso: true,
        idOrdemCompra: pedido.id,
        numero: pedido.numero,
        mensagem: data.status || 'OC criada com sucesso (com ou sem warnings)'
      };
    }

    // ❌ Se houver erros de validação (sem ID criado)
    if (data?.erros) {
      return {
        sucesso: false,
        erro: 'validação',
        mensagem: data.status || 'Ocorreram erros de validação',
        detalhes: data.erros
      };
    }

    // ❌ Se token for inválido ou acesso negado
    if (data?.status?.includes('Token inválido') || response.status === 403 || response.status === 401) {
      return {
        sucesso: false,
        erro: 'autenticacao',
        mensagem: data.status || 'Token inválido ou acesso negado'
      };
    }

    // ❓ Caso não identificado
    return {
      sucesso: false,
      erro: 'desconhecido',
      mensagem: data?.status || 'Erro desconhecido no retorno da Tiny'
    };

  } catch (err) {
    // 🌐 Falha de rede ou exceção inesperada
    return {
      sucesso: false,
      erro: 'falha',
      mensagem: err.message || 'Erro de rede ou exceção inesperada'
    };
  }
}

module.exports = { enviarOrdemCompra };
