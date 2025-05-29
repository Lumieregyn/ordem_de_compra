const { OpenAI } = require('openai');
const { listarTodosFornecedores } = require('./tinyFornecedorService');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Analisa um pedido e decide, com apoio da IA, se deve gerar uma OC.
 * A IA considera a marca do produto e os fornecedores disponíveis.
 */
async function analisarPedidoViaIA(pedido) {
  try {
    const fornecedores = await listarTodosFornecedores();

    if (fornecedores.length === 0) {
      console.warn('⚠️ Nenhum fornecedor disponível na Tiny');
    }

    const nomesFornecedores = fornecedores.map(f => f.nome).filter(Boolean);

    const prompt = `
Você é um sistema de análise de pedidos que decide se deve gerar uma Ordem de Compra (OC).

📦 Pedido:
${JSON.stringify(pedido, null, 2)}

📋 Lista de fornecedores disponíveis:
${nomesFornecedores.map((f, i) => `- ${f}`).join('\n')}

📌 Regras:
- A marca do produto deve ser usada para identificar o fornecedor.
- Se o nome da marca for encontrado na lista de fornecedores, gere uma OC.
- Responda com o nome exato do fornecedor correspondente.
- Caso não encontre, retorne "deveGerarOC": false com explicação.

🧠 Responda apenas neste JSON:

{
  "itens": [
    {
      "produtoSKU": "<sku>",
      "marca": "<marca>",
      "fornecedor": "<nome do fornecedor ou vazio>",
      "deveGerarOC": true | false,
      "motivo": "<explicação>"
    }
  ]
}
`;

    const resposta = await openai.chat.completions.create({
      model: 'gpt-4',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: 'Você é um analisador de pedidos que decide se deve gerar OC com base na marca e fornecedor.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const texto = resposta.choices[0]?.message?.content?.trim();
    console.log('🧠 RESPOSTA DA IA:\n', texto);

    const resultado = JSON.parse(texto);

    // 🧠 Localiza ID do fornecedor real com base no nome retornado pela IA
    for (const item of resultado.itens) {
      const nomeIA = item.fornecedor?.toLowerCase().trim();
      const fornecedor = fornecedores.find(f =>
        f.nome?.toLowerCase().trim() === nomeIA
      );

      item.fornecedorId = fornecedor?.id || null;
    }

    return resultado;

  } catch (err) {
    console.error('❌ Erro ao processar pedido via IA:', err.message);
    return {
      itens: [
        {
          produtoSKU: '',
          marca: '',
          fornecedor: '',
          fornecedorId: null,
          deveGerarOC: false,
          motivo: 'Erro ao interpretar resposta da IA'
        }
      ]
    };
  }
}

module.exports = { analisarPedidoViaIA };
