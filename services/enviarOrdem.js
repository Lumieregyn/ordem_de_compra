const axios = require('axios');
const { gerarOrdemCompra } = require('./ocGenerator');

async function enviarOrdemCompra(token) {
  const xml = gerarOrdemCompra();

  try {
    const response = await axios.post(
      'https://api.tiny.com.br/api2/pedido.incluir.php',
      {
        xml: xml,
        token: token,
        formato: 'json',
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    console.log('✅ Ordem de compra enviada com sucesso!');
    console.log(response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('❌ Erro ao enviar OC:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { enviarOrdemCompra };
