const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

    const marca = completion.choices[0].message.content.trim();
    return marca;
  } catch (err) {
    console.error('❌ Erro na inferência de marca via IA:', err.message);
    return null;
  }
}

// 🔤 Função auxiliar para normalizar textos (sem acento, caixa baixa, etc)
function normalizarTexto(txt) {
  return txt?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim();
}

// 🧠 Análise de pedido + fornecedores → IA escolhe fornecedor mais compatível
async function analisarPedidoViaIA(pedidoContexto, listaFornecedores) {
  const { marca, produtoSKU, quantidade, valorUnitario, produto } = pedidoContexto || {};

  // ⚠️ Validação básica
  if (!marca || !produtoSKU || !quantidade || !valorUnitario || !Array.isArray(listaFornecedores) || listaFornecedores.length === 0) {
    console.warn('⚠️ Dados insuficientes para análise IA:', { pedidoContexto, listaFornecedores });
    return null;
  }

  // 🔍 Reduzir lista de fornecedores relevantes por similaridade com a marca
  const marcaNorm = normalizarTexto(marca);
  const fornecedoresFiltrados = listaFornecedores.filter(f =>
    normalizarTexto(f.nome).includes(marcaNorm)
  ).slice(0, 10); // Limita a 10 fornecedores no prompt

  if (fornecedoresFiltrados.length === 0) {
    console.warn(`⚠️ Nenhum fornecedor compatível com a marca '${marca}' foi encontrado para análise IA.`);
    return null;
  }

  const prompt = `
Você é uma IA que analisa um item de pedido de venda no ERP Tiny. Com base nas informações do produto, quantidade, preço e lista de fornecedores disponíveis, escolha o fornecedor mais compatível com a marca e características do produto.

⚠️ DICAS:
- Ignore acentos e diferenças de caixa nos nomes dos fornecedores.
- Considere que "Acend Iluminação" pode corresponder a "FORNECEDOR ACEND ILUMINACAO".
- Compare por similaridade textual com foco na marca e SKU.

Responda SOMENTE com um JSON na estrutura abaixo:

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

### PRODUTO
SKU: ${produtoSKU}
Marca detectada: ${marca}
Quantidade: ${quantidade}
Valor unitário: ${valorUnitario}

### FORNECEDORES
${JSON.stringify(fornecedoresFiltrados, null, 2)}
`;

  try {
    console.log('🤖 IA - Enviando prompt...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const text = completion.choices[0].message.content.trim();
    console.log('🔎 RESPOSTA IA FORNECEDOR:', text);

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const jsonString = text.substring(start, end + 1);

    if (!jsonString) {
      console.warn('⚠️ Resposta da IA sem JSON válido detectado.');
      return null;
    }

    return JSON.parse(jsonString);
  } catch (err) {
    console.error('❌ Erro ao interpretar resposta da IA:', err.message);
    return { erro: 'Resposta inválida da IA' };
  }
}

module.exports = {
  inferirMarcaViaIA,
  analisarPedidoViaIA
};
