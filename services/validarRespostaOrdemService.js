const { enviarWhatsappErro } = require('./whatsAppService');

async function validarRespostaOrdem(data, numeroPedido, marca, fornecedor) {
  const pedidoStr = numeroPedido || '[indefinido]';
  const marcaStr = marca || '[indefinida]';

  if (!data || typeof data !== 'object' || !data.retorno) {
    console.error('❌ Resposta inválida da API Tiny: estrutura ausente');
    await enviarWhatsappErro(`🚨 Erro na resposta da API Tiny\nPedido: ${pedidoStr}\nMarca: ${marcaStr}\nMotivo: Estrutura ausente`);
    return false;
  }

  const status = data.retorno.status;
  const idOrdem = data.retorno.ordem_compra?.id;
  const mensagem = data.retorno.mensagem;

  let detalhes = [];
  const raw = data.retorno.erros || data.retorno.detalhes;

  if (Array.isArray(raw)) {
    detalhes = raw;
  } else if (typeof raw === 'object' && raw !== null) {
    detalhes = [raw];
  }

  const erroSomenteContaContabil = detalhes.length > 0 && detalhes.every(
    err => err?.campo === 'parcelas[0].contaContabil.id'
  );

  // ✅ TRATAMENTO DE SUCESSO
  if (idOrdem || erroSomenteContaContabil) {
    console.log(`✅ OC criada com sucesso (ID: ${idOrdem || 'N/A'}, status: '${status}')`);

    if (erroSomenteContaContabil && !idOrdem) {
      console.log('⚠️ Ignorando erro de conta contábil como falso positivo (OC criada).');
    }

    if (mensagem || detalhes.length > 0) {
      console.log('[OC ℹ️] Mensagem adicional da Tiny:', {
        mensagem,
        detalhes,
      });
    }

    const texto = `✅ Ordem de Compra criada com sucesso\nPedido: ${pedidoStr}\nMarca: ${marcaStr}\nFornecedor: ${fornecedor?.nome || '[desconhecido]'}`;

    try {
      await enviarWhatsappErro(texto);
    } catch (e) {
      console.warn('⚠️ Falha ao enviar alerta de sucesso (ignorado):', e.message);
    }

    return true;
  }

  // ❌ FALHA REAL
  console.error('❌ Falha na criação da OC via API Tiny:', {
    status: status,
    erros: detalhes.length > 0 ? detalhes : 'Sem detalhes de erro',
    ordem_compra: data.retorno?.ordem_compra,
  });

  const erroTexto = `🚨 Falha ao criar Ordem de Compra\nPedido: ${pedidoStr}\nMarca: ${marcaStr}\nMotivo: ${mensagem || 'Sem mensagem'}\nDetalhes: ${JSON.stringify(detalhes)}`;

  await enviarWhatsappErro(erroTexto);

  return false;
}

module.exports = { validarRespostaOrdem };
