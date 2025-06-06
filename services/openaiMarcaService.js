const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function normalizarTexto(txt) {
  return txt?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().trim();
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

    const marca = completion.choices[0].message.content.trim();
    return marca;
  } catch (err) {
    console.error('❌ Erro na inferência de marca via IA:', err.message);
    return null;
  }
}

// 🧠 Análise de pedido + fornecedores → IA escolhe fornecedor mais compatível
async function analisarPedidoViaIA(pedidoContexto, listaFornecedores = []) {
  // ✅ Validação prévia
  if (!pedidoContexto?.produto || !Array.isArray(listaFornecedores) || listaFornecedores.length === 0) {
    console.warn('⚠️ Dados insuficientes para análise IA:', { pedidoContexto, listaFornecedores });
    return { erro: 'Dados insuficientes' };
  }

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
${JSON.stringify(listaFornecedores.map(f => ({
  id: f.id,
  nome: normalizarTexto(f.nome)
})), null, 2)}
`;

  try {
    console.log('🤖 IA - Enviando prompt...');
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const resposta = completion.choices[0].message.content.trim();
    console.log('🔎 RESPOSTA IA FORNECEDOR:', resposta);

    const start = resposta.indexOf('{');
    const end = resposta.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('JSON malformado na resposta da IA');

    const jsonString = resposta.substring(start, end + 1);
    const parsed = JSON.parse(jsonString);
    return parsed?.itens?.[0] || null;

  } catch (err) {
    console.error('❌ Erro ao interpretar resposta da IA:', err.message);
    return { erro: 'Resposta inválida da IA' };
  }
}

module.exports = {
  inferirMarcaViaIA,
  analisarPedidoViaIA
};
