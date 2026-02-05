"""
ドリル学習フィードバック生成システム
====================================
CSVデータから学生の学習状況を分析し、
二人の仮想教員からの個別コメントを生成するシステム
"""

import pandas as pd
import os
from dataclasses import dataclass
from typing import List, Dict, Optional
from datetime import datetime

# ============================================
# データクラス定義
# ============================================

@dataclass
class FieldScore:
    """分野別スコア"""
    field_name: str
    score: float
    school_avg: float
    total_questions: int
    total_correct: int
    
    @property
    def diff(self) -> float:
        """学校平均との差分"""
        return self.score - self.school_avg
    
    @property
    def is_weak(self) -> bool:
        """不得意分野かどうか（学校平均-10%以上）"""
        return self.diff <= -10
    
    @property
    def is_strong(self) -> bool:
        """得意分野かどうか（学校平均+5%以上）"""
        return self.diff >= 5


@dataclass
class StudentData:
    """学生データ"""
    student_id: str
    name: str
    field_scores: List[FieldScore]
    total_questions: int
    total_correct: int
    
    @property
    def total_accuracy(self) -> float:
        """総合正答率"""
        if self.total_questions == 0:
            return 0
        return (self.total_correct / self.total_questions) * 100
    
    @property
    def weak_fields(self) -> List[FieldScore]:
        """不得意分野リスト"""
        return sorted([f for f in self.field_scores if f.is_weak], 
                      key=lambda x: x.diff)
    
    @property
    def strong_fields(self) -> List[FieldScore]:
        """得意分野リスト"""
        return sorted([f for f in self.field_scores if f.is_strong], 
                      key=lambda x: x.diff, reverse=True)
    
    @property
    def weak_field_count(self) -> int:
        """不得意分野数"""
        return len(self.weak_fields)
    
    @property
    def evaluation_level(self) -> str:
        """総合評価レベル"""
        if self.total_accuracy >= 70:
            return "優秀"
        elif self.total_accuracy >= 50:
            return "良好"
        elif self.total_accuracy >= 35:
            return "要注意"
        else:
            return "要改善"


# ============================================
# データ抽出モジュール
# ============================================

class CSVDataExtractor:
    """CSVデータ抽出クラス"""
    
    def __init__(self, csv_path: str):
        self.csv_path = csv_path
        self.df = None
        self.school_avg = {}
        
    def load(self):
        """CSVファイルを読み込み"""
        self.df = pd.read_csv(self.csv_path)
        self._calculate_school_avg()
        
    def _calculate_school_avg(self):
        """分野別の学校平均を計算"""
        for field in self.df['分野'].unique():
            field_data = self.df[self.df['分野'] == field]
            total_q = field_data['問題数'].sum()
            total_c = field_data['正答数'].sum()
            self.school_avg[field] = (total_c / total_q * 100) if total_q > 0 else 0
    
    def extract_all_students(self) -> List[StudentData]:
        """全学生のデータを抽出"""
        students = []
        
        # 学籍番号でグループ化
        for student_id in self.df['学籍番号'].unique():
            student_data = self.df[self.df['学籍番号'] == student_id]
            name = student_data['氏名'].iloc[0]
            
            # 分野別スコア
            field_scores = []
            for field in student_data['分野'].unique():
                field_records = student_data[student_data['分野'] == field]
                total_q = field_records['問題数'].sum()
                total_c = field_records['正答数'].sum()
                score = (total_c / total_q * 100) if total_q > 0 else 0
                
                field_scores.append(FieldScore(
                    field_name=field,
                    score=score,
                    school_avg=self.school_avg[field],
                    total_questions=int(total_q),
                    total_correct=int(total_c)
                ))
            
            # 学生データを作成
            total_q = student_data['問題数'].sum()
            total_c = student_data['正答数'].sum()
            
            student = StudentData(
                student_id=student_id,
                name=name,
                field_scores=field_scores,
                total_questions=int(total_q),
                total_correct=int(total_c)
            )
            students.append(student)
        
        return students


