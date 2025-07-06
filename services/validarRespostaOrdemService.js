const { enviarWhatsappErro } = require('./whatsAppService');
const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

async function validarRespostaOrdem(data, numeroPedido, marca, fornecedor) {
  const detalhesRaw = data?.retorno?.erros || data?.retorno?.detalhes;
  let detalhes = [];

  if (Array.isArray(detalhesRaw)) {
    detalhes = detalhesRaw;
  } else if (typeof detalhesRaw === 'object' && detalhesRaw !== null) {
    detalhes = [detalhesRaw];
  }

  const idOrdem = data?.retorno?.ordem_compra?.id;
  const status = data?.retorno?.status;
  const mensagem = data?.retorno?.mensagem;

  // IA decide se deve considerar sucesso
  const prompt = `Análise da resposta da API Tiny:
Pedido: ${numeroPedido}
Marca: ${marca}
ID OC: ${idOrdem || 'N/A'}
Status: ${status}
Mensagem: ${mensagem || 'Nenhuma'}
Detalhes: ${JSON.stringify(detalhes)}

Se a Ordem de Compra foi de fato criada com sucesso (mesmo que contenha erros de validação como conta contábil ausente), responda apenas "SIM". Caso contrário, responda "NAO".`;

  let decisaoIA = 'NAO';
  try {
    const completion = await openai.createCompletion({
      model: 'gpt-3.5-turbo-instruct',
      prompt,
      max_tokens: 5,
      temperature: 0
    });

    decisaoIA = completion.data.choices[0].text.trim().toUpperCase();
  } catch (e) {
    console.warn('⚠️ Falha ao consultar IA para decidir status da OC:', e.message);
  }

  const sucesso = idOrdem || decisaoIA === 'SIM';

  if (sucesso) {
    console.log(`✅ OC considerada criada com sucesso (ID: ${idOrdem || 'N/A'}, status: '${status}')`);
    const texto = `✅ Ordem de Compra criada com sucesso
Pedido: ${numeroPedido || '[indefinido]'}
Marca: ${marca || '[indefinida]'}
Fornecedor: ${fornecedor?.nome || '[desconhecido]'}`;

    try {
      await enviarWhatsappErro(texto);
    } catch (e) {
      console.warn('⚠️ Falha ao enviar alerta de sucesso (ignorado):', e.message);
    }

    return true;
  }

  console.error('❌ Falha na criação da OC via API Tiny:', {
    status,
    erros: detalhes.length > 0 ? detalhes : 'Sem detalhes de erro',
    ordem_compra: data?.retorno?.ordem_compra,
  });

  const erroTexto = `🚨 Falha ao criar Ordem de Compra
Pedido: ${numeroPedido || '[indefinido]'}
Marca: ${marca || '[indefinida]'}
Motivo: ${mensagem || 'Sem mensagem'}
Detalhes: ${JSON.stringify(detalhes)}`;

  await enviarWhatsappErro(erroTexto);
  return false;
}

module.exports = { validarRespostaOrdem };
