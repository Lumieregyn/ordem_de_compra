const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 🔍 Inferência de marca a partir de um produto isolado (ex: testar-marca-ia/:id)
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

// 🧠 Análise completa de pedido com decisão de OC por item
async function analisarPedidoViaIA(pedidoJsonCompleto) {
  const prompt = `
Você é uma IA que analisa um pedido de venda em JSON e responde apenas com um JSON estruturado conforme abaixo.

### IMPORTANTE:
- Responda SOMENTE com o JSON, sem comentários ou explicações
- NÃO coloque texto antes ou depois do JSON
- Utilize esse formato EXATO:

{
  "itens": [
    {
      "produtoSKU": "string",
      "deveGerarOC": true,
      "marca": "string",
      "fornecedor": "string",
      "motivo": "string"
    }
  ]
}

Abaixo está o pedido para análise:
${JSON.stringify(pedidoJsonCompleto, null, 2)}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const text = completion.choices[0].message.content.trim();

    // 🔍 DEBUG: log da IA (pode ver isso nos logs do Railway)
    console.log('🔎 RESPOSTA DA IA:', text);

    // Força extração do JSON, mesmo que a IA adicione algum texto extra
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
