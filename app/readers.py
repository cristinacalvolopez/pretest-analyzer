"""Lectura de datasets de pretest en xlsx, Stata (.dta) y SPSS (.sav)."""
import io
import os
import tempfile

import pandas as pd
import pyreadstat

SUPPORTED_EXTENSIONS = (".xlsx", ".xls", ".dta", ".sav")


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
        df = reader.read(convert_categoricals=True)
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