# ============================================
# コメント生成モジュール
# ============================================

class CommentGenerator:
    """コメント生成クラス"""
    
    def generate_kirihima_comment(self, student: StudentData) -> str:
        """桐島凛子先生のコメント生成（厳しめ）"""
        comments = []
        
        # 正答数に関するコメント
        comments.append(self._kirihima_study_comment(student))
        
        # 正答率に関するコメント
        comments.append(self._kirihima_score_comment(student))
        
        # 改善アドバイス
        if student.weak_field_count > 0:
            comments.append(self._kirihima_advice(student))
        
        return "\n".join([c for c in comments if c])
    
    def generate_yamada_comment(self, student: StudentData) -> str:
        """山田陽介先生のコメント生成（励まし）"""
        comments = []
        
        # 正答数に関するコメント
        comments.append(self._yamada_study_comment(student))
        
        # 正答率に関するコメント
        comments.append(self._yamada_score_comment(student))
        
        # 励ましアドバイス
        comments.append(self._yamada_advice(student))
        
        return "\n".join([c for c in comments if c])
    
    def _kirihima_study_comment(self, student: StudentData) -> str:
        """桐島先生の正答数コメント"""
        total_correct = student.total_correct
        
        if total_correct >= 180:
            return f"正答数{total_correct}問と、素晴らしい成果です。知識が定着していますね。"
        elif total_correct >= 120:
            return f"正答数{total_correct}問と、順調に正解を積み上げています。この調子で続けましょう。"
        elif total_correct >= 60:
            return f"正答数{total_correct}問です。さらに正答数を増やしていきましょう。"
        else:
            return f"正答数{total_correct}問です。まずは正答数を増やすことから始めましょう。"
    
    def _kirihima_score_comment(self, student: StudentData) -> str:
        """桐島先生の正答率コメント"""
        accuracy = student.total_accuracy
        weak_count = student.weak_field_count
        
        if accuracy >= 70:
            return f"総合正答率{accuracy:.1f}%と素晴らしい成績です。この調子で本番も頑張りましょう。"
        elif accuracy >= 50:
            if weak_count > 0:
                weak_names = [f.field_name for f in student.weak_fields]
                return f"総合正答率{accuracy:.1f}%と良好ですが、{', '.join(weak_names)}が弱点です。重点的に復習しましょう。"
            return f"総合正答率{accuracy:.1f}%と概ね良好です。油断せず継続してください。"
        elif accuracy >= 35:
            return f"総合正答率{accuracy:.1f}%と、まだ合格ラインには達していません。基礎からの復習が必要です。"
        else:
            return f"総合正答率{accuracy:.1f}%と深刻な状況です。抜本的な対策が必要です。"
    
    def _kirihima_advice(self, student: StudentData) -> str:
        """桐島先生の改善アドバイス"""
        worst = student.weak_fields[0]
        return f"特に{worst.field_name}は{worst.score:.1f}%と学校平均を{abs(worst.diff):.1f}%下回っています。集中的に取り組んでください。"
    
    def _yamada_study_comment(self, student: StudentData) -> str:
        """山田先生の正答数コメント"""
        total_correct = student.total_correct
        
        if total_correct >= 180:
            return f"{total_correct}問も正解してる！すごい実力だね！"
        elif total_correct >= 120:
            return f"{total_correct}問正解！だいぶ正解が増えてきたね！この調子！"
        elif total_correct >= 60:
            return f"{total_correct}問正解！正解が増えるともっと楽しくなるよ！"
        else:
            return f"正答数{total_correct}問だね。一つずつ正解を増やしていこう！"
    
    def _yamada_score_comment(self, student: StudentData) -> str:
        """山田先生の正答率コメント"""
        strong_fields = student.strong_fields
        
        if strong_fields:
            best = strong_fields[0]
            return f"{best.field_name}が{best.score:.1f}%、すごいじゃん！得意分野をしっかり持ってるね！"
        elif student.total_accuracy >= 50:
            return "全体的にバランスよく取れてるね！いい感じだよ！"
        else:
            return "苦手分野があっても大丈夫！一つずつクリアしていけば、必ず力がつくよ！"
    
    def _yamada_advice(self, student: StudentData) -> str:
        """山田先生の励ましアドバイス"""
        if student.weak_field_count > 0:
            worst = student.weak_fields[0]
            return f"まずは{worst.field_name}から取り組んでみよう！一緒に頑張ろう！"
        else:
            return "この調子で本番まで駆け抜けよう！君ならできる！"


