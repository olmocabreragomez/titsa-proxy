// v3
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { linea } = req.query;
  if (!linea) return res.status(400).json({ error: 'Falta linea' });

  const lineaPadded = linea.toString().padStart(3, '0');
  const url = `https://www.titsa.com/index.php/tus-guaguas/lineas-y-horarios/linea-${lineaPadded}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (!response.ok) return res.status(404).json({ error: `Linea ${linea} no encontrada` });

    const html = await response.text();

    // Nombre desde el selector
    const numInt = parseInt(linea);
    const nombreMatch = html.match(new RegExp('Línea\\s+0*' + numInt + '\\s*[-\u2013]\\s*([^\\[<\\n\\(]+)', 'i'));
    const nombre = nombreMatch ? nombreMatch[1].replace(/<[^>]+>/g, '').trim() : 'Linea ' + lineaPadded;

    // Extraer bloque desde "Cambiar el sentido" hasta "Mostrar mapa"
    const bloqueMatch = html.match(/Cambiar el sentido[\s\S]*?(?=Mostrar mapa)/i);
    let contenido = '';

    if (bloqueMatch) {
      contenido = bloqueMatch[0]
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/th>/gi, ' | ')
        .replace(/<\/td>/gi, ' | ')
        .replace(/<[^>]+>/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n[ |]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .substring(0, 5000);
    }

    res.status(200).json({ linea: lineaPadded, nombre, contenido, url });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
