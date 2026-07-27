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
- Los datos solo se guardan en memoria mientras el servidor está en marcha;
  no se escriben en disco ni en una base de datos.

## Requisitos

- Python 3.10+

## Instalación

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Uso

```bash
source .venv/bin/activate
uvicorn app.main:app --reload
```

Abre [http://localhost:8000](http://localhost:8000) en el navegador, sube tu
archivo y explora las variables desde el panel lateral.

## Estructura del proyecto

```
app/
  main.py       # rutas FastAPI
  readers.py    # lectura de xlsx / dta / sav
  stats.py      # descriptivos y chi-cuadrado
  store.py      # almacén de sesiones en memoria
static/
  index.html
  styles.css
  app.js
```
