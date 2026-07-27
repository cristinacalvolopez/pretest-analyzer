"""Lectura de datasets de pretest en xlsx, Stata (.dta) y SPSS (.sav)."""
import io
import os
import tempfile

import pandas as pd
import pyreadstat

SUPPORTED_EXTENSIONS = (".xlsx", ".xls", ".dta", ".sav")


def read_dataset(filename: str, content: bytes) -> pd.DataFrame:
    name = filename.lower()
    buf = io.BytesIO(content)

    if name.endswith((".xlsx", ".xls")):
        df = pd.read_excel(buf)
    elif name.endswith(".dta"):
        df = pd.read_stata(buf, convert_categoricals=True)
    elif name.endswith(".sav"):
        # pyreadstat necesita una ruta de archivo real, no acepta un buffer en memoria.
        fd, tmp_path = tempfile.mkstemp(suffix=".sav")
        try:
            with os.fdopen(fd, "wb") as tmp:
                tmp.write(content)
            df, _meta = pyreadstat.read_sav(tmp_path, apply_value_formats=True)
        finally:
            os.unlink(tmp_path)
    else:
        raise ValueError(
            "Formato no soportado. Sube un archivo .xlsx, .xls, .dta o .sav."
        )

    df.columns = [str(c) for c in df.columns]
    return df
