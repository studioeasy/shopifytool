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
- Das einzige Zeichen das ersetzt werden muss: ss statt ß (also Strasse, weiss, Groesse, muss)
- Alle anderen Umlaute bleiben EXAKT so: ä bleibt ä, ö bleibt ö, ü bleibt ü, Ä Ö Ü ebenfalls
- NIEMALS ae, oe, ue schreiben – das ist FALSCH!
- Verwende KEINE Anführungszeichen innerhalb der Textwerte!
- Ton: Klar, modern, direkt. Du-Ansprache. Kurze, präzise Sätze.

Produkt: ${produkt} von ${marke}
Farbe: ${farbe || 'nicht angegeben'}
Beschreibung (englisch): ${beschreibung || 'nicht angegeben'}

BEISPIELE fuer Details & Pflege:

Beispiel 1 (Tasche):
Die Raffia Bucket Bag von Zulu & Zephyr – eine handgeflochtene Tasche, die mit einer weichen, zugleich strukturierten Silhouette und einem breiten, festen Trageriemen fuer komfortables Tragen ueberzeugt. Grosszuegig bemessen bietet sie ausreichend Platz fuer alle Essentials.
Details:
- Weiches, dicht geflochtenes Material
- Innentasche mit cremefarbenem Logo-Patch
Pflegehinweis:
- Mit einem feuchten Tuch reinigen
- Flach im Schatten trocknen

Beispiel 2 (Badeanzug):
Der Novantatre Badeanzug von Lido steht fuer klare Linien und funktionale Eleganz. Breite, elastische Traeger sorgen fuer sicheren Halt.
Details:
- Mittlere Bedeckung (Medium Coverage)
- Material: Nachhaltiges Lycra mit matter Oberflaeche
- Hergestellt in Italien
Pflegehinweis:
- Maschinenwaesche im Schonwaschgang bei max. 30°C
- Flach an der Luft trocknen

BEISPIEL fuer SEO-Text:

<h1>[Marke] [Produktname] [Farbe] – [praegnantes Haupt-Keyword]</h1>
<h2>[Produktname] [Farbe] – [keyword-reicher Untertitel mit Produkttyp und Material]</h2>
<p>[Erster Absatz: 3-4 Saetze. Produktname + Marke + Farbe + was es ist + Besonderheit. Longtail-Keywords natuerlich eingebaut.]</p>
<p>[Zweiter Absatz: 3-4 Saetze. Material/Herstellung + Nachhaltigkeitsaspekte + Styling-Situation. Markenname nochmal erwaehnen.]</p>
<h2>Details</h2>
<ul><li>Marke: [Marke]</li><li>Modell: [Produktname]</li><li>Farbe: [Farbe]</li><li>[Material]</li><li>[Besonderheit]</li></ul>
<h2>Grösse & Passform</h2>
<ul><li>[Masse oder Fit-Infos]</li></ul>
<h2>Material & Qualitaet</h2>
<ul><li>[Material]</li><li>[Nachhaltigkeit]</li></ul>
<h2>Styling & Anlaesse</h2>
<p>[2-3 Saetze natuerlicher Text mit Outfit-Kombis und Anlaessen. KEINE Keyword-Liste!]</p>

SEO-REGELN:
- H1 IMMER: Marke + Produktname + Farbe + Keyword
- Markenname min. 3x im Text
- Min. 300 Woerter gesamt
- SEO-Titel: MAXIMAL 70 Zeichen (zaehle genau!)
- Meta-Description: MAXIMAL 155 Zeichen (zaehle genau!)

Filterkategorien:
Kleidung: Bottoms, Knitwear, Tops, Dresses, Outerwear, Sets, Swimwear
Schuhe: Sandalen, Ballerinas, Slip-Ins, Sneaker, Stiefel
Accessoires: Hair Clips, Schmuck, Sonnenbrillen, Taschen, Accessoires, Bags, Caps, Gürtel, Halstücher, Schals
Lifestyle: Bücher, Gutschein, Home Goods, Kaffee, Kerzen, Spiele, Schreibwaren, Feuerzeuge

Erstelle alle 6 Texte. Antworte NUR mit JSON:`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: 'Du antwortest AUSSCHLIESSLICH mit validem JSON. Kein Text davor oder danach, keine Backticks. Nur reines JSON-Objekt mit diesen 6 Feldern: details_pflege, groesse_passform, seo_text, seo_title, meta_description, filter_kategorie. KRITISCH: seo_title MAXIMAL 70 Zeichen, meta_description MAXIMAL 155 Zeichen.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const responseText = await response.text();
    if (!response.ok) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Anthropic: ' + responseText }) };

    const data = JSON.parse(responseText);
    let rawText = data.content?.[0]?.text || '';
    console.log('Raw response:', rawText.substring(0, 300));

    rawText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed = null;

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch(e1) {
      console.log('Direct parse failed:', e1.message);
      try {
        let fixed = rawText.match(/\{[\s\S]*\}/)?.[0] || rawText;
        fixed = fixed.replace(/:\s*"([\s\S]*?)(?=",\s*"|\s*"\s*\})/g, (match, val) => {
          const escaped = val.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/(?<!\\)"/g, '\\"');
          return match.replace(val, escaped);
        });
        parsed = JSON.parse(fixed);
      } catch(e2) {
        console.log('Fixed parse also failed:', e2.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'JSON parse failed: ' + e2.message }) };
      }
    }

    if (!parsed) return { statusCode: 500, headers, body: JSON.stringify({ error: 'No parsed result' }) };

    // Hard enforce character limits
    if (parsed.seo_title) {
      // Remove | Studio Easy if Claude added it, we'll add it ourselves
      parsed.seo_title = parsed.seo_title.replace(/\s*\|\s*Studio Easy\s*$/i, '').trim();
      // Add | Studio Easy and truncate to 70 chars
      const withSuffix = parsed.seo_title + ' | Studio Easy';
      if (withSuffix.length <= 70) {
        parsed.seo_title = withSuffix;
      } else {
        // Truncate title to fit
        const maxTitleLength = 70 - ' | Studio Easy'.length;
        parsed.seo_title = parsed.seo_title.substring(0, maxTitleLength).trim() + ' | Studio Easy';
      }
    }
    if (parsed.meta_description && parsed.meta_description.length > 155) {
      parsed.meta_description = parsed.meta_description.substring(0, 152) + '...';
    }

    data.content[0].text = JSON.stringify(parsed);
    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch(e) {
    console.log('Error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
