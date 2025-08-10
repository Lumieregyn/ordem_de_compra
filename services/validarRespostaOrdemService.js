// services/validarRespostaOrdemService.js

/**
 * Valida a resposta da criação de OC tanto no formato V3 quanto V2.
 * V3 (tipos comuns):
 *   { id, numero, ... }
 *   { ordem_compra: { id, numero | numero_pedido, ... } }
 * V2 (legado):
 *   { retorno: { status: 'sucesso', ordem_compra: { id, numero_pedido } } }
 *
 * @param {any} data Resposta JSON da Tiny
 * @returns {boolean} true se reconhecer sucesso, false caso contrário
 */
function validarRespostaOrdem(data) {
  if (!data || typeof data !== 'object') {
    console.error('❌ Resposta inválida da API Tiny: corpo ausente ou não-objeto');
    return false;
  }

  // ===== Tentativas de extrair identificadores (V3 e V2) =====
  const id =
    data?.id ||
    data?.ordem_compra?.id ||
    data?.ordemCompra?.id ||
    data?.retorno?.ordem_compra?.id;

  const numero =
    data?.numero ||
    data?.numero_pedido ||
    data?.ordem_compra?.numero ||
    data?.ordem_compra?.numero_pedido ||
    data?.retorno?.ordem_compra?.numero_pedido;

  // ===== Heurística de sucesso V3: presença de ID já é suficiente =====
  if (id) {
    console.log(`✅ OC criada (V3). ID Tiny: ${id}${numero ? `, Número: ${numero}` : ''}`);
    return true;
  }

  // ===== Sucesso V2 (legado) =====
  const statusV2 = data?.retorno?.status;
  if (statusV2 === 'sucesso') {
    console.log(
      `✅ OC criada (V2).${data?.retorno?.ordem_compra?.id ? ` ID Tiny: ${data.retorno.ordem_compra.id}` : ''}`
    );
    return true;
  }

  // ===== Falha: agrega detalhes úteis =====
  const mensagem = data?.mensagem || data?.message || data?.retorno?.mensagem;
  const detalhes =
    data?.detalhes ||
    data?.errors ||
    data?.retorno?.erros ||
    data?.retorno?.mensagens ||
    [];

  console.error('❌ Falha na criação da OC via API Tiny:', {
    mensagem: mensagem || 'Sem mensagem',
    detalhes,
    corpo: data,
  });

  return false;
}

module.exports = { validarRespostaOrdem };
