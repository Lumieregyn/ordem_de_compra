require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const app = express();

let accessToken = null;

app.get('/auth', (req, res) => {
    const authUrl = `https://api.tiny.com.br/oauth2/authorize?response_type=code&client_id=${process.env.CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}`;
    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    try {
        const response = await axios.post('https://api.tiny.com.br/oauth2/token', null, {
            params: {
                grant_type: 'authorization_code',
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                code,
                redirect_uri: process.env.REDIRECT_URI
            }
        });
        accessToken = response.data.access_token;
        res.send('✅ Token de acesso obtido com sucesso!');
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).send('Erro ao obter token de acesso');
    }
});

app.get('/gerar-oc', (req, res) => {
    if (!accessToken) {
        return res.status(401).send('Token de acesso não disponível. Acesse /auth primeiro.');
    }
    const oc = gerarOrdemCompra();
    oc.token = accessToken; // para futura integração real
    res.json(oc);
});

app.listen(3000, () => {
    console.log('Servidor rodando na porta 3000');
});
