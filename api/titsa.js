export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { linea } = req.query;
  if (!linea) return res.status(400).json({ error: 'Falta el parámetro linea' });

  const lineaPadded = linea.toString().padStart(3, '0');
  const url = `https://www.titsa.com/index.php/tus-guaguas/lineas-y-horarios/linea-${lineaPadded}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (!response.ok) return res.status(404).json({ error: `Línea ${linea} no encontrada en TITSA` });

    const html = await response.text();

    // Nombre correcto desde el selector de líneas
    const numInt = parseInt(linea);
    const nombreMatch = html.match(new RegExp('Línea\\s+0*' + numInt + '\\s*[-\u2013]\\s*([^\\[<\\n]+)', 'i'));
    const nombre = nombreMatch ? nombreMatch[1].replace(/<[^>]+>/g, '').trim() : 'Línea ' + lineaPadded;

    // Bloque de contenido entre selector y mapa
    const bloqueMatch = html.match(/Seleccione una línea[\s\S]*?([\s\S]*?)(?=Mostrar mapa)/i);
    let texto = '';

    if (bloqueMatch) {
      texto = bloqueMatch[1]
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/th>/gi, '\t')
        .replace(/<\/td>/gi, '\t')
        .replace(/<[^>]+>/g, '')
        .replace(/\t+/g, ' | ')
        .replace(/[ ]{3,}/g, ' ')
        .replace(/\n[ \t|]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .substring(0, 4000);
    }

    res.status(200).json({ linea: lineaPadded, nombre, contenido: texto, url });

  } catch (err) {
    res.status(500).json({ error: 'Error al consultar TITSA: ' + err.message });
  }
}
