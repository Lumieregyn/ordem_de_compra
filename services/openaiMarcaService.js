const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ✅ Continua funcionando para testes individuais
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

// ✅ Agora com inteligência de escolha de fornecedor
async function analisarPedidoViaIA({ produto, quantidade, valorUnitario, marca }, fornecedores) {
  const nomesFornecedores = fornecedores.map(f => `- ${f.nome}`).join('\n');

  const prompt = `
Você é uma IA que analisa um item de pedido para decidir se deve ou não gerar uma Ordem de Compra.

Com base no nome da marca do produto e na lista de fornecedores disponíveis, indique o fornecedor mais compatível.

### Lista de fornecedores disponíveis:
${nomesFornecedores}

### Produto:
${JSON.stringify(produto, null, 2)}

### Responda apenas com o seguinte JSON:
{
  "itens": [
    {
      "produtoSKU": "${produto.sku || ''}",
      "marca": "${marca || 'Desconhecida'}",
      "fornecedor": "NOME EXATO DO FORNECEDOR ACIMA",
      "deveGerarOC": true,
      "motivo": "Motivo lógico da decisão"
    }
  ]
}

⚠️ Regras:
- Escolha o nome mais compatível com a marca do produto
- Se nenhum nome bater, preencha fornecedor como "Não encontrado"
- NUNCA invente nomes fora da lista
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const text = completion.choices[0].message.content.trim();
    console.log('🔍 RESPOSTA DA IA:', text);

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
