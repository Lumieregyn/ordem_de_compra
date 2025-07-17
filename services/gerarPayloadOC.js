const { addBusinessDays } = require('date-fns');

/**
 * Gera o payload da Ordem de Compra no padrão da API Tiny v3.
 * @param {Object} dados - Dados completos do pedido e item processado
 * @returns {Object} payload JSON final
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

  // 🔎 Validação dos campos essenciais
  const camposObrigatorios = {
    'pedido': pedido,
    'produto': produto,
    'produto.id': produto?.id,
    'sku': sku,
    'quantidade': quantidade,
    'valorUnitario': valorUnitario,
    'idFornecedor': idFornecedor
  };

  const camposFaltando = Object.entries(camposObrigatorios)
    .filter(([_, valor]) => valor === undefined || valor === null);

  if (camposFaltando.length > 0) {
    camposFaltando.forEach(([campo]) =>
      console.warn(`[Bloco 4 ⚠️] Campo ausente: ${campo}`)
    );
    throw new Error('Dados obrigatórios ausentes no Bloco 4');
  }

  // 📅 Datas
  const dataPedido = pedido.data;
  const diasPreparacao = produto?.diasPreparacao || 5;
  const dataPrevista = addBusinessDays(new Date(dataPedido), diasPreparacao)
    .toISOString()
    .split('T')[0];

  // 💰 Valor total da parcela
  const valorTotal = Number((quantidade * valorUnitario).toFixed(2));

  // 🧾 Payload final da Ordem de Compra
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
