const express = require('express');
const fs = require('fs');
const https = require('https');
const path = require('path');

const CERT = process.env.CERT || 'cert.crt';
const KEY = process.env.KEY || 'key.key';
const PORT = parseInt(process.env.PORT || '8080');

const options = {
  key: fs.readFileSync(path.join(__dirname, `../${KEY}`)),
  cert: fs.readFileSync(path.join(__dirname, `../${CERT}`))
};

const app = express();
const webAppPath = path.join(__dirname, '../build');
app.use('/', express.static(webAppPath));

app.get('/signin', (request, response) => {
  response.redirect(`https://localhost:${PORT}/?state=signinFailed`);
});

const server = https.createServer(options, app);
server.listen(PORT, () => {
  console.log(`Listening to port: ${PORT}...`);
});
