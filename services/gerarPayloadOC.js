function gerarPayloadOrdemCompra(dados) {
  const {
    origem,
    dataPedido,
    dataPrevista,
    estimativaEntrega,
    condicaoPagamento,
    parcelas,
    vendedor,
    pedidoNumero,
    contatoId,
    categoriaId = 0,
    produto,
    fornecedor
  } = dados;

  // 🛑 Validações obrigatórias
  if (!produto?.id || !produto?.quantidade || !produto?.valor || !fornecedor?.id) {
    throw new Error("Dados obrigatórios ausentes: produto.id, quantidade, valor ou fornecedor.id");
  }

  // 📅 Datas
  const dataHoje = new Date().toISOString().split("T")[0];
  const dataEntrega = origem === 'ecommerce'
    ? dataPrevista
    : calcularDataEntregaComercial(dataHoje, estimativaEntrega);

  if (!dataEntrega || !/^\d{4}-\d{2}-\d{2}$/.test(dataEntrega)) {
    throw new Error("Data prevista inválida ou ausente.");
  }

  // 📝 Observações
  const observacoes = "Gerado automaticamente via sistema";
  const observacoesInternas = "OC gerada via webhook automático";
  const informacoesAdicionais = `SKU: ${produto.sku || '---'} / Fornecedor: ${fornecedor.nome}`;

  // 💸 Parcelas formatadas
  const parcelasFormatadas = (parcelas || []).map(parcela => ({
    dias: parcela.dias || 30,
    valor: parcela.valor || produto.valor,
    contaContabil: { id: parcela.contaContabilId || 1 },
    meioPagamento: parcela.meioPagamento || "1",
    observacoes: parcela.observacoes || "Pagamento único"
  }));

  // ✅ Montagem do payload final
  const payload = {
    data: dataHoje,
    dataPrevista: dataEntrega,
    condicao: condicaoPagamento || "A prazo 30 dias",
    fretePorConta: "R",
    observacoes,
    observacoesInternas,
    contato: { id: contatoId },
    categoria: { id: categoriaId },
    parcelas: parcelasFormatadas.length > 0 ? parcelasFormatadas : [{
      dias: 30,
      valor: produto.valor,
      contaContabil: { id: 1 },
      meioPagamento: "1",
      observacoes: "Pagamento único"
    }],
    itens: [
      {
        produto: { id: produto.id },
        quantidade: produto.quantidade,
        valor: produto.valor,
        informacoesAdicionais,
        aliquotaIPI: 0,
        valorICMS: 0
      }
    ]
  };

  return payload;
}

// 📅 Função auxiliar para calcular prazo de entrega em pedidos comerciais
function calcularDataEntregaComercial(dataBase, diasPrazo = 7) {
  const base = new Date(dataBase);
  base.setDate(base.getDate() + parseInt(diasPrazo, 10));
  return base.toISOString().split("T")[0];
}

module.exports = {
  gerarPayloadOrdemCompra
};
