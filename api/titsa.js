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

    const cleanText = (str) => str
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const nombreMatch = html.match(/Línea\s+\d+\s*[-–]\s*([^\[<\n]+)/i);
    const nombre = nombreMatch ? cleanText(nombreMatch[1]) : `Línea ${lineaPadded}`;

    const duracionMatch = html.match(/(\d+)\s*min/i);
    const duracion = duracionMatch ? `${duracionMatch[1]} minutos` : '';

    const recorridoMatch = html.match(/(?:Intercambiador|Estación|Santa Cruz|La Laguna)[^<\n]{20,}/i);
    const recorrido = recorridoMatch ? cleanText(recorridoMatch[0]) : '';

    const horarios = [];
    const tablaRegex = /<table[\s\S]*?<\/table>/gi;
    let m;

    while ((m = tablaRegex.exec(html)) !== null) {
      const tabla = m[0];
      if (!tabla.match(/LABORABLE|SÁBADO|SALIDAS|DEPARTURES/i)) continue;

      const filas = [];
      const filaRegex = /<tr[\s\S]*?<\/tr>/gi;
      let fila;

      while ((fila = filaRegex.exec(tabla)) !== null) {
        const celdas = [];
        const celdaRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let celda;

        while ((celda = celdaRegex.exec(fila[0])) !== null) {
          const texto = cleanText(celda[1]);
          if (texto) celdas.push(texto);
        }

        if (celdas.length > 0) filas.push(celdas.join(' | '));
      }

      if (filas.length > 2) horarios.push(filas.join('\n'));
    }

    const notasMatch = html.match(/Notas?:([\s\S]*?)(?=Mostrar mapa)/i);
    let notas = '';
    if (notasMatch) {
      notas = cleanText(notasMatch[1])
        .split('.')
        .filter(s => s.trim().length > 10)
        .slice(0, 5)
        .join('. ')
        .trim();
    }

    res.status(200).json({
      linea: lineaPadded,
      nombre,
      recorrido,
      duracion,
      horarios,
      notas,
      url
    });

  } catch (err) {
    res.status(500).json({ error: 'Error al consultar TITSA: ' + err.message });
  }
}
