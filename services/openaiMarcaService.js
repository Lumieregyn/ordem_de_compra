const axios = require('axios');

async function inferirMarcaViaIA(produto) {
  const prompt = `
Você é um sistema especialista em catálogo de produtos. Receberá abaixo um objeto JSON com todos os dados de um produto cadastrado na Tiny.

Sua única tarefa é retornar o nome da marca do produto com base nas informações do JSON. O nome da marca está geralmente no campo "marca.nome", mas também pode aparecer na descrição, categoria ou variações.

Retorne **apenas o nome da marca**, sem explicações, prefixos ou aspas.

JSON do Produto:
${JSON.stringify(produto, null, 2)}
`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'Você é um especialista em identificação de marcas de produtos baseado em JSONs da Tiny.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let result = response.data.choices[0].message.content.trim();

    // Normaliza a resposta (remove aspas extras e prefixos comuns)
    result = result.replace(/^["']|["']$/g, '').replace(/marca[:\s]*/i, '').trim();

    return result || null;
  } catch (error) {
    console.error('❌ Erro ao consultar IA para marca:', error.response?.data || error.message);
    return null;
  }
}

module.exports = { inferirMarcaViaIA };
