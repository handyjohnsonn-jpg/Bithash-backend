const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');
const endpoint = "app.post('/api/convert', protect, async (req, res) => {";

if (!source.includes(endpoint)) {
  const marker = '// CONVERT ENDPOINT - Execute crypto conversion using Map balances';
  const markerPos = source.indexOf(marker);
  const tryPos = markerPos >= 0 ? source.indexOf('  try {', markerPos) : -1;
  if (tryPos < 0) throw new Error('Conversion endpoint marker/try block not found.');
  source = source.slice(0, tryPos) + endpoint + '\n' + source.slice(tryPos);
}

const sensitiveRoutePattern = /(['"])\/api\/loans\/repay\1,\s*\n\s*(['"])\/api\/convert\2/;
source = source.replace(sensitiveRoutePattern, "$1/api/loans/repay$1");

fs.writeFileSync(serverPath, source, 'utf8');
