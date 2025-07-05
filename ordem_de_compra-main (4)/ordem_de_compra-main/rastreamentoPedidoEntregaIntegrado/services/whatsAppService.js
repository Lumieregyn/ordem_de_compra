const axios = require('axios');

const WHATSAPP_URL = process.env.WHATSAPP_URL;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

async function enviarMensagem(numero, mensagem) {
  return axios.post(`${WHATSAPP_URL}/enviar`, {
    numero,
    mensagem
  }, {
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`
    }
  });
}

module.exports = { enviarMensagem };
