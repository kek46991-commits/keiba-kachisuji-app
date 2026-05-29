# -*- coding: utf-8 -*-
"""競馬 勝ち筋解析システム - Streamlit アプリ"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from datetime import datetime

from engine import (
    COURSE_MAP,
    DISTANCES,
    TRACK_TYPES,
    WEATHER_OPTIONS,
    AnalysisResult,
    EnvironmentData,
    HorseEntry,
    PaddockData,
    analyze_horse,
    calc_box_tickets,
    generate_sample_horses,
)

# ページ設定
st.set_page_config(
    page_title="🏇 勝ち筋解析システム",
    page_icon="🏇",
    layout="wide",
    initial_sidebar_state="expanded",
)

# カスタムCSS
st.markdown(
    """
<style>
    .main-header {
        font-size: 2.2rem;
        font-weight: 700;
        color: #1a1a2e;
        text-align: center;
        padding: 0.5rem 0;
    }
    .sub-header {
        font-size: 1rem;
        color: #666;
        text-align: center;
        margin-bottom: 1.5rem;
    }
    .metric-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 1.2rem;
        border-radius: 12px;
        color: white;
        text-align: center;
        margin-bottom: 0.5rem;
    }
    .atsui {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        padding: 1rem;
        border-radius: 12px;
        color: white;
        font-weight: bold;
        text-align: center;
        font-size: 1.1rem;
        margin: 0.3rem 0;
    }
    .chuumoku {
        background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        padding: 1rem;
        border-radius: 12px;
        color: white;
        font-weight: bold;
        text-align: center;
        font-size: 1.1rem;
        margin: 0.3rem 0;
    }
    .stSlider > div > div > div {
        color: #667eea;
    }
