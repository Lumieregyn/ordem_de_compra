const { enviarWhatsappErro } = require('./whatsAppService');

async function validarRespostaOrdem(data, numeroPedido, marca, fornecedor) {
  if (!data || !data.retorno) {
    console.error('❌ Resposta inválida da API Tiny: estrutura ausente');

    await enviarWhatsappErro(`🚨 Erro na resposta da API Tiny\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nMotivo: Estrutura ausente`);
    return false;
  }

  const status = data.retorno.status;
  const idOrdem = data.retorno.ordem_compra?.id;
  const mensagem = data.retorno.mensagem;

  // Garante que detalhes seja sempre um array para análise
  let detalhes = [];
  const raw = data.retorno.erros || data.retorno.detalhes;

  if (Array.isArray(raw)) {
    detalhes = raw;
  } else if (typeof raw === 'object' && raw !== null) {
    detalhes = [raw];
  } else {
    detalhes = [];
  }

  const erroContaContabil = detalhes.some(
    err => (err?.campo?.includes('contaContabil') || err?.mensagem?.toLowerCase().includes('conta contábil'))
  );

  if (idOrdem || erroContaContabil) {
    console.log(`✅ OC criada com sucesso (ID: ${idOrdem || 'N/A'}, status: '${status}')`);

    if (erroContaContabil && !idOrdem) {
      console.log('⚠️ Ignorando erro de conta contábil como falso positivo.');
    }

    if (mensagem || detalhes.length > 0) {
      console.log('[OC ℹ️] Mensagem adicional da Tiny:', {
        mensagem,
        detalhes,
      });
    }

    const texto = `✅ Ordem de Compra criada com sucesso\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nFornecedor: ${fornecedor?.nome || '[desconhecido]'}`;

    try {
      await enviarWhatsappErro(texto);
    } catch (e) {
      console.warn('⚠️ Falha ao enviar alerta de sucesso (ignorado):', e.message);
    }

    return true;
  }

  console.error('❌ Falha na criação da OC via API Tiny:', {
    status: data.retorno.status,
    erros: detalhes.length > 0 ? detalhes : 'Sem detalhes de erro',
    ordem_compra: data.retorno?.ordem_compra,
  });

  const erroTexto = `🚨 Falha ao criar Ordem de Compra\nPedido: ${numeroPedido || '[indefinido]'}\nMarca: ${marca || '[indefinida]'}\nMotivo: ${mensagem || 'Sem mensagem'}\nDetalhes: ${JSON.stringify(detalhes)}`;

  await enviarWhatsappErro(erroTexto);

  return false;
}

module.exports = { validarRespostaOrdem };
