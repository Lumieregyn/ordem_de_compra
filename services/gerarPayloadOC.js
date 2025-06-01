const { addBusinessDays } = require('date-fns');

/**
 * Gera o payload da Ordem de Compra conforme o padrão da API Tiny v3
 * @param {Object} dados
 * @returns {Object} JSON pronto para envio
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

  // 🧪 Validação detalhada com logs
  const erros = [];

  if (!produto?.id) erros.push('produto.id');
  if (!idFornecedor) erros.push('idFornecedor');
  if (!valorUnitario) erros.push('valorUnitario');
  if (!quantidade) erros.push('quantidade');
  if (!sku) erros.push('sku');
  if (!pedido) erros.push('pedido');
  if (!produto) erros.push('produto');

  if (erros.length > 0) {
    erros.forEach(campo => {
      console.warn(`[Bloco 4 ⚠️] Campo ausente: ${campo}`);
    });
    throw new Error('Dados obrigatórios ausentes no Bloco 4');
  }

  // 📅 Datas
  const dataPedido = pedido.data;
  const diasPreparacao = produto?.diasPreparacao || 5;
  const dataPrevista = addBusinessDays(new Date(dataPedido), diasPreparacao)
    .toISOString()
    .split('T')[0];

  // 💰 Cálculo da parcela
  const valorTotal = Number((quantidade * valorUnitario).toFixed(2));

  // 🧾 Payload final
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
