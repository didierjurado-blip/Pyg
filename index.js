const { createApp } = require('./src/http/create-app');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`P&G Control V2 disponible en http://localhost:${PORT}`);
});
