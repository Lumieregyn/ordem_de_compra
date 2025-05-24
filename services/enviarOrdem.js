const axios = require('axios');
const { gerarOrdemCompra } = require('./ocGenerator');
const qs = require('qs'); // Certifique-se que está no package.json

let accessToken = '';

function setAccessToken(token) {
  accessToken = token;
}

async function enviarOrdemCompra(req, res) {
  if (!accessToken) {
    return res.status(401).send('No access token. Call /auth first.');
  }

  const xmlData = gerarOrdemCompra();

  try {
    const response = await axios.post(
      'https://api.tiny.com.br/api2/pedido.compra.incluir.php',
      qs.stringify({
        token: accessToken,
        xml: xmlData,
        formato: 'json'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    console.log('✅ Resposta da Tiny:', response.data);

    if (response.data.retorno && response.data.retorno.status === 'OK') {
      res.send('✅ Ordem de compra enviada com sucesso!');
    } else {
      res.status(400).send('❌ Erro na resposta da Tiny: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    console.error('❌ Erro detalhado ao enviar ordem de compra:', error.response?.data || error.message);
    res.status(500).send('Erro ao enviar ordem de compra.');
  }
}

module.exports = { enviarOrdemCompra, setAccessToken };
