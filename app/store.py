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


def create_session(df: pd.DataFrame, filename: str) -> str:
    _purge_expired()
    session_id = uuid.uuid4().hex
    _SESSIONS[session_id] = {"df": df, "filename": filename, "created": time.time()}
    return session_id


def get_df(session_id: str) -> pd.DataFrame:
    _purge_expired()
    session = _SESSIONS.get(session_id)
    if session is None:
        raise KeyError("Sesión no encontrada o expirada. Vuelve a subir el archivo.")
    return session["df"]


def delete_session(session_id: str) -> None:
    _SESSIONS.pop(session_id, None)