</style>
""",
    unsafe_allow_html=True,
)


def init_session_state():
    if "horses" not in st.session_state:
        st.session_state.horses = generate_sample_horses(5)
    if "results" not in st.session_state:
        st.session_state.results = []


def render_sidebar() -> tuple[str, EnvironmentData]:
    """サイドバー: 開催場所 & 環境データ設定"""
    st.sidebar.markdown("## 🏟️ レース設定")

    location = st.sidebar.selectbox(
        "開催場所",
        list(COURSE_MAP.keys()),
        index=0,
    )

    course = COURSE_MAP[location]
    st.sidebar.caption(
        f"📐 コーナーR: {course['corner_r']} / "
        f"直線: {course['straight']}m / "
        f"坂: {'あり' if course['slope'] else 'なし'}"
    )

    st.sidebar.markdown("---")
    st.sidebar.markdown("## 🌤️ 環境データ")

    weather = st.sidebar.selectbox("天候", WEATHER_OPTIONS, index=0)
    temp = st.sidebar.slider("気温 (℃)", -5, 40, 22)
    humidity = st.sidebar.slider("湿度 (%)", 0, 100, 55)

    # 天候から含水率を自動設定
    weather_moisture = {"晴": 0.04, "曇": 0.06, "小雨": 0.10, "雨": 0.15, "大雨": 0.22}
    default_cond = weather_moisture.get(weather, 0.04)
    track_cond = st.sidebar.slider(
        "馬場含水率",
        0.00, 0.30, default_cond, 0.01,
        help="0.00=パンパンの良馬場, 0.30=不良",
    )
    track_type = st.sidebar.selectbox("馬場", TRACK_TYPES, index=0)
    distance = st.sidebar.selectbox("距離 (m)", DISTANCES, index=5)

    # 馬場状態ラベル
    if track_cond <= 0.05:
        baba_label = "良"
    elif track_cond <= 0.10:
        baba_label = "稍重"
    elif track_cond <= 0.18:
        baba_label = "重"
    else:
        baba_label = "不良"
    st.sidebar.info(f"馬場状態: **{baba_label}**")

    env = EnvironmentData(
        temp=temp,
        humidity=humidity,
        track_cond=track_cond,
        weather=weather,
        track_type=track_type,
        distance=distance,
    )
    return location, env


def render_horse_input():
    """馬データ入力セクション"""
    st.markdown("## 🐴 出走馬データ入力")

    col_ctrl1, col_ctrl2, col_ctrl3 = st.columns([1, 1, 2])
    with col_ctrl1:
        num_horses = st.number_input(
            "頭数", min_value=1, max_value=18, value=len(st.session_state.horses)
        )
    with col_ctrl2:
        if st.button("🎲 サンプル生成", use_container_width=True):
            st.session_state.horses = generate_sample_horses(num_horses)
            st.rerun()

    # 頭数の増減
    current = len(st.session_state.horses)
    if num_horses > current:
        for i in range(current, num_horses):
            st.session_state.horses.append(
                HorseEntry(umaban=i + 1, name=f"馬{i+1}", odds=10.0)
            )
    elif num_horses < current:
        st.session_state.horses = st.session_state.horses[:num_horses]

    # 入力テーブル
    for i, horse in enumerate(st.session_state.horses):
        with st.expander(
            f"馬番 {horse.umaban}: {horse.name or '(未入力)'} — オッズ {horse.odds}",
            expanded=False,
        ):
            c1, c2, c3 = st.columns(3)
            with c1:
                horse.umaban = st.number_input(
                    "馬番", 1, 18, horse.umaban, key=f"umaban_{i}"
                )
                horse.name = st.text_input("馬名", horse.name, key=f"name_{i}")
                horse.odds = st.number_input(
                    "オッズ", 1.0, 999.9, horse.odds, 0.1, key=f"odds_{i}"
                )

            with c2:
                st.markdown("**パドック指標**")
                horse.paddock.stride_angle_y = st.slider(
                    "後足ストライド（横振り幅）",
                    0.0, 1.0, horse.paddock.stride_angle_y, 0.01,
                    key=f"stride_{i}",
                    help="大きいほど推進力あり",
                )
                horse.paddock.bounce_factor = st.slider(
                    "弾み（ぴょこぴょこ度）",
                    0.0, 1.0, horse.paddock.bounce_factor, 0.01,
                    key=f"bounce_{i}",
                    help="寒い日に高いと好評価",
                )
                horse.paddock.coat_shine = st.slider(
                    "毛艶",
                    0.0, 1.0, horse.paddock.coat_shine, 0.01,
                    key=f"coat_{i}",
                    help="高いほど体調良好",
                )

            with c3:
                st.markdown("**状態指標**")
                horse.paddock.sweat_level = st.slider(
                    "発汗レベル",
                    0.0, 1.0, horse.paddock.sweat_level, 0.01,
                    key=f"sweat_{i}",
                    help="0.7超で過度な発汗（マイナス）",
                )
                horse.paddock.ear_movement = st.slider(
                    "耳の動き（集中度）",
                    0.0, 1.0, horse.paddock.ear_movement, 0.01,
                    key=f"ear_{i}",
                    help="高いほど集中している",
                )
                horse.paddock.after_poop_relax = st.checkbox(
                    "ボロ後リラックス検知",
                    horse.paddock.after_poop_relax,
                    key=f"poop_{i}",
                )


def render_results(results: list[AnalysisResult], location: str, env: EnvironmentData):
    """解析結果の表示"""
    st.markdown("---")
    st.markdown("## 📊 解析結果レポート")
    st.caption(
        f"{datetime.now().strftime('%Y/%m/%d %H:%M')} | "
        f"{COURSE_MAP[location]['label']} {env.distance}m {env.track_type} "
        f"({env.weather} / {env.temp}℃)"
    )

    # サマリーカード
    sorted_results = sorted(results, key=lambda r: r.expected_value, reverse=True)
    atsui = [r for r in sorted_results if r.expected_value >= 2.0]
    top = sorted_results[0] if sorted_results else None

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.metric("出走頭数", f"{len(results)}頭")
    with c2:
        st.metric("激アツ馬", f"{len(atsui)}頭")
    with c3:
        if top:
            st.metric("最高期待値", f"{top.expected_value:.2f}", f"馬番{top.umaban}")
    with c4:
        avg_ev = sum(r.expected_value for r in results) / len(results) if results else 0
        st.metric("平均期待値", f"{avg_ev:.2f}")

    # 激アツ馬のハイライト
    if atsui:
        st.markdown("### 🔥 勝ち筋候補")
        for r in atsui:
            if r.expected_value >= 3.0:
                st.markdown(
                    f'<div class="atsui">🔥 馬番{r.umaban} {r.name} — '
                    f'期待値 {r.expected_value:.2f} ({r.rating})</div>',
                    unsafe_allow_html=True,
                )
            else:
                st.markdown(
                    f'<div class="chuumoku">⭐ 馬番{r.umaban} {r.name} — '
                    f'期待値 {r.expected_value:.2f} ({r.rating})</div>',
                    unsafe_allow_html=True,
                )

    # 結果テーブル
    st.markdown("### 📋 全馬解析結果")
    df = pd.DataFrame(
        [
            {
                "馬番": r.umaban,
                "馬名": r.name,
                "オッズ": r.odds,
                "基礎点": r.base_score,
                "物理補正": r.physics_bonus,
                "状態補正": r.condition_bonus,
                "合計スコア": r.total_score,
                "勝率": f"{r.win_prob*100:.1f}%",
                "期待値": r.expected_value,
                "判定": r.rating,
            }
            for r in sorted_results
        ]
    )
    st.dataframe(
        df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "期待値": st.column_config.NumberColumn(format="%.2f"),
            "合計スコア": st.column_config.ProgressColumn(
                min_value=0, max_value=150, format="%.1f"
            ),
        },
    )

    # グラフ
    col_g1, col_g2 = st.columns(2)

    with col_g1:
        st.markdown("#### 期待値チャート")
        fig_ev = go.Figure()
        colors = [
            "#f5576c" if r.expected_value >= 3.0
            else "#4facfe" if r.expected_value >= 2.0
            else "#667eea" if r.expected_value >= 1.0
            else "#aaa"
            for r in sorted_results
        ]
        fig_ev.add_trace(
            go.Bar(
                x=[f"{r.umaban}. {r.name}" for r in sorted_results],
                y=[r.expected_value for r in sorted_results],
                marker_color=colors,
                text=[f"{r.expected_value:.2f}" for r in sorted_results],
                textposition="outside",
            )
        )
        fig_ev.add_hline(y=2.0, line_dash="dash", line_color="red",
                         annotation_text="高期待値ライン (2.0)")
        fig_ev.update_layout(
            yaxis_title="期待値", xaxis_title="", height=400,
            margin=dict(t=30, b=80),
        )
        st.plotly_chart(fig_ev, use_container_width=True)

    with col_g2:
        st.markdown("#### スコア内訳")
        fig_stack = go.Figure()
        labels = [f"{r.umaban}. {r.name}" for r in sorted_results]
        fig_stack.add_trace(go.Bar(
            name="基礎点", x=labels,
            y=[r.base_score for r in sorted_results],
            marker_color="#667eea",
        ))
        fig_stack.add_trace(go.Bar(
            name="物理補正", x=labels,
            y=[r.physics_bonus for r in sorted_results],
            marker_color="#764ba2",
        ))
        fig_stack.add_trace(go.Bar(
            name="状態補正", x=labels,
            y=[r.condition_bonus for r in sorted_results],
            marker_color="#f093fb",
        ))
        fig_stack.update_layout(
            barmode="stack", yaxis_title="スコア",
            height=400, margin=dict(t=30, b=80),
        )
        st.plotly_chart(fig_stack, use_container_width=True)

    # 詳細分析
    st.markdown("### 🔍 詳細分析")
    for r in sorted_results:
        with st.expander(
            f"馬番{r.umaban} {r.name} — {r.rating} (EV: {r.expected_value:.2f})"
        ):
            for d in r.details:
                st.markdown(f"- {d}")
            st.markdown(
                f"**合計スコア: {r.total_score:.1f} / 150 → "
                f"推定勝率: {r.win_prob*100:.1f}% × オッズ{r.odds} = "
                f"期待値 {r.expected_value:.2f}**"
            )


def render_box_calculator(results: list[AnalysisResult]):
    """ボックス買い目計算機"""
    st.markdown("---")
    st.markdown("## 🎰 ボックス買い目計算機")

    col1, col2 = st.columns(2)
    with col1:
        bet_type = st.selectbox(
            "馬券種別",
            ["三連単", "三連複", "馬連", "馬単", "ワイド"],
        )
    with col2:
        unit_price = st.number_input(
            "1点あたりの金額 (円)", 100, 100000, 100, 100
        )

    # 馬の選択
    if results:
        sorted_r = sorted(results, key=lambda r: r.expected_value, reverse=True)
        default_selected = [
            r.umaban for r in sorted_r if r.expected_value >= 1.5
        ][:5]

        selected = st.multiselect(
            "ボックスに含める馬番",
            [r.umaban for r in sorted_r],
            default=default_selected,
            format_func=lambda u: next(
                (f"{r.umaban}. {r.name} (EV:{r.expected_value:.2f})"
                 for r in sorted_r if r.umaban == u),
                str(u),
            ),
        )
    else:
        selected = st.multiselect("ボックスに含める馬番", list(range(1, 19)))

    n = len(selected)
    tickets = calc_box_tickets(n, bet_type)
    total_cost = tickets * unit_price

    c1, c2, c3 = st.columns(3)
    with c1:
        st.metric("選択頭数", f"{n}頭")
    with c2:
        st.metric("買い目点数", f"{tickets}点")
    with c3:
        st.metric("合計投資額", f"¥{total_cost:,}")

    if tickets > 0:
        # 点数テーブル参考
        st.markdown("#### 📝 頭数別点数表")
        ref_data = []
        for h in range(2, min(n + 3, 11)):
            for bt in ["三連単", "三連複", "馬連", "馬単", "ワイド"]:
                t = calc_box_tickets(h, bt)
                if t > 0:
                    ref_data.append({"頭数": h, "馬券種": bt, "点数": t,
                                     "投資額": f"¥{t * unit_price:,}"})
        if ref_data:
            st.dataframe(
                pd.DataFrame(ref_data),
                use_container_width=True,
                hide_index=True,
            )


def main():
    init_session_state()

    st.markdown('<div class="main-header">🏇 勝ち筋解析システム</div>', unsafe_allow_html=True)
    st.markdown(
        '<div class="sub-header">かずさん理論 × 物理統計 — パドック解析で期待値を最大化</div>',
        unsafe_allow_html=True,
    )

    location, env = render_sidebar()

    # タブ
    tab1, tab2, tab3 = st.tabs(["📝 馬データ入力", "📊 解析結果", "🎰 買い目計算"])

    with tab1:
        render_horse_input()

    # 解析実行ボタン
    st.sidebar.markdown("---")
    if st.sidebar.button("🚀 解析実行", use_container_width=True, type="primary"):
        results = []
        for horse in st.session_state.horses:
            r = analyze_horse(horse, env, location)
            results.append(r)
        st.session_state.results = results

    with tab2:
        if st.session_state.results:
            render_results(st.session_state.results, location, env)
        else:
            st.info("サイドバーの「🚀 解析実行」ボタンを押して解析を開始してください。")

    with tab3:
        render_box_calculator(st.session_state.results)


if __name__ == "__main__":
    main()
