export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { linea } = req.query;
  if (!linea) return res.status(400).json({ error: 'Falta el parámetro linea' });

  const lineaPadded = linea.toString().padStart(3, '0');

  try {
    const response = await fetch(
      `https://www.titsa.com/index.php/tus-guaguas/lineas-y-horarios/linea-${lineaPadded}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    if (!response.ok) return res.status(404).json({ error: 'Línea no encontrada' });

    const html = await response.text();

    const nombreMatch = html.match(/Línea\s+\d+\s*[-–]\s*([^<\n]+)/i);
    const nombre = nombreMatch ? nombreMatch[1].trim() : `Línea ${linea}`;

    const recorridoMatch = html.match(/<strong>([^<]+)<\/strong>\s*-[^<]+-\s*<strong>([^<]+)<\/strong>/);
    const recorrido = recorridoMatch
      ? `${recorridoMatch[1].trim()} → ${recorridoMatch[2].trim()}`
      : '';

    const tablas = [];
    const tablaRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tablaMatch;
    while ((tablaMatch = tablaRegex.exec(html)) !== null) {
      const textoTabla = tablaMatch[1]
        .replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, (_, t) => `[${t.replace(/<[^>]+>/g, '').trim()}]`)
        .replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, (_, t) => t.replace(/<[^>]+>/g, '').trim() + ' | ')
        .replace(/<tr[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n\s*\n/g, '\n')
        .trim();
      if (textoTabla.length > 20) tablas.push(textoTabla);
    }

    const notasMatch = html.match(/NOTAS:([\s\S]*?)<\/table>/i);
    const notas = notasMatch
      ? notasMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    const duracionMatch = html.match(/(\d+)\s*minutos/i);
    const duracion = duracionMatch ? `${duracionMatch[1]} minutos` : '';

    res.status(200).json({
      linea: lineaPadded,
      nombre,
      recorrido,
      duracion,
      horarios: tablas.slice(0, 4),
      notas,
      url: `https://www.titsa.com/index.php/tus-guaguas/lineas-y-horarios/linea-${lineaPadded}`
    });

  } catch (err) {
    res.status(500).json({ error: 'Error al consultar TITSA: ' + err.message });
  }
}
