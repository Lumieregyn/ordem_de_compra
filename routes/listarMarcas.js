app.get('/listar-marcas', async (req, res) => {
  const apiToken = process.env.TINY_API_TOKEN;
  const marcasUnicas = new Set();
  let pagina = 1;
  let continuar = true;
  const LIMITE_PAGINAS = 100; // você pode aumentar se quiser

  try {
    while (continuar) {
      const response = await axios.post(
        'https://api.tiny.com.br/api2/produtos.pesquisa.php',
        null,
        {
          params: {
            token: apiToken,
            formato: 'json',
            pagina,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const produtos = response.data?.retorno?.produtos || [];
      console.log(`🔁 Página ${pagina} com ${produtos.length} produtos.`);

      produtos.forEach(p => {
        const marca = p.produto?.marca?.trim();
        const nome = p.produto?.nome?.trim();

        if (marca) {
          marcasUnicas.add(marca);
        } else if (nome) {
          const match = nome.match(/^([^-–]+)/); // extrai antes do hífen
          if (match && match[1]) {
            marcasUnicas.add(match[1].trim());
          }
        }
      });

      const ultimaPagina = parseInt(response.data?.retorno?.numero_paginas || '1');
      continuar = pagina < ultimaPagina && pagina < LIMITE_PAGINAS;
      pagina++;
    }

    res.json({
      marcas: Array.from(marcasUnicas).sort(),
      total: marcasUnicas.size
    });

  } catch (error) {
    console.error('❌ Erro ao buscar marcas:', error.response?.data || error.message);
    res.status(500).send('Erro ao consultar marcas na API da Tiny.');
  }
});
