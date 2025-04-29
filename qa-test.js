const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

// Configuración
const BASE_URL = "http://localhost:4200/children/study/task/"
const SCREENSHOTS_DIR = "./screenshots"
const REPORTS_DIR = "./reports"
const ACTIVITIES_FILE = "./activities.json"

// Asegurar que existan los directorios
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true })

// Cargar IDs de actividades desde JSON
const loadActivities = () => {
  try {
    if (fs.existsSync(ACTIVITIES_FILE)) {
      const data = fs.readFileSync(ACTIVITIES_FILE, "utf8")
      const activities = JSON.parse(data)
      return Array.isArray(activities) ? activities : []
    } else {
      console.warn(`Archivo ${ACTIVITIES_FILE} no encontrado. Usando actividades por defecto.`)
      return ["ESARCEN000359"] // Actividad por defecto
    }
  } catch (error) {
    console.error(`Error al cargar actividades: ${error}`)
    return ["ESARCEN000359"] // Actividad por defecto en caso de error
  }
}

// Configuración de dispositivo
const deviceConfig = {
  name: "iPhone 7 Adjusted",
  viewport: { width: 355, height: 647 },
  deviceScaleFactor: 2,
  isMobile: true,
}

// Función principal
async function runTests(startIndex = 0, endIndex) {
  const activityIds = loadActivities()

  if (activityIds.length === 0) {
    console.error("No se encontraron actividades para probar")
    return
  }

  endIndex = endIndex !== undefined ? endIndex : activityIds.length - 1
  console.log(`Iniciando pruebas para actividades ${startIndex} a ${endIndex}`)

  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized"], // Para mejor visualización
  })

  // Crear un reporte simple
  const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0] // Formato más limpio
  const reportFileName = `reporte_${timestamp}.txt`
  const reportPath = path.join(REPORTS_DIR, reportFileName)

  // Iniciar el reporte
  fs.writeFileSync(reportPath, `REPORTE DE QA - ${new Date().toLocaleString()}\n`)
  fs.appendFileSync(reportPath, `=================================================\n\n`)

  // Contadores para el resumen
  let totalActivities = 0
  let passedActivities = 0
  let failedActivities = 0

  // Iterar sobre el rango de actividades seleccionado
  for (let i = startIndex; i <= endIndex && i < activityIds.length; i++) {
    const activityId = activityIds[i]
    console.log(`\n📋 Probando actividad ${i + 1}/${endIndex - startIndex + 1}: ${activityId}`)

    let activityStatus = "PASS"
    const activityErrors = []
    totalActivities++

    try {
      // Crear contexto con la configuración del dispositivo
      const context = await browser.newContext({
        viewport: deviceConfig.viewport,
        deviceScaleFactor: deviceConfig.deviceScaleFactor,
        isMobile: deviceConfig.isMobile,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 14.6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
      })

      const page = await context.newPage()

      // Navegar a la actividad
      console.log(`🌐 Navegando a ${BASE_URL}${activityId}`)
      await page.goto(`${BASE_URL}${activityId}`, { waitUntil: "networkidle", timeout: 30000 })

      // Esperar a que la actividad cargue
      try {
        await page.waitForSelector("ul.ng-star-inserted li", { timeout: 10000 })
      } catch (e) {
        throw new Error(`No se pudo cargar la actividad ${activityId}: ${e}`)
      }

      // Contar el número de slides
      const slideCount = await page.evaluate(() => {
        const slides = document.querySelectorAll("ul.ng-star-inserted li")
        return slides.length
      })

      console.log(`📊 La actividad tiene ${slideCount} slides`)

      // Crear directorio para screenshots de esta actividad (solo si es necesario)
      const activityScreenshotsDir = path.join(SCREENSHOTS_DIR, activityId)

      // Iterar sobre cada slide
      for (let slideIndex = 0; slideIndex < slideCount; slideIndex++) {
        console.log(`\n🔍 Probando slide ${slideIndex + 1}/${slideCount}`)

        try {
          // Si no es el primer slide, usar la función proporcionada para avanzar
          if (slideIndex > 0) {
            console.log(`🔄 Avanzando al slide ${slideIndex + 1}...`)
            const slideAdvanced = await page.evaluate(() => {
              try {
                window["ng"].getComponent(document.querySelector("cog-advance-questions-container")).next(0)
                return true
              } catch (e) {
                console.error("Error al avanzar slide:", e)
                return false
              }
            })

            if (!slideAdvanced) {
              console.warn(`⚠️ No se pudo avanzar al slide ${slideIndex + 1}`)
            }

            // Esperar a que cargue el nuevo slide
            await page.waitForTimeout(2000) // Aumentamos el tiempo de espera para asegurar que cargue completamente
          }

          // Opcional: Resaltar visualmente los límites del contenedor
          await highlightContainerBoundaries(page)

          // Verificar si hay elementos que se salen del contenedor
          console.log(`🔎 Verificando elementos en el contenedor...`)
          const checkResult = await checkElementsInContainer(page)

          if (checkResult.hasOverflow) {
            activityStatus = "FAIL"

            // Crear directorio para screenshots si no existe
            if (!fs.existsSync(activityScreenshotsDir)) {
              fs.mkdirSync(activityScreenshotsDir, { recursive: true })
            }

            // Tomar captura de pantalla si hay errores
            const screenshotFileName = `slide${slideIndex + 1}_fail.png`
            const screenshotPath = path.join(activityScreenshotsDir, screenshotFileName)
            await page.screenshot({ path: screenshotPath, fullPage: true })

            const errorMessage = `Slide ${slideIndex + 1}: Elementos fuera del contenedor`
            activityErrors.push(errorMessage)

            console.log(`❌ ${errorMessage}. Captura guardada en ${screenshotPath}`)
            checkResult.overflowElements.forEach((el) => {
              console.log(`  - ${el.selector}: ${el.issue}`)
            })
          } else {
            console.log(`✅ Slide ${slideIndex + 1}: Todos los elementos dentro del contenedor`)
          }
        } catch (e) {
          activityStatus = "FAIL"
          const errorMessage = `Error en slide ${slideIndex + 1}: ${e}`
          activityErrors.push(errorMessage)
          console.error(`❌ ${errorMessage}`)
        }
      }

      // Cerrar el contexto
      await context.close()
    } catch (e) {
      activityStatus = "FAIL"
      const errorMessage = `Error general en actividad: ${e}`
      activityErrors.push(errorMessage)
      console.error(`❌ ${errorMessage}`)
    }

    // Actualizar contadores
    if (activityStatus === "PASS") {
      passedActivities++
    } else {
      failedActivities++
    }

    // Añadir al reporte
    fs.appendFileSync(reportPath, `${activityId} --> QA ${activityStatus}\n`)
    if (activityErrors.length > 0) {
      fs.appendFileSync(reportPath, `  Errores:\n`)
      activityErrors.forEach((error) => {
        fs.appendFileSync(reportPath, `  - ${error}\n`)
      })
      fs.appendFileSync(reportPath, `\n`)
    }

    // Mostrar resultado final de la actividad
    if (activityStatus === "PASS") {
      console.log(`\n✅ Actividad ${activityId}: QA PASS`)
    } else {
      console.log(`\n❌ Actividad ${activityId}: QA FAIL`)
    }
  }

  // Añadir resumen al reporte
  fs.appendFileSync(reportPath, `\n=================================================\n`)
  fs.appendFileSync(reportPath, `RESUMEN:\n`)
  fs.appendFileSync(reportPath, `Total actividades: ${totalActivities}\n`)
  fs.appendFileSync(reportPath, `Actividades correctas: ${passedActivities}\n`)
  fs.appendFileSync(reportPath, `Actividades con errores: ${failedActivities}\n`)
  fs.appendFileSync(reportPath, `=================================================\n`)

  console.log(`\n🏁 Pruebas completadas. Reporte guardado en ${reportPath}`)
  console.log(`📊 Resumen: ${passedActivities}/${totalActivities} actividades pasaron las pruebas`)

  await browser.close()
}

