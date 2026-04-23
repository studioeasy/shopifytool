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
            farbe, marke, produkt, filterKategorie, detailsText, groesseText, seoTitle, seoMeta } = JSON.parse(event.body);

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
        'schwarz': 'BLACK', 'black': 'BLACK',
        'weiss': 'WHITE', 'white': 'WHITE',
        'grau': 'GRAY', 'gray': 'GRAY', 'grey': 'GRAY', 'dunkelgrau': 'DARK GRAY', 'hellgrau': 'LIGHT GRAY',
        'beige': 'BEIGE', 'sand gold': 'DARK KHAKI', 'sand': 'BISQUE',
        'braun': 'BROWN', 'brown': 'BROWN', 'dark brown': 'SADDLE BROWN', 'walnut': 'SADDLE BROWN',
        'cognac': 'SIENNA', 'camel': 'TAN', 'nougat': 'BURLY WOOD',
        'rot': 'RED', 'red': 'RED', 'dunkelrot': 'DARK RED',
        'pink': 'PINK', 'rosa': 'LIGHT PINK', 'altrosa': 'PALE VIOLET RED',
        'orange': 'ORANGE', 'coral': 'CORAL',
        'gelb': 'YELLOW', 'yellow': 'YELLOW', 'gold': 'GOLD',
        'grün': 'GREEN', 'green': 'GREEN', 'olive': 'OLIVE', 'khaki': 'KHAKI',
        'blau': 'BLUE', 'blue': 'BLUE', 'navy': 'NAVY', 'dunkelblau': 'DARK BLUE',
        'hellblau': 'LIGHT BLUE', 'cobalt': 'ROYAL BLUE',
        'lila': 'PURPLE', 'purple': 'PURPLE', 'violet': 'VIOLET', 'lavender': 'LAVENDER',
        'mint': 'MINT CREAM', 'türkis': 'TURQUOISE', 'teal': 'TEAL',
        'multi': 'MULTICOLOR', 'mehrfarbig': 'MULTICOLOR',
        'natur': 'LINEN', 'natural': 'LINEN', 'ecru': 'IVORY', 'creme': 'IVORY', 'cream': 'IVORY',
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
        // Find root folder "Fotos Brands"
        const rootSearch = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name+%3D+'Fotos+Brands'+and+mimeType+%3D+'application%2Fvnd.google-apps.folder'&fields=files(id,name)`,
          { headers: { 'Authorization': 'Bearer ' + googleToken } }
        ).then(r => r.json());
        const rootFolder = rootSearch.files?.[0];
        if (!rootFolder) { console.log('Root folder not found'); return []; }

        // Find brand folder inside root
        const brandSearch = await fetch(
          `https://www.googleapis.com/drive/v3/files?q='${rootFolder.id}'+in+parents+and+name+%3D+'${encodeURIComponent(marke)}'+and+mimeType+%3D+'application%2Fvnd.google-apps.folder'&fields=files(id,name)`,
          { headers: { 'Authorization': 'Bearer ' + googleToken } }
        ).then(r => r.json());
        const brandFolder = brandSearch.files?.[0];
        if (!brandFolder) { console.log('Brand folder not found:', marke); return []; }

        // Find ALL folders with product name anywhere under brand folder
        const productSearch = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name+%3D+'${encodeURIComponent(produkt)}'+and+mimeType+%3D+'application%2Fvnd.google-apps.folder'&fields=files(id,name)`,
          { headers: { 'Authorization': 'Bearer ' + googleToken } }
        ).then(r => r.json());
        const productFolders = productSearch.files || [];
        console.log('Product folders found:', productFolders.length);

        if (productFolders.length === 0) { console.log('No product folder found:', produkt); return []; }

        // Normalize color for matching (lowercase, spaces to hyphens)
        const colorNorm = farbe.toLowerCase().replace(/\s+/g, '-');

        // For each folder, check if it contains photos matching the color
        for (const folder of productFolders) {
          const filesSearch = await fetch(
            `https://www.googleapis.com/drive/v3/files?q='${folder.id}'+in+parents+and+mimeType+contains+'image/'&fields=files(id,name,mimeType)&orderBy=name`,
            { headers: { 'Authorization': 'Bearer ' + googleToken } }
          ).then(r => r.json());
          const allFiles = filesSearch.files || [];
          console.log('Files in folder', folder.name, ':', allFiles.map(f => f.name));

          // Check if any file contains the color name
          const colorFiles = allFiles.filter(f =>
            f.name.toLowerCase().includes(colorNorm) ||
            f.name.toLowerCase().includes(farbe.toLowerCase())
          );

          if (colorFiles.length > 0) {
            console.log('Found matching photos:', colorFiles.map(f => f.name));
            return colorFiles;
          }

          // If only one folder exists, use all files regardless of color match
          if (productFolders.length === 1 && allFiles.length > 0) {
            console.log('Single folder, using all photos');
            return allFiles;
          }
        }

        console.log('No photos with matching color found for:', farbe);
        return [];
      } catch(e) {
        console.log('Drive error:', e.message);
        return [];
      }
    }

    // Download and convert to base64
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
    const brandSearch2 = await gql(`
      query { metaobjects(type: "intro_brand", first: 50) { nodes { id displayName } } }`, {});
    const allBrands = brandSearch2?.data?.metaobjects?.nodes || [];
    const exactMatch = allBrands.find(b => b.displayName.toLowerCase() === marke.toLowerCase());
    const partialMatch = allBrands.find(b =>
      b.displayName.toLowerCase().includes(marke.toLowerCase()) ||
      marke.toLowerCase().includes(b.displayName.toLowerCase())
    );
    introBrandId = exactMatch?.id || partialMatch?.id || null;
    console.log('Brand match:', exactMatch?.displayName || partialMatch?.displayName || 'none');

    // --- CREATE METAOBJECTS ---
    // --- CREATE METAOBJECTS (active) ---
    const detailsHandle = makeHandle(title + '-details');
    const detailsResult = await gql(`
      mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject { id }
          userErrors { field message }
        }
      }`, { metaobject: { type: 'details_pflege', handle: detailsHandle, capabilities: { publishable: { status: 'ACTIVE' } }, fields: [{ key: 'details_pflege', value: detailsText }] } });
    const detailsId = detailsResult?.data?.metaobjectCreate?.metaobject?.id;
    console.log('Details ID:', detailsId, 'errors:', JSON.stringify(detailsResult?.data?.metaobjectCreate?.userErrors));

    const groesseHandle = makeHandle(title + '-groesse');
    const groesseResult = await gql(`
      mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject { id }
          userErrors { field message }
        }
      }`, { metaobject: { type: 'grosse_passform', handle: groesseHandle, capabilities: { publishable: { status: 'ACTIVE' } }, fields: [{ key: 'grosse_passform', value: groesseText }] } });
    const groesseId = groesseResult?.data?.metaobjectCreate?.metaobject?.id;
    console.log('Groesse ID:', groesseId, 'errors:', JSON.stringify(groesseResult?.data?.metaobjectCreate?.userErrors));

    // --- FIND PHOTOS ---
    const photos = await findPhotos();

    // --- CREATE PRODUCT ---
    const finalBarcode = (!barcode || barcode.trim() === '') ? 'kundenspezifisch' : barcode;
    const variantData = { price, taxable: true, barcode: finalBarcode, weight: 0.5, weight_unit: 'kg' };
    if (sku) variantData.sku = sku;

    const metafields = [
      { namespace: 'custom', key: 'color', value: mapColor(farbe), type: 'single_line_text_field' },
      { namespace: 'theme', key: 'cutline', value: marke, type: 'single_line_text_field' }
    ];
    if (filterKategorie) metafields.push({ namespace: 'custom', key: 'filter_kategorie', value: filterKategorie, type: 'single_line_text_field' });

    const productResp = await fetch('https://' + STORE + '/admin/api/2026-01/products.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
      body: JSON.stringify({ product: { title, body_html: bodyHtml, vendor, status: 'draft', published_scope: 'global', variants: [variantData], metafields } })
    });
    const productData = await productResp.json();

    if (!productData.product?.id) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Product failed', details: productData }) };
    }

    const pid = productData.product.id;
    const productGid = 'gid://shopify/Product/' + pid;

    // --- LINK METAOBJECTS ---
    const mfInputs = [];
    if (detailsId) mfInputs.push({ namespace: 'custom', key: 'details_pflege', value: detailsId, type: 'metaobject_reference' });
    if (groesseId) mfInputs.push({ namespace: 'custom', key: 'grosse_passform', value: groesseId, type: 'metaobject_reference' });
    if (introBrandId) mfInputs.push({ namespace: 'custom', key: 'intro_brand', value: introBrandId, type: 'metaobject_reference' });
    mfInputs.push({ namespace: 'custom', key: 'lieferung_retoure', value: LIEFERUNG_GID, type: 'metaobject_reference' });

    const linkResult = await gql(`
      mutation UpdateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id }
          userErrors { field message }
        }
      }`, { input: { id: productGid, metafields: mfInputs } });
    console.log('Link errors:', JSON.stringify(linkResult?.data?.productUpdate?.userErrors));

    // --- ACTIVATE ALL SALES CHANNELS ---
    const channelsResult = await gql(`
      query {
        publications(first: 20) {
          nodes { id name }
        }
      }`, {});
    const channels = channelsResult?.data?.publications?.nodes || [];
    console.log('Channels:', channels.map(c => c.name));
    for (const channel of channels) {
      await gql(`
        mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            publishable { availablePublicationsCount { count } }
            userErrors { field message }
          }
        }`, { id: productGid, input: [{ publicationId: channel.id }] });
    }

    // --- UPLOAD PHOTOS ---
    if (photos.length > 0) {
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        try {
          const base64 = await downloadAsBase64(photo.id);
          const ext = photo.name.split('.').pop();
          const newName = makeHandle(marke + '-' + produkt + '-' + farbe) + '-' + (i + 1) + '.' + ext;
          const altText = marke + ' ' + produkt + ' ' + farbe + ' – ' + (i + 1 === 1 ? 'Produktbild' : 'Detailbild ' + i);
          await fetch('https://' + STORE + '/admin/api/2026-01/products/' + pid + '/images.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
            body: JSON.stringify({ image: { attachment: base64, filename: newName, alt: altText } })
          });
          console.log('Uploaded photo:', newName);
        } catch(e) {
          console.log('Photo upload error:', e.message);
        }
      }
    }

    // --- EK AS COST ---
    if (ek && productData.product.variants?.[0]?.inventory_item_id) {
      const inventoryItemId = productData.product.variants[0].inventory_item_id;
      await fetch('https://' + STORE + '/admin/api/2026-01/inventory_items/' + inventoryItemId + '.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
        body: JSON.stringify({ inventory_item: { id: inventoryItemId, cost: ek } })
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

    return { statusCode: 200, headers, body: JSON.stringify({ product: productData.product, photosUploaded: photos.length }) };
  } catch(e) {
    console.log('Error:', e.message, e.stack);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
