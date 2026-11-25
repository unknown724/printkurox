import sys
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

def generate_graph(json_data_path, output_png_path, student_name="Student", roll_no=""):
    with open(json_data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if not data:
        print("No semester data provided.")
        return False

    labels = [d.get('shortLabel') or d.get('semesterLabel', f"Sem {i+1}") for i, d in enumerate(data)]
    sgpas = [float(d.get('sgpa', 0)) for d in data]
    cgpas = [float(d.get('cgpa', 0)) for d in data]

    num_sems = len(labels)
    fig_w = max(9.5, min(14.0, 0.95 * num_sems + 2.0))
    fig_h = 5.4

    plt.style.use('dark_background')
    fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=140)

    # Background styling
    fig.patch.set_facecolor('#0f172a')
    ax.set_facecolor('#1e293b')

    x = np.arange(num_sems)

    # Detect transition between Base Module (Certificate) and Degree Module (B.Tech)
    trans_idx = -1
    for i in range(1, num_sems):
        prev_deg = (data[i-1].get('degreeName') or '').lower()
        curr_deg = (data[i].get('degreeName') or '').lower()
        if 'cert' in prev_deg and 'tech' in curr_deg:
            trans_idx = i
            break

    # Plot module division line & headers if transition exists
    y_max_bound = min(max(sgpas + cgpas) + 0.85, 10.2)
    y_min_bound = min(min(sgpas + cgpas) - 0.75, 6.0)

    if trans_idx != -1:
        sep_x = trans_idx - 0.5
        ax.axvline(x=sep_x, color='#475569', linestyle='--', linewidth=1.3, alpha=0.8, zorder=2)
        # Module labels
        ax.text((sep_x) / 2.0, y_max_bound - 0.22, 'BASE MODULE (CERTIFICATE)', color='#94a3b8',
                fontsize=8.5, fontweight='bold', ha='center', va='top', alpha=0.9,
                bbox=dict(boxstyle='round,pad=0.25', facecolor='#0f172a', edgecolor='#334155', alpha=0.8))
        ax.text((sep_x + (num_sems - 1)) / 2.0, y_max_bound - 0.22, 'DEGREE MODULE (B.TECH)', color='#38bdf8',
                fontsize=8.5, fontweight='bold', ha='center', va='top', alpha=0.9,
                bbox=dict(boxstyle='round,pad=0.25', facecolor='#0f172a', edgecolor='#0284c7', alpha=0.8))

    # Plot SGPA (Cyan solid line with circle markers)
    ax.plot(x, sgpas, color='#38bdf8', linewidth=2.8, marker='o', markersize=7, label='SGPA (Semester)', zorder=4)
    # Plot CGPA (Gold dashed line with square markers)
    ax.plot(x, cgpas, color='#facc15', linewidth=2.4, linestyle='--', marker='s', markersize=6, label='CGPA (Cumulative)', zorder=4)

    # Fill under SGPA curve
    ax.fill_between(x, sgpas, alpha=0.12, color='#38bdf8', zorder=2)

    # Data callout labels
    for i, txt in enumerate(sgpas):
        if txt > 0:
            ax.annotate(f"{txt:.2f}", (x[i], sgpas[i]), textcoords="offset points", xytext=(0, 9),
                        ha='center', fontsize=8.5, fontweight='bold', color='#38bdf8')

    for i, txt in enumerate(cgpas):
        if txt > 0 and (i == 0 or i == num_sems - 1 or abs(cgpas[i] - sgpas[i]) > 0.28):
            ax.annotate(f"{txt:.2f}", (x[i], cgpas[i]), textcoords="offset points", xytext=(0, -14),
                        ha='center', fontsize=8, color='#fde047')

    # Grid and axes
    ax.set_xticks(x)
    rotation_angle = 18 if num_sems > 6 else 0
    ax.set_xticklabels(labels, fontsize=9.5, fontweight='bold', color='#cbd5e1', rotation=rotation_angle, ha='right' if rotation_angle else 'center')
    ax.set_ylim(y_min_bound, y_max_bound)
    ax.set_ylabel('Grade Points (0 - 10)', fontsize=10, color='#94a3b8', fontweight='bold', labelpad=8)
    ax.grid(color='#334155', linestyle=':', linewidth=0.8, alpha=0.8, zorder=1)

    # Clean borders
    for spine in ax.spines.values():
        spine.set_color('#475569')
        spine.set_linewidth(0.9)

    # Titles
    title_text = f"NERIST Examination Trend · {student_name}"
    latest_cgpa = cgpas[-1] if cgpas else 0.0
    status_label = " (First Class with Distinction)" if latest_cgpa >= 8.5 else (" (First Class)" if latest_cgpa >= 6.5 else "")
    subtitle_text = f"Roll No: {roll_no} | Completed Semesters: {num_sems} | Cumulative CGPA: {latest_cgpa:.2f}{status_label}" if roll_no else f"Completed Semesters: {num_sems} | Cumulative CGPA: {latest_cgpa:.2f}{status_label}"
    fig.suptitle(title_text, fontsize=13, fontweight='bold', color='#f8fafc', y=0.96)
    ax.set_title(subtitle_text, fontsize=10, color='#38bdf8', pad=10)

    # Legend
    legend = ax.legend(loc='lower right', framealpha=0.9, facecolor='#0f172a', edgecolor='#475569', fontsize=9)
    for text in legend.get_texts():
        text.set_color('#e2e8f0')

    plt.tight_layout(rect=[0, 0.03, 1, 0.94])
    plt.savefig(output_png_path, bbox_inches='tight', facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close()
    print(f"Chart saved to {output_png_path}")
    return True

if __name__ == '__main__':
    if len(sys.argv) >= 3:
        json_path = sys.argv[1]
        out_png = sys.argv[2]
        name = sys.argv[3] if len(sys.argv) > 3 else "NERIST Student"
        roll = sys.argv[4] if len(sys.argv) > 4 else ""
        generate_graph(json_path, out_png, name, roll)
