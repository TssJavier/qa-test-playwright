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

// Configuración de dispositivos
const deviceConfigs = [
  {
    name: "iPhone7",
    viewport: { width: 355, height: 647 },
    deviceScaleFactor: 2,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14.6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
  },
  {
    name: "iPadAir",
    viewport: { width: 1031, height: 701 },
    deviceScaleFactor: 2,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
  },
]

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

    // Para cada actividad, probar en todos los dispositivos configurados
    for (const deviceConfig of deviceConfigs) {
      console.log(`\n📱 Probando en dispositivo: ${deviceConfig.name}`)

      let activityStatus = "PASS"
      const activityErrors = []

      // Solo incrementamos el contador total una vez por actividad, no por dispositivo
      if (deviceConfig === deviceConfigs[0]) {
        totalActivities++
      }

      try {
        // Crear contexto con la configuración del dispositivo
        const context = await browser.newContext({
          viewport: deviceConfig.viewport,
          deviceScaleFactor: deviceConfig.deviceScaleFactor,
          isMobile: deviceConfig.isMobile,
          userAgent: deviceConfig.userAgent,
        })

        const page = await context.newPage()

        // Navegar a la actividad
        console.log(`🌐 Navegando a ${BASE_URL}${activityId}`)
        await page.goto(`${BASE_URL}${activityId}`, { waitUntil: "networkidle", timeout: 30000 })

        // Esperar a que la página cargue completamente
        await page.waitForLoadState("networkidle")
        await page.waitForTimeout(2000) // Esperar un poco más para asegurar que todo esté cargado

        // Verificar si hay múltiples slides o solo uno
        let slideCount = 1 // Por defecto asumimos que hay al menos 1 slide
        let hasMultipleSlides = false

        try {
          // Intentamos verificar si existen los elementos de navegación, con un timeout más corto
          const hasNavigation = await page
            .waitForSelector("ul.ng-star-inserted li", { timeout: 5000 })
            .then(() => true)
            .catch(() => false)

          if (hasNavigation) {
            // Si encontramos navegación, contamos los slides
            slideCount = await page.evaluate(() => {
              const slides = document.querySelectorAll("ul.ng-star-inserted li")
              return slides.length
            })
            hasMultipleSlides = slideCount > 1
            console.log(`📊 La actividad tiene ${slideCount} slides`)
          } else {
            console.log(`📊 La actividad tiene un solo slide (no se encontró navegación)`)
          }
        } catch (e) {
          // Si hay un error al buscar la navegación, asumimos que solo hay un slide
          console.log(`📊 Asumiendo un solo slide (error al buscar navegación: ${e.message})`)
        }

        // Crear directorio para screenshots de esta actividad y dispositivo
        const deviceDir = path.join(SCREENSHOTS_DIR, activityId, deviceConfig.name)

// Iterar sobre cada slide
for (let slideIndex = 0; slideIndex < slideCount; slideIndex++) {
  console.log(`\n🔍 Probando slide ${slideIndex + 1}/${slideCount}`)

  // Reiniciar estado por slide
  let slideStatus = "PASS"

  try {
    // Si no es el primer slide y hay múltiples slides, avanzar al siguiente
    if (slideIndex > 0 && hasMultipleSlides) {
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

      // Esperar a que el nuevo slide esté activo
      await page.waitForSelector("swiper-slide.swiper-slide-active", { timeout: 5000 })
      await page.waitForTimeout(1000)
    }

    // Resaltar visualmente los límites del contenedor
    await highlightContainerBoundaries(page)

    // Verificar si hay elementos que se salen del contenedor
    console.log(`🔎 Verificando elementos en el contenedor...`)
    const checkResult = await checkElementsInContainer(page)

    if (checkResult.hasOverflow) {
      slideStatus = "FAIL"

      // Crear directorio si no existe
      if (!fs.existsSync(deviceDir)) {
        fs.mkdirSync(deviceDir, { recursive: true })
      }

      // Captura de pantalla del fallo
      const screenshotFileName = `slide${slideIndex + 1}_fail.png`
      const screenshotPath = path.join(deviceDir, screenshotFileName)
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
    slideStatus = "FAIL"
    const errorMessage = `Error en slide ${slideIndex + 1}: ${e}`
    activityErrors.push(errorMessage)
    console.error(`❌ ${errorMessage}`)
  }

  // Si este slide falló, actualizar estado general de la actividad
  if (slideStatus === "FAIL") {
    activityStatus = "FAIL"
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

      // Actualizar contadores (solo contamos una vez por actividad, usando el peor resultado)
      if (activityStatus === "FAIL") {
        // Si algún dispositivo falla, marcamos la actividad como fallida
        failedActivities = Math.min(failedActivities + 1, totalActivities)
        passedActivities = totalActivities - failedActivities
      } else if (deviceConfig === deviceConfigs[deviceConfigs.length - 1] && activityStatus === "PASS") {
        // Solo si es el último dispositivo y todos los anteriores pasaron
        passedActivities++
      }

      // Añadir al reporte
      fs.appendFileSync(reportPath, `${activityId} (${deviceConfig.name}) --> QA ${activityStatus}\n`)
      if (activityErrors.length > 0) {
        fs.appendFileSync(reportPath, `  Errores:\n`)
        activityErrors.forEach((error) => {
          fs.appendFileSync(reportPath, `  - ${error}\n`)
        })
        fs.appendFileSync(reportPath, `\n`)
      }

      // Mostrar resultado final de la actividad para este dispositivo
      if (activityStatus === "PASS") {
        console.log(`\n✅ Actividad ${activityId} (${deviceConfig.name}): QA PASS`)
      } else {
        console.log(`\n❌ Actividad ${activityId} (${deviceConfig.name}): QA FAIL`)
      }
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

    // Selector del contenedor de referencia - ACTUALIZADO
    const referenceContainerSelector = "swiper-slide.swiper-slide-active"
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

// Función actualizada para verificar elementos dentro del contenedor .swiperDiv
async function checkElementsInContainer(page) {
  return await page.evaluate(() => {
    // Selector del contenedor de referencia - ACTUALIZADO
    const referenceContainerSelector = "swiper-slide.swiper-slide-active"
    const referenceContainer = document.querySelector(referenceContainerSelector)

    if (!referenceContainer) {
      return {
        hasOverflow: true,
        overflowElements: [
          {
            selector: "reference-container",
            issue: "No se encontró el contenedor de referencia (swiper-slide.swiper-slide:nth-child())",
            boundingBox: null,
          },
        ],
      }
    }

    // Obtener las dimensiones del contenedor de referencia
    const referenceRect = referenceContainer.getBoundingClientRect()
    const overflowElements = []

    // Lista de selectores para elementos de contenido significativo
    const contentSelectors = [
      // Textos
      "h1",
      "h2",
      "h3",
      "p",
      ".text",
      ".actTitle",
      // Imágenes y medios
      "img",
      "canvas",
      "video",
      "svg",
      // Inputs y controles interactivos
      "input",
      "button",
      "select",
      "textarea",
      "mat-form-field",
      // Contenedores de contenido específicos
      ".actCorpoUnit > *:not(cog-advance-questions-exercise-list)",
    ]

    // Buscar solo los elementos de contenido significativo DENTRO del contenedor .swiperDiv
    const contentElements = []
    contentSelectors.forEach((selector) => {
      try {
        // Buscar solo dentro del contenedor .swiperDiv
        const elements = referenceContainer.querySelectorAll(selector)
        elements.forEach((el) => contentElements.push(el))
      } catch (e) {
        // Ignorar errores en selectores inválidos
      }
    })

    // Verificar cada elemento de contenido
    contentElements.forEach((element) => {
      // Ignorar elementos de texto o sin dimensiones
      if (!(element instanceof HTMLElement)) return

      // Verificar si el elemento es realmente visible
      const style = window.getComputedStyle(element)
      if (style.opacity === "0" || style.visibility === "hidden" || style.display === "none") return

      const elementRect = element.getBoundingClientRect()

      // Si el elemento no tiene dimensiones o es muy pequeño, ignorarlo
      if (elementRect.width < 2 || elementRect.height < 2) return

      // Verificar si el elemento se sale del contenedor de referencia
      // Añadir un margen de tolerancia de 5px
      const toleranceMargin = 2
      const isOverflowingLeft = elementRect.left < referenceRect.left - toleranceMargin
      const isOverflowingRight = elementRect.right > referenceRect.right + toleranceMargin
      const isOverflowingTop = elementRect.top < referenceRect.top - toleranceMargin
      const isOverflowingBottom = elementRect.bottom > referenceRect.bottom + toleranceMargin

      if (isOverflowingLeft || isOverflowingRight || isOverflowingTop || isOverflowingBottom) {
        // Calcular qué porcentaje del elemento está fuera
        const elementArea = elementRect.width * elementRect.height
        if (elementArea === 0) return

        // Calcular área de intersección
        const xOverlap = Math.max(
          0,
          Math.min(elementRect.right, referenceRect.right) - Math.max(elementRect.left, referenceRect.left),
        )
        const yOverlap = Math.max(
          0,
          Math.min(elementRect.bottom, referenceRect.bottom) - Math.max(elementRect.top, referenceRect.top),
        )
        const overlapArea = xOverlap * yOverlap

        // Calcular porcentaje de desbordamiento
        const overflowPercentage = 100 - (overlapArea / elementArea) * 100

        // Solo considerar como error si más del 20% del elemento está fuera
        if (overflowPercentage > 2) {
          // Crear un selector para identificar el elemento
          let selector = element.tagName.toLowerCase()
          if (element.id) selector += `#${element.id}`
          if (element.className && typeof element.className === "string") {
            selector += `.${element.className.split(" ").join(".")}`
          }

          // Determinar el tipo de desbordamiento
          let issue = `Elemento fuera del contenedor (${Math.round(overflowPercentage)}%): `
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
      }
    })

    return {
      hasOverflow: overflowElements.length > 0,
      overflowElements,
    }
  })
}

// Función para ejecutar el script con argumentos de línea de comandos
function parseArgs(activityIds) {
  const args = process.argv.slice(2)

  // Si no hay argumentos, probar todas
  if (args.length === 0) {
    return { startIndex: 0, endIndex: activityIds.length - 1 }
  }

  const input = args[0]

  // Si es un número o un rango de índices
  if (/^\d+(-\d+)?$/.test(input)) {
    const parts = input.split("-").map((x) => parseInt(x, 10))
    const startIndex = parts[0]
    const endIndex = parts[1] !== undefined ? parts[1] : startIndex
    return { startIndex, endIndex }
  }

  // Si es un ID alfanumérico (como ESARC00380942)
  const indexById = activityIds.indexOf(input)
  if (indexById !== -1) {
    return { startIndex: indexById, endIndex: indexById }
  } else {
    console.error(`❌ ID de actividad '${input}' no encontrado en activities.json`)
    process.exit(1)
  }
}

// Ejecutar el script
const activityIds = loadActivities()
const { startIndex, endIndex } = parseArgs(activityIds)
runTests(startIndex, endIndex).catch((error) => {
  console.error("Error en la ejecución del script:", error)
  process.exit(1)
})

console.log("🚀 Script iniciado. Presiona Ctrl+C para detener.")
