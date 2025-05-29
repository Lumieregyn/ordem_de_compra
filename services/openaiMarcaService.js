const { OpenAI } = require('openai');
const { listarTodosFornecedores } = require('./tinyFornecedorService');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function normalizarTexto(texto) {
  return texto?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function inferirMarcaViaIA(produto) {
  try {
    const fornecedores = await listarTodosFornecedores();
    const nomesFornecedores = fornecedores.map(f => f.nome).filter(Boolean);

    const prompt = `
Você é um sistema inteligente que analisa JSONs de produtos para determinar a marca e o fornecedor.

🎯 Objetivo:
- Identificar a marca do produto.
- Verificar se a marca corresponde a algum fornecedor.
- Indicar se deve ser gerada uma ordem de compra (deveGerarOC: true).
- O nome da marca SEMPRE será igual ao nome do fornecedor.

📌 Regras:
- Compare o campo "marca" com os nomes abaixo.
- Se encontrar compatibilidade exata ou semelhante, associe como fornecedor.
- Se não encontrar, retorne deveGerarOC: false e explique no motivo.

🧾 Lista de fornecedores disponíveis:
${nomesFornecedores.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}

📦 Produto recebido (JSON):
${JSON.stringify(produto, null, 2)}

📤 Responda apenas no seguinte formato JSON:
{
  "itens": [
    {
      "produtoSKU": "<sku>",
      "marca": "<marca inferida ou extraída>",
      "fornecedor": "<nome completo do fornecedor>",
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
        { role: 'system', content: 'Você é um analisador de marca e fornecedor para produtos.' },
        { role: 'user', content: prompt }
      ]
    });

    const texto = resposta.choices[0]?.message?.content?.trim();
    const json = JSON.parse(texto);

    return json;
  } catch (err) {
    console.error('❌ Erro ao inferir marca via IA:', err.message);
    return {
      itens: [
        {
          produtoSKU: produto?.sku || '',
          marca: 'N/A',
          fornecedor: 'N/A',
          deveGerarOC: false,
          motivo: 'Resposta inválida da IA'
        }
      ]
    };
  }
}

module.exports = { analisarPedidoViaIA };

