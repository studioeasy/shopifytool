exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    if (!event.body) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No body' }) };

    const { shopifyToken, googleToken, title, bodyHtml, vendor, price, ek, sku, barcode,
            farbe, marke, produkt, filterKategorie, detailsText, groesseText,
            seoTitle, seoMeta, seoTextEn, metaDescEn, groessen } = JSON.parse(event.body);

    const STORE = 'pevzde-fd.myshopify.com';
    const GRAPHQL_URL = 'https://' + STORE + '/admin/api/2026-01/graphql.json';
    const LIEFERUNG_GID = 'gid://shopify/Metaobject/354778480975';
    const gqlHeaders = { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken };

    async function gql(query, variables) {
      const resp = await fetch(GRAPHQL_URL, { method: 'POST', headers: gqlHeaders, body: JSON.stringify({ query, variables }) });
      const data = await resp.json();
      console.log('GQL:', JSON.stringify(data).substring(0, 400));
      return data;
    }

    function mapColor(c) {
      if (!c) return 'BLACK';
      const cl = c.toLowerCase();
      const map = {
        'schwarz': 'BLACK', 'black': 'BLACK', 'weiss': 'WHITE', 'white': 'WHITE',
        'grau': 'GRAY', 'gray': 'GRAY', 'grey': 'GRAY', 'dunkelgrau': 'DARK GRAY',
        'beige': 'BEIGE', 'sand gold': 'DARK KHAKI', 'sand': 'BISQUE',
        'braun': 'BROWN', 'brown': 'BROWN', 'dark brown': 'SADDLE BROWN',
        'cognac': 'SIENNA', 'camel': 'TAN', 'rot': 'RED', 'red': 'RED',
        'pink': 'PINK', 'rosa': 'LIGHT PINK', 'orange': 'ORANGE', 'coral': 'CORAL',
        'gelb': 'YELLOW', 'yellow': 'YELLOW', 'gold': 'GOLD',
        'grün': 'GREEN', 'green': 'GREEN', 'olive': 'OLIVE', 'khaki': 'KHAKI',
        'blau': 'BLUE', 'blue': 'BLUE', 'navy': 'NAVY', 'dunkelblau': 'DARK BLUE',
        'hellblau': 'LIGHT BLUE', 'cobalt': 'ROYAL BLUE',
        'lila': 'PURPLE', 'purple': 'PURPLE', 'violet': 'VIOLET', 'lavender': 'LAVENDER',
        'mint': 'MINT CREAM', 'türkis': 'TURQUOISE', 'teal': 'TEAL',
        'multi': 'MULTICOLOR', 'mehrfarbig': 'MULTICOLOR',
        'natur': 'LINEN', 'natural': 'LINEN', 'ecru': 'IVORY', 'creme': 'IVORY',
        'silber': 'SILVER', 'silver': 'SILVER',
        'faded butter': 'LIGHT YELLOW', 'butter': 'LIGHT YELLOW',
        'stone': 'DARK KHAKI', 'slate': 'SLATE GRAY'
      };
      for (const [key, val] of Object.entries(map)) {
        if (cl.includes(key)) return val;
      }
      return 'BLACK';
    }

    function makeHandle(str) {
      return str.toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    // --- GOOGLE DRIVE: Find photos ---
    async function findPhotos() {
      if (!googleToken) return [];
      try {
        const rootSearch = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name+%3D+'Fotos+Brands'+and+mimeType+%3D+'application%2Fvnd.google-apps.folder'&fields=files(id,name)`,
          { headers: { 'Authorization': 'Bearer ' + googleToken } }
        ).then(r => r.json());
        const rootFolder = rootSearch.files?.[0];
        if (!rootFolder) { console.log('Root folder not found'); return []; }

        const brandSearch = await fetch(
          `https://www.googleapis.com/drive/v3/files?q='${rootFolder.id}'+in+parents+and+name+%3D+'${encodeURIComponent(marke)}'+and+mimeType+%3D+'application%2Fvnd.google-apps.folder'&fields=files(id,name)`,
          { headers: { 'Authorization': 'Bearer ' + googleToken } }
        ).then(r => r.json());
        const brandFolder = brandSearch.files?.[0];
        if (!brandFolder) { console.log('Brand folder not found:', marke); return []; }

        const productSearch = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name+%3D+'${encodeURIComponent(produkt)}'+and+mimeType+%3D+'application%2Fvnd.google-apps.folder'&fields=files(id,name)`,
          { headers: { 'Authorization': 'Bearer ' + googleToken } }
        ).then(r => r.json());
        const productFolders = productSearch.files || [];
        if (productFolders.length === 0) { console.log('No product folder:', produkt); return []; }

        const colorNorm = farbe.toLowerCase().replace(/\s+/g, '-');
        for (const folder of productFolders) {
          const filesSearch = await fetch(
            `https://www.googleapis.com/drive/v3/files?q='${folder.id}'+in+parents+and+mimeType+contains+'image/'&fields=files(id,name,mimeType)&orderBy=name`,
            { headers: { 'Authorization': 'Bearer ' + googleToken } }
          ).then(r => r.json());
          const allFiles = filesSearch.files || [];
          const colorFiles = allFiles.filter(f =>
            f.name.toLowerCase().includes(colorNorm) ||
            f.name.toLowerCase().includes(farbe.toLowerCase())
          );
          if (colorFiles.length > 0) return colorFiles;
          if (productFolders.length === 1 && allFiles.length > 0) return allFiles;
        }
        return [];
      } catch(e) {
        console.log('Drive error:', e.message);
        return [];
      }
    }

    async function downloadAsBase64(fileId) {
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': 'Bearer ' + googleToken } }
      );
      const buffer = await resp.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }

    // --- FIND INTRO BRAND ---
    let introBrandId = null;
    const brandResult = await gql(`query { metaobjects(type: "intro_brand", first: 50) { nodes { id displayName } } }`, {});
    const allBrands = brandResult?.data?.metaobjects?.nodes || [];
    const exactMatch = allBrands.find(b => b.displayName.toLowerCase() === marke.toLowerCase());
    const partialMatch = allBrands.find(b => b.displayName.toLowerCase().includes(marke.toLowerCase()) || marke.toLowerCase().includes(b.displayName.toLowerCase()));
    introBrandId = exactMatch?.id || partialMatch?.id || null;
    console.log('Brand:', exactMatch?.displayName || partialMatch?.displayName || 'none');

    // --- CREATE METAOBJECTS ---
    const detailsResult = await gql(`
      mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) { metaobject { id } userErrors { field message } }
      }`, { metaobject: { type: 'details_pflege', handle: makeHandle(title + '-details'), capabilities: { publishable: { status: 'ACTIVE' } }, fields: [{ key: 'details_pflege', value: detailsText }] } });
    const detailsId = detailsResult?.data?.metaobjectCreate?.metaobject?.id;

    const groesseResult = await gql(`
      mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) { metaobject { id } userErrors { field message } }
      }`, { metaobject: { type: 'grosse_passform', handle: makeHandle(title + '-groesse'), capabilities: { publishable: { status: 'ACTIVE' } }, fields: [{ key: 'grosse_passform', value: groesseText }] } });
    const groesseId = groesseResult?.data?.metaobjectCreate?.metaobject?.id;

    // --- FIND PHOTOS ---
    const photos = await findPhotos();

    // --- BUILD VARIANTS ---
    const finalBarcode = (!barcode || barcode.trim() === '') ? 'kundenspezifisch' : barcode;
    // Clean price - ensure it's a valid decimal string
    const cleanPrice = String(price).replace(/[^\d,\.]/g, '').replace(',', '.');
    const sizeKeys = ['XS','S','M','L','XL','34','36','38','40','42','44','25','26','27','28','29','30','37','39','41','OS'];
    const activeGroessen = groessen ? Object.entries(groessen).filter(([k,v]) => v !== '' && v !== null && v !== undefined && sizeKeys.includes(k)) : [];
    console.log('Price:', cleanPrice, 'Sizes:', activeGroessen.length);

    let variants = [];
    if (activeGroessen.length > 0) {
      variants = activeGroessen.map(([size]) => ({
        option1: size,
        price: cleanPrice,
        taxable: true,
        barcode: finalBarcode,
        weight: 0.5,
        weight_unit: 'kg',
        inventory_management: 'shopify',
        sku: sku ? sku + '-' + size : undefined
      }));
    } else {
      variants = [{ price: cleanPrice, taxable: true, barcode: finalBarcode, weight: 0.5, weight_unit: 'kg', sku: sku || undefined }];
    }

    const metafields = [
      { namespace: 'custom', key: 'color', value: mapColor(farbe), type: 'single_line_text_field' },
      { namespace: 'theme', key: 'cutline', value: marke, type: 'single_line_text_field' }
    ];
    if (filterKategorie) metafields.push({ namespace: 'custom', key: 'filter_kategorie', value: filterKategorie, type: 'single_line_text_field' });

    const productPayload = { title, body_html: bodyHtml, vendor, status: 'draft', published_scope: 'global', variants, metafields };
    if (activeGroessen.length > 0) productPayload.options = [{ name: 'Grösse', values: activeGroessen.map(([k]) => k) }];

    // --- CREATE PRODUCT ---
    const productResp = await fetch('https://' + STORE + '/admin/api/2026-01/products.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
      body: JSON.stringify({ product: productPayload })
    });
    const productData = await productResp.json();
    if (!productData.product?.id) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Product failed', details: productData }) };

    const pid = productData.product.id;
    const productGid = 'gid://shopify/Product/' + pid;

    // --- SET PRICE ON ALL VARIANTS (in case Shopify only set it on first) ---
    for (const variant of productData.product.variants || []) {
      await fetch('https://' + STORE + '/admin/api/2026-01/variants/' + variant.id + '.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
        body: JSON.stringify({ variant: { id: variant.id, price: cleanPrice } })
      });
    }

    // --- LINK METAOBJECTS ---
    const mfInputs = [];
    if (detailsId) mfInputs.push({ namespace: 'custom', key: 'details_pflege', value: detailsId, type: 'metaobject_reference' });
    if (groesseId) mfInputs.push({ namespace: 'custom', key: 'grosse_passform', value: groesseId, type: 'metaobject_reference' });
    if (introBrandId) mfInputs.push({ namespace: 'custom', key: 'intro_brand', value: introBrandId, type: 'metaobject_reference' });
    mfInputs.push({ namespace: 'custom', key: 'lieferung_retoure', value: LIEFERUNG_GID, type: 'metaobject_reference' });
    await gql(`mutation UpdateProduct($input: ProductInput!) { productUpdate(input: $input) { product { id } userErrors { field message } } }`, { input: { id: productGid, metafields: mfInputs } });

    // --- ADD TO COLLECTIONS ---
    const collectionsResult = await gql(`query { collections(first: 100) { nodes { id title } } }`, {});
    const allCollections = collectionsResult?.data?.collections?.nodes || [];
    const targetCollections = allCollections.filter(c =>
      c.title === 'New Arrivals' || c.title.toLowerCase() === marke.toLowerCase()
    );
    for (const collection of targetCollections) {
      await gql(`mutation AddToCollection($id: ID!, $productIds: [ID!]!) { collectionAddProducts(id: $id, productIds: $productIds) { collection { id } userErrors { field message } } }`, { id: collection.id, productIds: [productGid] });
      console.log('Added to collection:', collection.title);
    }

    // --- SALES CHANNELS ---
    const channelsResult = await gql(`query { publications(first: 20) { nodes { id name } } }`, {});
    const channels = channelsResult?.data?.publications?.nodes || [];
    for (const channel of channels) {
      await gql(`mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { publishable { availablePublicationsCount { count } } userErrors { field message } } }`, { id: productGid, input: [{ publicationId: channel.id }] });
    }

    // --- UPLOAD PHOTOS ---
    for (let i = 0; i < photos.length; i++) {
      try {
        const base64 = await downloadAsBase64(photos[i].id);
        const ext = photos[i].name.split('.').pop();
        const newName = makeHandle(marke + '-' + produkt + '-' + farbe) + '-' + (i + 1) + '.' + ext;
        const altText = marke + ' ' + produkt + ' ' + farbe + (i === 0 ? ' – Produktbild' : ' – Detailbild ' + i);
        await fetch('https://' + STORE + '/admin/api/2026-01/products/' + pid + '/images.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
          body: JSON.stringify({ image: { attachment: base64, filename: newName, alt: altText } })
        });
      } catch(e) { console.log('Photo error:', e.message); }
    }

    // --- EK AS COST (first variant only) ---
    if (ek && productData.product.variants?.[0]?.inventory_item_id) {
      await fetch('https://' + STORE + '/admin/api/2026-01/inventory_items/' + productData.product.variants[0].inventory_item_id + '.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
        body: JSON.stringify({ inventory_item: { id: productData.product.variants[0].inventory_item_id, cost: ek } })
      });
    }

    // --- SEO ---
    if (seoTitle || seoMeta) {
      await fetch('https://' + STORE + '/admin/api/2026-01/products/' + pid + '.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
        body: JSON.stringify({ product: { id: pid, metafields_global_title_tag: seoTitle, metafields_global_description_tag: seoMeta } })
      });
    }

    // Small delay to let Shopify index the content
    await new Promise(r => setTimeout(r, 1500));

    // --- ENGLISH TRANSLATIONS via translatableContent ---
    if (seoTextEn || metaDescEn) {
      try {
        const translatableResult = await gql(`
          query GetTranslatable($resourceId: ID!) {
            translatableResource(resourceId: $resourceId) {
              translatableContent {
                key
                value
                digest
                locale
              }
            }
          }`, { resourceId: productGid });

        const content = translatableResult?.data?.translatableResource?.translatableContent || [];
        console.log('Translatable keys:', content.map(c => c.key + ':' + (c.digest ? c.digest.substring(0,8) : 'null')));

        const translations = [];
        if (seoTextEn) {
          const bodyContent = content.find(c => c.key === 'body_html');
          console.log('body_html content:', bodyContent ? 'found, digest: ' + bodyContent.digest?.substring(0,8) : 'NOT FOUND');
          if (bodyContent?.digest) translations.push({ key: 'body_html', value: seoTextEn, locale: 'en', translatableContentDigest: bodyContent.digest });
        }
        if (metaDescEn) {
          const metaContent = content.find(c => c.key === 'meta_description');
          console.log('meta_description content:', metaContent ? 'found, digest: ' + metaContent.digest?.substring(0,8) : 'NOT FOUND');
          if (metaContent?.digest) translations.push({ key: 'meta_description', value: metaDescEn, locale: 'en', translatableContentDigest: metaContent.digest });
        }

        if (translations.length > 0) {
          const transResult = await gql(`
            mutation TranslationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
              translationsRegister(resourceId: $resourceId, translations: $translations) {
                translations { key locale value }
                userErrors { field message }
              }
            }`, { resourceId: productGid, translations });
          console.log('Translation result:', JSON.stringify(transResult?.data?.translationsRegister));
        } else {
          console.log('No valid translations to register');
        }
      } catch(e) {
        console.log('Translation error:', e.message);
      }
    }

    // --- SET INVENTORY FOR SIZE VARIANTS ---
    if (activeGroessen.length > 0) {
      // Get location ID first
      const locationsResp = await fetch('https://' + STORE + '/admin/api/2026-01/locations.json', {
        headers: { 'X-Shopify-Access-Token': shopifyToken }
      });
      const locationsData = await locationsResp.json();
      const locationId = locationsData.locations?.[0]?.id;

      if (locationId) {
        for (let i = 0; i < activeGroessen.length; i++) {
          const [size, qty] = activeGroessen[i];
          const variant = productData.product.variants?.[i];
          if (variant?.inventory_item_id && qty) {
            await fetch('https://' + STORE + '/admin/api/2026-01/inventory_levels/set.json', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
              body: JSON.stringify({ location_id: locationId, inventory_item_id: variant.inventory_item_id, available: parseInt(qty) || 0 })
            });
            console.log('Set inventory for size:', size, qty);
          }
        }
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ product: productData.product, photosUploaded: photos.length }) };
  } catch(e) {
    console.log('Error:', e.message, e.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
