# Pretest Analyzer

Aplicación para explorar datos de pretest (Excel, Stata o SPSS) sin salir del
navegador: estadísticos descriptivos, gráficos, tablas cruzadas con
chi-cuadrado, recodificación de variables, conjuntos de respuesta múltiple y
regresión lineal/logística.

Los datos se procesan solo en memoria mientras la aplicación está en marcha;
no se escriben en disco ni se envían a ningún servidor externo.

## Características

- Lee archivos `.xlsx`, `.xls`, `.dta` (Stata) y `.sav` (SPSS), incluyendo
  etiquetas de variable y de valor cuando el archivo las trae.
- Detecta automáticamente variables numéricas y categóricas, y muestra las
  categorías en su orden natural (numérico o el definido en el archivo
  original), no por frecuencia.
- Estadísticos descriptivos (media, desviación típica, mediana, cuartiles) e
  histograma para variables numéricas; tabla de frecuencias y gráfico de
  barras para categóricas.
- Tablas cruzadas con test de chi-cuadrado (estadístico, grados de libertad,
  p-valor, V de Cramér), porcentajes de columna y aviso si hay frecuencias
  esperadas bajas.
- Recodificación de variables: crea una nueva variable categórica a partir de
  rangos numéricos o agrupando categorías existentes, sin modificar la
  variable original.
- Renombrado de variables y edición de etiquetas de categoría.
- Conjuntos de respuesta múltiple al estilo SPSS ($mrsets): dicotomías o
  categorías compartidas, con tabla de frecuencias de respuestas y de casos.
- Regresión lineal múltiple y logística sobre las variables cargadas.

## Cómo empezar

Hay dos formas de usar la aplicación, según el sistema operativo.

### Opción A · macOS: descargar la app

No requiere instalar nada más.

1. Ve a la pestaña [**Releases**](../../releases) de este repositorio y
   descarga `PretestAnalyzer-mac.zip` de la versión más reciente.
2. Descomprime el archivo y mueve `PretestAnalyzer.app` a la carpeta
   **Aplicaciones**.
3. Ábrela con doble clic. La primera vez, macOS puede advertir que la app
   viene de un desarrollador no identificado: haz clic derecho sobre
   `PretestAnalyzer.app` → **Abrir** → **Abrir** de nuevo en el diálogo de
   confirmación. Solo hace falta la primera vez.
4. La app abre una ventana de estado y, automáticamente, tu navegador en
   `http://localhost:8000`. Para cerrarla, cierra esa ventana.

### Opción B · Windows / Linux, o para desarrollar

Requiere tener Python instalado. Sigue estos pasos una vez; después, arrancar
la aplicación es un único comando.

**1. Instalar Python**

Descarga Python 3.10 o superior desde
[python.org/downloads](https://www.python.org/downloads/).

- **Windows**: al ejecutar el instalador, marca **"Add python.exe to PATH"**
  antes de pulsar "Install Now".
- **macOS/Linux**: usa el instalador oficial o tu gestor de paquetes
  (`brew install python`, `apt install python3`, etc.).

Verifica la instalación abriendo una terminal (PowerShell en Windows,
Terminal en macOS/Linux):

```bash
python3 --version
```

**2. Descargar el proyecto**

Pulsa el botón verde **"Code" → "Download ZIP"** en la página principal de
este repositorio, y descomprímelo. (Si usas Git: `git clone` la URL del
repositorio.)

**3. Instalar dependencias**

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows (PowerShell): .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Si PowerShell bloquea la activación por política de ejecución, ejecuta antes
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` y confirma con "S".

**4. Arrancar la aplicación**

```bash
uvicorn app.main:app --reload
```

Deja esa terminal abierta y abre
[http://localhost:8000](http://localhost:8000) en el navegador. Para cerrar
la aplicación, vuelve a la terminal y pulsa `Ctrl + C`.

**Las siguientes veces**, solo hacen falta los pasos 3 (sin volver a crear el
entorno, únicamente activarlo) y 4:

```bash
source .venv/bin/activate
uvicorn app.main:app --reload
```

### Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| `python3: command not found` (o "no se reconoce como un comando") | Python no se instaló o no se añadió al PATH. Reinstala marcando esa opción y reinicia la terminal. |
| `pip: command not found` | Usa `python3 -m pip install -r requirements.txt` en su lugar. |
| La página no carga en el navegador | Comprueba que la terminal sigue abierta y no muestra errores. |
| El `.sav` o `.dta` no se lee bien | Cierra el archivo en SPSS/Stata antes de subirlo. |
| macOS bloquea la app ("desarrollador no identificado") | Clic derecho → Abrir, en vez de doble clic (solo la primera vez). |

## Estructura del proyecto

```
app/
  main.py         # rutas FastAPI
  readers.py      # lectura de xlsx / dta / sav (datos y etiquetas)
  stats.py        # descriptivos, orden de categorías, chi-cuadrado, recodificación
  mrsets.py       # conjuntos de respuesta múltiple (estilo SPSS)
  regression.py   # regresión lineal y logística
  store.py        # almacén de sesiones en memoria
static/
  index.html
  styles.css
  app.js
desktop_app.py    # punto de entrada para el empaquetado de escritorio (PyInstaller)
.github/workflows/build-desktop.yml  # compila y publica la app de macOS/Windows en cada tag vX.Y.Z
```

## Publicar una nueva versión de la app de escritorio

Al crear y subir un tag `vX.Y.Z`, el workflow de GitHub Actions compila la
app para macOS y Windows y las adjunta automáticamente a una nueva Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```
