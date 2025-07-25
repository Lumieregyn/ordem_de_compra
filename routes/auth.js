const express = require('express');
const router = express.Router();
const axios = require('axios');
const { salvarToken } = require('../services/tokenService');

router.get('/auth', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CLIENT_ID,
    redirect_uri: process.env.REDIRECT_URI,
    scope: 'openid',
  });

  res.redirect(`https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth?${params}`);
});

router.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Código ausente');

  try {
    const response = await axios.post(
      'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        validateStatus: () => true,
      }
    );

    const tokenData = response.data;
    if (!tokenData?.access_token) {
      console.error('❌ Erro no token:', tokenData);
      return res.status(500).send('Token não retornado pela API');
    }

    await salvarToken(tokenData);
    res.send('✅ Token salvo com sucesso no Redis.');

  } catch (err) {
    console.error('❌ Erro no callback:', err.message);
    res.status(500).send('Erro ao salvar token');
  }
});

module.exports = router;
