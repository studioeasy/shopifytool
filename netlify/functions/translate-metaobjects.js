exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    if (!event.body) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No body' }) };
    const { shopifyToken, detailsId, groesseId, detailsText, groesseText, productGid, seoText, seoMeta } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const STORE = 'pevzde-fd.myshopify.com';
    const GRAPHQL_URL = 'https://' + STORE + '/admin/api/2026-01/graphql.json';
    const gqlHeaders = { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken };

    async function gql(query, variables) {
      const resp = await fetch(GRAPHQL_URL, { method: 'POST', headers: gqlHeaders, body: JSON.stringify({ query, variables }) });
      return resp.json();
    }

    async function translateMetaobject(metaobjId, fieldKey, enText) {
      if (!metaobjId || !enText) return;
      await new Promise(r => setTimeout(r, 1000));
      const result = await gql(`
        query GetTranslatable($resourceId: ID!) {
          translatableResource(resourceId: $resourceId) {
            translatableContent { key value digest locale }
          }
        }`, { resourceId: metaobjId });
      const content = result?.data?.translatableResource?.translatableContent || [];
      const fieldContent = content.find(c => c.key === fieldKey);
      console.log('Metaobj', fieldKey, fieldContent ? 'found digest: ' + fieldContent.digest?.substring(0,8) : 'NOT FOUND');
      if (fieldContent?.digest) {
        const transResult = await gql(`
          mutation TranslationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
            translationsRegister(resourceId: $resourceId, translations: $translations) {
              translations { key locale }
              userErrors { field message }
            }
          }`, { resourceId: metaobjId, translations: [{ key: fieldKey, value: enText, locale: 'en', translatableContentDigest: fieldContent.digest }] });
        console.log('Translation errors:', JSON.stringify(transResult?.data?.translationsRegister?.userErrors));
      }
    }

    // Generate EN translations via Claude
    const enPrompt = `Translate these German product texts to English for the online shop Studio Easy. Keep the exact same format and structure. For seo_text_en keep all HTML tags. Return ONLY JSON with four fields: details_en, groesse_en, seo_text_en, meta_description_en.

Details & Pflege (DE):
${detailsText}

Grösse & Passform (DE):
${groesseText}

SEO Text (DE HTML):
${seoText || ''}

Meta Description (DE):
${seoMeta || ''}`;

    const enResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        system: 'Return ONLY valid JSON with fields: details_en, groesse_en, seo_text_en, meta_description_en. No backticks. Keep all HTML tags in seo_text_en.',
        messages: [{ role: 'user', content: enPrompt }]
      })
    });
    const enData = await enResp.json();
    const enRaw = enData.content?.[0]?.text || '{}';
    const enParsed = JSON.parse(enRaw.replace(/```json\n?|```\n?/g, '').trim());
    console.log('EN texts generated');

    if (detailsId && enParsed.details_en) await translateMetaobject(detailsId, 'details_pflege', enParsed.details_en);
    if (groesseId && enParsed.groesse_en) await translateMetaobject(groesseId, 'grosse_passform', enParsed.groesse_en);

    // Translate product SEO text and meta description
    if (productGid && (enParsed.seo_text_en || enParsed.meta_description_en)) {
      try {
        await new Promise(r => setTimeout(r, 1000));
        const translatableResult = await gql(`
          query GetTranslatable($resourceId: ID!) {
            translatableResource(resourceId: $resourceId) {
              translatableContent { key value digest locale }
            }
          }`, { resourceId: productGid });
        const content = translatableResult?.data?.translatableResource?.translatableContent || [];
        const translations = [];
        if (enParsed.seo_text_en) {
          const bodyContent = content.find(c => c.key === 'body_html');
          if (bodyContent?.digest) translations.push({ key: 'body_html', value: enParsed.seo_text_en, locale: 'en', translatableContentDigest: bodyContent.digest });
        }
        if (enParsed.meta_description_en) {
          const metaContent = content.find(c => c.key === 'meta_description');
          if (metaContent?.digest) translations.push({ key: 'meta_description', value: enParsed.meta_description_en, locale: 'en', translatableContentDigest: metaContent.digest });
        }
        if (translations.length > 0) {
          await gql(`
            mutation TranslationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
              translationsRegister(resourceId: $resourceId, translations: $translations) {
                translations { key locale }
                userErrors { field message }
              }
            }`, { resourceId: productGid, translations });
          console.log('Product SEO translated');
        }
      } catch(e) {
        console.log('Product SEO translation error:', e.message);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch(e) {
    console.log('Error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
