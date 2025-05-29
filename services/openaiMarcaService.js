const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// IA que infere marca a partir de um produto isolado
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

// IA que analisa um pedido completo e decide sobre Ordem de Compra
async function analisarPedidoViaIA(pedidoJsonCompleto) {
  const prompt = `
Você é um sistema de inteligência artificial que analisa pedidos de venda no ERP Tiny.

Com base nos dados abaixo, para cada item diga:
- Se deve gerar uma ordem de compra (true/false)
- O motivo da decisão
- O nome da marca
- O nome do fornecedor
- O SKU (ou identificador do produto)

Responda em JSON com a estrutura:
{
  "itens": [
    {
      "produtoSKU": "...",
      "deveGerarOC": true,
      "marca": "...",
      "fornecedor": "...",
      "motivo": "..."
    }
  ]
}

Abaixo está o JSON do pedido:
${JSON.stringify(pedidoJsonCompleto, null, 2)}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const text = completion.choices[0].message.content;
    const resposta = JSON.parse(text);
    return resposta;
  } catch (err) {
    console.error('❌ Erro ao interpretar resposta da IA:', err.message);
    return { erro: 'Resposta inválida da IA' };
  }
}

module.exports = {
  inferirMarcaViaIA,
  analisarPedidoViaIA,
};
