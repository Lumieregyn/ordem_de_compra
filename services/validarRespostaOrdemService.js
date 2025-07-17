// services/validarRespostaOrdemService.js

function validarRespostaOrdem(data) {
  if (!data || !data.retorno) {
    console.error('❌ Resposta inválida da API Tiny: estrutura ausente');
    return false;
  }

  const status = data.retorno.status;
  const idOrdem = data.retorno.ordem_compra?.id;

  if (status === 'sucesso' && idOrdem) {
    console.log(`✅ OC criada com sucesso. ID Tiny: ${idOrdem}`);
    return true;
  }

  console.error('❌ Falha na criação da OC via API Tiny:', {
    status: data.retorno.status,
    erros: data.retorno?.erros || 'Sem detalhes de erro',
    ordem_compra: data.retorno?.ordem_compra,
  });

  return false;
}

module.exports = { validarRespostaOrdem };
