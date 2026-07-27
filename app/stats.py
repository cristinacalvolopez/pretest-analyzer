"""Estadística descriptiva básica y tablas cruzadas con chi-cuadrado."""
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

CATEGORICAL_MAX_UNIQUE = 10


def classify_role(series: pd.Series) -> str:
    """Clasifica una variable como 'numeric' o 'categorical'.

    Numéricas con pocos valores distintos (p. ej. escalas Likert) se tratan
    como categóricas, que es lo útil para tablas de frecuencias y chi-cuadrado.
    """
    if pd.api.types.is_bool_dtype(series):
        return "categorical"
    if pd.api.types.is_numeric_dtype(series):
        if series.nunique(dropna=True) > CATEGORICAL_MAX_UNIQUE:
            return "numeric"
    return "categorical"


def variable_summary(df: pd.DataFrame) -> list[dict]:
    out = []
    for col in df.columns:
        s = df[col]
        out.append(
            {
                "name": col,
                "role": classify_role(s),
                "dtype": str(s.dtype),
                "n": int(s.shape[0]),
                "n_missing": int(s.isna().sum()),
                "n_unique": int(s.nunique(dropna=True)),
            }
        )
    return out


def describe_numeric(series: pd.Series) -> dict:
    n = int(series.shape[0])
    missing = int(series.isna().sum())
    clean = series.dropna().astype(float)

    if clean.empty:
        return {
            "role": "numeric",
            "stats": {"n": n, "missing": missing},
            "histogram": {"bin_edges": [], "counts": []},
        }

    stats_dict = {
        "n": n,
        "missing": missing,
        "mean": float(clean.mean()),
        "sd": float(clean.std()) if len(clean) > 1 else 0.0,
        "min": float(clean.min()),
        "p25": float(clean.quantile(0.25)),
        "median": float(clean.median()),
        "p75": float(clean.quantile(0.75)),
        "max": float(clean.max()),
    }

    n_bins = min(10, max(3, int(np.sqrt(len(clean)))))
    counts, bin_edges = np.histogram(clean, bins=n_bins)

    return {
        "role": "numeric",
        "stats": stats_dict,
        "histogram": {
            "bin_edges": [float(x) for x in bin_edges],
            "counts": [int(c) for c in counts],
        },
    }


def describe_categorical(series: pd.Series) -> dict:
    n = int(series.shape[0])
    missing = int(series.isna().sum())
    vc = series.dropna().astype(str).value_counts()
    total = int(vc.sum())

    frequencies = [
        {
            "label": str(label),
            "count": int(count),
            "pct": (float(count) / total * 100) if total else 0.0,
        }
        for label, count in vc.items()
    ]

    return {
        "role": "categorical",
        "stats": {"n": n, "missing": missing, "n_unique": int(series.nunique(dropna=True))},
        "frequencies": frequencies,
    }


def crosstab_chi2(df: pd.DataFrame, var1: str, var2: str) -> dict:
    sub = df[[var1, var2]].dropna()
    s1 = sub[var1].astype(str)
    s2 = sub[var2].astype(str)
    table = pd.crosstab(s1, s2)

    if table.shape[0] < 2 or table.shape[1] < 2:
        raise ValueError(
            "Cada variable necesita al menos 2 categorías con datos para calcular chi-cuadrado."
        )

    chi2, p_value, dof, expected = scipy_stats.chi2_contingency(table)
    n = table.values.sum()
    min_dim = min(table.shape) - 1
    cramers_v = float(np.sqrt((chi2 / n) / min_dim)) if min_dim > 0 and n > 0 else 0.0

    return {
        "var1": var1,
        "var2": var2,
        "row_labels": [str(x) for x in table.index.tolist()],
        "col_labels": [str(x) for x in table.columns.tolist()],
        "table": table.values.tolist(),
        "row_totals": table.sum(axis=1).tolist(),
        "col_totals": table.sum(axis=0).tolist(),
        "total": int(n),
        "chi2": {
            "statistic": float(chi2),
            "dof": int(dof),
            "p_value": float(p_value),
            "significant_at_05": bool(p_value < 0.05),
        },
        "cramers_v": cramers_v,
        "expected": [[float(v) for v in row] for row in expected],
        "low_expected_warning": bool((expected < 5).any()),
    }


def recode_numeric(series: pd.Series, rules: list[dict], other_label: str | None) -> pd.Series:
    """Recodifica una variable numérica en categorías a partir de rangos [min, max].

    Las reglas se evalúan en orden y gana la primera que encaje (min/max son
    inclusivos; None significa "sin límite" por ese lado). Los valores
    perdidos del origen siguen siendo perdidos en el resultado.
    """
    values = series.astype(float)
    result = pd.Series([None] * len(series), index=series.index, dtype=object)
    unmatched = pd.Series(True, index=series.index)

    for rule in rules:
        lo, hi, label = rule.get("min"), rule.get("max"), rule["label"]
        mask = unmatched & values.notna()
        if lo is not None:
            mask &= values >= lo
        if hi is not None:
            mask &= values <= hi
        result[mask] = label
        unmatched &= ~mask

    if other_label:
        result[unmatched & values.notna()] = other_label

    return result


def recode_categorical(series: pd.Series, rules: list[dict], other_label: str | None) -> pd.Series:
    """Recodifica una variable categórica agrupando valores originales bajo nuevas etiquetas."""
    mapping: dict[str, str] = {}
    for rule in rules:
        label = rule["label"]
        for v in rule["values"]:
            mapping[str(v)] = label

    def map_value(v):
        if pd.isna(v):
            return None
        key = str(v)
        if key in mapping:
            return mapping[key]
        return other_label if other_label else key

    return series.map(map_value)
