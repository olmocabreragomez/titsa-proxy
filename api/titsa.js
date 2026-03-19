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

    // Nombre de la línea
    const nombreMatch = html.match(/Línea\s+\d+\s*[-–]\s*([^\[<\n]+)/i);
    const nombre = nombreMatch ? nombreMatch[1].trim() : `Línea ${lineaPadded}`;

    // Duración
    const duracionMatch = html.match(/(\d+)\s*min/i);
    const duracion = duracionMatch ? `${duracionMatch[1]} minutos` : '';

    // Extraer recorrido (párrafo de paradas)
    const recorridoMatch = html.match(/Intercambiador[^<\n]{10,}/i);
    const recorrido = recorridoMatch ? recorridoMatch[0].replace(/<[^>]+>/g, '').trim() : '';

    // Extraer todas las tablas de horarios
    const tablas = [];
    const tablaRegex = /<table[\s\S]*?<\/table>/gi;
    let m;
    while ((m = tablaRegex.exec(html)) !== null) {
      const texto = m[0]
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, (_, t) => `| ${t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()} `)
        .replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, (_, t) => `| ${t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()} `)
        .replace(/<tr[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n\s*\n/g, '\n')
        .trim();
      if (texto.length > 100 && (texto.includes('LABORABLE') || texto.includes('SÁBADO') || texto.includes(':') )) {
        tablas.push(texto);
      }
    }

    // Notas
    const notasMatch = html.match(/Notas?:([\s\S]*?)(?=Mostrar mapa)/i);
    const notas = notasMatch
      ? notasMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 1000)
      : '';

    res.status(200).json({
      linea: lineaPadded,
      nombre,
      recorrido,
      duracion,
      horarios: tablas.slice(0, 5),
      notas,
      url
    });

  } catch (err) {
    res.status(500).json({ error: 'Error al consultar TITSA: ' + err.message });
  }
}