# ============================================
# 出力モジュール（HTML）
# ============================================

class ReportGenerator:
    """レポート出力クラス"""
    
    def __init__(self, output_dir: str = "output"):
        self.output_dir = output_dir
        self.comment_generator = CommentGenerator()
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(f"{output_dir}/html", exist_ok=True)
    
    def _get_evaluation_class(self, level: str) -> str:
        """評価レベルに応じたCSSクラスを返す"""
        mapping = {
            "優秀": "evaluation-excellent",
            "良好": "evaluation-good",
            "要注意": "evaluation-warning",
            "要改善": "evaluation-critical"
        }
        return mapping.get(level, "")
    
    def _generate_advices(self, student: StudentData) -> List[str]:
        """学習アドバイスを生成"""
        advices = []
        
        if student.total_accuracy < 50:
            advices.append("基礎問題から着実に理解を深めましょう")
        
        if student.weak_fields:
            worst = student.weak_fields[0]
            advices.append(f"特に{worst.field_name}は重点的に復習することをおすすめします")
        
        if student.strong_fields:
            advices.append("得意分野は維持しつつ、さらに得点源として磨きましょう")
        
        advices.append("毎日の学習習慣を継続することが合格への近道です")
        
        return advices[:3]
    
    def generate_html(self, student: StudentData, period: str = "2026年2月") -> str:
        """学生のHTMLレポートを生成"""
        
        # 得意分野HTML
        strong_html = ""
        for f in student.strong_fields[:3]:
            strong_html += f'''
                <div class="field-item strong">
                    <span class="field-name">{f.field_name}</span>
                    <span class="field-score">{f.score:.1f}%</span>
                    <span class="field-diff">(+{f.diff:.1f}%)</span>
                </div>
            '''
        if not strong_html:
            strong_html = '<div class="field-item">該当なし</div>'
        
        # 不得意分野HTML
        weak_html = ""
        for f in student.weak_fields[:3]:
            weak_html += f'''
                <div class="field-item weak">
                    <span class="field-name">{f.field_name}</span>
                    <span class="field-score">{f.score:.1f}%</span>
                    <span class="field-diff">({f.diff:.1f}%)</span>
                </div>
            '''
        if not weak_html:
            weak_html = '<div class="field-item">該当なし</div>'
        
        # 全分野HTML
        all_fields_html = ""
        for f in sorted(student.field_scores, key=lambda x: x.score, reverse=True):
            diff_sign = "+" if f.diff >= 0 else ""
            field_class = "strong" if f.is_strong else ("weak" if f.is_weak else "")
            all_fields_html += f'''
                <div class="field-item {field_class}">
                    <span class="field-name">{f.field_name}</span>
                    <span class="field-score">{f.score:.1f}%</span>
                    <span class="field-diff">({diff_sign}{f.diff:.1f}%)</span>
                </div>
            '''
        
        # 教員コメント
        kirihima_comment = self.comment_generator.generate_kirihima_comment(student)
        yamada_comment = self.comment_generator.generate_yamada_comment(student)
        
        # アドバイスHTML
        advices = self._generate_advices(student)
        advices_html = ""
        for advice in advices:
            advices_html += f"<li>{advice}</li>\n"
        
        # HTMLテンプレート
        html = f'''<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>学習状況レポート - {student.name}</title>
    <style>
        @page {{
            size: A4;
            margin: 15mm;
        }}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
            font-size: 11pt;
            line-height: 1.5;
            color: #333;
            background: #fff;
        }}

        .report-container {{
            max-width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 15mm;
            background: #fff;
        }}

        .header {{
            text-align: center;
            border-bottom: 3px solid #2c3e50;
            padding-bottom: 10px;
            margin-bottom: 15px;
        }}

        .header h1 {{
            font-size: 18pt;
            color: #2c3e50;
            margin-bottom: 5px;
        }}

        .header .period {{
            font-size: 12pt;
            color: #666;
        }}

        .student-info {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            margin-bottom: 15px;
        }}

        .student-info .name {{
            font-size: 16pt;
            font-weight: bold;
        }}

        .summary-box {{
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 15px;
        }}

        .summary-item {{
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 10px;
            text-align: center;
        }}

        .summary-item .label {{
            font-size: 9pt;
            color: #666;
            margin-bottom: 3px;
        }}

        .summary-item .value {{
            font-size: 14pt;
            font-weight: bold;
            color: #2c3e50;
        }}

        .evaluation-excellent {{ color: #27ae60; }}
        .evaluation-good {{ color: #3498db; }}
        .evaluation-warning {{ color: #f39c12; }}
        .evaluation-critical {{ color: #e74c3c; }}

        .section {{
            margin-bottom: 15px;
        }}

        .section-title {{
            font-size: 12pt;
            font-weight: bold;
            color: #2c3e50;
            border-left: 4px solid #667eea;
            padding-left: 10px;
            margin-bottom: 8px;
        }}

        .field-list {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }}

        .field-item {{
            display: flex;
            justify-content: space-between;
            padding: 6px 10px;
            background: #f8f9fa;
            border-radius: 4px;
            font-size: 10pt;
        }}

        .field-item.strong {{
            background: #e8f5e9;
            border-left: 3px solid #27ae60;
        }}

        .field-item.weak {{
            background: #ffebee;
            border-left: 3px solid #e74c3c;
        }}

        .field-name {{ flex: 1; }}
        .field-score {{ font-weight: bold; }}
        .field-diff {{
            font-size: 9pt;
            color: #666;
            margin-left: 8px;
        }}

        .comments-section {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 15px;
        }}

        .comment-box {{
            border-radius: 10px;
            padding: 12px;
        }}

        .comment-box.kirihima {{
            background: linear-gradient(135deg, #e8eaf6 0%, #c5cae9 100%);
            border: 1px solid #9fa8da;
        }}

        .comment-box.yamada {{
            background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
            border: 1px solid #ffcc80;
        }}

        .teacher-name {{
            font-size: 11pt;
            font-weight: bold;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 5px;
        }}

        .teacher-name.kirihima {{ color: #3f51b5; }}
        .teacher-name.yamada {{ color: #e65100; }}

        .comment-text {{
            font-size: 10pt;
            line-height: 1.6;
            color: #333;
        }}

        .advice-section {{
            background: #e3f2fd;
            border: 1px solid #90caf9;
            border-radius: 8px;
            padding: 12px;
        }}

        .advice-title {{
            font-size: 11pt;
            font-weight: bold;
            color: #1565c0;
            margin-bottom: 8px;
        }}

        .advice-list {{
            list-style: none;
            padding: 0;
        }}

        .advice-list li {{
            font-size: 10pt;
            padding: 4px 0;
            padding-left: 20px;
            position: relative;
        }}

        .advice-list li::before {{
            content: "✓";
            position: absolute;
            left: 0;
            color: #1565c0;
            font-weight: bold;
        }}

        .footer {{
            text-align: center;
            font-size: 9pt;
            color: #999;
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid #eee;
        }}

        @media print {{
            body {{
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }}
            .report-container {{
                page-break-after: always;
            }}
        }}
    </style>
</head>
<body>
    <div class="report-container">
        <header class="header">
            <h1>📊 ドリル学習状況レポート</h1>
            <p class="period">{period}</p>
        </header>

        <div class="student-info">
            <span class="name">{student.name}</span>
        </div>

        <div class="summary-box">
            <div class="summary-item">
                <div class="label">総問題数</div>
                <div class="value">{student.total_questions:,}問</div>
            </div>
            <div class="summary-item">
                <div class="label">総正答数</div>
                <div class="value">{student.total_correct:,}問</div>
            </div>
            <div class="summary-item">
                <div class="label">総合正答率</div>
                <div class="value">{student.total_accuracy:.1f}%</div>
            </div>
            <div class="summary-item">
                <div class="label">総合評価</div>
                <div class="value {self._get_evaluation_class(student.evaluation_level)}">{student.evaluation_level}</div>
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">📈 分野別成績</h2>
            <div class="field-list">
                {all_fields_html}
            </div>
        </div>

        <div class="comments-section">
            <div class="comment-box kirihima">
                <div class="teacher-name kirihima">
                    💎 桐島 凛子 先生より
                </div>
                <div class="comment-text">
                    {kirihima_comment.replace(chr(10), "<br>")}
                </div>
            </div>

            <div class="comment-box yamada">
                <div class="teacher-name yamada">
                    ☀️ 山田 陽介 先生より
                </div>
                <div class="comment-text">
                    {yamada_comment.replace(chr(10), "<br>")}
                </div>
            </div>
        </div>

        <div class="advice-section">
            <h3 class="advice-title">📝 学習アドバイス</h3>
            <ul class="advice-list">
                {advices_html}
            </ul>
        </div>

        <footer class="footer">
            生成日: {datetime.now().strftime("%Y年%m月%d日")} | ドリル学習フィードバックシステム
        </footer>
    </div>
</body>
</html>'''
        
        return html
    
    def save_html(self, student: StudentData, period: str = "2026年2月") -> str:
        """HTMLファイルを保存"""
        html = self.generate_html(student, period)
        filename = f"{self.output_dir}/html/{student.name.replace(' ', '_')}.html"
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(html)
        return filename
    
    def generate_all(self, students: List[StudentData], period: str = "2026年2月") -> List[str]:
        """全学生のレポートを生成"""
        results = []
        
        for student in students:
            html_file = self.save_html(student, period)
            results.append(html_file)
        
        return results


