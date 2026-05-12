exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    if (!event.body) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No body' }) };
    const { shopifyToken, googleToken, pid, marke, produkt, farbe } = JSON.parse(event.body);
    const STORE = 'pevzde-fd.myshopify.com';

    function makeHandle(str) {
      return str.toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    async function findPhotos() {
      if (!googleToken) return [];
      try {
        const rootSearch = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name+%3D+'Fotos+Brands'+and+mimeType+%3D+'application%2Fvnd.google-apps.folder'&fields=files(id,name)`,
          { headers: { 'Authorization': 'Bearer ' + googleToken } }
        ).then(r => r.json());
        const rootFolder = rootSearch.files?.[0];
        if (!rootFolder) return [];

        const brandSearch = await fetch(
          `https://www.googleapis.com/drive/v3/files?q='${rootFolder.id}'+in+parents+and+name+%3D+'${encodeURIComponent(marke)}'+and+mimeType+%3D+'application%2Fvnd.google-apps.folder'&fields=files(id,name)`,
          { headers: { 'Authorization': 'Bearer ' + googleToken } }
        ).then(r => r.json());
        const brandFolder = brandSearch.files?.[0];
        if (!brandFolder) return [];

        const productSearch = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name+%3D+'${encodeURIComponent(produkt)}'+and+mimeType+%3D+'application%2Fvnd.google-apps.folder'&fields=files(id,name)`,
          { headers: { 'Authorization': 'Bearer ' + googleToken } }
        ).then(r => r.json());
        const productFolders = productSearch.files || [];
        if (productFolders.length === 0) return [];

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

    const photos = await findPhotos();
    console.log('Photos found:', photos.length);

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
        console.log('Uploaded:', newName);
      } catch(e) {
        console.log('Photo error:', e.message);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ photosUploaded: photos.length }) };
  } catch(e) {
    console.log('Error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
