const { monitorarPedidos } = require('./jobs/agendadorPedidos');

monitorarPedidos().then(() => {
  console.log('✅ Rastreamento concluído.');
}).catch(err => {
  console.error('❌ Erro no rastreamento:', err);
});
