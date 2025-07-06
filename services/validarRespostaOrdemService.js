const { enviarWhatsappErro } = require('./whatsAppService');

async function validarRespostaOrdem(data, numeroPedido, marca, fornecedor) {
  if (!data || !data.retorno) {
    console.error('❌ Resposta inválida da API Tiny: estrutura ausente');

    await enviarWhatsappErro(`🚨 Erro na resposta da API Tiny\nPedido: ${numeroPedido}\nMarca: ${marca}\nMotivo: Estrutura ausente`);
    return false;
  }

  const status = data.retorno.status;
  const idOrdem = data.retorno.ordem_compra?.id;
  const mensagem = data.retorno.mensagem;
  const detalhes = data.retorno.erros || data.retorno.detalhes;

  if (idOrdem) {
    console.log(`✅ OC criada com ID ${idOrdem} (status: '${status}')`);

    if (mensagem || detalhes) {
      console.log('[OC ℹ️] Mensagem adicional da Tiny:', {
        mensagem,
        detalhes,
      });
    }

    const texto = `✅ Ordem de Compra criada com sucesso
Pedido: ${numeroPedido}
Marca: ${marca}
Fornecedor: ${fornecedor?.nome || '[desconhecido]'}`;

    await enviarWhatsappErro(texto);

    return true;
  }

  // ❌ Nenhum ID retornado = falha real
  console.error('❌ Falha na criação da OC via API Tiny:', {
    status: data.retorno.status,
    erros: detalhes || 'Sem detalhes de erro',
    ordem_compra: data.retorno?.ordem_compra,
  });

  const erroTexto = `🚨 Falha ao criar Ordem de Compra
Pedido: ${numeroPedido}
Marca: ${marca}
Motivo: ${mensagem || 'Sem mensagem'}
Detalhes: ${JSON.stringify(detalhes)}`;

  await enviarWhatsappErro(erroTexto);

  return false;
}

module.exports = { validarRespostaOrdem };
