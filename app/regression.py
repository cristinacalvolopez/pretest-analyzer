"""Regresión lineal múltiple y logística sobre las variables del pretest.

Los predictores categóricos se codifican como variables dummy (una por
categoría salvo la de referencia). Por defecto la referencia es la
categoría más baja según el orden lógico de `stats.category_order`
(numérico, orden de código de Stata/SPSS, o alfabético); el usuario puede
indicar otra categoría de referencia por variable.
"""
import numpy as np
import pandas as pd
import statsmodels.api as sm

from .stats import category_order, classify_role


def _reference_category(series: pd.Series, override: str | None) -> tuple[str, list[str]]:
    labels = series.dropna().astype(str).unique().tolist()
    ordered = category_order(series, labels)
    if not ordered:
        raise ValueError("La variable no tiene categorías con datos.")
    if override is not None:
        if override not in ordered:
            raise ValueError(f'"{override}" no es una categoría válida.')
        return override, ordered
    return ordered[0], ordered


def _build_design(df: pd.DataFrame, independents: list[str], references: dict[str, str]) -> tuple[pd.DataFrame, list[dict]]:
    X = pd.DataFrame(index=df.index)
    meta: list[dict] = []
    for var in independents:
        series = df[var]
        if classify_role(series) == "numeric":
            X[var] = series.astype(float)
            meta.append({"variable": var, "type": "numeric", "column": var})
        else:
            ref, ordered = _reference_category(series, references.get(var))
            str_series = series.astype(str)
            for label in ordered:
                if label == ref:
                    continue
                col = f"{var}[{label}]"
                X[col] = (str_series == label).astype(float)
                meta.append(
                    {"variable": var, "type": "categorical", "category": label, "reference": ref, "column": col}
                )
    if X.shape[1] == 0:
        raise ValueError("No hay predictores válidos para el modelo.")
    return X, meta


def _format_coefficients(model, meta: list[dict], with_odds_ratio: bool) -> list[dict]:
    meta_by_col = {m["column"]: m for m in meta}
    rows = []
    for name in model.params.index:
        entry = meta_by_col.get(name)
        if name == "const":
            term = "Constante"
            variable = None
        elif entry is None:
            term = name
            variable = None
        elif entry["type"] == "numeric":
            term = entry["variable"]
            variable = entry["variable"]
        else:
            term = f'{entry["variable"]} = {entry["category"]} (ref: {entry["reference"]})'
            variable = entry["variable"]

        row = {
            "term": term,
            "variable": variable,
            "coef": float(model.params[name]),
            "std_err": float(model.bse[name]),
            "p_value": float(model.pvalues[name]),
            "significant_at_05": bool(model.pvalues[name] < 0.05),
        }
        if with_odds_ratio:
            row["odds_ratio"] = float(np.exp(model.params[name]))
        rows.append(row)
    return rows


def _validate_common(df: pd.DataFrame, dependent: str, independents: list[str]) -> pd.DataFrame:
    if dependent in independents:
        raise ValueError("La variable dependiente no puede ser también independiente.")
    if not independents:
        raise ValueError("Selecciona al menos una variable independiente.")

    sub = df[[dependent] + independents].dropna()
    n_predictors_upper_bound = sum(
        (df[v].nunique(dropna=True) - 1) if classify_role(df[v]) == "categorical" else 1 for v in independents
    )
    if sub.shape[0] < n_predictors_upper_bound + 2:
        raise ValueError(
            "No hay suficientes casos completos (sin valores perdidos en las variables elegidas) "
            "para estimar el modelo."
        )
    return sub


def run_linear(df: pd.DataFrame, dependent: str, independents: list[str], references: dict[str, str] | None = None) -> dict:
    references = references or {}
    if classify_role(df[dependent]) != "numeric":
        raise ValueError("La variable dependiente debe ser numérica continua para una regresión lineal.")

    sub = _validate_common(df, dependent, independents)
    y = sub[dependent].astype(float)
    X, meta = _build_design(sub, independents, references)
    X = sm.add_constant(X, has_constant="add")

    try:
        model = sm.OLS(y, X).fit()
    except Exception as e:
        raise ValueError(f"No se pudo estimar el modelo: {e}")

    return {
        "type": "linear",
        "dependent": dependent,
        "n": int(model.nobs),
        "r_squared": float(model.rsquared),
        "r_squared_adj": float(model.rsquared_adj),
        "f_statistic": float(model.fvalue) if model.fvalue is not None and not np.isnan(model.fvalue) else None,
        "f_p_value": float(model.f_pvalue) if model.f_pvalue is not None and not np.isnan(model.f_pvalue) else None,
        "coefficients": _format_coefficients(model, meta, with_odds_ratio=False),
    }


def run_logistic(df: pd.DataFrame, dependent: str, independents: list[str], references: dict[str, str] | None = None) -> dict:
    references = references or {}
    dep_series = df[dependent]
    if classify_role(dep_series) != "categorical":
        raise ValueError("La variable dependiente debe ser categórica para una regresión logística.")

    dep_labels = category_order(dep_series, dep_series.dropna().astype(str).unique().tolist())
    if len(dep_labels) != 2:
        raise ValueError("La regresión logística requiere una variable dependiente con exactamente 2 categorías.")
    dep_ref, dep_event = dep_labels[0], dep_labels[1]

    sub = _validate_common(df, dependent, independents)
    y = (sub[dependent].astype(str) == dep_event).astype(float)
    X, meta = _build_design(sub, independents, references)
    X = sm.add_constant(X, has_constant="add")

    try:
        model = sm.Logit(y, X).fit(disp=0)
    except Exception as e:
        raise ValueError(f"No se pudo estimar el modelo: {e}")

    return {
        "type": "logistic",
        "dependent": dependent,
        "dependent_reference": dep_ref,
        "dependent_event": dep_event,
        "n": int(model.nobs),
        "pseudo_r_squared": float(model.prsquared) if not np.isnan(model.prsquared) else None,
        "log_likelihood": float(model.llf),
        "coefficients": _format_coefficients(model, meta, with_odds_ratio=True),
    }
