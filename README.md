# Pretest Analyzer

Aplicación web para subir datos de pretest (Excel, Stata o SPSS) y obtener
análisis descriptivos básicos: tablas y gráficos por variable, y tablas
cruzadas con test de chi-cuadrado.

## Características

- Sube archivos `.xlsx`, `.xls`, `.dta` (Stata) o `.sav` (SPSS).
- Detecta automáticamente variables numéricas y categóricas.
- Estadísticos descriptivos (media, desviación típica, mediana, cuartiles...)
  e histograma para variables numéricas.
- Tabla de frecuencias y gráfico de barras para variables categóricas.
- Tablas cruzadas entre dos variables categóricas con test de chi-cuadrado
  (estadístico, grados de libertad, p-valor, V de Cramér) y aviso si hay
  frecuencias esperadas bajas.
- **Recodificación**: crea una nueva variable categórica a partir de rangos
  numéricos (p. ej. edad → grupos de edad) o agrupando categorías existentes
  bajo nuevas etiquetas (p. ej. fusionar "Media" y "Alta" en "Satisfecho").
  La variable original no se modifica.
- **Renombrar**: cambia el nombre de una variable o edita el texto de sus
  categorías (equivalente a las etiquetas de valor de SPSS).
- **Conjuntos de respuesta múltiple** (al estilo SPSS $mrsets): agrupa varias
  variables dicotómicas (sí/no por opción) o varias variables que comparten
  categorías (p. ej. 1ª y 2ª opción) y obtén su tabla de frecuencias de
  respuesta múltiple (N y % de respuestas, % de casos).
- Los datos solo se guardan en memoria mientras el servidor está en marcha;
  no se escriben en disco ni en una base de datos.

## Guía de instalación para principiantes (sin conocimientos de programación)

Estas instrucciones asumen que nunca has usado Python ni la Terminal. Solo
hay que hacerlo una vez; después, arrancar la aplicación es un único
comando.

### 1. Instalar Python

Python es el lenguaje en el que está escrito el programa; hace falta
tenerlo instalado en el ordenador.

- **Windows**: ve a [python.org/downloads](https://www.python.org/downloads/)
  y pulsa el botón amarillo "Download Python". Al ejecutar el instalador,
  marca la casilla **"Add python.exe to PATH"** antes de pulsar "Install
  Now" (es el paso que más gente olvida y luego da error).
- **Mac**: ve a [python.org/downloads](https://www.python.org/downloads/),
  descarga el instalador para macOS y ábrelo, aceptando las opciones por
  defecto.

Para comprobar que se instaló bien, abre la Terminal (en Windows, busca
"PowerShell" en el menú de inicio; en Mac, busca "Terminal" con Spotlight,
la lupa arriba a la derecha) y escribe:

```bash
python3 --version
```

(en Windows puede que tengas que escribir `python --version`). Debería
mostrar algo como `Python 3.12.x`. Si sale un error, vuelve a instalar
Python asegurándote de marcar la opción de añadirlo al PATH.

### 2. Descargar el código de la aplicación

En esta misma página de GitHub, pulsa el botón verde **"Code"** y luego
**"Download ZIP"**. Descomprime el archivo ZIP descargado en una carpeta
fácil de encontrar (por ejemplo, el Escritorio).

### 3. Abrir la Terminal en esa carpeta

- **Windows**: abre la carpeta descomprimida en el Explorador de archivos,
  haz clic en la barra de direcciones de arriba, escribe `powershell` y
  pulsa Intro. Se abrirá una Terminal ya situada en esa carpeta.
- **Mac**: abre la Terminal y escribe `cd ` (con un espacio detrás),
  arrastra la carpeta descomprimida sobre la ventana de la Terminal (esto
  escribe automáticamente la ruta) y pulsa Intro.

### 4. Instalar las dependencias del programa

Copia y pega estos comandos en la Terminal, uno por uno, pulsando Intro
después de cada uno:

```bash
python3 -m venv .venv
```

Esto crea un espacio aislado para que la instalación no interfiera con
otros programas. Después, actívalo:

- **Mac**:
  ```bash
  source .venv/bin/activate
  ```
- **Windows (PowerShell)**:
  ```bash
  .venv\Scripts\Activate.ps1
  ```
  Si PowerShell da un error de "permisos" o "execution policy", escribe
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` y pulsa Intro,
  confirma con "S" o "Y", y vuelve a intentar activar.

Verás que al principio de la línea de la Terminal aparece `(.venv)`; eso
indica que se activó correctamente. Ahora instala las librerías que
necesita el programa:

```bash
pip install -r requirements.txt
```

Este paso puede tardar uno o dos minutos.

### 5. Arrancar la aplicación

En la misma Terminal (con `(.venv)` visible al principio de la línea):

```bash
uvicorn app.main:app --reload
```

Deberías ver un mensaje indicando que el servidor está en marcha
("Uvicorn running on http://127.0.0.1:8000"). **Deja esa ventana de
Terminal abierta** mientras uses la aplicación.

Abre el navegador (Chrome, Safari, Edge...) y entra en:

[http://localhost:8000](http://localhost:8000)

Ya puedes subir tu archivo de datos y explorar las variables desde el
panel lateral.

Para cerrar la aplicación, vuelve a la ventana de la Terminal y pulsa
`Ctrl + C`.

### Las siguientes veces

No hace falta repetir todos los pasos. Solo tienes que:

1. Abrir la Terminal en la carpeta del proyecto (paso 3).
2. Activar el entorno (paso 4, solo el comando `source .venv/bin/activate`
   o `.venv\Scripts\Activate.ps1`, sin volver a crearlo ni instalar nada).
3. Arrancar con `uvicorn app.main:app --reload` (paso 5).

### Problemas frecuentes

- **"python3: command not found" o "no se reconoce como un comando"**:
  Python no quedó bien instalado o no se añadió al PATH. Repite el paso 1
  y reinicia la Terminal.
- **"pip: command not found"**: prueba `python3 -m pip install -r
  requirements.txt` en lugar de `pip install -r requirements.txt`.
- **La página no carga en el navegador**: comprueba que la ventana de la
  Terminal sigue abierta y no muestra ningún error en rojo.
- **El archivo `.sav` o `.dta` no se lee bien**: asegúrate de que el
  archivo no está abierto en otro programa (SPSS, Stata) al subirlo.

## Instalación rápida (para quien ya usa Python)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Requisito: Python 3.10+.

## Estructura del proyecto

```
app/
  main.py       # rutas FastAPI
  readers.py    # lectura de xlsx / dta / sav
  stats.py      # descriptivos, chi-cuadrado y recodificación
  mrsets.py     # conjuntos de respuesta múltiple (estilo SPSS)
  store.py      # almacén de sesiones en memoria
static/
  index.html
  styles.css
  app.js
```
