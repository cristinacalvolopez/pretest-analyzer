"""Lectura de datasets de pretest en xlsx, Stata (.dta) y SPSS (.sav)."""
import io
import os
import tempfile

import pandas as pd
import pyreadstat

SUPPORTED_EXTENSIONS = (".xlsx", ".xls", ".dta", ".sav")


def _dedupe_value_labels(mapping: dict[float, str]) -> dict[float, str]:
    """Si dos códigos comparten el mismo texto de etiqueta (p. ej. dos
    códigos distintos ambos etiquetados "Ninguna de las anteriores"), pandas
    no puede construir un Categorical porque las categorías deben ser
    únicas. Distinguimos las repetidas añadiendo el código entre paréntesis.
    """
    text_counts: dict[str, int] = {}
    for text in mapping.values():
        text_counts[text] = text_counts.get(text, 0) + 1
    return {
        code: (f"{text} ({code:g})" if text_counts[text] > 1 else text)
        for code, text in mapping.items()
    }


def _apply_stata_value_labels(df: pd.DataFrame, value_labels_by_var: dict[str, dict[float, str]]) -> pd.DataFrame:
    """Aplica a mano las etiquetas de valor de Stata cuando pandas no puede
    hacerlo automáticamente (etiquetas repetidas dentro del mismo conjunto).
    Los códigos sin etiqueta conocida conservan su valor numérico original.
    """
    for col, mapping in value_labels_by_var.items():
        if col not in df.columns or not mapping:
            continue
        safe_mapping = _dedupe_value_labels(mapping)
        code_by_text = {text: code for code, text in safe_mapping.items()}
        mapped = df[col].map(lambda v: safe_mapping.get(v, v))
        cat = pd.Categorical(mapped)

        def sort_key(value, code_by_text=code_by_text):
            if value in code_by_text:
                return (0, code_by_text[value])
            try:
                return (0, float(value))
            except (TypeError, ValueError):
                return (1, str(value))

        df[col] = cat.reorder_categories(sorted(cat.categories, key=sort_key))
    return df


def read_dataset(filename: str, content: bytes) -> tuple[pd.DataFrame, dict[str, str]]:
    """Lee el dataset y devuelve (dataframe, etiquetas descriptivas de variable).

    Stata y SPSS pueden traer una etiqueta descriptiva por variable, distinta
    del nombre técnico de columna (p. ej. columna "p3", etiqueta "Edad del
    encuestado"); para xlsx no existe ese concepto, así que la etiqueta
    coincide con el nombre de columna.
    """
    name = filename.lower()
    buf = io.BytesIO(content)

    if name.endswith((".xlsx", ".xls")):
        df = pd.read_excel(buf)
        labels = {col: str(col) for col in df.columns}
    elif name.endswith(".dta"):
        reader = pd.io.stata.StataReader(buf)
        try:
            df = reader.read(convert_categoricals=True)
        except ValueError as e:
            if "are not unique" not in str(e):
                raise
            # Alguna variable usa un conjunto de etiquetas de valor con texto
            # repetido para códigos distintos; pandas no puede convertirlo
            # automáticamente. Releemos sin conversión automática y aplicamos
            # las etiquetas nosotros mismos, distinguiendo las repetidas.
            buf.seek(0)
            reader = pd.io.stata.StataReader(buf)
            df = reader.read(convert_categoricals=False)
            # value_labels() está indexado por el nombre del CONJUNTO de
            # etiquetas (asignado con "label values"), que no siempre
            # coincide con el nombre de la variable; _lbllist asocia cada
            # columna (por posición) con el conjunto que usa.
            value_labels_by_set = reader.value_labels()
            col_to_labelset = dict(zip(df.columns, getattr(reader, "_lbllist", [])))
            value_labels_by_var = {
                col: value_labels_by_set[labelset]
                for col, labelset in col_to_labelset.items()
                if labelset in value_labels_by_set
            }
            df = _apply_stata_value_labels(df, value_labels_by_var)
        raw_labels = reader.variable_labels()
        labels = {col: (raw_labels.get(col) or str(col)) for col in df.columns}
    elif name.endswith(".sav"):
        # pyreadstat necesita una ruta de archivo real, no acepta un buffer en memoria.
        fd, tmp_path = tempfile.mkstemp(suffix=".sav")
        try:
            with os.fdopen(fd, "wb") as tmp:
                tmp.write(content)
            # formats_as_ordered_category=True conserva el orden original de los
            # códigos de valor (p. ej. 1=Bajo, 2=Medio, 3=Alto); sin este flag
            # pandas reordena las categorías alfabéticamente.
            df, meta = pyreadstat.read_sav(
                tmp_path, apply_value_formats=True, formats_as_ordered_category=True
            )
        finally:
            os.unlink(tmp_path)
        raw_labels = dict(zip(meta.column_names, meta.column_labels))
        labels = {col: (raw_labels.get(col) or str(col)) for col in df.columns}
    else:
        raise ValueError(
            "Formato no soportado. Sube un archivo .xlsx, .xls, .dta o .sav."
        )

    df.columns = [str(c) for c in df.columns]
    labels = {str(k): str(v) for k, v in labels.items()}
    return df, labels
