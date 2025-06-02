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

  // 💳 Parcela (sem contaContabil)
  const parcela = {
    dias: 30,
    valor: valorTotal,
    meioPagamento: "1",
    observacoes: "Pagamento único"
  };

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
    parcelas: [parcela],
    itens: [
      {
        produto: { id: parseInt(produto.id) },
        quantidade,
        valor: valorUnitario,
        informacoesAdicionais: `SKU: ${sku} / Fornecedor: ${produto?.marca?.nome || '---'}`,
        aliquotaIPI: 0,
        valorICMS: 0
      }
    ]
  };

  // 🚫 Remover objetos inválidos se necessário
  if (!payload.contato?.id) {
    console.warn('[Bloco 4 ⚠️] contato.id ausente – removendo campo contato');
    delete payload.contato;
  }

  if (!payload.categoria?.id && payload.categoria?.id !== 0) {
    console.warn('[Bloco 4 ⚠️] categoria.id inválido – removendo campo categoria');
    delete payload.categoria;
  }

  if (!payload.itens[0].produto?.id) {
    console.warn('[Bloco 4 ⚠️] produto.id inválido – removendo campo produto do item');
    delete payload.itens[0].produto;
  }

  console.log('🔧 Payload OC gerado:', JSON.stringify(payload, null, 2));
  return payload;
}

module.exports = {
  gerarPayloadOrdemCompra
};
