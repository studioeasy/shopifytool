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

    const prompt = `SEO-Texter für Studio Easy (studioeasy.de). Kuratierte Mode, Accessoires, Lifestyle.

Regeln: ß→ss, Umlaute ä/ö/ü behalten, keine Anführungszeichen in Textwerten.
Ton: Klar, modern, Du-Ansprache.
WICHTIG für details_pflege: Variiere den Einstiegssatz – wechsle zwischen verschiedenen Perspektiven und Formulierungen. Nie zweimal denselben Anfang.

Produkt: ${produkt} von ${marke}, Farbe: ${farbe || '-'}
Beschreibung: ${beschreibung || '-'}

FELDER:
1. details_pflege: Plaintext. 2-3 Einleitungssätze + Details: (Stichpunkte) + Pflegehinweis: (Stichpunkte)
2. groesse_passform: Plaintext. Kurz, Masse/Fit-Empfehlung.
3. seo_title: MAX 56 Zeichen
4. meta_description: MAX 155 Zeichen
5. filter_kategorie: Bottoms/Knitwear/Tops/Dresses/Outerwear/Sets/Swimwear/Sandalen/Ballerinas/Slip-Ins/Sneaker/Stiefel/Hair Clips/Schmuck/Sonnenbrillen/Taschen/Bags/Caps/Gürtel/Halstücher/Schals/Bücher/Home Goods/Kerzen/Schreibwaren/Accessoires

JSON mit 5 Feldern, keine anderen Felder.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: 'Antworte NUR mit validem JSON ohne Backticks. 5 Felder: details_pflege, groesse_passform, seo_title (max 56 Zeichen!), meta_description (max 155 Zeichen!), filter_kategorie. Umlaute ä ö ü IMMER behalten!',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const responseText = await response.text();
    if (!response.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Anthropic: ' + responseText }) };

    const data = JSON.parse(responseText);
    let rawText = data.content?.[0]?.text || '';
    console.log('Raw:', rawText.substring(0, 200));
    rawText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed = null;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch(e1) {
      try {
        let fixed = rawText.match(/\{[\s\S]*\}/)?.[0] || rawText;
        fixed = fixed.replace(/:\s*"([\s\S]*?)(?=",\s*"|\s*"\s*\})/g, (match, val) => {
          const escaped = val.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/(?<!\\)"/g, '\\"');
          return match.replace(val, escaped);
        });
        parsed = JSON.parse(fixed);
      } catch(e2) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'JSON parse failed: ' + e2.message }) };
      }
    }

    if (!parsed) return { statusCode: 500, headers, body: JSON.stringify({ error: 'No result' }) };

    if (parsed.seo_title) {
      parsed.seo_title = parsed.seo_title.replace(/\s*\|\s*Studio Easy\s*$/i, '').trim();
      const withSuffix = parsed.seo_title + ' | Studio Easy';
      parsed.seo_title = withSuffix.length <= 70 ? withSuffix : parsed.seo_title.substring(0, 56).trim() + ' | Studio Easy';
    }
    if (parsed.meta_description?.length > 155) parsed.meta_description = parsed.meta_description.substring(0, 152) + '...';

    // seo_text als Platzhalter – wird separat via generate-seo-text generiert
    parsed.seo_text = '';

    data.content[0].text = JSON.stringify(parsed);
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch(e) {
    console.log('Error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
