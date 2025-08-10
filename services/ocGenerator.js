// services/gerarOrdemCompraXML.js
const xml2js = require('xml2js');

const builder = new xml2js.Builder({ headless: true, renderOpts: { pretty: false } });

function toNumberBR(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return Number(v.toFixed(2));
  const s = String(v).trim();
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

function fmt2(v) {
  const n = toNumberBR(v);
  if (n == null) return null;
  // Tiny costuma aceitar “.” como separador decimal
  return n.toFixed(2);
}

/**
 * Gera XML de Ordem de Compra (Tiny v2) com estrutura robusta.
 *
 * @param {Object} dados
 * @param {Object} dados.fornecedor { id?, nome?, codigo? }
 * @param {Array}  dados.itens [{ codigo?, id_produto?, descricao, quantidade, valor_unitario }]
 * @param {String} dados.data (YYYY-MM-DD) opcional
 * @param {String} dados.observacoes opcional
 * @param {Array}  dados.parcelas opcional [{ dias, valor }]
 * @returns {String} XML Tiny v2
 */
function gerarOrdemCompra(dados = {}) {
  const faltando = [];
  if (!dados.fornecedor) faltando.push('fornecedor');
  if (!Array.isArray(dados.itens) || dados.itens.length === 0) faltando.push('itens');

  if (faltando.length) {
    throw new Error(`Campos obrigatórios ausentes: ${faltando.join(', ')}`);
  }

  const dataPedido =
    dados.data ||
    new Date().toISOString().slice(0, 10);

  // Normaliza itens com validação e decimais
  const itensXml = dados.itens.map((i, idx) => {
    const q = fmt2(i.quantidade ?? 1);
    const vu = fmt2(i.valor_unitario);
    if (!(Number(q) > 0)) {
      throw new Error(`itens[${idx}].quantidade inválida`);
    }
    if (!(Number(vu) > 0)) {
      throw new Error(`itens[${idx}].valor_unitario inválido`);
    }

    const item = {
      // Preferência: id_produto do Tiny; se não tiver, envia codigo
      ...(i.id_produto ? { id_produto: String(i.id_produto) } : {}),
      ...(i.codigo ? { codigo: String(i.codigo) } : {}),
      descricao: String(i.descricao || '').trim(),
      quantidade: q,
      valor_unitario: vu,
    };
    return item;
  });

  // Monta parcelas (se não vier, uma parcela à vista com o total)
  let parcelasXml;
  if (Array.isArray(dados.parcelas) && dados.parcelas.length > 0) {
    parcelasXml = dados.parcelas
      .map(p => {
        const dias = Number(p?.dias ?? 0);
        const valor = fmt2(p?.valor ?? 0);
        if (!Number.isFinite(dias) || valor == null) return null;
        return { dias, valor };
      })
      .filter(Boolean);
  } else {
    const total = itensXml.reduce((acc, it) => acc + Number(it.valor_unitario) * Number(it.quantidade), 0);
    parcelasXml = [{ dias: 0, valor: total.toFixed(2) }];
  }

  // Fornecedor: aceita id/codigo/nome; mande o que tiver
  const fornecedorXml = {};
  if (dados.fornecedor.id) fornecedorXml.id = String(dados.fornecedor.id);
  if (dados.fornecedor.codigo) fornecedorXml.codigo = String(dados.fornecedor.codigo);
  if (dados.fornecedor.nome) fornecedorXml.nome = String(dados.fornecedor.nome);

  const objetoXml = {
    pedido: {
      data_pedido: dataPedido,
      fornecedor: fornecedorXml,
      ...(dados.observacoes ? { observacoes: String(dados.observacoes) } : {}),
      itens: { item: itensXml },
      parcelas: { parcela: parcelasXml },
    }
  };

  return builder.buildObject(objetoXml);
}

module.exports = { gerarOrdemCompra };
