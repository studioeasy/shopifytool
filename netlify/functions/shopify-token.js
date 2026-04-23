exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  const CLIENT_ID = '8685386776dc75b33dcb101af44370d1';
  const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
  const STORE = 'pevzde-fd.myshopify.com';

  if (!CLIENT_SECRET) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SHOPIFY_CLIENT_SECRET not set' }) };
  }

  try {
    const response = await fetch('https://' + STORE + '/admin/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&client_id=' + CLIENT_ID + '&client_secret=' + CLIENT_SECRET
    });
    const data = await response.json();
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
