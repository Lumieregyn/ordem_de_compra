// services/validarRespostaOrdemService.js

function validarRespostaOrdem(data) {
  if (!data || !data.retorno) {
    console.error('❌ Resposta inválida da API Tiny: estrutura ausente');
    return false;
  }

  const status = data.retorno.status;
  const idOrdem = data.retorno.ordem_compra?.id;
  const mensagem = data.retorno.mensagem;
  const detalhes = data.retorno.erros || data.retorno.detalhes;

  // ✅ Considera sucesso se o ID da OC estiver presente, mesmo com status "erro"
  if (idOrdem) {
    console.log(`✅ OC criada com ID ${idOrdem} (status: '${status}')`);

    // 📝 Log adicional de mensagem ou detalhes
    if (mensagem || detalhes) {
      console.log('[OC ℹ️] Mensagem adicional da Tiny:', {
        mensagem,
        detalhes,
      });
    }

    return true;
  }

  // ❌ Nenhum ID retornado = erro real
  console.error('❌ Falha na criação da OC via API Tiny:', {
    status: data.retorno.status,
    erros: data.retorno?.erros || 'Sem detalhes de erro',
    ordem_compra: data.retorno?.ordem_compra,
  });

  return false;
}

module.exports = { validarRespostaOrdem };
