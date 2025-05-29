const { OpenAI } = require('openai');
const { listarTodosFornecedores } = require('./tinyFornecedorService');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Função principal para analisar o pedido completo e decidir sobre geração de OC
 */
async function analisarPedidoViaIA(pedido) {
  try {
    const fornecedores = await listarTodosFornecedores();
    const nomesFornecedores = fornecedores.map(f => f.nome).filter(Boolean);

    const prompt = `
Você é um sistema de análise de pedidos e vai decidir se deve gerar uma Ordem de Compra (OC) para cada item.

📦 Pedido:
${JSON.stringify(pedido, null, 2)}

📋 Lista de fornecedores disponíveis:
${nomesFornecedores.map((f, i) => `- ${f}`).join('\n')}

📌 Regras:
- Use o nome da marca presente no produto.
- Verifique se esse nome existe entre os fornecedores disponíveis.
- Se existir, retorne o nome exato do fornecedor e deveGerarOC: true.
- Se não existir, deveGerarOC: false com explicação no campo motivo.

🧠 Responda somente no seguinte formato JSON:
{
  "itens": [
    {
      "produtoSKU": "<sku ou vazio>",
      "marca": "<marca detectada>",
      "fornecedor": "<nome exato do fornecedor ou vazio>",
      "deveGerarOC": true | false,
      "motivo": "<explicação curta>"
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
          content: 'Você é um analisador de pedidos para geração automática de ordens de compra.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const texto = resposta.choices[0]?.message?.content?.trim();
    console.log('🧠 RESPOSTA DA IA:\n', texto);

    const json = JSON.parse(texto);
    return json;

  } catch (err) {
    console.error('❌ Erro ao processar pedido via IA:', err.message);
    return {
      itens: [
        {
          produtoSKU: '',
          marca: '',
          fornecedor: '',
          deveGerarOC: false,
          motivo: 'Erro ao interpretar resposta da IA'
        }
      ]
    };
  }
}

module.exports = { analisarPedidoViaIA };
