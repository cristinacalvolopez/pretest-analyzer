"""Conjuntos de respuesta múltiple al estilo SPSS ($mrsets).

Dos tipos:
- "dichotomy": cada variable del conjunto representa una opción, con un valor
  que indica que fue seleccionada (p. ej. media_tv = "1" si se marcó TV).
- "category": varias variables comparten el mismo dominio de categorías
  (p. ej. primera_opcion, segunda_opcion, tercera_opcion) y se cuentan todas
  las respuestas juntas.

El resumen replica la tabla de frecuencias de respuesta múltiple de SPSS:
N y % de respuestas, y % de casos (sobre encuestados con alguna respuesta).
"""
import pandas as pd

from . import stats as statsmod


def build_dichotomy_summary(
    df: pd.DataFrame, variables: list[str], variable_labels: dict[str, str], dichotomy_value: str
) -> dict:
    dv = str(dichotomy_value)
    selected = pd.DataFrame({v: df[v].astype(str) == dv for v in variables})
    counts = selected.sum(axis=0)
    n_responses = int(counts.sum())
    n_cases = int(selected.any(axis=1).sum())

    categories = []
    for v in variables:
        count = int(counts[v])
        categories.append(
            {
                "variable": v,
                "label": variable_labels.get(v, v),
                "count": count,
                "pct_responses": (count / n_responses * 100) if n_responses else 0.0,
                "pct_cases": (count / n_cases * 100) if n_cases else 0.0,
            }
        )
    categories.sort(key=lambda c: -c["count"])

    return {"type": "dichotomy", "n_responses": n_responses, "n_cases": n_cases, "categories": categories}


def build_category_summary(df: pd.DataFrame, variables: list[str]) -> dict:
    parts = [df[v].dropna().astype(str) for v in variables]
    stacked = pd.concat(parts, axis=0) if parts else pd.Series(dtype=object)
    vc = stacked.value_counts()

    n_responses = int(vc.sum())
    n_cases = int(df[variables].notna().any(axis=1).sum())

    ref_series = df[variables[0]] if variables else pd.Series(dtype=object)
    ordered_labels = statsmod.category_order(ref_series, list(vc.index))

    categories = [
        {
            "variable": None,
            "label": label,
            "count": int(vc[label]),
            "pct_responses": (float(vc[label]) / n_responses * 100) if n_responses else 0.0,
            "pct_cases": (float(vc[label]) / n_cases * 100) if n_cases else 0.0,
        }
        for label in ordered_labels
    ]

    return {"type": "category", "n_responses": n_responses, "n_cases": n_cases, "categories": categories}


def build_summary(df: pd.DataFrame, mrset: dict) -> dict:
    if mrset["type"] == "dichotomy":
        return build_dichotomy_summary(
            df, mrset["variables"], mrset.get("variable_labels", {}), mrset["dichotomy_value"]
        )
    return build_category_summary(df, mrset["variables"])
