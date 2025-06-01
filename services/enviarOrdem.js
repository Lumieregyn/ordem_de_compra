const axios = require('axios');
const { getAccessToken } = require('../auth/tokenService');

async function enviarOrdemCompraV3(payload) {
  try {
    // Validação mínima do payload
    if (!payload || typeof payload !== 'object' || !payload.itens?.length) {
      throw new Error('Payload da Ordem de Compra está incompleto ou inválido.');
    }

    const token = await getAccessToken();

    const response = await axios.post(
      'https://erp.tiny.com.br/public-api/v3/ordens-compra',
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        validateStatus: () => true, // Captura todos os status HTTP
      }
    );

    const { status, data } = response;

    if (status === 200 && data?.retorno?.status === 'sucesso') {
      const ordemCompra = data.retorno.ordem_compra;
      console.log(`[OC Enviada ✅] Ordem de Compra criada com sucesso (ID: ${ordemCompra.id}, Pedido: ${ordemCompra.numero_pedido})`);
      return {
        sucesso: true,
        id: ordemCompra.id,
        numeroPedido: ordemCompra.numero_pedido,
      };
    } else {
      // Tratamento de erro retornado pela Tiny
      const mensagem = data?.mensagem || 'Erro no envio da OC';
      const detalhes = data?.detalhes || data?.retorno?.erros || [];

      console.warn(`[OC Erro ⚠️] Falha no envio da OC. Status: ${status} | Mensagem: ${mensagem}`);
      if (detalhes.length) console.warn('Detalhes do erro:', detalhes);

      // Aqui você pode invocar o Bloco 7, ex: enviarNotificacaoWhatsapp(mensagem)
      return {
        sucesso: false,
        status,
        mensagem,
        detalhes,
      };
    }
  } catch (erro) {
    // Erro inesperado (rede, token, estrutura etc.)
    console.error('[OC Erro ❌] Erro crítico ao enviar OC:', erro.message);

    return {
      sucesso: false,
      mensagem: 'Erro crítico ao tentar enviar a OC',
      detalhes: erro.message,
    };
  }
}

module.exports = { enviarOrdemCompraV3 };
