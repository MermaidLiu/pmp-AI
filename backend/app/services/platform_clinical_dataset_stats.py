"""Real statistical analysis for imported clinical datasets."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    cohen_kappa_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.ensemble import RandomForestClassifier

try:
    import statsmodels.api as sm
except ImportError:  # pragma: no cover
    sm = None

try:
    from lifelines import CoxPHFitter, KaplanMeierFitter
    from lifelines.statistics import logrank_test
except ImportError:  # pragma: no cover
    CoxPHFitter = None
    KaplanMeierFitter = None
    logrank_test = None


def _fmt_p(p: float) -> str:
    if p < 0.001:
        return "< 0.001"
    if p < 0.01:
        return f"{p:.3f}"
    return f"{p:.3f}"


def _sig(p: float) -> str:
    if p < 0.001:
        return "***"
    if p < 0.01:
        return "**"
    if p < 0.05:
        return "*"
    return "ns"


def _build_frame(rows: list[dict[str, str]], variables: list[dict[str, str]]) -> pd.DataFrame:
    cols = [v["name"] for v in variables if v.get("type") != "file" and not v.get("skipped")]
    data = [{c: (r.get(c) or "").strip() for c in cols} for r in rows]
    df = pd.DataFrame(data)
    for v in variables:
        name = v["name"]
        if name not in df.columns:
            continue
        if v.get("type") == "numerical":
            df[name] = pd.to_numeric(df[name], errors="coerce")
        elif v.get("type") == "date":
            df[name] = pd.to_datetime(df[name], errors="coerce")
    return df


def _numeric_cols(df: pd.DataFrame, variables: list[dict[str, str]], names: list[str] | None = None) -> list[str]:
    allowed = {v["name"] for v in variables if v.get("type") == "numerical"}
    if names:
        return [n for n in names if n in allowed and n in df.columns]
    return [c for c in df.columns if c in allowed]


def _cat_cols(df: pd.DataFrame, variables: list[dict[str, str]], names: list[str] | None = None) -> list[str]:
    allowed = {v["name"] for v in variables if v.get("type") in ("categorical", "text")}
    if names:
        return [n for n in names if n in allowed and n in df.columns]
    return [c for c in df.columns if c in allowed]


def _apply_filters(df: pd.DataFrame, filters: dict[str, list[str]] | None) -> pd.DataFrame:
    if not filters:
        return df
    result = df
    for var, values in filters.items():
        if var not in result.columns or not values:
            continue
        allowed = {str(v).strip() for v in values if str(v).strip()}
        if not allowed:
            continue
        result = result[result[var].astype(str).str.strip().isin(allowed)]
    if result.empty:
        raise ValueError("筛选后无有效样本，请放宽筛选条件")
    return result


def _filter_body_rows(body: dict[str, Any]) -> dict[str, Any]:
    filters = body.get("filter_criteria") or {}
    if not filters:
        return body
    rows = body.get("rows") or []
    variables = body.get("variables") or []
    df = _apply_filters(_build_frame(rows, variables), filters)
    new_rows: list[dict[str, str]] = []
    for _, row in df.iterrows():
        new_rows.append({col: "" if pd.isna(row[col]) else str(row[col]).strip() for col in df.columns})
    return {**body, "rows": new_rows}


def _encode_predictors(x_df: pd.DataFrame) -> pd.DataFrame:
    out = x_df.copy()
    for col in out.columns:
        if out[col].dtype == object:
            out[col] = out[col].astype("category").cat.codes
        out[col] = pd.to_numeric(out[col], errors="coerce")
    return out


def _univariate_screen(
    y: pd.Series,
    x_df: pd.DataFrame,
    p_threshold: float,
    *,
    binary_y: pd.Series | None = None,
) -> list[str]:
    selected: list[str] = []
    for col in x_df.columns:
        sub = pd.concat([y, x_df[col]], axis=1).dropna()
        if len(sub) < 3:
            continue
        if binary_y is not None and sm is not None:
            by = binary_y.loc[sub.index]
            x = sm.add_constant(sub[col])
            try:
                model = sm.Logit(by, x).fit(disp=0)
                p = float(model.pvalues.iloc[-1])
            except Exception:
                continue
        elif sm is not None:
            x = sm.add_constant(sub[col])
            try:
                model = sm.OLS(sub.iloc[:, 0], x).fit()
                p = float(model.pvalues.iloc[-1])
            except Exception:
                continue
        else:
            continue
        if p <= p_threshold:
            selected.append(col)
    return selected


def _model_pvalues_ols(y: pd.Series, x_df: pd.DataFrame, included: list[str]) -> dict[str, float]:
    if sm is None or not included:
        return {}
    sub = x_df[included]
    mask = y.notna() & sub.notna().all(axis=1)
    if mask.sum() < len(included) + 2:
        return {}
    model = sm.OLS(y[mask], sm.add_constant(sub[mask])).fit()
    return {name: float(model.pvalues[name]) for name in included if name in model.pvalues}


def _candidate_pvalue_ols(y: pd.Series, x_df: pd.DataFrame, included: list[str], candidate: str) -> float | None:
    if sm is None:
        return None
    trial = included + [candidate]
    sub = x_df[trial]
    mask = y.notna() & sub.notna().all(axis=1)
    if mask.sum() < len(trial) + 2:
        return None
    try:
        model = sm.OLS(y[mask], sm.add_constant(sub[mask])).fit()
        return float(model.pvalues[candidate])
    except Exception:
        return None


def _select_predictors(
    y: pd.Series,
    x_df: pd.DataFrame,
    candidates: list[str],
    *,
    p_threshold: float,
    selection_method: str,
    univariate_screen: bool,
    binary_y: pd.Series | None = None,
) -> list[str]:
    pool = [c for c in candidates if c in x_df.columns]
    if not pool:
        return []
    if univariate_screen:
        pool = _univariate_screen(y, x_df[pool], p_threshold, binary_y=binary_y)
        if not pool:
            raise ValueError(f"单因素筛选后无变量满足 P<{p_threshold}")
    method = (selection_method or "none").lower()
    if method in ("none", ""):
        return pool
    if method == "lasso":
        from sklearn.linear_model import LassoCV
        from sklearn.preprocessing import StandardScaler

        sub = x_df[pool]
        mask = y.notna() & sub.notna().all(axis=1)
        if mask.sum() < 5:
            return pool[: min(3, len(pool))]
        X = StandardScaler().fit_transform(sub[mask].fillna(sub[mask].median()))
        target = binary_y.loc[mask].values if binary_y is not None else y[mask].values
        lasso = LassoCV(cv=min(5, int(mask.sum())), random_state=42, max_iter=5000).fit(X, target)
        picked = [c for c, coef in zip(pool, lasso.coef_) if abs(coef) > 1e-8]
        return picked or pool[:1]

    if sm is None:
        return pool

    included: list[str] = []
    if method == "forward":
        while True:
            best_p = p_threshold
            best_var: str | None = None
            for cand in pool:
                if cand in included:
                    continue
                p = _candidate_pvalue_ols(y, x_df, included, cand)
                if p is not None and p <= best_p:
                    best_p = p
                    best_var = cand
            if best_var is None:
                break
            included.append(best_var)
        return included or pool[:1]

    # stepwise: forward + backward until stable
    while True:
        changed = False
        best_p = p_threshold
        best_var: str | None = None
        for cand in pool:
            if cand in included:
                continue
            p = _candidate_pvalue_ols(y, x_df, included, cand)
            if p is not None and p <= best_p:
                best_p = p
                best_var = cand
        if best_var is not None:
            included.append(best_var)
            changed = True
        pvals = _model_pvalues_ols(y, x_df, included)
        removed = False
        for var, p in sorted(pvals.items(), key=lambda x: -x[1]):
            if p > p_threshold and len(included) > 1:
                included.remove(var)
                changed = True
                removed = True
                break
        if not changed or (best_var is None and not removed):
            break
    return included or pool[:1]


def run_descriptive(rows: list[dict[str, str]], variables: list[dict[str, str]], selected: list[str]) -> dict[str, Any]:
    df = _build_frame(rows, variables)
    targets = selected or [v["name"] for v in variables if v.get("type") != "file"]
    out: list[dict[str, Any]] = []
    for name in targets:
        v = next((x for x in variables if x["name"] == name), None)
        if not v or v.get("type") == "file":
            continue
        series = df[name]
        non_null = series.dropna()
        n = int(non_null.shape[0])
        row: dict[str, Any] = {"variable": name, "n": n}
        if v.get("type") == "numerical":
            nums = non_null.astype(float)
            row.update(
                {
                    "type": "数值型",
                    "mean": round(float(nums.mean()), 4) if n else None,
                    "sd": round(float(nums.std(ddof=1)), 4) if n > 1 else None,
                    "median": round(float(nums.median()), 4) if n else None,
                    "min": round(float(nums.min()), 4) if n else None,
                    "max": round(float(nums.max()), 4) if n else None,
                }
            )
        elif v.get("type") == "date":
            row.update(
                {
                    "type": "日期型",
                    "min": str(non_null.min())[:10] if n else None,
                    "max": str(non_null.max())[:10] if n else None,
                }
            )
        else:
            vc = non_null.astype(str).value_counts()
            cats = " · ".join(f"{k}({int(c)})" for k, c in vc.head(8).items())
            row.update({"type": "分类型", "categories": cats or "—"})
        out.append(row)
    return {"rows": out, "summary": f"描述性统计 · {len(out)} 个变量 · n={len(df)}"}


def run_significance(
    rows: list[dict[str, str]],
    variables: list[dict[str, str]],
    selected: list[str],
    split_var: str | None,
    group_a: str | None = None,
    group_b: str | None = None,
) -> dict[str, Any]:
    df = _build_frame(rows, variables)
    if not split_var or split_var not in df.columns:
        raise ValueError("显著性分析需选择拆分维度（分类型变量）")
    groups = df[split_var].dropna().astype(str).unique().tolist()
    if len(groups) < 2:
        raise ValueError("拆分变量至少需要 2 个组")
    ga = group_a or groups[0]
    gb = group_b or groups[1]
    sub_a = df[df[split_var].astype(str) == ga]
    sub_b = df[df[split_var].astype(str) == gb]
    out: list[dict[str, Any]] = []
    targets = selected or _numeric_cols(df, variables) + _cat_cols(df, variables)
    for name in targets:
        if name == split_var:
            continue
        v = next((x for x in variables if x["name"] == name), None)
        if not v:
            continue
        if v.get("type") == "numerical":
            a = sub_a[name].dropna().astype(float)
            b = sub_b[name].dropna().astype(float)
            if len(a) < 2 or len(b) < 2:
                continue
            t_stat, p = stats.ttest_ind(a, b, equal_var=False, nan_policy="omit")
            out.append(
                {
                    "variable": name,
                    "test": "Welch t 检验",
                    "group1": f"{ga}: {a.mean():.3f} (n={len(a)})",
                    "group2": f"{gb}: {b.mean():.3f} (n={len(b)})",
                    "stat": round(float(t_stat), 4),
                    "pValue": _fmt_p(float(p)),
                    "sig": _sig(float(p)),
                }
            )
        elif v.get("type") in ("categorical", "text"):
            ct = pd.crosstab(df[split_var].astype(str), df[name].astype(str))
            if ct.shape[0] < 2 or ct.shape[1] < 2:
                continue
            chi2, p, _, _ = stats.chi2_contingency(ct)
            out.append(
                {
                    "variable": name,
                    "test": "卡方检验",
                    "group1": ga,
                    "group2": gb,
                    "stat": round(float(chi2), 4),
                    "pValue": _fmt_p(float(p)),
                    "sig": _sig(float(p)),
                }
            )
    return {"rows": out, "summary": f"显著性分析 · {ga} vs {gb} · {len(out)} 项检验"}


def run_correlation(
    rows: list[dict[str, str]], variables: list[dict[str, str]], selected: list[str]
) -> dict[str, Any]:
    df = _build_frame(rows, variables)
    cols = _numeric_cols(df, variables, selected or None)
    if len(cols) < 2:
        raise ValueError("相关性分析至少需要 2 个数值型变量")
    out: list[dict[str, Any]] = []
    for i, a in enumerate(cols):
        for b in cols[i + 1 :]:
            pair = df[[a, b]].dropna()
            if len(pair) < 3:
                continue
            r, p = stats.pearsonr(pair[a], pair[b])
            rho, p_s = stats.spearmanr(pair[a], pair[b])
            out.append(
                {
                    "var1": a,
                    "var2": b,
                    "pearson_r": round(float(r), 4),
                    "pearson_p": _fmt_p(float(p)),
                    "spearman_rho": round(float(rho), 4),
                    "spearman_p": _fmt_p(float(p_s)),
                    "n": len(pair),
                }
            )
    return {"rows": out, "summary": f"相关性分析 · Pearson / Spearman · {len(out)} 对"}


def run_roc(
    rows: list[dict[str, str]],
    variables: list[dict[str, str]],
    outcome_var: str,
    predictor: str,
    positive_class: str | None = None,
) -> dict[str, Any]:
    df = _build_frame(rows, variables)
    if outcome_var not in df.columns or predictor not in df.columns:
        raise ValueError("ROC 需要选择结局变量（分类型）与预测变量（数值型）")
    y_raw = df[outcome_var].dropna().astype(str)
    pos = positive_class or y_raw.value_counts().index[0]
    mask = df[outcome_var].notna() & df[predictor].notna()
    sub = df.loc[mask].copy()
    y = (sub[outcome_var].astype(str) == pos).astype(int).values
    x = sub[predictor].astype(float).values
    if len(np.unique(y)) < 2:
        raise ValueError("结局变量需为二分类")
    fpr, tpr, thresholds = roc_curve(y, x)
    auc = roc_auc_score(y, x)
    points = [{"fpr": round(float(a), 4), "tpr": round(float(b), 4)} for a, b in zip(fpr[:: max(1, len(fpr) // 20)], tpr[:: max(1, len(tpr) // 20)])]
    return {
        "auc": round(float(auc), 4),
        "outcome": outcome_var,
        "predictor": predictor,
        "positive_class": pos,
        "curve": points,
        "summary": f"ROC · AUC={auc:.3f} · {predictor} → {outcome_var}",
    }


def run_consistency(
    rows: list[dict[str, str]], variables: list[dict[str, str]], var_a: str, var_b: str
) -> dict[str, Any]:
    df = _build_frame(rows, variables)
    if var_a not in df.columns or var_b not in df.columns:
        raise ValueError("一致性检验需选择两个分类型变量")
    pair = df[[var_a, var_b]].dropna()
    if len(pair) < 2:
        raise ValueError("有效样本不足")
    kappa = cohen_kappa_score(pair[var_a].astype(str), pair[var_b].astype(str))
    return {
        "var_a": var_a,
        "var_b": var_b,
        "kappa": round(float(kappa), 4),
        "interpretation": "几乎一致" if kappa > 0.8 else "中等一致" if kappa > 0.4 else "一致性较弱",
        "n": len(pair),
        "summary": f"Cohen's κ = {kappa:.3f}",
    }


def run_multiple_regression(
    rows: list[dict[str, str]],
    variables: list[dict[str, str]],
    dependent: str,
    independents: list[str],
    *,
    p_threshold: float = 0.10,
    selection_method: str = "stepwise",
    univariate_screen: bool = False,
) -> dict[str, Any]:
    if sm is None:
        raise RuntimeError("statsmodels 未安装，无法运行多元回归")
    df = _build_frame(rows, variables)
    y = df[dependent].astype(float)
    x_df = _encode_predictors(df[independents])
    picked = _select_predictors(
        y,
        x_df,
        independents,
        p_threshold=p_threshold,
        selection_method=selection_method,
        univariate_screen=univariate_screen,
    )
    mask = y.notna() & x_df[picked].notna().all(axis=1)
    y = y[mask]
    x_df = x_df[picked][mask]
    if len(y) < len(picked) + 2:
        raise ValueError("样本量不足以进行多元回归")
    x = sm.add_constant(x_df)
    model = sm.OLS(y, x).fit()
    out = []
    for name, coef, se, p in zip(model.params.index, model.params, model.bse, model.pvalues):
        out.append(
            {
                "factor": name,
                "coef": round(float(coef), 4),
                "se": round(float(se), 4),
                "pValue": _fmt_p(float(p)),
                "sig": _sig(float(p)),
            }
        )
    sel_note = f" · 入选 {len(picked)} 变量" if selection_method != "none" or univariate_screen else ""
    return {
        "rows": out,
        "r_squared": round(float(model.rsquared), 4),
        "selected_predictors": picked,
        "p_threshold": p_threshold,
        "selection_method": selection_method,
        "summary": f"多元线性回归 · R²={model.rsquared:.3f} · n={len(y)}{sel_note}",
    }


def run_logistic_regression(
    rows: list[dict[str, str]],
    variables: list[dict[str, str]],
    outcome_var: str,
    independents: list[str],
    positive_class: str | None = None,
    *,
    p_threshold: float = 0.10,
    selection_method: str = "stepwise",
    univariate_screen: bool = False,
) -> dict[str, Any]:
    if sm is None:
        raise RuntimeError("statsmodels 未安装，无法运行逻辑回归")
    df = _build_frame(rows, variables)
    y_raw = df[outcome_var].dropna().astype(str)
    pos = positive_class or y_raw.value_counts().index[0]
    x_df = _encode_predictors(df[independents])
    y = df[outcome_var].astype(str)
    binary_y = (y == pos).astype(int)
    picked = _select_predictors(
        y,
        x_df,
        independents,
        p_threshold=p_threshold,
        selection_method=selection_method,
        univariate_screen=univariate_screen,
        binary_y=binary_y,
    )
    work = pd.concat([x_df[picked], binary_y.rename("_y")], axis=1).dropna()
    if len(work) < len(picked) + 5:
        raise ValueError("样本量不足")
    y_fit = work["_y"].astype(int)
    x_fit = work[picked]
    if len(np.unique(y_fit)) < 2:
        raise ValueError("结局变量需为二分类")
    x = sm.add_constant(x_fit)
    model = sm.Logit(y_fit, x).fit(disp=0)
    out = []
    for name in picked:
        coef = float(model.params[name])
        p = float(model.pvalues[name])
        out.append(
            {
                "factor": name,
                "coef": round(coef, 4),
                "odds_ratio": round(float(math.exp(coef)), 4),
                "pValue": _fmt_p(p),
                "sig": _sig(p),
            }
        )
    pred = (model.predict(x) >= 0.5).astype(int)
    acc = accuracy_score(y_fit, pred)
    sel_note = f" · 入选 {len(picked)} 变量" if selection_method != "none" or univariate_screen else ""
    return {
        "rows": out,
        "accuracy": round(float(acc), 4),
        "positive_class": pos,
        "selected_predictors": picked,
        "p_threshold": p_threshold,
        "selection_method": selection_method,
        "summary": f"逻辑回归 · 准确率={acc:.3f} · n={len(y_fit)}{sel_note}",
    }


def run_survival(
    rows: list[dict[str, str]],
    variables: list[dict[str, str]],
    time_var: str,
    event_var: str,
    split_var: str | None = None,
) -> dict[str, Any]:
    if KaplanMeierFitter is None:
        raise RuntimeError("lifelines 未安装，无法运行生存分析")
    df = _build_frame(rows, variables)
    work = df[[time_var, event_var] + ([split_var] if split_var else [])].copy()
    raw_time = work[time_var]
    work[time_var] = pd.to_numeric(raw_time, errors="coerce")
    if work[time_var].isna().all():
        dt = pd.to_datetime(raw_time, errors="coerce")
        work[time_var] = (dt - dt.min()).dt.days.astype(float)
    work[event_var] = work[event_var].astype(str).str.lower().isin(["1", "true", "是", "yes", "发生", "死亡", "进展"]).astype(int)
    work = work.dropna(subset=[time_var])
    curves: list[dict[str, Any]] = []
    if split_var and split_var in work.columns:
        groups = work[split_var].dropna().astype(str).unique().tolist()
        for g in groups[:4]:
            sub = work[work[split_var].astype(str) == g]
            kmf = KaplanMeierFitter()
            kmf.fit(sub[time_var], sub[event_var], label=str(g))
            surv = kmf.survival_function_.reset_index()
            curves.append(
                {
                    "group": str(g),
                    "points": [{"time": float(r["timeline"]), "survival": float(r[str(g)])} for _, r in surv.iloc[:: max(1, len(surv) // 30)].iterrows()],
                }
            )
        if len(groups) >= 2 and logrank_test:
            a = work[work[split_var].astype(str) == groups[0]]
            b = work[work[split_var].astype(str) == groups[1]]
            lr = logrank_test(a[time_var], b[time_var], a[event_var], b[event_var])
            p = float(lr.p_value)
            summary = f"KM 生存曲线 · Log-rank p={_fmt_p(p)}"
        else:
            p = None
            summary = "KM 生存曲线"
    else:
        kmf = KaplanMeierFitter()
        kmf.fit(work[time_var], work[event_var])
        surv = kmf.survival_function_.reset_index()
        curves.append(
            {
                "group": "全部",
                "points": [{"time": float(r["timeline"]), "survival": float(r["KM_estimate"])} for _, r in surv.iloc[:: max(1, len(surv) // 30)].iterrows()],
            }
        )
        p = None
        summary = f"KM 生存曲线 · n={len(work)}"
    return {"curves": curves, "logrank_p": _fmt_p(p) if p is not None else None, "summary": summary}


def run_cox(
    rows: list[dict[str, str]],
    variables: list[dict[str, str]],
    time_var: str,
    event_var: str,
    covariates: list[str],
) -> dict[str, Any]:
    if CoxPHFitter is None:
        raise RuntimeError("lifelines 未安装，无法运行 Cox 回归")
    df = _build_frame(rows, variables)
    cols = [time_var, event_var] + covariates
    work = df[cols].copy()
    work[time_var] = pd.to_numeric(work[time_var], errors="coerce")
    work[event_var] = work[event_var].astype(str).str.lower().isin(["1", "true", "是", "yes", "发生", "死亡", "进展"]).astype(int)
    for c in covariates:
        if work[c].dtype == object:
            work[c] = work[c].astype("category").cat.codes
        work[c] = pd.to_numeric(work[c], errors="coerce")
    work = work.dropna()
    if len(work) < len(covariates) + 3:
        raise ValueError("样本量不足以进行 Cox 回归")
    cph = CoxPHFitter()
    cph.fit(work, duration_col=time_var, event_col=event_var)
    out = []
    for name in covariates:
        hr = float(math.exp(cph.params_[name]))
        p = float(cph.summary.loc[name, "p"])
        out.append({"factor": name, "hr": round(hr, 4), "pValue": _fmt_p(p), "sig": _sig(p)})
    return {"rows": out, "summary": f"Cox 比例风险回归 · n={len(work)}", "concordance": round(float(cph.concordance_index_), 4)}


def run_ml(
    rows: list[dict[str, str]],
    variables: list[dict[str, str]],
    feature_vars: list[str],
    outcome_var: str,
    model: str = "random_forest",
    positive_class: str | None = None,
    test_size: float = 0.3,
) -> dict[str, Any]:
    df = _build_frame(rows, variables)
    y_raw = df[outcome_var].dropna().astype(str)
    pos = positive_class or y_raw.value_counts().index[0]
    work = df[feature_vars + [outcome_var]].copy()
    num_cols = [c for c in feature_vars if c in _numeric_cols(df, variables)]
    cat_cols = [c for c in feature_vars if c in _cat_cols(df, variables)]
    preprocess = ColumnTransformer(
        transformers=[
            ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())]), num_cols),
            ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")), ("oh", OneHotEncoder(handle_unknown="ignore"))]), cat_cols),
        ]
    )
    y = (work[outcome_var].astype(str) == pos).astype(int)
    mask = y.notna()
    work = work.loc[mask]
    y = y.loc[mask]
    if len(np.unique(y)) < 2:
        raise ValueError("结局变量需为二分类")
    if len(y) < 10:
        raise ValueError("样本量至少 10 例才能训练模型")
    x_train, x_test, y_train, y_test = train_test_split(
        work[feature_vars], y, test_size=test_size, random_state=42, stratify=y if y.value_counts().min() >= 2 else None
    )
    if model == "logistic":
        clf = LogisticRegression(max_iter=2000)
    elif model in ("xgboost", "xgb"):
        try:
            from xgboost import XGBClassifier
        except ImportError as e:
            raise RuntimeError("xgboost 未安装，请运行 pip install xgboost") from e
        clf = XGBClassifier(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.1,
            random_state=42,
            eval_metric="logloss",
        )
    else:
        clf = RandomForestClassifier(n_estimators=200, random_state=42)
    pipe = Pipeline([("prep", preprocess), ("clf", clf)])
    pipe.fit(x_train, y_train)
    pred = pipe.predict(x_test)
    proba = pipe.predict_proba(x_test)[:, 1] if hasattr(pipe.named_steps["clf"], "predict_proba") else pred
    acc = accuracy_score(y_test, pred)
    auc = roc_auc_score(y_test, proba) if len(np.unique(y_test)) > 1 else None
    return {
        "model": model,
        "accuracy": round(float(acc), 4),
        "auc": round(float(auc), 4) if auc is not None else None,
        "train_n": len(x_train),
        "test_n": len(x_test),
        "positive_class": pos,
        "features": feature_vars,
        "summary": f"机器学习 · {model} · 准确率={acc:.3f}" + (f" · AUC={auc:.3f}" if auc else ""),
    }


def run_markov(
    rows: list[dict[str, str]],
    variables: list[dict[str, str]],
    state_var: str,
    from_state_var: str | None = None,
    patient_id_field: str | None = None,
    time_var: str | None = None,
) -> dict[str, Any]:
    df = _build_frame(rows, variables)
    if state_var not in df.columns:
        raise ValueError(f"未找到状态变量：{state_var}")

    transitions: list[tuple[str, str]] = []
    pid_col = patient_id_field or "患者ID"

    if from_state_var and from_state_var in df.columns:
        sub = df[[from_state_var, state_var]].dropna()
        for _, row in sub.iterrows():
            a = str(row[from_state_var]).strip()
            b = str(row[state_var]).strip()
            if a and b:
                transitions.append((a, b))
    elif pid_col in df.columns:
        sort_cols = [pid_col]
        if time_var and time_var in df.columns:
            sort_cols.append(time_var)
        sub = df.sort_values(sort_cols)
        for _, grp in sub.groupby(pid_col):
            states = [str(s).strip() for s in grp[state_var].dropna().tolist() if str(s).strip()]
            for i in range(len(states) - 1):
                transitions.append((states[i], states[i + 1]))
    else:
        raise ValueError("马尔可夫链需：① 起始状态 + 结束状态变量，或 ② 患者 ID + 状态变量（同一患者≥2 次观测）")

    if len(transitions) < 2:
        raise ValueError(f"有效状态转移仅 {len(transitions)} 条，不足以估计 CTMC 转移矩阵")

    states = sorted({a for a, _ in transitions} | {b for _, b in transitions})
    idx = {s: i for i, s in enumerate(states)}
    n = len(states)
    counts = np.zeros((n, n))
    for a, b in transitions:
        counts[idx[a], idx[b]] += 1

    rows_out: list[dict[str, Any]] = []
    for i, from_s in enumerate(states):
        row_sum = counts[i].sum()
        if row_sum <= 0:
            continue
        for j, to_s in enumerate(states):
            if counts[i, j] <= 0:
                continue
            prob = float(counts[i, j] / row_sum)
            rows_out.append(
                {
                    "factor": f"{from_s} → {to_s}",
                    "metric": round(prob, 4),
                    "pValue": "—",
                    "note": f"n={int(counts[i, j])}",
                    "sig": "",
                }
            )

    row_sums = counts.sum(axis=1, keepdims=True)
    P = np.divide(counts, row_sums, out=np.zeros_like(counts), where=row_sums > 0)
    steady_txt = ""
    if n > 0 and P.sum() > 0:
        try:
            eigvals, eigvecs = np.linalg.eig(P.T)
            ss_idx = int(np.argmin(np.abs(eigvals - 1)))
            ss = np.real(eigvecs[:, ss_idx])
            ss = np.where(ss < 0, -ss, ss)
            if ss.sum() > 0:
                ss = ss / ss.sum()
                steady_txt = " · ".join(f"{s} {ss[i] * 100:.0f}%" for i, s in enumerate(states))
        except Exception:
            steady_txt = ""

    mode = f"{from_state_var}→{state_var}" if from_state_var else f"纵向 {state_var}"
    return {
        "rows": rows_out,
        "steady_state": steady_txt,
        "n_transitions": len(transitions),
        "n_states": n,
        "summary": f"马尔可夫链 CTMC · {mode} · {len(transitions)} 次转移 · {n} 个状态",
    }


def run_arimax(
    rows: list[dict[str, str]],
    variables: list[dict[str, str]],
    dependent: str,
    independents: list[str],
    time_var: str | None = None,
    arima_order: list[int] | None = None,
) -> dict[str, Any]:
    try:
        from statsmodels.tsa.statespace.sarimax import SARIMAX
    except ImportError as e:
        raise RuntimeError("statsmodels 未安装 SARIMAX，无法运行 ARIMAX") from e

    order = tuple(arima_order or [1, 1, 1])
    if len(order) != 3:
        raise ValueError("arima_order 需为 [p, d, q]")

    df = _build_frame(rows, variables)
    if dependent not in df.columns:
        raise ValueError(f"未找到因变量：{dependent}")

    if time_var and time_var in df.columns:
        df = df.sort_values(time_var)

    y = pd.to_numeric(df[dependent], errors="coerce")
    exog_df = None
    if independents:
        exog_df = df[independents].apply(pd.to_numeric, errors="coerce")

    mask = y.notna()
    if exog_df is not None:
        mask &= exog_df.notna().all(axis=1)
    endog = y[mask].astype(float)
    exog = exog_df[mask].values if exog_df is not None else None

    min_n = sum(order) + len(independents) + 3
    if len(endog) < min_n and len(endog) >= 4:
        order = (1, 0, 0)
        min_n = 4
    if len(endog) < min_n:
        raise ValueError(f"时间序列长度 {len(endog)} 不足，ARIMAX{order} 至少需要 {min_n} 个观测")

    model = SARIMAX(
        endog,
        exog=exog,
        order=order,
        enforce_stationarity=False,
        enforce_invertibility=False,
    )
    res = model.fit(disp=False, maxiter=200)

    rows_out: list[dict[str, Any]] = []
    for name in res.params.index:
        coef = float(res.params[name])
        se = float(res.bse[name]) if name in res.bse.index else float("nan")
        p = float(res.pvalues[name]) if name in res.pvalues.index else float("nan")
        rows_out.append(
            {
                "factor": str(name),
                "coef": round(coef, 4),
                "se": round(se, 4) if np.isfinite(se) else None,
                "pValue": _fmt_p(p) if np.isfinite(p) else "—",
                "sig": _sig(p) if np.isfinite(p) else "",
            }
        )

    steps = min(6, max(1, len(endog) // 3))
    try:
        fc = res.forecast(steps=steps)
        forecast_txt = f"未来 {steps} 步预测均值={float(np.mean(fc)):.3f}"
    except Exception:
        forecast_txt = "预测步长不足，未生成外推"

    exog_note = f" · 外生变量 {len(independents)} 个" if independents else ""
    return {
        "rows": rows_out,
        "aic": round(float(res.aic), 2),
        "bic": round(float(res.bic), 2),
        "forecast": forecast_txt,
        "order": list(order),
        "summary": f"ARIMAX{order} · AIC={res.aic:.1f} · n={len(endog)}{exog_note}",
    }


def analyze_clinical_dataset(body: dict[str, Any]) -> dict[str, Any]:
    body = _filter_body_rows(body)
    analysis = body.get("analysis", "desc")
    rows = body.get("rows") or []
    variables = body.get("variables") or []
    selected = body.get("selected_vars") or []
    p_threshold = float(body.get("p_threshold") or 0.10)
    selection_method = str(body.get("selection_method") or "stepwise")
    univariate_screen = bool(body.get("univariate_screen"))

    if not rows:
        raise ValueError("数据集为空")

    if analysis == "desc":
        return run_descriptive(rows, variables, selected)
    if analysis == "sig":
        return run_significance(
            rows,
            variables,
            selected,
            body.get("split_var"),
            body.get("group_a"),
            body.get("group_b"),
        )
    if analysis == "corr":
        return run_correlation(rows, variables, selected)
    if analysis == "roc":
        return run_roc(
            rows,
            variables,
            body.get("outcome_var") or "",
            body.get("predictor") or (selected[0] if selected else ""),
            body.get("positive_class"),
        )
    if analysis == "consistency":
        vars_ = selected if len(selected) >= 2 else []
        if len(vars_) < 2:
            raise ValueError("一致性检验需选择两个变量")
        return run_consistency(rows, variables, vars_[0], vars_[1])
    if analysis == "multi_reg":
        return run_multiple_regression(
            rows,
            variables,
            body.get("dependent") or "",
            body.get("independents") or [],
            p_threshold=p_threshold,
            selection_method=selection_method,
            univariate_screen=univariate_screen,
        )
    if analysis == "logistic":
        return run_logistic_regression(
            rows,
            variables,
            body.get("outcome_var") or body.get("dependent") or "",
            body.get("independents") or [],
            body.get("positive_class"),
            p_threshold=p_threshold,
            selection_method=selection_method,
            univariate_screen=univariate_screen,
        )
    if analysis == "survival":
        return run_survival(
            rows,
            variables,
            body.get("time_var") or body.get("dependent") or "",
            body.get("event_var") or body.get("outcome_var") or "",
            body.get("split_var"),
        )
    if analysis == "cox":
        return run_cox(
            rows,
            variables,
            body.get("time_var") or "",
            body.get("event_var") or "",
            body.get("independents") or body.get("covariates") or [],
        )
    if analysis == "markov":
        return run_markov(
            rows,
            variables,
            body.get("state_var") or "",
            body.get("from_state_var"),
            body.get("patient_id_field"),
            body.get("time_var"),
        )
    if analysis == "arimax":
        order = body.get("arima_order") or [1, 1, 1]
        return run_arimax(
            rows,
            variables,
            body.get("dependent") or "",
            body.get("independents") or [],
            body.get("time_var"),
            order,
        )
    if analysis == "ml":
        return run_ml(
            rows,
            variables,
            body.get("feature_vars") or body.get("independents") or selected,
            body.get("outcome_var") or "",
            body.get("ml_model") or "random_forest",
            body.get("positive_class"),
            float(body.get("test_size") or 0.3),
        )
    raise ValueError(f"未知分析类型：{analysis}")
