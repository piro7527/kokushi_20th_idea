#!/usr/bin/env python3
"""
学習記録CSV統合スクリプト
- 複数のCSVファイルを読み込み
- 学籍番号順・日付順にソート
- 同一日・同一分野のデータを統合
"""

import pandas as pd
import glob
import os


def load_csv_files(directory: str) -> pd.DataFrame:
    """指定ディレクトリ内の入力CSVファイルを読み込んで結合"""
    # 入力ファイルのみを対象（出力ファイル「学習記録_統合」を除外）
    # csvDataフォルダ内のファイルを対象
    search_dir = os.path.join(directory, "csvData")
    csv_files = glob.glob(os.path.join(search_dir, "学習記録_フィルター済み_*.csv"))
    
    if not csv_files:
        print("CSVファイルが見つかりません")
        return pd.DataFrame()
    
    print(f"読み込みファイル数: {len(csv_files)}")
    for f in csv_files:
        print(f"  - {os.path.basename(f)}")
    
    dfs = []
    for file in csv_files:
        df = pd.read_csv(file, encoding='utf-8')
        # 氏名の正規化（スペース、タブ、アンダースコア、全角スペース、全角アンダースコアを除去）
        if '氏名' in df.columns:
            df['氏名'] = df['氏名'].astype(str).str.replace(r'[\s_＿]+', '', regex=True)
        dfs.append(df)
    
    return pd.concat(dfs, ignore_index=True)


def integrate_records(df: pd.DataFrame) -> pd.DataFrame:
    """同一学籍番号・同一日・同一分野のレコードを統合"""
    
    # 日付を統一フォーマットに変換
    df['日付'] = pd.to_datetime(df['日付']).dt.strftime('%Y/%m/%d')
    
    # グループ化して集計
    grouped = df.groupby(['学籍番号', '氏名', '日付', '分野']).agg({
        '問題数': 'sum',
        '正答数': 'sum'
    }).reset_index()
    
    # 正答率を再計算
    grouped['正答率(%)'] = (grouped['正答数'] / grouped['問題数'] * 100).round(1)
    
    return grouped


def sort_records(df: pd.DataFrame) -> pd.DataFrame:
    """学籍番号順→日付順にソート"""
    df = df.sort_values(['学籍番号', '日付', '分野'])
    return df.reset_index(drop=True)


def create_matrix_format(df: pd.DataFrame, output_path: str):
    """マトリクス形式のExcelファイルを作成"""
    
    # ピボットテーブル作成（問題数）
    pivot_questions = df.pivot_table(
        index=['学籍番号', '氏名'],
        columns=['日付', '分野'],
        values='問題数',
        aggfunc='sum',
        fill_value=0
    )
    
    # ピボットテーブル作成（正答数）
    pivot_correct = df.pivot_table(
        index=['学籍番号', '氏名'],
        columns=['日付', '分野'],
        values='正答数',
        aggfunc='sum',
        fill_value=0
    )
    
    # ピボットテーブル作成（正答率）
    pivot_rate = df.pivot_table(
        index=['学籍番号', '氏名'],
        columns=['日付', '分野'],
        values='正答率(%)',
        aggfunc='mean',
        fill_value=0
    )
    
    # Excelに出力
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        # 詳細データシート
        df.to_excel(writer, sheet_name='詳細データ', index=False)
        
        # マトリクス形式シート
        pivot_questions.to_excel(writer, sheet_name='問題数マトリクス')
        pivot_correct.to_excel(writer, sheet_name='正答数マトリクス')
        pivot_rate.to_excel(writer, sheet_name='正答率マトリクス')
    
    print(f"Excelファイルを作成しました: {output_path}")


def main():
    # 設定
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # CSVファイル読み込み
    print("=" * 50)
    print("学習記録CSV統合処理")
    print("=" * 50)
    
    df = load_csv_files(script_dir)
    if df.empty:
        return
    
    print(f"\n読み込みレコード数: {len(df)}")
    
    # データ統合
    print("\nデータ統合中...")
    integrated = integrate_records(df)
    print(f"統合後レコード数: {len(integrated)}")
    
    # ソート
    sorted_df = sort_records(integrated)
    
    # 統計情報表示
    print("\n--- 統計情報 ---")
    print(f"学生数: {sorted_df['学籍番号'].nunique()}")
    print(f"日付数: {sorted_df['日付'].nunique()}")
    print(f"分野数: {sorted_df['分野'].nunique()}")
    print("\n分野一覧:")
    for field in sorted_df['分野'].unique():
        print(f"  - {field}")
    
    # フラット形式CSV出力
    flat_output = os.path.join(script_dir, "学習記録_統合.csv")
    sorted_df.to_csv(flat_output, index=False, encoding='utf-8-sig')
    print(f"\nCSVファイルを作成しました: {flat_output}")
    
    # マトリクス形式Excel出力
    matrix_output = os.path.join(script_dir, "学習記録_統合.xlsx")
    create_matrix_format(sorted_df, matrix_output)
    
    print("\n処理完了!")


if __name__ == "__main__":
    main()