// Función para resaltar visualmente los límites del contenedor
async function highlightContainerBoundaries(page) {
  await page.evaluate(() => {
    // Eliminar resaltados anteriores
    const oldHighlights = document.querySelectorAll(".qa-test-highlight")
    oldHighlights.forEach((el) => el.remove())

    // Selector del contenedor de referencia
    const referenceContainerSelector = "swiper-slide.swiper-slide-active > div:nth-child(1)"
    const referenceContainer = document.querySelector(referenceContainerSelector)

    if (!referenceContainer) return

    const rect = referenceContainer.getBoundingClientRect()

    // Crear un elemento para resaltar los límites
    const highlight = document.createElement("div")
    highlight.className = "qa-test-highlight"
    highlight.style.position = "absolute"
    highlight.style.left = rect.left + "px"
    highlight.style.top = rect.top + "px"
    highlight.style.width = rect.width + "px"
    highlight.style.height = rect.height + "px"
    highlight.style.border = "2px dashed red"
    highlight.style.pointerEvents = "none"
    highlight.style.boxSizing = "border-box"
    highlight.style.zIndex = "9999"

    document.body.appendChild(highlight)

    // Opcional: Mostrar las dimensiones
    const label = document.createElement("div")
    label.className = "qa-test-highlight"
    label.style.position = "absolute"
    label.style.left = rect.left + "px"
    label.style.top = rect.top - 20 + "px"
    label.style.background = "rgba(0,0,0,0.7)"
    label.style.color = "white"
    label.style.padding = "2px 5px"
    label.style.fontSize = "10px"
    label.style.borderRadius = "3px"
    label.style.zIndex = "9999"
    label.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`

    document.body.appendChild(label)

    // Eliminar después de 5 segundos
    setTimeout(() => {
      document.querySelectorAll(".qa-test-highlight").forEach((el) => el.remove())
    }, 5000)
  })
}

// Función para verificar si los elementos están dentro del contenedor
async function checkElementsInContainer(page) {
  return await page.evaluate(() => {
    // Selector del contenedor de referencia (para dimensiones)
    const referenceContainerSelector = "swiper-slide.swiper-slide-active > div:nth-child(1)"
    // Selector del contenedor con elementos a verificar
    const elementsContainerSelector = "swiper-slide.swiper-slide-active > div:nth-child(2)"

    const referenceContainer = document.querySelector(referenceContainerSelector)
    const elementsContainer = document.querySelector(elementsContainerSelector)

    if (!referenceContainer) {
      return {
        hasOverflow: true,
        overflowElements: [
          {
            selector: "reference-container",
            issue: "No se encontró el contenedor de referencia",
            boundingBox: null,
          },
        ],
      }
    }

    if (!elementsContainer) {
      return {
        hasOverflow: true,
        overflowElements: [
          {
            selector: "elements-container",
            issue: "No se encontró el contenedor de elementos",
            boundingBox: null,
          },
        ],
      }
    }

    // Obtener las dimensiones del contenedor de referencia
    const referenceRect = referenceContainer.getBoundingClientRect()
    const overflowElements = []

    // Obtener todos los elementos dentro del contenedor de elementos
    const allElements = elementsContainer.querySelectorAll("*")

    // Verificar cada elemento
    allElements.forEach((element, index) => {
      // Ignorar elementos de texto o sin dimensiones
      if (!(element instanceof HTMLElement)) return

      const elementRect = element.getBoundingClientRect()

      // Si el elemento no tiene dimensiones o es muy pequeño, ignorarlo
      if (elementRect.width < 2 || elementRect.height < 2) return

      // Verificar si el elemento se sale del contenedor de referencia
      const isOverflowingLeft = elementRect.left < referenceRect.left
      const isOverflowingRight = elementRect.right > referenceRect.right
      const isOverflowingTop = elementRect.top < referenceRect.top
      const isOverflowingBottom = elementRect.bottom > referenceRect.bottom

      if (isOverflowingLeft || isOverflowingRight || isOverflowingTop || isOverflowingBottom) {
        // Crear un selector para identificar el elemento
        let selector = element.tagName.toLowerCase()
        if (element.id) selector += `#${element.id}`
        if (element.className && typeof element.className === "string") {
          selector += `.${element.className.split(" ").join(".")}`
        }

        // Determinar el tipo de desbordamiento
        let issue = "Elemento fuera del contenedor: "
        if (isOverflowingLeft) issue += "izquierda "
        if (isOverflowingRight) issue += "derecha "
        if (isOverflowingTop) issue += "arriba "
        if (isOverflowingBottom) issue += "abajo"

        overflowElements.push({
          selector,
          issue,
          boundingBox: {
            element: {
              x: elementRect.x,
              y: elementRect.y,
              width: elementRect.width,
              height: elementRect.height,
            },
            referenceContainer: {
              x: referenceRect.x,
              y: referenceRect.y,
              width: referenceRect.width,
              height: referenceRect.height,
            },
          },
        })
      }
    })

    return {
      hasOverflow: overflowElements.length > 0,
      overflowElements,
    }
  })
}

// Función para ejecutar el script con argumentos de línea de comandos
function parseArgs() {
  const args = process.argv.slice(2)
  let startIndex = 0
  let endIndex = undefined

  if (args.length >= 1) {
    const range = args[0].split("-")
    startIndex = Number.parseInt(range[0], 10)

    if (range.length > 1) {
      endIndex = Number.parseInt(range[1], 10)
    } else {
      endIndex = startIndex
    }
  }

  return { startIndex, endIndex }
}

// Ejecutar el script
const { startIndex, endIndex } = parseArgs()
runTests(startIndex, endIndex).catch((error) => {
  console.error("Error en la ejecución del script:", error)
  process.exit(1)
})

console.log("🚀 Script iniciado. Presiona Ctrl+C para detener.")
