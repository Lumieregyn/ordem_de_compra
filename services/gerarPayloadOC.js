// services/gerarPayloadOC.js
const { addBusinessDays } = require('date-fns');

/** Converte "2.016,84" | "2016,84" | 2016.84 -> 2016.84 (number) */
function toNumberBR(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Pega melhor data do pedido (com fallbacks) e retorna YYYY-MM-DD */
function pickDataPedido(pedido) {
  const candidatas = [
    pedido?.data,
    pedido?.dados,           // já apareceu nos teus logs
    pedido?.dataEmissao,
    pedido?.dataFaturamento,
  ].filter(Boolean);

  const toISO = (d) => {
    const dt = new Date(d);
    return isNaN(dt) ? null : dt.toISOString().slice(0, 10);
  };

  for (const d of candidatas) {
    const iso = toISO(d);
    if (iso) return iso;
  }
  return new Date().toISOString().slice(0, 10);
}

/** Monta as parcelas com base no pedido; se não houver, 1 parcela = total */
function montarParcelas(pedido, valorTotal) {
  const parcelasOrig = pedido?.pagamento?.parcelas;
  if (Array.isArray(parcelasOrig) && parcelasOrig.length > 0) {
    const pars = parcelasOrig
      .map((p) => {
        const dias = Number(p?.dias ?? 0);
        const valor = toNumberBR(p?.valor);
        return (Number.isFinite(dias) && valor != null && valor >= 0)
          ? { dias, valor }
          : null;
      })
      .filter(Boolean);

    // Se somatório for válido, usa; senão cai para 1 parcela
    const soma = pars.reduce((acc, x) => acc + x.valor, 0);
    if (pars.length && soma > 0) return pars;
  }

  // fallback: 1 parcela
  return [{ dias: 0, valor: valorTotal }];
}

/**
 * Gera o payload da Ordem de Compra (Tiny v3).
 * @param {Object} dados - { pedido, produto, sku, quantidade, valorUnitario, idFornecedor }
 */
function gerarPayloadOrdemCompra(dados) {
  const { pedido, produto, sku, quantidade, valorUnitario, idFornecedor } = dados;

  // Validação essencial
  const faltando = [];
  if (!pedido) faltando.push('pedido');
  if (!produto?.id) faltando.push('produto.id');
  if (!sku) faltando.push('sku');
  const qtd = toNumberBR(quantidade);
  const val = toNumberBR(valorUnitario);
  if (!(qtd > 0)) faltando.push('quantidade (>0)');
  if (!(val > 0)) faltando.push('valorUnitario (>0)');
  if (!idFornecedor) faltando.push('idFornecedor');

  if (faltando.length) {
    console.warn('[Bloco 5 ⚠️] Campos ausentes:', faltando);
    throw new Error('Dados obrigatórios ausentes para gerar OC');
  }

  // Datas
  const data = pickDataPedido(pedido);
  const diasPreparacao = Number(produto?.diasPreparacao ?? 5);
  const dataPrevista = addBusinessDays(new Date(data), isNaN(diasPreparacao) ? 5 : diasPreparacao)
    .toISOString()
    .slice(0, 10);

  // Totais
  const valorTotal = Number((qtd * val).toFixed(2));
  const parcelas = montarParcelas(pedido, valorTotal);

  // Observações
  const observacoes = pedido?.observacoes || 'Gerado automaticamente';
  const observacoesInternas = 'OC gerada automaticamente via IA';

  // Monta payload mínimo/seguro para V3
  const payload = {
    data,
    dataPrevista,
    observacoes,
    observacoesInternas,
    contato: { id: idFornecedor },
    parcelas,
    itens: [
      {
        produto: { id: produto.id },
        quantidade: qtd,
        valor: val,
        informacoesAdicionais: `SKU: ${sku} / Fornecedor: ${produto?.marca?.nome || '---'}`,
        aliquotaIPI: 0,
        valorICMS: 0,
      },
    ],
  };

  return payload;
}

module.exports = { gerarPayloadOrdemCompra };
