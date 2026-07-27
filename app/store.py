"""Almacén en memoria de los datasets subidos, indexados por sesión.

No hay persistencia en disco ni base de datos: los datos viven solo mientras
el proceso está en marcha y se pueden borrar en cualquier momento, lo cual es
deliberado dado que los ficheros de pretest pueden contener datos sensibles.
"""
import time
import uuid

import pandas as pd

SESSION_TTL_SECONDS = 4 * 60 * 60  # 4 horas

_SESSIONS: dict[str, dict] = {}


def _purge_expired() -> None:
    now = time.time()
    expired = [sid for sid, s in _SESSIONS.items() if now - s["created"] > SESSION_TTL_SECONDS]
    for sid in expired:
        _SESSIONS.pop(sid, None)


def _get_record(session_id: str) -> dict:
    _purge_expired()
    session = _SESSIONS.get(session_id)
    if session is None:
        raise KeyError("Sesión no encontrada o expirada. Vuelve a subir el archivo.")
    return session


def create_session(df: pd.DataFrame, filename: str) -> str:
    _purge_expired()
    session_id = uuid.uuid4().hex
    _SESSIONS[session_id] = {"df": df, "filename": filename, "created": time.time(), "mrsets": {}}
    return session_id


def get_df(session_id: str) -> pd.DataFrame:
    return _get_record(session_id)["df"]


def delete_session(session_id: str) -> None:
    _SESSIONS.pop(session_id, None)


def rename_column(session_id: str, old: str, new: str) -> None:
    session = _get_record(session_id)
    session["df"].rename(columns={old: new}, inplace=True)
    for mrset in session["mrsets"].values():
        mrset["variables"] = [new if v == old else v for v in mrset["variables"]]
        labels = mrset.get("variable_labels", {})
        if old in labels:
            labels[new] = labels.pop(old)


def set_column(session_id: str, name: str, series: pd.Series) -> None:
    session = _get_record(session_id)
    session["df"][name] = series


def relabel_column(session_id: str, var: str, mapping: dict[str, str]) -> None:
    session = _get_record(session_id)
    df = session["df"]

    def apply(v):
        if pd.isna(v):
            return v
        return mapping.get(str(v), str(v))

    df[var] = df[var].map(apply)


def upsert_mrset(session_id: str, name: str, definition: dict) -> None:
    session = _get_record(session_id)
    session["mrsets"][name] = definition


def delete_mrset(session_id: str, name: str) -> None:
    session = _get_record(session_id)
    session["mrsets"].pop(name, None)


def get_mrset(session_id: str, name: str) -> dict | None:
    session = _get_record(session_id)
    return session["mrsets"].get(name)


def list_mrsets(session_id: str) -> list[dict]:
    session = _get_record(session_id)
    return [{"name": name, **definition} for name, definition in session["mrsets"].items()]
