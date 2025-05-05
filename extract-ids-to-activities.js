const fs = require("fs");

const inputFile = "paths.json";
const outputFile = "activities.json";

try {
  // Leer el archivo como texto plano
  const rawText = fs.readFileSync(inputFile, "utf8");

  // Expresión regular para encontrar los IDs ESARC
  const matches = rawText.match(/ESARC\d+/g);

  if (!matches || matches.length === 0) {
    throw new Error("No se encontraron IDs ESARC en el archivo.");
  }

  // Eliminar duplicados por si acaso
  const uniqueIds = [...new Set(matches)];

  // Guardar en formato JSON válido
  fs.writeFileSync(outputFile, JSON.stringify(uniqueIds, null, 2), "utf8");

  console.log(`✅ Extraídos ${uniqueIds.length} IDs y guardados en ${outputFile}`);
} catch (err) {
  console.error("❌ Error procesando el archivo:", err.message);
}
