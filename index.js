require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { gerarOrdemCompra } = require('./services/ocGenerator');
const app = express();

let accessToken = null;

// Rota para iniciar o OAuth2
app.get('/auth', (req, res) => {
    const clientId = process.env.CLIENT_ID;
    const redirectUri = process.env.REDIRECT_URI;
    console.log("🔍 /auth route hit");
    console.log("📦 Env vars:", { clientId, redirectUri });

    if (!clientId || !redirectUri) {
        return res
            .status(500)
            .send("❌ Variáveis de ambiente CLIENT_ID ou REDIRECT_URI estão ausentes.");
    }

    const authUrl = \`https://api.tiny.com.br/oauth2/authorize?response_type=code&client_id=\${clientId}&redirect_uri=\${encodeURIComponent(redirectUri)}\`;
    res.redirect(authUrl);
});

// Callback do OAuth2
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    console.log("🔁 Callback recebido com code:", code);

    if (!code) {
        return res.status(400).send("❌ Código de autorização ausente na URL.");
    }

    try {
        const response = await axios.post(
            'https://api.tiny.com.br/oauth2/token',
            null,
            {
                params: {
                    grant_type: 'authorization_code',
                    client_id: process.env.CLIENT_ID,
                    client_secret: process.env.CLIENT_SECRET,
                    code,
                    redirect_uri: process.env.REDIRECT_URI
                }
            }
        );

        accessToken = response.data.access_token;
        console.log("✅ Access token obtido:", accessToken);
        res.send('✅ Token de acesso obtido com sucesso!');
    } catch (error) {
        console.error("❌ Erro ao obter token:", error.response?.data || error.message);
        res.status(500).send('Erro ao obter token de acesso');
    }
});

// Rota para gerar OC mock
app.get('/gerar-oc', (req, res) => {
    console.log("📦 Requisição em /gerar-oc");
    if (!accessToken) {
        return res
            .status(401)
            .send('❌ Token de acesso não disponível. Acesse /auth primeiro.');
    }
    const oc = gerarOrdemCompra();
    oc.token = accessToken;
    res.json(oc);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(\`🚀 Servidor rodando na porta \${PORT}\`);
});