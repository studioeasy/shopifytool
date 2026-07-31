exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    if (!event.body) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No body' }) };
    const { marke, produkt, farbe, beschreibung } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key missing' }) };

    const prompt = `SEO-Text für Studio Easy (studioeasy.de) für: ${produkt} von ${marke}, Farbe: ${farbe || '-'}
Beschreibung: ${beschreibung || '-'}

Regeln: ß→ss, Umlaute ä/ö/ü behalten, keine Anführungszeichen in Textwerten.

HTML-Struktur (MIN 350 Wörter):
<h1>${marke} ${produkt} ${farbe} – [Keyword]</h1>
<h2>${produkt} ${farbe} – [keyword-reicher Untertitel]</h2>
<p>[4-5 Sätze: Marke + Produkt + Farbe + Besonderheit]</p>
<p>[4-5 Sätze: Material + Verarbeitung + Styling, Marke nochmal]</p>
<h2>Details</h2>
<ul><li>Marke: ${marke}</li><li>Modell: ${produkt}</li><li>Farbe: ${farbe}</li><li>[min. 5 weitere Details]</li></ul>
<h2>Grösse & Passform</h2>
<ul><li>[min. 3 Punkte]</li></ul>
<h2>Material & Qualität</h2>
<ul><li>[min. 3 Punkte]</li></ul>
<h2>Styling & Anlässe</h2>
<p>[3-4 Sätze Fliesstext, keine Liste]</p>

JSON mit 1 Feld: seo_text`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2500,
        system: 'Antworte NUR mit validem JSON ohne Backticks. 1 Feld: seo_text (HTML). Umlaute ä ö ü IMMER behalten!',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const responseText = await response.text();
    if (!response.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Anthropic: ' + responseText }) };

    const data = JSON.parse(responseText);
    let rawText = data.content?.[0]?.text || '';
    rawText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed = null;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Parse failed: ' + e.message }) };
    }

    if (!parsed?.seo_text) return { statusCode: 500, headers, body: JSON.stringify({ error: 'No seo_text' }) };

    data.content[0].text = JSON.stringify(parsed);
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch(e) {
    console.log('Error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
