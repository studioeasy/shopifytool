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

=== FELD 1: details_pflege (PLAINTEXT, KEIN HTML) ===
Format wie dieses Beispiel:
Die Raffia Bucket Bag von Zulu und Zephyr - eine handgeflochtene Tasche mit breitem Trageriemen. Grosszügig bemessen für alle Essentials.
Details:
- 100 % natürliches Raffia, handgeflochten
- Innentasche mit Logo-Patch
Pflegehinweis:
- Mit feuchtem Tuch reinigen
- Flach trocknen

=== FELD 2: groesse_passform (PLAINTEXT, KEIN HTML) ===
Kurz und präzise. Masse falls bekannt. Fit-Empfehlung.

=== FELD 3: seo_text (NUR HTML, MIN. 350 WÖRTER) ===
Exakte Struktur:
<h1>[Marke] [Produkt] [Farbe] – [Keyword]</h1>
<h2>[Produkt] [Farbe] – [keyword-reicher Untertitel]</h2>
<p>[Absatz 1: 4-5 Sätze, Marke + Produkt + Farbe + Besonderheit + warum es toll ist]</p>
<p>[Absatz 2: 4-5 Sätze, Material + Verarbeitung + Nachhaltigkeit + Styling-Kontext, Marke nochmal erwähnen]</p>
<h2>Details</h2>
<ul><li>Marke: ${marke}</li><li>Modell: ${produkt}</li><li>Farbe: ${farbe}</li><li>[weitere Details, min. 5 Punkte]</li></ul>
<h2>Grösse & Passform</h2>
<ul><li>[min. 3 Passform-Infos]</li></ul>
<h2>Material & Qualität</h2>
<ul><li>[min. 3 Punkte: Material, Verarbeitung, Nachhaltigkeit]</li></ul>
<h2>Styling & Anlässe</h2>
<p>[3-4 Sätze natürlicher Text mit konkreten Outfit-Kombis und Anlässen. KEINE Liste!]</p>

=== FELDER 4-8 ===
- seo_title: MAXIMAL 56 Zeichen (ohne | Studio Easy)
- meta_description: MAXIMAL 155 Zeichen
- filter_kategorie: aus Liste unten
- seo_text_en: Englische Version von seo_text (gleiche HTML-Struktur)
- meta_description_en: MAXIMAL 155 Zeichen

Filterkategorien:
Kleidung: Bottoms, Knitwear, Tops, Dresses, Outerwear, Sets, Swimwear
Schuhe: Sandalen, Ballerinas, Slip-Ins, Sneaker, Stiefel
Accessoires: Hair Clips, Schmuck, Sonnenbrillen, Taschen, Accessoires, Bags, Caps, Gürtel, Halstücher, Schals
Lifestyle: Bücher, Gutschein, Home Goods, Kaffee, Kerzen, Spiele, Schreibwaren, Feuerzeuge

Erstelle alle 8 Texte. Antworte NUR mit JSON.`;

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
