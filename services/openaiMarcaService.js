const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helpers de parsing seguro
function safeExtractJson(text) {
  if (!text || typeof text !== 'string') return null;

  // Tenta extrair bloco entre a 1ª "{" e a última "}"
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  return text.substring(start, end + 1);
}

function safeParse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

function validarSchema(res) {
  if (!res || typeof res !== 'object') return false;
  if (!Array.isArray(res.itens)) return false;
  // itens opcionais, mas se existir valida campos principais
  if (res.itens.length > 0) {
    const i = res.itens[0];
    if (typeof i.deveGerarOC !== 'boolean') return false;
    if (typeof i.produtoSKU !== 'string') return false;
  }
  return true;
}

// 🔍 Inferência de marca a partir de um produto isolado
async function inferirMarcaViaIA(produto) {
  const prompt = `
Você é uma IA que analisa dados de produtos de um ERP (Tiny) e tenta inferir a marca do produto com base nos dados disponíveis.

Abaixo está o JSON do produto:
${JSON.stringify(produto, null, 2)}

Responda apenas com o nome da marca inferida. Se não conseguir inferir, responda "Desconhecida".
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const marca = completion?.choices?.[0]?.message?.content?.trim() || 'Desconhecida';
    return marca;
  } catch (err) {
    console.error('❌ Erro na inferência de marca via IA:', err.message);
    return null;
  }
}

// 🧠 Análise de pedido + fornecedores → IA escolhe fornecedor mais compatível
async function analisarPedidoViaIA(pedidoContexto, listaFornecedores) {
  const prompt = `
Você é uma IA que analisa um item de pedido de venda no ERP Tiny. Com base nas informações do produto, quantidade, preço e lista de fornecedores disponíveis, escolha o fornecedor mais compatível com a marca e características do produto.

Retorne APENAS um JSON **válido** e **mínimo** com a estrutura abaixo (sem comentários, sem texto fora do JSON):

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

### DADOS DO PEDIDO
Produto:
${JSON.stringify(pedidoContexto?.produto || {}, null, 2)}

Quantidade: ${pedidoContexto?.quantidade ?? ''}
Valor unitário: ${pedidoContexto?.valorUnitario ?? ''}
Marca detectada: ${pedidoContexto?.marca ?? ''}

### FORNECEDORES DISPONÍVEIS
${JSON.stringify(listaFornecedores || [], null, 2)}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const text = completion?.choices?.[0]?.message?.content?.trim() || '';
    console.log('🔎 RESPOSTA IA FORNECEDOR:', text);

    const raw = safeExtractJson(text);
    const parsed = raw ? safeParse(raw) : null;

    if (validarSchema(parsed)) {
      return parsed;
    }

    // Fallback enxuto para não quebrar o pipeline
    return {
      itens: [
        {
          produtoSKU: String(pedidoContexto?.produto?.sku || pedidoContexto?.produto?.codigo || ''),
          deveGerarOC: false,
          marca: String(pedidoContexto?.marca || ''),
          motivo: 'Resposta inválida da IA',
          idFornecedor: null,
          nomeFornecedor: null
        }
      ]
    };
  } catch (err) {
    console.error('❌ Erro ao interpretar resposta da IA:', err.message);
    return {
      itens: [
        {
          produtoSKU: String(pedidoContexto?.produto?.sku || pedidoContexto?.produto?.codigo || ''),
          deveGerarOC: false,
          marca: String(pedidoContexto?.marca || ''),
          motivo: 'Falha na chamada da IA',
          idFornecedor: null,
          nomeFornecedor: null
        }
      ]
    };
  }
}

module.exports = {
  inferirMarcaViaIA,
  analisarPedidoViaIA
};
