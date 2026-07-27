from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import mrsets as mrsetsmod
from . import stats as statsmod
from . import store
from .readers import read_dataset

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB

app = FastAPI(title="Pretest Analyzer")


def _get_df_or_404(session_id: str):
    try:
        return store.get_df(session_id)
    except KeyError as e:
        raise HTTPException(404, str(e))


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
    df = _get_df_or_404(session_id)
    if var_name not in df.columns:
        raise HTTPException(404, "Variable no encontrada.")

    series = df[var_name]
    role = statsmod.classify_role(series)
    if role == "numeric":
        return statsmod.describe_numeric(series)
    return statsmod.describe_categorical(series)


@app.get("/api/crosstab/{session_id}")
async def crosstab(session_id: str, var1: str, var2: str):
    df = _get_df_or_404(session_id)
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


# ---------- Renombrar variables y categorías ----------

class RenameVariableRequest(BaseModel):
    new_name: str


@app.post("/api/variables/{session_id}/{var_name}/rename")
async def rename_variable(session_id: str, var_name: str, payload: RenameVariableRequest):
    df = _get_df_or_404(session_id)
    if var_name not in df.columns:
        raise HTTPException(404, "Variable no encontrada.")

    new_name = payload.new_name.strip()
    if not new_name:
        raise HTTPException(400, "El nombre no puede estar vacío.")
    if new_name != var_name and new_name in df.columns:
        raise HTTPException(400, "Ya existe una variable con ese nombre.")

    store.rename_column(session_id, var_name, new_name)
    return {"variables": statsmod.variable_summary(store.get_df(session_id)), "new_name": new_name}


class RelabelRequest(BaseModel):
    mapping: dict[str, str]


@app.post("/api/variables/{session_id}/{var_name}/relabel")
async def relabel_variable(session_id: str, var_name: str, payload: RelabelRequest):
    df = _get_df_or_404(session_id)
    if var_name not in df.columns:
        raise HTTPException(404, "Variable no encontrada.")
    if statsmod.classify_role(df[var_name]) != "categorical":
        raise HTTPException(400, "Solo se pueden editar etiquetas de variables categóricas.")

    cleaned = {k: v.strip() for k, v in payload.mapping.items() if v.strip()}
    store.relabel_column(session_id, var_name, cleaned)
    df = store.get_df(session_id)
    return {
        "variables": statsmod.variable_summary(df),
        "detail": statsmod.describe_categorical(df[var_name]),
    }


# ---------- Recodificación ----------

class NumericRecodeRule(BaseModel):
    min: float | None = None
    max: float | None = None
    label: str = Field(min_length=1)


class NumericRecodeRequest(BaseModel):
    source_var: str
    new_var: str
    rules: list[NumericRecodeRule]
    other_label: str | None = None


@app.post("/api/recode/{session_id}/numeric")
async def recode_numeric_endpoint(session_id: str, payload: NumericRecodeRequest):
    df = _get_df_or_404(session_id)
    if payload.source_var not in df.columns:
        raise HTTPException(404, "Variable no encontrada.")
    if not payload.rules:
        raise HTTPException(400, "Añade al menos un rango.")

    new_var = payload.new_var.strip()
    if not new_var:
        raise HTTPException(400, "Indica un nombre para la nueva variable.")
    if new_var in df.columns:
        raise HTTPException(400, "Ya existe una variable con ese nombre. Elige otro.")

    new_series = statsmod.recode_numeric(
        df[payload.source_var], [r.model_dump() for r in payload.rules], payload.other_label
    )
    store.set_column(session_id, new_var, new_series)
    return {"variables": statsmod.variable_summary(store.get_df(session_id)), "new_var": new_var}


class CategoricalRecodeRule(BaseModel):
    values: list[str]
    label: str = Field(min_length=1)


class CategoricalRecodeRequest(BaseModel):
    source_var: str
    new_var: str
    rules: list[CategoricalRecodeRule]
    other_label: str | None = None


@app.post("/api/recode/{session_id}/categorical")
async def recode_categorical_endpoint(session_id: str, payload: CategoricalRecodeRequest):
    df = _get_df_or_404(session_id)
    if payload.source_var not in df.columns:
        raise HTTPException(404, "Variable no encontrada.")
    if not payload.rules:
        raise HTTPException(400, "Añade al menos una categoría.")

    new_var = payload.new_var.strip()
    if not new_var:
        raise HTTPException(400, "Indica un nombre para la nueva variable.")
    if new_var in df.columns:
        raise HTTPException(400, "Ya existe una variable con ese nombre. Elige otro.")

    new_series = statsmod.recode_categorical(
        df[payload.source_var], [r.model_dump() for r in payload.rules], payload.other_label
    )
    store.set_column(session_id, new_var, new_series)
    return {"variables": statsmod.variable_summary(store.get_df(session_id)), "new_var": new_var}


# ---------- Conjuntos de respuesta múltiple ----------

class MrsetCreateRequest(BaseModel):
    name: str
    label: str = ""
    type: Literal["dichotomy", "category"]
    variables: list[str]
    dichotomy_value: str | None = None
    variable_labels: dict[str, str] = {}


@app.get("/api/mrsets/{session_id}")
async def list_mrsets(session_id: str):
    _get_df_or_404(session_id)
    return {"mrsets": store.list_mrsets(session_id)}


@app.post("/api/mrsets/{session_id}")
async def create_mrset(session_id: str, payload: MrsetCreateRequest):
    df = _get_df_or_404(session_id)

    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Indica un nombre para el conjunto.")
    if len(payload.variables) < 2:
        raise HTTPException(400, "Selecciona al menos 2 variables.")
    missing = [v for v in payload.variables if v not in df.columns]
    if missing:
        raise HTTPException(404, f"Variable no encontrada: {missing[0]}")
    if payload.type == "dichotomy" and not (payload.dichotomy_value or "").strip():
        raise HTTPException(400, "Indica el valor que representa 'seleccionado'.")

    store.upsert_mrset(
        session_id,
        name,
        {
            "label": payload.label.strip() or name,
            "type": payload.type,
            "variables": payload.variables,
            "dichotomy_value": (payload.dichotomy_value or "").strip(),
            "variable_labels": payload.variable_labels,
        },
    )
    return {"mrsets": store.list_mrsets(session_id)}


@app.delete("/api/mrsets/{session_id}/{name}")
async def remove_mrset(session_id: str, name: str):
    _get_df_or_404(session_id)
    store.delete_mrset(session_id, name)
    return {"ok": True}


@app.get("/api/mrsets/{session_id}/{name}/summary")
async def mrset_summary(session_id: str, name: str):
    df = _get_df_or_404(session_id)
    mrset = store.get_mrset(session_id, name)
    if mrset is None:
        raise HTTPException(404, "Conjunto no encontrado.")
    return mrsetsmod.build_summary(df, mrset)


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")
