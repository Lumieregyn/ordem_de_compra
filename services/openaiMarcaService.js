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

// 🧠 Análise de pedido + fornecedores → IA escolhe fornecedor mais compatível
async function analisarPedidoViaIA(pedidoContexto, listaFornecedores) {
  const prompt = `
Você é uma IA que analisa um item de pedido de venda no ERP Tiny. Com base nas informações do produto, quantidade, preço e lista de fornecedores disponíveis, escolha o fornecedor mais compatível com a marca e características do produto.

Retorne APENAS um JSON com a estrutura abaixo:

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
${JSON.stringify(pedidoContexto.produto, null, 2)}

Quantidade: ${pedidoContexto.quantidade}
Valor unitário: ${pedidoContexto.valorUnitario}
Marca detectada: ${pedidoContexto.marca}

### FORNECEDORES DISPONÍVEIS
${JSON.stringify(listaFornecedores, null, 2)}
`;

  try {
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
