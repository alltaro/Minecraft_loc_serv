const crypto = require('crypto');

// Générer une clé secrète de 256 bits
const secretKey = crypto.randomBytes(64).toString('hex');

console.log('Clé secrète générée :', secretKey);