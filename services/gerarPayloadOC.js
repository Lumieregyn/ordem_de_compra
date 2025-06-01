const { addBusinessDays } = require('date-fns');

/**
 * Gera o payload completo e válido para envio da Ordem de Compra na API Tiny v3
 * @param {Object} dados
 * @returns {Object} payload JSON completo
 */
function gerarPayloadOrdemCompra(dados) {
  const {
    pedido,
    produto,
    sku,
    quantidade,
    valorUnitario,
    idFornecedor
  } = dados;

  // ✅ Validações básicas
  if (!pedido?.data || !produto?.id || !idFornecedor || !quantidade || !valorUnitario) {
    throw new Error('Dados obrigatórios ausentes no Bloco 4');
  }

  // 📅 Datas
  const dataPedido = pedido.data;
  const diasPreparacao = produto?.diasPreparacao || 5;
  const dataPrevista = addBusinessDays(new Date(dataPedido), diasPreparacao)
    .toISOString()
    .split('T')[0];

  // 💰 Cálculo do valor total
  const valorTotal = Number((quantidade * valorUnitario).toFixed(2));

  // 🧾 Montagem do payload final
  const payload = {
    data: dataPedido,
    dataPrevista,
    condicao: pedido.condicao || "A prazo 30 dias",
    fretePorConta: "R",
    observacoes: pedido.observacoes || "Gerado automaticamente",
    observacoesInternas: "OC gerada automaticamente via IA",
    contato: { id: idFornecedor },
    categoria: { id: 0 },
    parcelas: [
      {
        dias: 30,
        valor: valorTotal,
        contaContabil: { id: 1 },
        meioPagamento: "1",
        observacoes: "Pagamento único"
      }
    ],
    itens: [
      {
        produto: { id: produto.id },
        quantidade,
        valor: valorUnitario,
        informacoesAdicionais: `SKU: ${sku} / Fornecedor: ${produto?.marca?.nome || '---'}`,
        aliquotaIPI: 0,
        valorICMS: 0
      }
    ]
  };

  console.log('🔧 Payload OC gerado:', payload);
  return payload;
}

module.exports = {
  gerarPayloadOrdemCompra
};
