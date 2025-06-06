// services/validarRespostaOrdemService.js

function validarRespostaOrdem(data) {
  if (!data || typeof data !== 'object' || !data.retorno) {
    console.error('❌ Resposta inválida da API Tiny: estrutura ausente ou malformada');
    return false;
  }

  const { retorno } = data;
  const status = retorno.status;
  const idOrdem = retorno.ordem_compra?.id;
  const numeroOC = retorno.ordem_compra?.numero_pedido;
  const mensagem = retorno.mensagem;
  const detalhes = retorno.erros || retorno.detalhes;

  // ✅ Sucesso: se ID da OC está presente, mesmo que status diga "erro"
  if (idOrdem) {
    console.log(`✅ OC criada com sucesso (ID: ${idOrdem}, Número: ${numeroOC || '---'}) | Status: '${status}'`);

    if (mensagem || detalhes) {
      console.log('[OC ℹ️] Mensagem adicional da Tiny:', {
        mensagem,
        detalhes,
      });
    }

    return true;
  }

  // ❌ Erro real: nenhum ID retornado
  console.error('❌ Falha na criação da OC via API Tiny:', {
    status,
    mensagem,
    erros: detalhes || 'Sem detalhes de erro',
    ordem_compra: retorno.ordem_compra,
  });

  return false;
}

module.exports = { validarRespostaOrdem };
