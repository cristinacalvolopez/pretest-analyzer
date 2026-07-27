from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import stats as statsmod
from . import store
from .readers import read_dataset

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB

app = FastAPI(title="Pretest Analyzer")


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "El archivo supera el límite de 25 MB.")

    try:
        df = read_dataset(file.filename, content)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(400, f"No se pudo leer el archivo: {e}")

    if df.shape[1] == 0:
        raise HTTPException(400, "El archivo no contiene columnas.")

    session_id = store.create_session(df, file.filename)
    return {
        "session_id": session_id,
        "filename": file.filename,
        "n_rows": int(df.shape[0]),
        "n_cols": int(df.shape[1]),
        "variables": statsmod.variable_summary(df),
    }


@app.get("/api/variable/{session_id}/{var_name}")
async def variable_detail(session_id: str, var_name: str):
    try:
        df = store.get_df(session_id)
    except KeyError as e:
        raise HTTPException(404, str(e))
    if var_name not in df.columns:
        raise HTTPException(404, "Variable no encontrada.")

    series = df[var_name]
    role = statsmod.classify_role(series)
    if role == "numeric":
        return statsmod.describe_numeric(series)
    return statsmod.describe_categorical(series)


@app.get("/api/crosstab/{session_id}")
async def crosstab(session_id: str, var1: str, var2: str):
    try:
        df = store.get_df(session_id)
    except KeyError as e:
        raise HTTPException(404, str(e))
    if var1 not in df.columns or var2 not in df.columns:
        raise HTTPException(404, "Variable no encontrada.")
    if var1 == var2:
        raise HTTPException(400, "Elige dos variables distintas.")

    try:
        return statsmod.crosstab_chi2(df, var1, var2)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.delete("/api/session/{session_id}")
async def remove_session(session_id: str):
    store.delete_session(session_id)
    return {"ok": True}


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")
