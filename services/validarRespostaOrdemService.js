const { enviarWhatsappErro } = require('./whatsAppService');

async function validarRespostaOrdem(data, numeroPedido, marca, fornecedor) {
  console.log('[DEBUG validarRespostaOrdem] Dados recebidos:', {
    numeroPedido,
    marca,
    fornecedorNome: fornecedor?.nome || 'undefined'
  });

  const detalhesRaw = data?.retorno?.erros || data?.retorno?.detalhes;
  let detalhes = [];

  if (Array.isArray(detalhesRaw)) {
    detalhes = detalhesRaw;
  } else if (typeof detalhesRaw === 'object' && detalhesRaw !== null) {
    detalhes = [detalhesRaw];
  }

  const idOrdem = data?.retorno?.ordem_compra?.id;
  const status = data?.retorno?.status;
  const mensagem = data?.retorno?.mensagem;

  const erroSomenteContaContabil = detalhes.length > 0 && detalhes.every(
    err => err?.campo === 'parcelas[0].contaContabil.id'
  );

  if (idOrdem || erroSomenteContaContabil) {
    console.log(`✅ OC criada com sucesso (ID: ${idOrdem || 'N/A'}, status: '${status}')`);

    if (erroSomenteContaContabil && !idOrdem) {
      console.log('⚠️ Ignorando erro de conta contábil como falso positivo (OC criada).');
    }

    if (mensagem || detalhes.length > 0) {
      console.log('[OC ℹ️] Mensagem adicional da Tiny:', { mensagem, detalhes });
    }

    const texto = `✅ Ordem de Compra criada com sucesso\nPedido: ${numeroPedido || 'sem número'}\nMarca: ${marca || 'sem marca'}\nFornecedor: ${fornecedor?.nome || 'sem fornecedor'}`;

    try {
      await enviarWhatsappErro(texto);
    } catch (e) {
      console.warn('⚠️ Falha ao enviar alerta de sucesso (ignorado):', e.message);
    }

    return true;
  }

  if (!data || !data.retorno) {
    const erroCampoContabil = detalhes.some(e => e?.campo === 'parcelas[0].contaContabil.id');
    if (!erroCampoContabil) {
      console.error('❌ Resposta inválida da API Tiny: estrutura ausente');
      await enviarWhatsappErro(`🚨 Erro na resposta da API Tiny\nPedido: ${numeroPedido || 'sem número'}\nMarca: ${marca || 'sem marca'}\nMotivo: Estrutura ausente`);
    }
    return false;
  }

  console.error('❌ Falha na criação da OC via API Tiny:', {
    status: status,
    erros: detalhes.length > 0 ? detalhes : 'Sem detalhes de erro',
    ordem_compra: data.retorno?.ordem_compra,
  });

  const erroTexto = `🚨 Falha ao criar Ordem de Compra\nPedido: ${numeroPedido || 'sem número'}\nMarca: ${marca || 'sem marca'}\nMotivo: ${mensagem || 'Sem mensagem'}\nDetalhes: ${JSON.stringify(detalhes)}`;

  await enviarWhatsappErro(erroTexto);

  return false;
}

module.exports = { validarRespostaOrdem };
