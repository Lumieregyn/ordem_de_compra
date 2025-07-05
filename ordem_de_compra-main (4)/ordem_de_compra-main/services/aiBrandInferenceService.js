const axios = require('axios');

async function inferirMarcaViaIA(produto) {
  const prompt = `
  Este é um produto cadastrado no Tiny ERP.
  Seu objetivo é identificar a marca mais provável com base no JSON fornecido.

  Retorne apenas o nome da marca em texto puro.

  Produto:
  ${JSON.stringify(produto, null, 2)}
  `;

  try {
    const resposta = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'Você é um assistente que analisa produtos e identifica a marca.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const texto = resposta.data.choices[0].message.content;
    return texto.trim();
  } catch (err) {
    console.error('❌ Erro na inferência de marca via IA:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { inferirMarcaViaIA };
