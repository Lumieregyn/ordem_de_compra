// services/openaiMarcaService.js
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/** ───────── utils: limpeza e extração robusta de JSON ───────── **/
function limparCodeFence(txt = '') {
  // remove ```json ... ``` e ``` ... ```
  return txt
    .replace(/```json\s*([\s\S]*?)```/gi, '$1')
    .replace(/```\s*([\s\S]*?)```/g, '$1')
    .trim();
}

function extrairJsonRobusto(txt) {
  const limpo = limparCodeFence(txt);

  // 1) tentativa direta
  try { return JSON.parse(limpo); } catch {}

  // 2) localizar maior bloco { ... } com chaves balanceadas
  let start = limpo.indexOf('{');
  while (start !== -1) {
    let nivel = 0;
    for (let i = start; i < limpo.length; i++) {
      const c = limpo[i];
      if (c === '{') nivel++;
      else if (c === '}') {
        nivel--;
        if (nivel === 0) {
          const cand = limpo.slice(start, i + 1);
          try { return JSON.parse(cand); } catch {}
          break;
        }
      }
    }
    start = limpo.indexOf('{', start + 1);
  }

  throw new Error('JSON da IA inválido ou truncado');
}

/** ───────── IA: inferência simples de marca ───────── **/
async function inferirMarcaViaIA(produto) {
  const prompt = `
Você analisa dados de um produto (Tiny ERP) e infere a MARCA.
Responda APENAS com o nome da marca em texto puro. Se não souber, responda: Desconhecida.

Produto:
${JSON.stringify(produto, null, 2)}
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const marca = (completion.choices?.[0]?.message?.content || '').trim();
    return marca;
  } catch (err) {
    console.error('❌ Erro na inferência de marca via IA:', err.message);
    return null;
  }
}

/** ───────── IA: escolher fornecedor compatível ─────────
 * Entrada é flexível: funciona com o contexto que você já envia no webhook
 * { produtoSKU, marca, fornecedores } e também aceita objetos mais ricos.
 * Retorna ACHATADO:
 * { produtoSKU, deveGerarOC, marca, motivo, idFornecedor, nomeFornecedor }
 */
async function analisarPedidoViaIA(pedidoContexto = {}, listaFornecedores = []) {
  // Normaliza campos para o prompt, independente do formato que chegar
  const produtoSKU = pedidoContexto.produtoSKU || pedidoContexto.sku || pedidoContexto?.produto?.sku || 'DESCONHECIDO';
  const quantidade = pedidoContexto.quantidade ?? pedidoContexto.qtd ?? 1;
  const valorUnitario = pedidoContexto.valorUnitario ?? pedidoContexto.valor_unitario ?? pedidoContexto.preco ?? null;
  const marcaDetectada = pedidoContexto.marca || pedidoContexto.marcaDetectada || pedidoContexto?.produto?.marca?.nome || null;

  const prompt = `
Você é uma IA que escolhe o MELHOR FORNECEDOR para um item de pedido Tiny.
Responda **APENAS** com JSON válido (sem markdown/backticks), seguindo EXATAMENTE esta estrutura:

{
  "itens": [
    {
      "produtoSKU": "string",
      "deveGerarOC": true,
      "marca": "string",
      "motivo": "string",
      "idFornecedor": 123,
      "nomeFornecedor": "Fornecedor ABC"
    }
  ]
}

Regra de negócio:
- Preferir fornecedor cujo nome siga "FORNECEDOR <MARCA>" (case-insensitive).
- Se houver ambiguidade, escolher o mais específico para a marca do SKU.
- Se não houver fornecedor confiável, defina "deveGerarOC": false e explique "motivo".

### CONTEXTO DO ITEM
SKU: ${produtoSKU}
Quantidade: ${quantidade}
Valor unitário: ${valorUnitario ?? 'N/D'}
Marca detectada: ${marcaDetectada ?? 'N/D'}

### LISTA DE FORNECEDORES (JSON)
${JSON.stringify(listaFornecedores, null, 2)}

Seja objetivo. Apenas o JSON final, sem comentários.
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.15,
    });

    const text = (completion.choices?.[0]?.message?.content || '').trim();
    const json = extrairJsonRobusto(text);

    // extrai o primeiro item e ACHATA pro chamador (webhook) usar direto
    const item = Array.isArray(json?.itens) && json.itens.length ? json.itens[0] : null;

    if (!item) {
      return {
        erro: 'Sem itens válidos na resposta da IA',
      };
    }

    // Preenche SKU/Marca se a IA não devolver
    return {
      produtoSKU: item.produtoSKU || produtoSKU,
      deveGerarOC: !!item.deveGerarOC,
      marca: item.marca || marcaDetectada || null,
      motivo: item.motivo || '',
      idFornecedor: typeof item.idFornecedor === 'number' ? item.idFornecedor : null,
      nomeFornecedor: item.nomeFornecedor || null
    };
  } catch (err) {
    console.error('❌ Erro ao interpretar resposta da IA (parser robusto):', err.message);
    return { erro: 'Resposta inválida da IA' };
  }
}

module.exports = {
  inferirMarcaViaIA,
  analisarPedidoViaIA
};
