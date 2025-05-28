const axios = require('axios');

async function inferirMarcaViaIA(produto) {
  const prompt = `
Você é um especialista em catálogo de produtos. A partir dos dados JSON de um produto cadastrado na Tiny, identifique e retorne apenas o nome da marca correspondente.

Formato esperado: apenas o nome da marca, sem explicações adicionais.

Produto:
${JSON.stringify(produto, null, 2)}
`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'Você é um especialista em identificação de marcas de produtos.' },
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

    const result = response.data.choices[0].message.content.trim();
    return result;
  } catch (error) {
    console.error('Erro ao consultar IA para marca:', error.response?.data || error.message);
    return null;
  }
}

module.exports = { inferirMarcaViaIA };
