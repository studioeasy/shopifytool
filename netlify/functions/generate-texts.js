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

    const prompt = `Du bist SEO-Texter fuer den deutschen Online-Shop Studio Easy (studioeasy.de). Kuratierte Mode, Accessoires und Lifestyle-Produkte.

ZEICHENREGELN:
- Ersetze ß durch ss (Strasse, weiss, Groesse)
- Umlaute ä, ö, ü BLEIBEN als ä, ö, ü - NIEMALS ae, oe, ue schreiben!
- Keine Anführungszeichen innerhalb der Textwerte!
- Ton: Klar, modern, direkt. Du-Ansprache.

Produkt: ${produkt} von ${marke}
Farbe: ${farbe || 'nicht angegeben'}
Beschreibung (englisch): ${beschreibung || 'nicht angegeben'}

BEISPIELE fuer Details und Pflege:

Beispiel 1:
Die Raffia Bucket Bag von Zulu und Zephyr - eine handgeflochtene Tasche mit breitem Trageriemen. Grosszügig bemessen für alle Essentials.
Details:
- 100 % natürliches Raffia, handgeflochten
- Innentasche mit Logo-Patch
Pflegehinweis:
- Mit feuchtem Tuch reinigen
- Flach trocknen

Beispiel 2:
Der Novantatre Badeanzug von Lido steht für klare Linien und funktionale Eleganz.
Details:
- Mittlere Bedeckung (Medium Coverage)
- Nachhaltiges Lycra, matte Oberfläche
- Hergestellt in Italien
Pflegehinweis:
- Schonwaschgang bei max. 30 Grad
- Flach trocknen

SEO-REGELN:
- H1: Marke + Produktname + Farbe + Keyword
- H2: keyword-reich
- 2 Fliesstext-Absätze, min. 300 Wörter
- Markenname min. 3x erwähnen
- Styling als natürlicher Text, keine Keyword-Liste
- Details beginnt mit: Marke: [Marke]
- seo_title: MAXIMAL 56 Zeichen
- meta_description: MAXIMAL 155 Zeichen

Filterkategorien:
Kleidung: Bottoms, Knitwear, Tops, Dresses, Outerwear, Sets, Swimwear
Schuhe: Sandalen, Ballerinas, Slip-Ins, Sneaker, Stiefel
Accessoires: Hair Clips, Schmuck, Sonnenbrillen, Taschen, Accessoires, Bags, Caps, Gürtel, Halstücher, Schals
Lifestyle: Bücher, Gutschein, Home Goods, Kaffee, Kerzen, Spiele, Schreibwaren, Feuerzeuge

Erstelle 8 Texte (DE + EN). Antworte NUR mit JSON.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: 'Du antwortest AUSSCHLIESSLICH mit validem JSON ohne Backticks. JSON mit 8 Feldern: details_pflege, groesse_passform, seo_text, seo_title, meta_description, filter_kategorie, seo_text_en, meta_description_en. KRITISCH: seo_title max 56 Zeichen, meta_description max 155 Zeichen. Umlaute ä ö ü IMMER behalten!',
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

    // Add | Studio Easy to title
    if (parsed.seo_title) {
      parsed.seo_title = parsed.seo_title.replace(/\s*\|\s*Studio Easy\s*$/i, '').trim();
      const withSuffix = parsed.seo_title + ' | Studio Easy';
      parsed.seo_title = withSuffix.length <= 70 ? withSuffix : parsed.seo_title.substring(0, 56).trim() + ' | Studio Easy';
    }

    if (parsed.meta_description?.length > 155) parsed.meta_description = parsed.meta_description.substring(0, 152) + '...';
    if (parsed.meta_description_en?.length > 155) parsed.meta_description_en = parsed.meta_description_en.substring(0, 152) + '...';

    data.content[0].text = JSON.stringify(parsed);
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch(e) {
    console.log('Error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
