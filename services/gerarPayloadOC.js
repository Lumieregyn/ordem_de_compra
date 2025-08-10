// services/gerarPayloadOC.js
const { addBusinessDays } = require('date-fns');

/**
 * Converte "2.016,84" | "2016,84" | 2016.84 para número JS.
 */
function toNumberBR(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Determina a melhor data base do pedido.
 */
function pickDataPedido(pedido) {
  const candidatas = [
    pedido?.data,
    pedido?.dados,            // já vi vindo assim nos seus logs
    pedido?.dataEmissao,
    pedido?.dataFaturamento
  ].filter(Boolean);

  const iso = (d) => {
    try {
      return new Date(d).toISOString().split('T')[0];
    } catch {
      return null;
    }
  };

  for (const d of candidatas) {
    const v = iso(d);
    if (v) return v;
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * Gera o payload da Ordem de Compra no padrão da API Tiny v3.
 * @param {Object} dados - { pedido, produto, sku, quantidade, valorUnitario, idFornecedor }
 * @returns {Object} payload JSON final
 */
function gerarPayloadOrdemCompra(dados) {
  const { pedido, produto, sku, quantidade, valorUnitario, idFornecedor } = dados;

  // Validação essencial
  const faltando = [];
  if (!pedido) faltando.push('pedido');
  if (!produto?.id) faltando.push('produto.id');
  if (!sku) faltando.push('sku');
  if (!(quantidade > 0)) faltando.push('quantidade (>0)');
  if (!(valorUnitario > 0)) faltando.push('valorUnitario (>0)');
  if (!idFornecedor) faltando.push('idFornecedor');

  if (faltando.length) {
    console.warn('[Bloco 5 ⚠️] Campos ausentes:', faltando);
    throw new Error('Dados obrigatórios ausentes para gerar OC');
  }

  // Datas
  const dataPedido = pickDataPedido(pedido);
  const diasPreparacao = produto?.diasPreparacao || 5;
  const dataPrevista = addBusinessDays(new Date(dataPedido), diasPreparacao)
    .toISOString()
    .split('T')[0];

  // Valor total
  const qtd = toNumberBR(quantidade) ?? 1;
  const val = toNumberBR(valorUnitario) ?? 0;
  const valorTotal = Number((qtd * val).toFixed(2));

  const payload = {
    data: dataPedido,
    dataPrevista,
    condicao: pedido.condicao || 'A prazo 30 dias',
    fretePorConta: 'R',
    observacoes: pedido.observacoes || 'Gerado automaticamente',
    observacoesInternas: 'OC gerada automaticamente via IA',
    contato: { id: idFornecedor },
    categoria: { id: 0 },
    parcelas: [
      {
        dias: 30,
        valor: valorTotal,
        contaContabil: { id: 1 },
        meioPagamento: '1',
        observacoes: 'Pagamento único'
      }
    ],
    itens: [
      {
        produto: { id: produto.id },
        quantidade: qtd,
        valor: val,
        informacoesAdicionais: `SKU: ${sku} / Fornecedor: ${produto?.marca?.nome || '---'}`,
        aliquotaIPI: 0,
        valorICMS: 0
      }
    ]
  };

  return payload;
}

module.exports = { gerarPayloadOrdemCompra };
