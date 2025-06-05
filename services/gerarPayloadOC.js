/**
 * Gera o payload da Ordem de Compra no padrão Tiny v3 para um grupo de itens por marca.
 * @param {Object} dados - Contém: numeroPedido, nomeCliente, dataPrevista, itens[], fornecedor
 * @returns {Object} payload JSON final
 */
function gerarPayloadOrdemCompra(dados) {
  const {
    numeroPedido,
    nomeCliente,
    dataPrevista,
    itens,
    fornecedor
  } = dados;

  // ⚠️ Validação básica
  if (!numeroPedido || !Array.isArray(itens) || itens.length === 0 || !fornecedor?.id) {
    console.warn('[Bloco 4 ⚠️] Dados incompletos para geração da OC');
    throw new Error('Bloco 4: dados incompletos');
  }

  // 🗓️ Fallback para dataPrevista
  const dataPrevistaFinal = dataPrevista?.trim() !== ''
    ? dataPrevista
    : new Date().toISOString().split('T')[0];

  // 🎯 Validar e montar os itens
  const itensValidos = itens
    .filter(item => item?.produto?.id && item?.quantidade && item?.valorUnitario)
    .map(item => ({
      produto: { id: parseInt(item.produto.id) },
      quantidade: item.quantidade,
      valor: item.valorUnitario,
      informacoesAdicionais: `SKU: ${item.sku || '---'} / Fornecedor: ${fornecedor.nome}`,
      aliquotaIPI: 0,
      valorICMS: 0
    }));

  if (itensValidos.length === 0) {
    console.warn('[Bloco 4 ⚠️] Nenhum item válido para gerar OC.');
    throw new Error('Bloco 4: Nenhum item válido no grupo');
  }

  // 💰 Total da parcela
  const valorTotal = itensValidos.reduce(
    (total, item) => total + (item.quantidade * item.valor),
    0
  ).toFixed(2);

  const parcela = {
    dias: 30,
    valor: Number(valorTotal),
    meioPagamento: "1",
    observacoes: "Pagamento único"
  };

  // 🧾 Observações padronizadas
  const observacoes = [
    'OC gerada automaticamente via IA',
    `Pedido de Venda: ${numeroPedido}`,
    `Cliente: ${nomeCliente}`
  ].join('\n');

  // 📦 Payload final
  const payload = {
    data: new Date().toISOString().split('T')[0],
    dataPrevista: dataPrevistaFinal,
    condicao: "A prazo 30 dias",
    fretePorConta: "Destinatário",
    observacoes,
    observacoesInternas: `OC gerada automaticamente para fornecedor ${fornecedor.nome} / Pedido ${numeroPedido}`,
    contato: { id: fornecedor.id },
    categoria: { id: 0 },
    parcelas: [parcela],
    itens: itensValidos
  };

  console.log('🔧 Payload OC gerado:', JSON.stringify(payload, null, 2));
  return payload;
}

module.exports = {
  gerarPayloadOrdemCompra
};