# ============================================
# メイン処理
# ============================================

if __name__ == "__main__":
    csv_path = "学習記録_統合.csv"
    
    if os.path.exists(csv_path):
        print("=" * 50)
        print("ドリル学習フィードバック生成システム")
        print("=" * 50)
        
        # データ抽出
        print("\n[Phase 1] データ抽出中...")
        extractor = CSVDataExtractor(csv_path)
        extractor.load()
        students = extractor.extract_all_students()
        print(f"  → {len(students)}名の学生データを抽出しました")
        
        # 学校平均表示
        print("\n[学校平均正答率]")
        for field, avg in extractor.school_avg.items():
            print(f"  - {field}: {avg:.1f}%")
        
        # コメント生成テスト
        print("\n[Phase 2] コメント生成テスト...")
        generator = CommentGenerator()
        
        if students:
            test_student = students[0]
            print(f"\n【テスト: {test_student.name}】")
            print(f"正答数: {test_student.total_correct}問")
            print(f"総合正答率: {test_student.total_accuracy:.1f}%")
            print("\n--- 桐島先生のコメント ---")
            print(generator.generate_kirihima_comment(test_student))
            print("\n--- 山田先生のコメント ---")
            print(generator.generate_yamada_comment(test_student))
        
        # レポート出力
        print("\n[Phase 3] 全学生のHTMLレポート生成...")
        report_gen = ReportGenerator()
        results = report_gen.generate_all(students, "2026年2月（2/2〜2/4）")
        
        print(f"\n✅ 完了！ {len(results)}名分のHTMLファイルを output/html フォルダに出力しました")
        
    else:
        print(f"ファイルが見つかりません: {csv_path}")
